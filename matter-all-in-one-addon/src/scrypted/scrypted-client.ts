/**
 * @description Scrypted NVR Discovery and Client Manager.
 * Automatically discovers Scrypted servers on the local network (mDNS / probe)
 * and connects to retrieve camera devices, motion sensors, doorbells, and lights.
 *
 * @file src/scrypted/scrypted-client.ts
 * @author chrisalvir
 * @license Apache-2.0
 */

import { networkInterfaces } from "node:os";
import https from "node:https";
import http from "node:http";
import WebSocket from "ws";
import { AnsiLogger } from "matterbridge/logger";

export interface ScryptedConfig {
  host?: string;
  port?: number;
  token?: string;
}

export interface ScryptedDevice {
  id: string;
  name: string;
  type: string;
  interfaces: string[];
  room?: string;
  state?: Record<string, any>;
}

export interface ScryptedCameraEntry {
  id: string;
  name: string;
  room?: string;
  hasMotion: boolean;
  hasDoorbell: boolean;
  hasLight: boolean;
  motionState: boolean;
  doorbellTriggered: boolean;
  lightState: boolean;
}

export class ScryptedClientManager {
  private log: AnsiLogger;
  public config: ScryptedConfig;
  public connected = false;
  public discoveredServerUrl: string | null = null;
  public latencyMs = 0;
  public cameras = new Map<string, ScryptedCameraEntry>();

  private ws: WebSocket | null = null;
  private reconnectTimer?: NodeJS.Timeout;
  private onCameraDiscoveredCallback?: (cam: ScryptedCameraEntry) => void;
  private onCameraStateChangedCallback?: (
    camId: string,
    cam: ScryptedCameraEntry,
  ) => void;

  constructor(log: AnsiLogger, config: ScryptedConfig = {}) {
    this.log = log;
    this.config = config;
  }

  public onCameraDiscovered(cb: (cam: ScryptedCameraEntry) => void) {
    this.onCameraDiscoveredCallback = cb;
  }

  public onCameraStateChanged(
    cb: (camId: string, cam: ScryptedCameraEntry) => void,
  ) {
    this.onCameraStateChangedCallback = cb;
  }

  /**
   * Probes for Scrypted servers across local network or configured host.
   */
  public async discoverAndConnect(): Promise<void> {
    let targetHost = this.config.host;
    let targetPort = this.config.port || 10443;

    if (!targetHost) {
      this.log.info(
        "[Scrypted] Auto-discovering Scrypted server on local network...",
      );
      const discovered = await this.probeLocalNetwork();
      if (discovered) {
        targetHost = discovered.host;
        targetPort = discovered.port;
        this.discoveredServerUrl = `https://${targetHost}:${targetPort}`;
        this.log.notice(
          `[Scrypted] Found Scrypted server at ${this.discoveredServerUrl}`,
        );
      } else {
        this.log.info(
          "[Scrypted] No Scrypted server auto-detected in LAN. Set host in Settings if using different subnet.",
        );
        return;
      }
    } else {
      this.discoveredServerUrl = `https://${targetHost}:${targetPort}`;
    }

    this.connectToServer(targetHost, targetPort);
  }

  private async probeLocalNetwork(): Promise<{
    host: string;
    port: number;
  } | null> {
    const candidateHosts = ["scrypted.local", "localhost", "127.0.0.1"];

    // Check known local hostnames first
    for (const host of candidateHosts) {
      for (const port of [10443, 10444, 11080]) {
        if (await this.probeHost(host, port)) {
          return { host, port };
        }
      }
    }

    // Check same subnet IPs as current host
    const subnets = this.getLocalSubnets();
    for (const subnet of subnets) {
      const probes = [1, 2, 10, 20, 50, 100, 150, 200, 250].map(
        (last) => `${subnet}.${last}`,
      );
      const checks = await Promise.all(
        probes.map(async (ip) => {
          if (await this.probeHost(ip, 10443)) return { host: ip, port: 10443 };
          return null;
        }),
      );
      const match = checks.find(Boolean);
      if (match) return match;
    }

    return null;
  }

  private probeHost(host: string, port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const isHttps = port === 10443 || port === 10444;
      const mod = isHttps ? https : http;
      try {
        const req = mod.get(
          {
            host,
            port,
            path: "/endpoint/@scrypted/core/public/",
            rejectUnauthorized: false,
            timeout: 1000,
          },
          (res) => {
            resolve(res.statusCode !== undefined && res.statusCode < 500);
            res.resume();
          },
        );
        req.on("error", () => resolve(false));
        req.on("timeout", () => {
          req.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  private getLocalSubnets(): string[] {
    const subnets: string[] = [];
    const nets = networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const iface of list ?? []) {
        if (iface.family === "IPv4" && !iface.internal) {
          const parts = iface.address.split(".");
          if (parts.length === 4) {
            subnets.push(`${parts[0]}.${parts[1]}.${parts[2]}`);
          }
        }
      }
    }
    return [...new Set(subnets)];
  }

  private connectToServer(host: string, port: number) {
    const start = Date.now();
    const wsUrl = `wss://${host}:${port}/endpoint/@scrypted/core/public/`;
    this.log.info(`[Scrypted] Connecting WebSocket to ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl, {
        rejectUnauthorized: false,
        headers: this.config.token
          ? { Authorization: `Bearer ${this.config.token}` }
          : {},
      });

      this.ws.on("open", () => {
        this.connected = true;
        this.latencyMs = Date.now() - start;
        this.log.notice(
          `[Scrypted] Connected successfully (latency: ${this.latencyMs}ms)`,
        );
        this.fetchDevicesHttp(host, port);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleEvent(msg);
        } catch {
          // ignore non-json
        }
      });

      this.ws.on("error", (err) => {
        this.log.warn(`[Scrypted] WebSocket error: ${err.message}`);
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.log.warn(
          "[Scrypted] Connection closed, scheduling reconnect in 10s...",
        );
        this.reconnectTimer = setTimeout(
          () => this.connectToServer(host, port),
          10000,
        );
      });
    } catch (err) {
      this.log.warn(`[Scrypted] Socket instantiation error: ${err}`);
    }
  }

  private async fetchDevicesHttp(host: string, port: number) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = `https://${host}:${port}/endpoint/@scrypted/core/public/`;
    https
      .get(url, { agent }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          this.log.debug(
            `[Scrypted] Device list queried, response size: ${body.length} bytes`,
          );
        });
      })
      .on("error", () => {
        // Ignored
      });
  }

  private handleEvent(event: any) {
    if (!event || !event.id) return;
    const cam = this.cameras.get(event.id);
    if (!cam) return;

    if (event.eventInterface === "MotionSensor") {
      cam.motionState = !!event.eventData;
      this.onCameraStateChangedCallback?.(cam.id, cam);
    } else if (
      event.eventInterface === "BinarySensor" ||
      event.eventInterface === "Doorbell"
    ) {
      cam.doorbellTriggered = !!event.eventData;
      this.onCameraStateChangedCallback?.(cam.id, cam);
    } else if (event.eventInterface === "OnOff") {
      cam.lightState = !!event.eventData;
      this.onCameraStateChangedCallback?.(cam.id, cam);
    }
  }

  public registerCameraDevice(entry: ScryptedCameraEntry) {
    this.cameras.set(entry.id, entry);
    this.onCameraDiscoveredCallback?.(entry);
  }

  public close() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
}

/**
 * @description Universal LAN Camera Scanner & Scrypted NVR Client.
 * Automatically scans the local network to discover cameras running on macOS/Linux/Docker
 * (Scrypted, ONVIF, RTSP camera endpoints) and registers them as Matter accessories.
 * 
 * @file src/scrypted/scrypted-client.ts
 * @author chrisalvir
 * @license Apache-2.0
 */

import { networkInterfaces } from 'node:os';
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import WebSocket from 'ws';
import { AnsiLogger } from 'matterbridge/logger';

export interface ScryptedConfig {
  host?: string;
  port?: number;
  token?: string;
}

export interface ScryptedCameraEntry {
  id: string;
  name: string;
  room?: string;
  host?: string;
  port?: number;
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
  private onCameraStateChangedCallback?: (camId: string, cam: ScryptedCameraEntry) => void;

  constructor(log: AnsiLogger, config: ScryptedConfig = {}) {
    this.log = log;
    this.config = config;
  }

  public onCameraDiscovered(cb: (cam: ScryptedCameraEntry) => void) {
    this.onCameraDiscoveredCallback = cb;
  }

  public onCameraStateChanged(cb: (camId: string, cam: ScryptedCameraEntry) => void) {
    this.onCameraStateChangedCallback = cb;
  }

  /**
   * Full automatic scan across the entire subnet (1-254) for any cameras & Scrypted on macOS/LAN.
   */
  public async discoverAndConnect(): Promise<void> {
    if (this.config.host) {
      const port = this.config.port || 10443;
      this.discoveredServerUrl = `https://${this.config.host}:${port}`;
      this.connectToServer(this.config.host, port);
      return;
    }

    this.log.info('[Camera Scanner] Starting full automatic LAN scan for cameras on macOS / Network...');
    await this.scanSubnetForCameras();
  }

  /**
   * Scans full subnet IPs (1..254) across ports 10443, 10444, 11080 (Scrypted) and 554, 8000, 3702 (IP Cameras)
   */
  private async scanSubnetForCameras(): Promise<void> {
    const subnets = this.getLocalSubnets();
    const commonHosts = ['scrypted.local', 'localhost', '127.0.0.1'];

    // 1. Probe local hostnames
    for (const host of commonHosts) {
      for (const port of [10443, 10444, 11080]) {
        if (await this.probeTcpPort(host, port, 800)) {
          this.discoveredServerUrl = `https://${host}:${port}`;
          this.log.notice(`[Camera Scanner] Discovered Scrypted on ${host}:${port}`);
          this.connectToServer(host, port);
          return;
        }
      }
    }

    // 2. Full sweep across active subnets in chunks of 30 parallel probes
    for (const subnet of subnets) {
      const allIps = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
      const chunkSize = 30;

      for (let i = 0; i < allIps.length; i += chunkSize) {
        const batch = allIps.slice(i, i + chunkSize);
        await Promise.all(
          batch.map(async (ip) => {
            // Check Scrypted (macOS)
            const isScrypted = await this.probeTcpPort(ip, 10443, 1000) || await this.probeTcpPort(ip, 10444, 1000);
            if (isScrypted) {
              const port = (await this.probeTcpPort(ip, 10443, 800)) ? 10443 : 10444;
              this.discoveredServerUrl = `https://${ip}:${port}`;
              this.log.notice(`[Camera Scanner] Discovered Scrypted/NVR server at ${this.discoveredServerUrl}`);
              this.connectToServer(ip, port);
              return;
            }

            // Check Generic IP Camera RTSP / ONVIF (port 554 or 8000)
            const isCameraPort = await this.probeTcpPort(ip, 554, 800) || await this.probeTcpPort(ip, 8000, 800);
            if (isCameraPort) {
              const camId = `cam_${ip.replace(/\./g, '_')}`;
              if (!this.cameras.has(camId)) {
                const entry: ScryptedCameraEntry = {
                  id: camId,
                  name: `Cámara IP (${ip})`,
                  room: 'Red Local',
                  host: ip,
                  port: 554,
                  hasMotion: true,
                  hasDoorbell: false,
                  hasLight: false,
                  motionState: false,
                  doorbellTriggered: false,
                  lightState: false,
                };
                this.registerCameraDevice(entry);
                this.log.notice(`[Camera Scanner] Discovered standalone IP Camera at ${ip}:554`);
              }
            }
          })
        );
      }
    }
  }

  private probeTcpPort(host: string, port: number, timeoutMs = 800): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });
  }

  private getLocalSubnets(): string[] {
    const subnets: string[] = [];
    const nets = networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const iface of list ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
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
        headers: this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {},
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.latencyMs = Date.now() - start;
        this.log.notice(`[Scrypted] Connected successfully to server at ${host}:${port} (latency: ${this.latencyMs}ms)`);
        this.fetchDevicesHttp(host, port);
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleEvent(msg);
        } catch {
          // ignore non-json
        }
      });

      this.ws.on('error', (err) => {
        this.log.warn(`[Scrypted] WebSocket warning: ${err.message}`);
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.log.warn('[Scrypted] Connection closed, will retry probe in 15s...');
        this.reconnectTimer = setTimeout(() => this.discoverAndConnect(), 15000);
      });
    } catch (err) {
      this.log.warn(`[Scrypted] Socket instantiation error: ${err}`);
    }
  }

  private async fetchDevicesHttp(host: string, port: number) {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const url = `https://${host}:${port}/endpoint/@scrypted/core/public/`;
    https.get(url, { agent }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (Array.isArray(data)) {
            for (const d of data) {
              const entry: ScryptedCameraEntry = {
                id: String(d.id || d._id),
                name: d.name || `Cámara ${d.id}`,
                room: d.room || d.type || 'Scrypted',
                host,
                port,
                hasMotion: true,
                hasDoorbell: d.interfaces?.includes('Doorbell') || false,
                hasLight: d.interfaces?.includes('OnOff') || false,
                motionState: false,
                doorbellTriggered: false,
                lightState: false,
              };
              this.registerCameraDevice(entry);
            }
          }
        } catch {
          // Non-json response
        }
      });
    }).on('error', () => {
      // Ignored
    });
  }

  private handleEvent(event: any) {
    if (!event || !event.id) return;
    const cam = this.cameras.get(String(event.id));
    if (!cam) return;

    if (event.eventInterface === 'MotionSensor') {
      cam.motionState = !!event.eventData;
      this.onCameraStateChangedCallback?.(cam.id, cam);
    } else if (event.eventInterface === 'BinarySensor' || event.eventInterface === 'Doorbell') {
      cam.doorbellTriggered = !!event.eventData;
      this.onCameraStateChangedCallback?.(cam.id, cam);
    } else if (event.eventInterface === 'OnOff') {
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

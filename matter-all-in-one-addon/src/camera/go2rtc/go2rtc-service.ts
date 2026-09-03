/**
 * Embedded go2rtc Service
 * Manages the internal go2rtc restreaming daemon on localhost.
 * Multiplexes single RTSP camera sessions into unlimited concurrent consumers,
 * eliminates multi-viewer camera hardware freezes, and provides instantaneous
 * RAM-buffered JPEG snapshots (<15ms) without spawning FFmpeg processes.
 */

import { spawn, ChildProcess, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export interface Go2rtcConfig {
  binaryPath?: string;
  configPath?: string;
  apiPort?: number;
  rtspPort?: number;
  webrtcPort?: number;
}

export class Go2rtcService {
  private static instance: Go2rtcService | null = null;

  private process: ChildProcess | null = null;
  private isRunning = false;
  private stopping = false;
  private restartCount = 0;
  private readonly maxRestarts = 5;

  private readonly apiPort: number;
  private readonly rtspPort: number;
  private readonly webrtcPort: number;
  private readonly configPath: string;
  private binaryPath: string | null = null;

  private readonly registeredStreams = new Map<string, string>();

  public constructor(config: Go2rtcConfig = {}) {
    this.apiPort = config.apiPort ?? Number(process.env.GO2RTC_API_PORT || 19840);
    this.rtspPort = config.rtspPort ?? Number(process.env.GO2RTC_RTSP_PORT || 18554);
    this.webrtcPort = config.webrtcPort ?? Number(process.env.GO2RTC_WEBRTC_PORT || 18555);
    this.configPath = config.configPath ?? "/tmp/go2rtc.yaml";
    this.binaryPath = config.binaryPath ?? this.resolveBinaryPath();
  }

  public static getInstance(config?: Go2rtcConfig): Go2rtcService {
    if (!Go2rtcService.instance) {
      Go2rtcService.instance = new Go2rtcService(config);
    }
    return Go2rtcService.instance;
  }

  /**
   * Resolves the go2rtc binary on the local system.
   */
  public resolveBinaryPath(): string | null {
    if (process.env.GO2RTC_PATH && fs.existsSync(process.env.GO2RTC_PATH)) {
      return process.env.GO2RTC_PATH;
    }

    const candidates = [
      "/usr/local/bin/go2rtc",
      "/usr/bin/go2rtc",
      "/app/bin/go2rtc",
      "/opt/homebrew/bin/go2rtc",
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    try {
      const output = execSync("which go2rtc 2>/dev/null", { encoding: "utf-8" }).trim();
      if (output && fs.existsSync(output)) {
        return output;
      }
    } catch {}

    return null;
  }

  /**
   * Generates minimal non-conflicting configuration bound to localhost.
   */
  private generateConfigFile(): void {
    const content = [
      "api:",
      `  listen: "127.0.0.1:${this.apiPort}"`,
      "rtsp:",
      `  listen: "127.0.0.1:${this.rtspPort}"`,
      "webrtc:",
      `  listen: "127.0.0.1:${this.webrtcPort}"`,
      "log:",
      `  level: "warn"`,
      "",
    ].join("\n");

    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.configPath, content, { encoding: "utf-8" });
    } catch (err) {
      console.warn(`[Go2rtcService] Failed to write config to ${this.configPath}:`, err);
    }
  }

  /**
   * Starts the go2rtc daemon if the binary is present.
   */
  public async start(): Promise<boolean> {
    if (this.isRunning && this.process) {
      return true;
    }

    this.binaryPath = this.resolveBinaryPath();
    if (!this.binaryPath) {
      console.info("[Go2rtcService] go2rtc binary not found on system; embedded restreamer disabled.");
      return false;
    }

    this.stopping = false;
    this.generateConfigFile();

    return new Promise<boolean>((resolve) => {
      try {
        const args = ["-c", this.configPath];
        const proc = spawn(this.binaryPath!, args, {
          stdio: ["ignore", "pipe", "pipe"],
        });

        this.process = proc;

        proc.stdout?.on("data", (chunk: Buffer) => {
          const msg = chunk.toString().trim();
          if (msg && process.env.DEBUG_GO2RTC) {
            console.debug(`[go2rtc][stdout] ${msg}`);
          }
        });

        proc.stderr?.on("data", (chunk: Buffer) => {
          const msg = chunk.toString().trim();
          if (msg && process.env.DEBUG_GO2RTC) {
            console.warn(`[go2rtc][stderr] ${msg}`);
          }
        });

        proc.on("error", (err) => {
          console.warn("[Go2rtcService] Failed to spawn go2rtc process:", err);
          this.isRunning = false;
          this.process = null;
          resolve(false);
        });

        proc.on("close", (code) => {
          this.isRunning = false;
          this.process = null;
          if (!this.stopping && this.restartCount < this.maxRestarts) {
            this.restartCount++;
            console.warn(`[Go2rtcService] go2rtc exited with code ${code}; restarting (${this.restartCount}/${this.maxRestarts})...`);
            setTimeout(() => void this.start(), 2000);
          }
        });

        // Verify API availability with a probe
        setTimeout(async () => {
          const ok = await this.healthcheck();
          if (ok) {
            this.isRunning = true;
            this.restartCount = 0;
            console.info(`[Go2rtcService] Embedded go2rtc daemon started successfully (API: ${this.apiPort}, RTSP: ${this.rtspPort})`);
            // Re-register any previously registered streams
            await this.syncRegisteredStreams();
            resolve(true);
          } else {
            console.warn("[Go2rtcService] go2rtc spawned but healthcheck failed.");
            resolve(false);
          }
        }, 600);
      } catch (err) {
        console.warn("[Go2rtcService] Exception starting go2rtc:", err);
        resolve(false);
      }
    });
  }

  /**
   * Stops the go2rtc daemon cleanly.
   */
  public async stop(): Promise<void> {
    this.stopping = true;
    if (this.process) {
      try {
        this.process.kill("SIGTERM");
      } catch {}
      this.process = null;
    }
    this.isRunning = false;
  }

  /**
   * Healthcheck probing the local go2rtc REST API.
   */
  public async healthcheck(): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${this.apiPort}/api/streams`, {
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  public isAvailable(): boolean {
    return this.isRunning;
  }

  /**
   * Returns the restreamed RTSP URL on localhost.
   */
  public getRestreamUrl(name: string): string {
    const cleanName = this.normalizeStreamName(name);
    return `rtsp://127.0.0.1:${this.rtspPort}/${cleanName}`;
  }

  /**
   * Returns the instant snapshot URL on localhost.
   */
  public getSnapshotUrl(name: string): string {
    const cleanName = this.normalizeStreamName(name);
    return `http://127.0.0.1:${this.apiPort}/api/frame.jpeg?src=${encodeURIComponent(cleanName)}`;
  }

  /**
   * Normalizes stream identifier into valid go2rtc stream key.
   */
  public normalizeStreamName(raw: string): string {
    return raw.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  }

  /**
   * Dynamically registers or updates a stream source in go2rtc.
   */
  public async registerStream(name: string, sourceUrl: string): Promise<boolean> {
    const cleanName = this.normalizeStreamName(name);
    this.registeredStreams.set(cleanName, sourceUrl);

    if (!this.isRunning) {
      return false;
    }

    try {
      const url = `http://127.0.0.1:${this.apiPort}/api/streams?name=${encodeURIComponent(cleanName)}&src=${encodeURIComponent(sourceUrl)}`;
      const res = await fetch(url, {
        method: "PUT",
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch (err) {
      console.warn(`[Go2rtcService] Failed to register stream "${cleanName}":`, err);
      return false;
    }
  }

  /**
   * Removes a stream from go2rtc.
   */
  public async unregisterStream(name: string): Promise<boolean> {
    const cleanName = this.normalizeStreamName(name);
    this.registeredStreams.delete(cleanName);

    if (!this.isRunning) {
      return true;
    }

    try {
      const url = `http://127.0.0.1:${this.apiPort}/api/streams?name=${encodeURIComponent(cleanName)}`;
      const res = await fetch(url, {
        method: "DELETE",
        signal: AbortSignal.timeout(2000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Re-syncs all mapped streams to go2rtc daemon (e.g. after daemon restart).
   */
  private async syncRegisteredStreams(): Promise<void> {
    for (const [name, sourceUrl] of this.registeredStreams.entries()) {
      await this.registerStream(name, sourceUrl);
    }
  }

  /**
   * Fetches an instantaneous JPEG frame from the go2rtc RAM buffer (<15ms).
   */
  public async fetchSnapshot(name: string, timeoutMs: number = 2000): Promise<Buffer | null> {
    if (!this.isRunning) return null;
    const cleanName = this.normalizeStreamName(name);
    try {
      const url = this.getSnapshotUrl(cleanName);
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        // Verify JPEG magic bytes (FF D8 ... FF D9)
        if (buf.length > 512 && buf[0] === 0xff && buf[1] === 0xd8) {
          return buf;
        }
      }
    } catch {}
    return null;
  }
}

/**
 * FfmpegMotionDetector — Frame-difference motion detection using FFmpeg.
 *
 * Reads the RTSP stream at 1 fps, scales to 160x90, and uses FFmpeg's
 * tblend=difference128 + blackframe filters to compare consecutive frames.
 * When the difference frame is NOT mostly black, motion has occurred.
 *
 * No Camera.UI dependency. No external AI. Just FFmpeg, already in the container.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { resolveFfmpegPath } from "../homekit/ffmpeg-helper.js";

export interface FfmpegMotionDetectorOptions {
  cameraId: string;
  cameraName: string;
  rtspUrl: string;
  /** Percentage of changed pixels required to trigger motion (default: 4, meaning pblack <= 96 triggers). */
  changeThresholdPercent?: number;
  /** Sensitivity 1–99 (alternative). Higher = triggers on smaller movement. Default: 75. */
  sensitivity?: number;
  /** Minimum ms between consecutive motion triggers. Default: 4000. */
  cooldownMs?: number;
  /** ms after last trigger before resetting to no-motion. Default: 15000. */
  resetMs?: number;
  /** Analysis resolution. Defaults to 160x90 to keep the background reader inexpensive. */
  analysisWidth?: number;
  analysisHeight?: number;
  /** Luma difference below which a pixel is considered unchanged. Default: 12. */
  pixelDifferenceThreshold?: number;
  /** Analysis frame rate in FPS (default: 2 to capture fast vehicles and people). */
  fps?: number;
  /** Report high-motion frames too; opt-in preserves existing camera profiles. */
  reportAllFrameChanges?: boolean;
}

export class FfmpegMotionDetector extends EventEmitter {
  private proc?: ChildProcess;
  private running = false;
  private motionActive = false;
  private lastTriggerAt = 0;
  private resetTimer?: NodeJS.Timeout;
  private restartTimer?: NodeJS.Timeout;
  private consecutiveErrors = 0;

  constructor(private readonly opts: FfmpegMotionDetectorOptions) {
    super();
  }

  public get isRunning(): boolean {
    return this.running;
  }

  public start(log?: any): void {
    if (this.running) return;
    this.running = true;
    this.consecutiveErrors = 0;
    log?.notice?.(
      `[MotionDetector][${this.opts.cameraName}] Starting FFmpeg motion detection`,
    );
    this.spawnProcess(log);
  }

  private paused = false;

  public pause(log?: any): void {
    if (!this.running || this.paused) return;
    this.paused = true;
    log?.notice?.(
      `[MotionDetector][${this.opts.cameraName}] Pausing motion detector to yield RTSP socket to Live View`,
    );
    this.killProcess();
  }

  public resume(log?: any): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    log?.notice?.(
      `[MotionDetector][${this.opts.cameraName}] Resuming motion detector after Live View ended`,
    );
    this.spawnProcess(log);
  }

  public stop(log?: any): void {
    if (!this.running) return;
    this.running = false;
    this.paused = false;
    log?.notice?.(
      `[MotionDetector][${this.opts.cameraName}] Stopping motion detection`,
    );
    this.killProcess();
    if (this.motionActive) {
      this.motionActive = false;
      this.emit("motion", false);
    }
  }

  private killProcess(): void {
    if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = undefined; }
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = undefined; }
    if (this.proc) {
      try { this.proc.kill("SIGKILL"); } catch {}
      this.proc = undefined;
    }
  }

  private spawnProcess(log?: any): void {
    if (!this.running || this.paused) return;
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) return;

    // Normalize URL for FFmpeg compatibility
    let url = (this.opts.rtspUrl || "")
      .replace(/^(rtsps?):\/\/localhost(?=[:/])/i, "$1://127.0.0.1");
    const hashIdx = url.indexOf("#");
    if (hashIdx !== -1) url = url.substring(0, hashIdx);

    // Determine change threshold percentage (default 4% changed pixels triggers motion)
    let minChangedPercent = this.opts.changeThresholdPercent;
    if (minChangedPercent === undefined) {
      if (typeof this.opts.sensitivity === "number" && this.opts.sensitivity > 0 && this.opts.sensitivity < 100) {
        // Sensitivity 1-99: 99 -> 1% change, 75 -> 3% change, 50 -> 5% change, 15 -> 8% change
        minChangedPercent = Math.max(1, Math.round(10 - (this.opts.sensitivity / 100) * 8));
      } else {
        minChangedPercent = 4;
      }
    }
    // pblack = % of pixels with luminance difference <= 12 (i.e. static/unchanged)
    // Motion: pblack drops to <= (100 - minChangedPercent), e.g. <= 96%
    const pblackThreshold = 100 - minChangedPercent;

    /**
     * Pipeline:
     *  fps=1        — 1 frame/sec, minimal CPU
     *  scale=160:90 — downscale for speed
     *  format=gray  — luma only, drop chroma
     *  tblend=all_mode=difference — absolute pixel difference |frame_N - frame_N-1| (0 = no motion)
     *  blackframe=amount=95:thresh=12 — measures percentage of black pixels (pblack)
     *    outputs at info level: "[Parsed_blackframe...] frame:N pblack:P pts:..."
     *    pblack <= threshold → significant pixel changes → MOTION
     */
    const analysisWidth = Math.max(64, Math.min(this.opts.analysisWidth ?? 160, 640));
    const analysisHeight = Math.max(36, Math.min(this.opts.analysisHeight ?? 90, 360));
    const pixelDifferenceThreshold = Math.max(
      1,
      Math.min(this.opts.pixelDifferenceThreshold ?? 12, 255),
    );
    // amount=95 suppresses reports when more than 5% of pixels change,
    // exactly the frames a motion detector needs. amount=0 reports every frame.
    const reportAmount = this.opts.reportAllFrameChanges ? 0 : 95;
    const analysisFps = Math.max(1, Math.min(this.opts.fps ?? 1, 5));
    const vf = `fps=${analysisFps},scale=${analysisWidth}:${analysisHeight},format=gray,tblend=all_mode=difference,blackframe=amount=${reportAmount}:thresh=${pixelDifferenceThreshold}`;

    const isTapoC402 =
      /(?:\bc402\b|tapo[-_ ]?c402)/i.test(this.opts.cameraName || "") ||
      /(?:\bc402\b|tapo[-_ ]?c402)/i.test(this.opts.cameraId || "") ||
      /(?:\bc402\b|tapo[-_ ]?c402)/i.test(this.opts.rtspUrl || "");

    const probeSize = isTapoC402 ? "2097152" : "524288";
    const analyzeDuration = isTapoC402 ? "3000000" : "500000";

    const args = [
      "-hide_banner",
      "-loglevel", "info",
      "-rtsp_transport", "tcp",
      "-timeout", "10000000",
      "-probesize", probeSize,
      "-analyzeduration", analyzeDuration,
      "-fflags", "+genpts+igndts+discardcorrupt",
      "-i", url,
      "-vf", vf,
      "-an", "-f", "null", "-",
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    this.proc = proc;

    let stderrBuf = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf = (stderrBuf + chunk.toString()).slice(-4000);
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop() ?? "";
      for (const line of lines) {
        this.parseLine(line, pblackThreshold, log);
      }
    });

    proc.once("error", (err) => {
      this.proc = undefined;
      log?.debug?.(`[MotionDetector][${this.opts.cameraName}] error: ${err.message}`);
      this.scheduleRestart(log);
    });

    proc.once("close", (code) => {
      this.proc = undefined;
      if (this.running) {
        this.consecutiveErrors = code !== 0 ? this.consecutiveErrors + 1 : 0;
        log?.debug?.(
          `[MotionDetector][${this.opts.cameraName}] closed code=${code} errors=${this.consecutiveErrors}`,
        );
        this.scheduleRestart(log);
      }
    });
  }

  private lastHeartbeatAt = 0;

  private parseLine(line: string, pblackThreshold: number, log?: any): void {
    const m = line.match(/pblack:(\d+)/);
    if (!m) return;
    const pblack = parseInt(m[1], 10);
    const changedPct = 100 - pblack;

    const now = Date.now();
    if (now - this.lastHeartbeatAt > 30000) {
      this.lastHeartbeatAt = now;
      log?.notice?.(
        `[MotionDetector][${this.opts.cameraName}] 👁️ Analizando flujo activo a 1 FPS (cambio=${changedPct}%, pblack=${pblack}%, reposo)`,
      );
    }

    if (pblack <= pblackThreshold) {
      this.onMotionDetected(pblack, changedPct, log);
    }
  }

  private onMotionDetected(pblack: number, changedPct: number, log?: any): void {
    const now = Date.now();
    if (now - this.lastTriggerAt < (this.opts.cooldownMs ?? 4000)) return;
    this.lastTriggerAt = now;

    if (!this.motionActive) {
      this.motionActive = true;
      log?.notice?.(
        `[MotionDetector][${this.opts.cameraName}] 🎯 MOVIMIENTO DETECTADO EN CÁMARA (cambio=${changedPct}%, pblack=${pblack}%)`,
      );
      this.emit("motion", true);
    }

    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.resetTimer = undefined;
      if (this.motionActive) {
        this.motionActive = false;
        log?.notice?.(`[MotionDetector][${this.opts.cameraName}] Movimiento finalizado (reposo)`);
        this.emit("motion", false);
      }
    }, this.opts.resetMs ?? 15000);
  }

  private scheduleRestart(log?: any): void {
    if (!this.running || this.paused) return;
    const delayMs = Math.min(3000 * Math.pow(2, Math.min(this.consecutiveErrors, 3)), 30_000);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      this.spawnProcess(log);
    }, delayMs);
    this.restartTimer.unref();
  }
}

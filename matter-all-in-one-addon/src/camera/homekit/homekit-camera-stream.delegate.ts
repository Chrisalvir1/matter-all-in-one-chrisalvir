import { RtpDatagramRelay } from "./rtp-relay.js";
import { StreamStartupTiming } from "./startup-timing.js";
import { routeAddress } from "./route-address.js";
import { CameraSourceAdapter } from "../source-adapter.js";
import {
  h264AudioPlan,
  h264VideoPlan,
  verifiedH264Encoder,
} from "./media-policy.js";
import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  AudioRecordingSamplerate,
  CameraController,
  CameraStreamingDelegate,
  H264Level,
  H264Profile,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  ReconfigureStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  SRTPCryptoSuites,
  StartStreamRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  StreamingRequest,
} from "@homebridge/hap-nodejs";
import { spawn, type ChildProcess } from "node:child_process";
import dgram from "node:dgram";
import { isIPv4, isIPv6 } from "node:net";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import { CameraSourceResolver } from "../camera-source-resolver.js";
import {
  getFfmpegVersion,
  resolveFfmpegPath,
  sanitizeUrlCredentials,
  supportsFdkAac,
  checkAudioPassthroughCompatibility,
  detectPrimaryNetworkInterface,
  probeCameraSource,
} from "./ffmpeg-helper.js";
import {
  createSessionTelemetry,
  finishSessionTelemetry,
  mergeFfmpegProgress,
  mergeFfmpegStreamHeader,
  retainRecentSessions,
  sanitizeDiagnosticText,
  type LiveViewProcessingMode,
  type LiveViewSessionTelemetry,
  type VideoStreamMetadata,
} from "./live-view-telemetry.js";

export interface HomeKitStreamSession {
  sessionId: string;
  process?: ChildProcess;
  releaseReader?: () => void;
  targetAddress: string;
  videoPort: number;
  localVideoPort: number;
  localAddress?: string;
  videoRelay?: RtpDatagramRelay;
  audioRelay?: RtpDatagramRelay;
  startup?: StreamStartupTiming;
  videoSsrc: number;
  videoCryptoSuite: SRTPCryptoSuites;
  videoKeySalt: Buffer;
  audioPort?: number;
  localAudioPort?: number;
  audioSsrc?: number;
  audioCryptoSuite?: SRTPCryptoSuites;
  audioKeySalt?: Buffer;
  retried?: boolean;
  pipeController?: AbortController;
  telemetry?: LiveViewSessionTelemetry;
  /** FFmpeg writes input and output headers alike; observe only output fields. */
  ffmpegOutputHeaderSeen?: boolean;
}

export const FALLBACK_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYwLjMuMTAwAP/bAEMACAYGBwYHCAgICAgICQkJCgoKCQkJCQoKCgoKCgwMDAoKCgoKCgoMDAwMDQ4NDQ0MDQ4ODw8PEhIRERUVFRkZH//EAEwAAQEAAAAAAAAAAAAAAAAAAAAHAQEBAAAAAAAAAAAAAAAAAAAAARABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AI2AoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=",
  "base64",
);

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length > 128 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function convertImageToJpeg(
  inputBuffer: Buffer,
  width?: number,
  height?: number,
): Promise<Buffer | null> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) return Promise.resolve(null);
  return new Promise<Buffer | null>((resolve) => {
    const scaleFilter =
      width && height
        ? `scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`
        : undefined;
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
    ];
    if (scaleFilter) {
      args.push("-vf", scaleFilter);
    }
    args.push("-f", "image2", "-c:v", "mjpeg", "-q:v", "3", "pipe:1");

    const proc = spawn(ffmpegPath, args, {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      resolve(null);
    }, 2000);

    proc.stdout?.on("data", (c: Buffer) => chunks.push(c));
    proc.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const out = Buffer.concat(chunks);
        if (isJpeg(out) && out.length > 256) {
          resolve(out);
          return;
        }
      }
      resolve(null);
    });

    try {
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write(inputBuffer);
        proc.stdin.end();
      }
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function formatHost(address: string): string {
  // Strip IPv6 interface identifier like %en0 or %eth0 if present
  let cleanAddr = address;
  const pct = cleanAddr.indexOf("%");
  if (pct !== -1) {
    cleanAddr = cleanAddr.substring(0, pct);
  }
  // Strip IPv4-mapped IPv6 prefix (::ffff:192.168.x.x -> 192.168.x.x)
  cleanAddr = cleanAddr.replace(/^::ffff:/i, "");
  if (!cleanAddr.includes(":")) return cleanAddr;
  return cleanAddr.startsWith("[") ? cleanAddr : `[${cleanAddr}]`;
}

function suiteName(suite: SRTPCryptoSuites): string {
  return suite === SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80
    ? "AES_CM_256_HMAC_SHA1_80"
    : "AES_CM_128_HMAC_SHA1_80";
}

function h264Profile(profile: H264Profile): string {
  if (profile === H264Profile.HIGH) return "high";
  if (profile === H264Profile.MAIN) return "main";
  return "baseline";
}

function h264Level(level: H264Level): string {
  if (level === H264Level.LEVEL4_0) return "4.0";
  if (level === H264Level.LEVEL3_2) return "3.2";
  return "3.1";
}

/**
 * Resolves the appropriate frame rate for HomeKit Live View on a per-camera basis.
 * Priority order:
 * 1. Requested FPS from Apple HomeKit (if provided and valid > 0), capped by cameraMaxFps
 * 2. Source measured/probe FPS (if valid > 0), capped by cameraMaxFps
 * 3. Configured FPS (if valid > 0), capped by cameraMaxFps
 *
 * NOTE: cameraMaxFps is strictly a ceiling (upperLimit), NEVER an effective measurement.
 * If neither requestedFps, sourceFps, nor configuredFps is provided, returns undefined.
 */
export function resolveLiveViewFps(
  requestedFps: number | undefined,
  sourceFps: number | undefined,
  configuredFps: number | undefined,
  cameraMaxFps: number | undefined,
): number | undefined {
  const sanitize = (val: number | undefined): number | undefined => {
    return typeof val === "number" && Number.isFinite(val) && val > 0
      ? Math.round(val * 100) / 100
      : undefined;
  };

  const req = sanitize(requestedFps);
  const src = sanitize(sourceFps);
  const cfg = sanitize(configuredFps);
  const max = sanitize(cameraMaxFps);

  const candidate = req ?? src ?? cfg;
  if (candidate === undefined) {
    return undefined;
  }

  const upperLimit = Math.min(max ?? 60, src ?? 60, 60);
  return Math.max(1, Math.min(candidate, upperLimit));
}

export class HomeKitCameraStreamingDelegate
  extends EventEmitter
  implements CameraStreamingDelegate
{
  private readonly activeSessions = new Map<string, HomeKitStreamSession>();
  /**
   * Watchdog timers for orphaned prepareStream sessions.
   * If iOS calls prepareStream but cancels before startStream, the session
   * would remain in activeSessions forever, preventing activeSessions.size
   * from ever reaching 0.  This watchdog auto-cleans orphaned sessions after
   * PREPARE_TIMEOUT_MS and emits "session-end" if no active sessions remain.
   */
  private readonly prepareTimeouts = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  public static readonly PREPARE_TIMEOUT_MS = 45_000; // 45 seconds safety window

  private readonly recentSessions: LiveViewSessionTelemetry[] = [];
  private static readonly MAX_RECENT_SESSIONS = 8;
  private lastSnapshotBuffer: Buffer = FALLBACK_JPEG_BUFFER;

  public get isStreaming(): boolean {
    return this.activeSessions.size > 0;
  }

  /** Returns true when at least one live-view session is active. */
  public hasActiveSessions(): boolean {
    return this.activeSessions.size > 0;
  }

  /** Current number of active live-view sessions. */
  public activeSessionCount(): number {
    return this.activeSessions.size;
  }

  private isTakingSnapshot = false;
  private lastSnapshotTime = 0;

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private streamSource: ResolvedStreamSource,
    private readonly record?: HomeKitCameraStorageRecord,
  ) {
    super();
    this.loadPersistedSnapshot();
  }

  public isTapoC120(): boolean {
    const sourceUrl = (this.getCleanSourceUrl() || "").toLowerCase();
    const name = String(this.streamSource?.metadata?.name || "").toLowerCase();
    const model = String(
      this.streamSource?.metadata?.model || "",
    ).toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const isC120Token = (s: string) =>
      /(?:\bc120\b|tapo[-_ ]?c120\b|tapo[-_ ]?spot\b|\bspot\b)/i.test(s);
    return (
      isC120Token(model) ||
      isC120Token(entityId) ||
      isC120Token(name) ||
      isC120Token(sourceUrl)
    );
  }

  public isTapoC402(): boolean {
    const sourceUrl = (this.getCleanSourceUrl() || "").toLowerCase();
    const name = String(this.streamSource?.metadata?.name || "").toLowerCase();
    const model = String(
      this.streamSource?.metadata?.model || "",
    ).toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const isC402Token = (s: string) =>
      /(?:\bc402\b|tapo[-_ ]?c402|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente)/i.test(
        s,
      );
    return (
      isC402Token(model) ||
      isC402Token(entityId) ||
      isC402Token(name) ||
      isC402Token(sourceUrl)
    );
  }

  public isEzviz(): boolean {
    const sourceUrl = (this.getCleanSourceUrl() || "").toLowerCase();
    const name = String(this.streamSource?.metadata?.name || "").toLowerCase();
    const model = String(
      this.streamSource?.metadata?.model || "",
    ).toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const fullText = `${model} ${entityId} ${name} ${sourceUrl}`;
    if (/wyze/i.test(fullText)) return false;
    const isEzvizToken = (s: string) =>
      /(?:\bezviz\b|\bh6c\b|4661fae4|patio[-_ ]?trasero|ezviz[-_ ]?patio)/i.test(
        s,
      );
    return (
      isEzvizToken(model) ||
      isEzvizToken(entityId) ||
      isEzvizToken(name) ||
      isEzvizToken(sourceUrl)
    );
  }

  public isWyze(): boolean {
    const sourceUrl = (this.getCleanSourceUrl() || "").toLowerCase();
    const name = String(this.streamSource?.metadata?.name || "").toLowerCase();
    const model = String(
      this.streamSource?.metadata?.model || "",
    ).toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const isWyzeToken = (s: string) => /(?:\bwyze\b|cba17b87)/i.test(s);
    return (
      isWyzeToken(model) ||
      isWyzeToken(entityId) ||
      isWyzeToken(name) ||
      isWyzeToken(sourceUrl)
    );
  }

  /** Diagnostics only: never returns URLs, FFmpeg arguments, tokens, or SRTP material. */
  public getLiveViewTelemetry(): {
    active: LiveViewSessionTelemetry[];
    recent: LiveViewSessionTelemetry[];
  } {
    const active = [...this.activeSessions.values()]
      .map((session) => session.telemetry)
      .filter((telemetry): telemetry is LiveViewSessionTelemetry =>
        Boolean(telemetry),
      );
    return {
      active,
      recent: [...this.recentSessions],
    };
  }

  private sourceOutputMetadata(): VideoStreamMetadata {
    const measured = this.capabilities.measuredVideo;
    return {
      codec: measured?.codec,
      profile: measured?.profile,
      level: measured?.level,
      width: measured?.width,
      height: measured?.height,
      rFrameRate: measured?.rFrameRate,
      avgFrameRate: measured?.avgFrameRate,
      nominalFps: measured?.rFrameRate
        ? Number(measured.rFrameRate.split("/")[0]) /
          Number(measured.rFrameRate.split("/")[1] || 1)
        : undefined,
      averageFps: measured?.avgFrameRate
        ? Number(measured.avgFrameRate.split("/")[0]) /
          Number(measured.avgFrameRate.split("/")[1] || 1)
        : undefined,
      fps: measured?.fps,
      bitrateKbps: measured?.bitrateKbps,
      pixFmt: measured?.pixFmt,
      metadataSource: measured ? "ffprobe" : undefined,
    };
  }

  private startTelemetry(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    effectiveMode: LiveViewProcessingMode,
    output: VideoStreamMetadata,
    fallbackReason?: string,
    fpsProcessing?: LiveViewSessionTelemetry["fpsProcessing"],
  ): void {
    const video = request.video;
    const audio = request.audio;
    session.telemetry = createSessionTelemetry({
      cameraId: this.entityId,
      sessionId: session.sessionId,
      videoSsrc: session.videoSsrc,
      video: {
        width: video.width,
        height: video.height,
        fps: video.fps,
        profile: h264Profile(video.profile),
        level: h264Level(video.level),
        maxBitrateKbps: video.max_bit_rate,
      },
      audio: audio
        ? {
            codec:
              audio.codec === AudioStreamingCodecType.OPUS ? "opus" : "aac-eld",
            sampleRate:
              audio.sample_rate === AudioStreamingSamplerate.KHZ_24
                ? 24000
                : 16000,
            maxBitrateKbps: audio.max_bit_rate,
          }
        : undefined,
      effectiveMode,
      fpsProcessing: fpsProcessing || effectiveMode,
      output,
      fallbackReason,
    });
    if (session.startup) session.telemetry.startup = session.startup;
  }

  private finishTelemetry(
    session: HomeKitStreamSession,
    state: "finished" | "failed",
    error?: unknown,
  ): void {
    if (!session.telemetry || session.telemetry.state !== "active") return;
    const finished = finishSessionTelemetry(session.telemetry, state, error);
    session.telemetry = finished;
    this.recentSessions.splice(
      0,
      this.recentSessions.length,
      ...retainRecentSessions(
        this.recentSessions,
        finished,
        HomeKitCameraStreamingDelegate.MAX_RECENT_SESSIONS,
      ),
    );
  }

  private recordFfmpegProgress(
    session: HomeKitStreamSession,
    line: string,
  ): void {
    if (!session.telemetry) return;
    if (/^Output #\d+/i.test(line.trim())) {
      session.ffmpegOutputHeaderSeen = true;
      session.startup?.mark("T4");
      return;
    }
    const progress = mergeFfmpegProgress(session.telemetry.output, line);
    const output = session.ffmpegOutputHeaderSeen
      ? mergeFfmpegStreamHeader(progress, line)
      : progress;
    if (output) session.telemetry.output = output;
  }

  private loadPersistedSnapshot(): void {
    try {
      const snapPath = `/data/snapshots/${this.entityId.replaceAll(".", "_")}.jpg`;
      if (fsSync.existsSync(snapPath)) {
        const buf = fsSync.readFileSync(snapPath);
        if (isJpeg(buf) && buf.length > 2048) {
          this.lastSnapshotBuffer = buf;
          // A persisted snapshot can survive an add-on restart. Preserve its
          // actual age instead of treating load time as capture time.
          this.lastSnapshotTime = fsSync.statSync(snapPath).mtimeMs;
        }
      }
    } catch {}
  }

  private async persistSnapshotToDisk(buffer: Buffer): Promise<void> {
    try {
      const dir = "/data/snapshots";
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
      const snapPath = `${dir}/${this.entityId.replaceAll(".", "_")}.jpg`;
      await fs.writeFile(snapPath, buffer);
    } catch {}
  }

  public async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    const started = Date.now();
    let completed = false;
    let safetyTimer: ReturnType<typeof setTimeout> | undefined = undefined;
    const finish = (source: string, buffer: Buffer): void => {
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = undefined;
      }
      this.isTakingSnapshot = false;
      if (completed) return;
      completed = true;
      const selected =
        isJpeg(buffer) && buffer.length > 2048
          ? buffer
          : this.lastSnapshotBuffer;
      if (isJpeg(selected) && selected !== FALLBACK_JPEG_BUFFER) {
        this.lastSnapshotBuffer = selected;
        // Cached/error fallbacks keep HomeKit responsive, but must not make
        // old bytes appear newly captured or replace a newer disk snapshot.
        if (
          source === "ha-fetch-snapshot" ||
          source === "ha-fetch-png-converted" ||
          source === "http-snapshot" ||
          source === "http-png-converted" ||
          source === "ffmpeg"
        ) {
          this.lastSnapshotTime = Date.now();
          void this.persistSnapshotToDisk(selected);
        }
      }
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Snapshot source=${source} bytes=${selected.length} duration=${Date.now() - started}ms validJpeg=${isJpeg(selected)}`,
      );
      callback(undefined, selected);
    };

    // NEVER open a competing RTSP connection while live viewing is active.
    // Cameras like Tapo allow max 2 RTSP connections; opening a 3rd connection kills the live stream.
    if (this.activeSessions.size > 0) {
      finish("active-session-protect", this.lastSnapshotBuffer);
      return;
    }

    // If a live stream is actively running, reuse last snapshot immediately to avoid RTSP socket contention
    if (
      this.activeSessions.size > 0 &&
      this.lastSnapshotBuffer &&
      this.lastSnapshotBuffer !== FALLBACK_JPEG_BUFFER
    ) {
      finish("cached-active-stream", this.lastSnapshotBuffer);
      return;
    }

    const now = Date.now();
    if (
      this.lastSnapshotBuffer &&
      this.lastSnapshotBuffer !== FALLBACK_JPEG_BUFFER &&
      (this.isTakingSnapshot || now - this.lastSnapshotTime < 8000)
    ) {
      finish("cached-session-guard", this.lastSnapshotBuffer);
      return;
    }

    this.isTakingSnapshot = true;
    safetyTimer = setTimeout(() => {
      if (
        !completed &&
        this.lastSnapshotBuffer &&
        this.lastSnapshotBuffer !== FALLBACK_JPEG_BUFFER
      ) {
        finish("safety-cached-fallback", this.lastSnapshotBuffer);
      }
    }, 1800);

    try {
      let haEntityToQuery: string | undefined = this.entityId.startsWith(
        "camera.",
      )
        ? this.entityId
        : undefined;

      if (!haEntityToQuery && this.platform?.ha?.hassStates) {
        const cleanName = this.entityId
          .replace(/^scrypted\./, "")
          .toLowerCase();
        const cameraModel = (
          this.streamSource.metadata?.model || ""
        ).toLowerCase();
        for (const [id, state] of this.platform.ha.hassStates.entries()) {
          if (!id.startsWith("camera.")) continue;
          const fn = (state.attributes?.friendly_name || "").toLowerCase();
          if (
            id.includes(cleanName) ||
            fn.includes(cleanName) ||
            (cameraModel && fn.includes(cameraModel))
          ) {
            haEntityToQuery = id;
            break;
          }
        }
      }

      if (
        haEntityToQuery &&
        this.platform?.ha?.fetchSnapshot &&
        typeof this.platform.ha.fetchSnapshot === "function"
      ) {
        try {
          const buffer = await this.platform.ha.fetchSnapshot(haEntityToQuery);
          if (buffer && isJpeg(buffer) && buffer.length > 512) {
            finish("ha-fetch-snapshot", buffer);
            return;
          } else if (buffer && isPng(buffer)) {
            const converted = await convertImageToJpeg(
              buffer,
              request.width,
              request.height,
            );
            if (converted) {
              finish("ha-fetch-png-converted", converted);
              return;
            }
          }
        } catch {}
      }

      const snapshotUrl = this.streamSource.snapshotUrl;
      if (
        snapshotUrl?.startsWith("http://") ||
        snapshotUrl?.startsWith("https://")
      ) {
        try {
          const headers: Record<string, string> = {};
          const token =
            this.platform?.ha?.getAccessToken?.() ||
            this.platform?.ha?.wsAccessToken;
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          const response = await fetch(snapshotUrl, {
            headers,
            signal: AbortSignal.timeout(1500),
          });
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            if (isJpeg(buffer) && buffer.length > 512) {
              finish("http-snapshot", buffer);
              return;
            } else if (isPng(buffer)) {
              const converted = await convertImageToJpeg(
                buffer,
                request.width,
                request.height,
              );
              if (converted) {
                finish("http-png-converted", converted);
                return;
              }
            }
          }
        } catch (error) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] Snapshot HTTP failed: ${sanitizeDiagnosticText(error)}`,
          );
        }
      }

      const ffmpegPath = resolveFfmpegPath();
      const sourceUrl = this.getCleanSourceUrl();
      if (!ffmpegPath || !sourceUrl) {
        finish("fallback-no-source", this.lastSnapshotBuffer);
        return;
      }

      const args = ["-hide_banner", "-loglevel", "error"];
      if (/^rtsps?:\/\//.test(sourceUrl)) {
        args.push(
          "-probesize",
          "2097152",
          "-analyzeduration",
          "3000000",
          "-rtsp_transport",
          "tcp",
          "-timeout",
          "3000000",
          "-fflags",
          "+nobuffer+flush_packets",
          "-flags",
          "low_delay",
        );
      } else if (
        sourceUrl.startsWith("http://") ||
        sourceUrl.startsWith("https://")
      ) {
        args.push(
          "-probesize",
          "32768",
          "-analyzeduration",
          "0",
          "-fflags",
          "+nobuffer+flush_packets",
          "-flags",
          "low_delay",
        );
        const token =
          this.platform?.ha?.getAccessToken?.() ||
          this.platform?.ha?.wsAccessToken;
        if (token) {
          args.push("-headers", `Authorization: Bearer ${token}\r\n`);
        }
      }
      args.push(
        "-i",
        sourceUrl,
        "-frames:v",
        "1",
        "-vf",
        `scale=w='min(${request.width},iw)':h='min(${request.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
        "-f",
        "image2",
        "-q:v",
        "3",
        "pipe:1",
      );

      const process = spawn(ffmpegPath, args, {
        stdio: ["ignore", "pipe", "ignore"],
      });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        try {
          process.kill("SIGKILL");
        } catch {}
        finish("fallback-timeout", this.lastSnapshotBuffer);
      }, 2000);
      process.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      process.once("error", () => {
        clearTimeout(timer);
        finish("fallback-ffmpeg-error", this.lastSnapshotBuffer);
      });
      process.once("close", () => {
        clearTimeout(timer);
        const buffer = Buffer.concat(chunks);
        finish(
          isJpeg(buffer) && buffer.length > 2048
            ? "ffmpeg"
            : "fallback-invalid-jpeg",
          buffer,
        );
      });
    } catch (error) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Snapshot fatal error: ${sanitizeDiagnosticText(error)}`,
      );
      finish("fatal-error", this.lastSnapshotBuffer);
    }
  }

  public prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): void {
    void this.prepareStreamAsync(request, callback);
  }

  private async prepareStreamAsync(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): Promise<void> {
    let callbackCompleted = false;
    try {
      // Purge any zombie sessions (process died but Map entry survived) before
      // setting up a new one — otherwise the old dead entry corrupts cleanup.
      for (const [sid, s] of [...this.activeSessions.entries()]) {
        if (s.process && (s.process.killed || s.process.exitCode !== null)) {
          this.platform?.log?.notice?.(
            `[HomeKitCamera][${this.entityId}] Purging zombie session=${sid} before new prepare`,
          );
          if (s.pipeController) {
            try {
              s.pipeController.abort();
            } catch {}
          }
          if (s.process) {
            try {
              s.process.kill("SIGKILL");
            } catch {}
          }
          s.releaseReader?.();
          s.videoRelay?.close();
          s.audioRelay?.close();
          this.activeSessions.delete(sid);
        }
      }

      const localVideoPort = await this.allocateUdpPort([request.video.port]);
      const localAudioPort = request.audio
        ? await this.allocateUdpPort([request.audio.port, localVideoPort])
        : undefined;
      const session: HomeKitStreamSession = {
        sessionId: request.sessionID,
        targetAddress: request.targetAddress,
        videoPort: request.video.port,
        localVideoPort,
        videoSsrc: CameraController.generateSynchronisationSource(),
        videoCryptoSuite: request.video.srtpCryptoSuite,
        videoKeySalt: Buffer.concat([
          request.video.srtp_key,
          request.video.srtp_salt,
        ]),
      };
      if (request.audio) {
        const audioPort = localAudioPort || localVideoPort + 1;
        session.audioPort = request.audio.port;
        session.localAudioPort = audioPort;
        session.audioSsrc = CameraController.generateSynchronisationSource();
        session.audioCryptoSuite = request.audio.srtpCryptoSuite;
        session.audioKeySalt = Buffer.concat([
          request.audio.srtp_key,
          request.audio.srtp_salt,
        ]);
      }
      this.activeSessions.set(request.sessionID, session);

      try {
        session.videoRelay = await RtpDatagramRelay.create(
          request.targetAddress,
          request.video.port,
          () => session.startup?.mark("T5"),
        );
        if (request.audio)
          session.audioRelay = await RtpDatagramRelay.create(
            request.targetAddress,
            request.audio.port,
            () => session.startup?.mark("T6"),
          );
      } catch (error) {
        session.videoRelay?.close();
        session.audioRelay?.close();
        session.releaseReader?.();
        this.activeSessions.delete(session.sessionId);
        throw error;
      }
      // Install watchdog timer: if startStream is never called by iOS (e.g. user cancelled
      // live view before connection established), auto-clean the orphaned session after 45s.
      const zombieTimer = setTimeout(() => {
        this.prepareTimeouts.delete(request.sessionID);
        const s = this.activeSessions.get(request.sessionID);
        if (s && !s.process) {
          this.platform?.log?.warn?.(
            `[HomeKitCamera][${this.entityId}] [Session][${request.sessionID}] session-timeout: prepareStream completed but startStream was not called after ${HomeKitCameraStreamingDelegate.PREPARE_TIMEOUT_MS / 1000}s — clearing orphan session`,
          );
          s.releaseReader?.();
          s.videoRelay?.close();
          s.audioRelay?.close();
          this.activeSessions.delete(request.sessionID);
          if (this.activeSessions.size === 0) {
            this.platform?.log?.notice?.(
              `[HomeKitCamera][${this.entityId}] [Session] session-end (cleared last orphan session)`,
            );
            this.emit("session-end");
          }
        }
      }, HomeKitCameraStreamingDelegate.PREPARE_TIMEOUT_MS);
      this.prepareTimeouts.set(request.sessionID, zombieTimer);

      // sourceAddress may be an IPv6 interface address even when HomeKit
      // negotiated IPv4. Always advertise an address from the negotiated
      // family; fall back to the host's primary IPv4 if needed, or let HAP
      // choose the bound interface when no safe override is available.
      const sourceAddress =
        typeof request.sourceAddress === "string" &&
        request.sourceAddress.startsWith("::ffff:")
          ? request.sourceAddress.slice("::ffff:".length)
          : request.sourceAddress;
      const addressOverride = await routeAddress(
        request.targetAddress,
        request.video.port,
      );
      session.localAddress = addressOverride;
      const response: PrepareStreamResponse = {
        ...(addressOverride ? { addressOverride } : {}),
        video: {
          port: session.videoRelay?.outputPort || localVideoPort,
          ssrc: session.videoSsrc,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
      };
      if (request.audio) {
        const audioPort =
          session.localAudioPort || localAudioPort || localVideoPort + 1;
        response.audio = {
          port: audioPort,
          ssrc: session.audioSsrc!,
          srtp_key: request.audio.srtp_key,
          srtp_salt: request.audio.srtp_salt,
        };
      }
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] [Session][${request.sessionID}] session-prepare activeSessions=${this.activeSessions.size} addressOverride=${response.addressOverride || "HAP-default"} addressVersion=${request.addressVersion} sourceAddressFamily=${isIPv4(sourceAddress || "") ? "ipv4" : isIPv6(sourceAddress || "") ? "ipv6" : "unknown"} remote=${request.targetAddress}:${request.video.port} localVideoRTCP=${localVideoPort} videoSSRC=${session.videoSsrc}${session.localAudioPort ? ` localAudioRTCP=${session.localAudioPort} audioSSRC=${session.audioSsrc}` : ""}`,
      );
      callbackCompleted = true;
      callback(undefined, response);
    } catch (error) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] HAP SetupEndpoints failed: ${sanitizeDiagnosticText(error)}`,
      );
      if (!callbackCompleted) {
        callbackCompleted = true;
        callback(error as Error);
      }
    }
  }

  private allocateUdpPort(excluded: number[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.once("error", (error) => {
        try {
          socket.close();
        } catch {}
        reject(error);
      });
      socket.bind(0, "0.0.0.0", () => {
        const address = socket.address();
        const port = typeof address === "string" ? 0 : address.port;
        socket.close(() => {
          if (!port || excluded.includes(port)) {
            void this.allocateUdpPort(excluded).then(resolve, reject);
          } else {
            resolve(port);
          }
        });
      });
    });
  }

  public handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback,
  ): void {
    if (request.type === StreamRequestTypes.START) {
      const session = this.activeSessions.get(request.sessionID);
      if (!session) {
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] HAP START rejected: session=${request.sessionID} was not prepared`,
        );
        callback(new Error(`Session ${request.sessionID} was not prepared`));
        return;
      }
      let completed = false;
      const done: StreamRequestCallback = (error) => {
        if (completed) return;
        completed = true;
        callback(error);
      };
      void this.startStream(session, request as StartStreamRequest, done).catch(
        (error) => {
          if (this.activeSessions.get(request.sessionID) === session)
            this.stopStream(request.sessionID);
          done(
            new Error(
              sanitizeDiagnosticText(
                error instanceof Error ? error.message : String(error),
              ) || "Camera session failed",
            ),
          );
        },
      );
      return;
    }
    if (request.type === StreamRequestTypes.RECONFIGURE) {
      const video = (request as ReconfigureStreamRequest).video;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] HAP RECONFIGURE ${video.width}x${video.height}@${video.fps}`,
      );
      callback();
      return;
    }
    this.stopStream(request.sessionID);
    callback();
  }

  private getCleanSourceUrl(): string | undefined {
    let url = this.streamSource.url;
    if (!url) return undefined;
    const hashIdx = url.indexOf("#");
    if (hashIdx !== -1) {
      url = url.substring(0, hashIdx);
    }
    // Replace localhost with 127.0.0.1 to avoid IPv6 connection issues in FFmpeg
    url = url.replace(
      /^(rtsps?|https?):\/\/localhost(?=[:/])/i,
      "$1://127.0.0.1",
    );
    return url;
  }

  private async startStream(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    callback: StreamRequestCallback,
  ): Promise<void> {
    session.startup = new StreamStartupTiming();
    session.startup.metrics.retries = 0;
    const video = request.video;
    const measuredFps = this.capabilities.measuredVideo?.fps;
    const declaredFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.round(measuredFps) : 30);
    const requestedFps = video?.fps;
    const cameraMaxFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0
        ? Math.max(15, Math.round(measuredFps))
        : 30);
    const effectiveFps = resolveLiveViewFps(
      requestedFps,
      measuredFps,
      this.capabilities.maxFps,
      cameraMaxFps,
    );

    const ffmpegPath = resolveFfmpegPath();
    const readerAdapter = new CameraSourceAdapter(
      this.platform,
      this.entityId,
      this.streamSource,
      this.capabilities,
      this.record,
    );
    if (readerAdapter.provider === "omni_tuya")
      session.releaseReader = readerAdapter.acquireReader(session);
    // Pause recording/motion readers BEFORE allocating an Omni session.
    // Tuya allocation by a competing reader can invalidate the live URL.
    this.emit("session-start", session.sessionId);
    await new Promise((resolve) => setImmediate(resolve));
    const allocationStarted = performance.now();
    const adapter = new CameraSourceAdapter(
      this.platform,
      this.entityId,
      this.streamSource,
      this.capabilities,
      this.record,
    );
    let sourceUrl: string | undefined;
    try {
      this.streamSource = await adapter.resolveSession();
      sourceUrl = this.getCleanSourceUrl();
    } catch {
      sourceUrl = undefined;
    }

    if (this.activeSessions.get(session.sessionId) !== session) {
      session.releaseReader?.();
      callback(new Error("HAP session ended during source resolution"));
      return;
    }
    session.startup?.mark("T1");
    if (session.startup)
      session.startup.metrics.allocation1Ms =
        performance.now() - allocationStarted;
    if (!ffmpegPath || !sourceUrl) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] HAP START rejected: ${!ffmpegPath ? "FFmpeg unavailable" : "stream source unavailable"}`,
      );
      callback(new Error("FFmpeg or RTSP source is unavailable"));
      this.stopStream(session.sessionId);
      return;
    }
    // Omni issues a new single-session RTSP URL for each HomeKit open. The
    // startup probe can therefore describe an older URL and incorrectly mark
    // its audio as absent. Probe the exact URL about to be sent to FFmpeg.
    if (this.streamSource.metadata?.isOmniTuyaDirect === true) {
      let probeConsumedReader = false;
      {
        const probeStarted = performance.now();
        try {
          const adapter = new CameraSourceAdapter(
            this.platform,
            this.entityId,
            this.streamSource,
            this.capabilities,
            this.record,
          );
          // Re-measure SD/HD changes with recording and motion already paused.
          adapter.invalidate();
          const { probe, performed } = await adapter.discover(sourceUrl);
          probeConsumedReader = performed;
          if (session.startup)
            session.startup.metrics.probeMs = performance.now() - probeStarted;
          if (probe.valid) {
            this.capabilities.audioProvenance = "PROBED";
            this.emit("source-capabilities");
            this.capabilities.hasAudio = probe.hasAudio;
            this.capabilities.audioCodec = probe.hasAudio
              ? ((probe.audioCodec || "incompatible") as any)
              : "none";
            this.capabilities.audioSampleRate = probe.audioSampleRate;
            this.capabilities.audioChannels = probe.audioChannels;
            this.platform?.log?.notice?.(
              `[HomeKitCamera][${this.entityId}] Fresh Omni stream probe: audio=${probe.hasAudio ? `${probe.audioCodec || "present"}/${probe.audioSampleRate || "unknown"}Hz` : "absent"}`,
            );
          }
        } catch {
          // The stream start remains available; the existing capability record
          // decides whether Apple receives an audio RTP branch.
        }
      }
      // Metadata probing is a separate RTSP reader. Allocate another signed
      // URL for the actual live process instead of reopening the probe URL.
      if (probeConsumedReader) {
        const allocation2Started = performance.now();
        const freshUrl = await this.platform?.ha?.requestOmniTuyaCameraStream?.(
          this.streamSource.metadata?.sourceCameraEntityId || this.entityId,
        );
        if (!freshUrl) {
          callback(
            new Error("Omni could not renew the live stream after probing"),
          );
          this.stopStream(session.sessionId);
          return;
        }
        this.streamSource.url = freshUrl;
        sourceUrl = this.getCleanSourceUrl();
        if (session.startup)
          session.startup.metrics.allocation2Ms =
            performance.now() - allocation2Started;
      }
    }
    if (this.activeSessions.get(session.sessionId) !== session) {
      session.releaseReader?.();
      callback(new Error("HAP session ended during source resolution"));
      return;
    }
    session.startup?.mark("T2");
    // HomeKit on iOS can request default low bitrates (e.g. 299k).
    // Ensure a high-fidelity floor: at least 3500k-5000k for 2K (Tapo/Wyze), 6000k-8000k for 4K.
    const qualityFloor =
      video.width >= 3840
        ? 6000
        : video.width >= 2304
          ? 3500
          : video.width >= 1920
            ? 2500
            : 1500;
    const maxBitrateCap =
      video.width >= 3840
        ? 12000
        : video.width >= 2304
          ? 6000
          : video.width >= 1920
            ? 4000
            : 2500;
    const bitrate = Math.max(
      qualityFloor,
      Math.min(video.max_bit_rate || 2500, maxBitrateCap),
    );
    // Cancel the prepare watchdog timer because stream has legitimately started
    const timer = this.prepareTimeouts.get(session.sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.prepareTimeouts.delete(session.sessionId);
    }
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] [Session][${session.sessionId}] session-start ${video.width}x${video.height} | FPS[declarado=${declaredFps}, solicitado=${requestedFps ?? "omitted"}, medido=${measuredFps ?? "unmeasured"}, efectivo=${effectiveFps ?? "auto"}]`,
    );

    // Yield event loop without artificial delay so background listeners handle pause immediately
    await new Promise((resolve) => setImmediate(resolve));

    let callbackSettled = false;
    const settle = (error?: Error): void => {
      if (callbackSettled) return;
      callbackSettled = true;
      session.startup?.mark("T7");
      callback(error);
    };
    if (this.activeSessions.get(session.sessionId) !== session) {
      session.releaseReader?.();
      settle(new Error("HAP session ended before media spawn"));
      return;
    }
    this.spawnFfmpegProcess(session, request, settle, false);
  }

  private spawnFfmpegProcess(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    settle: (error?: Error) => void,
    forceTranscode = false,
  ): void {
    const ffmpegPath = resolveFfmpegPath() || "ffmpeg";
    const sourceUrl = this.getCleanSourceUrl();
    const video = request.video;
    const measuredFps = this.capabilities.measuredVideo?.fps;
    const declaredFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.round(measuredFps) : 30);
    const requestedFps = video?.fps;
    const cameraMaxFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0
        ? Math.max(15, Math.round(measuredFps))
        : 30);
    const effectiveFps = resolveLiveViewFps(
      requestedFps,
      measuredFps,
      this.capabilities.maxFps,
      cameraMaxFps,
    );
    const mtu = video.mtu || 1378;

    const args = this.buildStreamArgs(session, request, forceTranscode);

    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] HAP START ${video.width}x${video.height} forceTranscode=${forceTranscode} profile=${h264Profile(video.profile)} level=${h264Level(video.level)} mtu=${mtu} fps[declarado=${declaredFps}, solicitado=${requestedFps ?? "omitted"}, medido=${measuredFps ?? "unmeasured"}, efectivo=${effectiveFps ?? "auto"}] source=[camera-source] ffmpeg=${ffmpegPath} ${getFfmpegVersion(ffmpegPath) || "unknown"}`,
    );

    const isHaProxyStream =
      this.streamSource.sourceType === "ha_proxy" ||
      this.streamSource.sourceType === "mjpeg" ||
      Boolean(
        sourceUrl &&
        (sourceUrl.includes("/api/camera_proxy_stream/") ||
          sourceUrl.includes("/api/camera_proxy/")),
      );
    try {
      const spawnStarted = performance.now();
      const process = spawn(ffmpegPath, args, {
        stdio: [
          isHaProxyStream ? "pipe" : "ignore",
          "pipe",
          "pipe",
          this.streamSource.metadata?.isOmniTuyaDirect === true &&
          /^rtsps?:\/\//i.test(sourceUrl || "")
            ? "pipe"
            : "ignore",
        ],
      });
      session.process = process;
      process.once("spawn", () => {
        if (session.startup)
          session.startup.metrics.ffmpegSpawnMs =
            performance.now() - spawnStarted;
      });
      const recordingPipe = process.stdio[3];
      if (recordingPipe && typeof recordingPipe !== "string") {
        recordingPipe.on("data", (chunk: Buffer) => {
          this.emit("recording-analysis-data", chunk);
        });
      }
      if (isHaProxyStream && sourceUrl) {
        this.startHaCameraProxyPipe(session, process, sourceUrl);
      }
      let stderr = "";
      let progress = "";
      let startupTimer: NodeJS.Timeout | undefined;
      let startupConfirmed = false;
      process.stdout?.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split(/\r?\n/)) {
          this.recordFfmpegProgress(session, line);
        }
      });
      process.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (/Input #|Stream #0/.test(text)) session.startup?.mark("T3");
        for (const line of text.split(/\r?\n/)) {
          this.recordFfmpegProgress(session, line);
          if (/pblack:\d+/.test(line)) {
            this.emit("motion-analysis-line", line);
          }
        }
        // Keep a short, pre-sanitized failure summary only. Raw FFmpeg stderr
        // can contain source URLs or HTTP authorization headers.
        const safe = sanitizeDiagnosticText(text);
        if (safe) stderr = `${stderr}\n${safe}`.slice(-1200);
      });
      const guard = setTimeout(() => {
        if (process.exitCode === null && !process.killed) settle();
        else settle(new Error("FFmpeg exited during HAP startup"));
      }, 400);
      process.once("error", (error) => {
        clearTimeout(guard);
        if (startupTimer) clearTimeout(startupTimer);
        settle(error);
      });
      process.once("close", (code) => {
        if (
          this.activeSessions.get(session.sessionId) !== session ||
          session.process !== process
        )
          return;
        clearTimeout(guard);
        if (startupTimer) clearTimeout(startupTimer);
        session.process = undefined;
        if (code !== 0)
          new CameraSourceAdapter(
            this.platform,
            this.entityId,
            this.streamSource,
            this.capabilities,
            this.record,
          ).invalidate();
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] FFmpeg closed code=${code} ${stderr.trim()}`,
        );

        // Automatic fallback recovery: if initial attempt failed (e.g. missing audio track or incompatible passthrough),
        // retry immediately with safe transcoding and/or silent audio fallback
        if (
          code !== 0 &&
          !session.retried &&
          this.activeSessions.has(session.sessionId)
        ) {
          session.retried = true;
          if (session.startup)
            session.startup.metrics.retries =
              (session.startup.metrics.retries || 0) + 1;
          this.finishTelemetry(
            session,
            "failed",
            stderr || `FFmpeg exited with code ${code}`,
          );

          const isOmniStreamNotFound =
            this.streamSource.metadata?.isOmniTuyaDirect === true &&
            /(?:DESCRIBE failed:\s*404|404\s+Stream Not Found)/i.test(stderr);
          if (isOmniStreamNotFound) {
            const sourceEntityId =
              this.streamSource.metadata?.sourceCameraEntityId || this.entityId;
            void (async () => {
              const state = this.platform?.ha?.hassStates?.get(sourceEntityId);
              const fallback =
                await CameraSourceResolver.resolveOmniTuyaFallback(
                  this.platform,
                  sourceEntityId,
                  state,
                  { allowCameraProxy: false },
                );
              if (fallback?.url) {
                this.streamSource = fallback;
                this.platform?.log?.warn?.(
                  `[HomeKitCamera][${this.entityId}] Omni RTSP returned 404 Stream Not Found; retrying Live View through Home Assistant's stream/proxy route.`,
                );
                this.spawnFfmpegProcess(session, request, settle, false);
                return;
              }

              this.platform?.log?.error?.(
                `[HomeKitCamera][${this.entityId}] Omni RTSP returned 404 and Home Assistant could not provide a fallback stream.`,
              );
              settle(
                new Error(
                  "Omni RTSP stream not found; HA fallback unavailable",
                ),
              );
              session.videoRelay?.close();
              session.audioRelay?.close();
              session.releaseReader?.();
              this.activeSessions.delete(session.sessionId);
              if (this.activeSessions.size === 0) this.emit("session-end");
            })().catch((error) => {
              this.platform?.log?.warn?.(
                `[HomeKitCamera][${this.entityId}] Could not switch Omni Live View to Home Assistant fallback: ${sanitizeDiagnosticText(error instanceof Error ? error.message : "unknown error")}`,
              );
              settle(new Error("Omni RTSP fallback failed"));
              session.videoRelay?.close();
              session.audioRelay?.close();
              session.releaseReader?.();
              this.activeSessions.delete(session.sessionId);
              if (this.activeSessions.size === 0) this.emit("session-end");
            });
            return;
          }

          const is401 =
            stderr.includes("401") ||
            stderr.includes("Unauthorized") ||
            stderr.includes("Authentication failed");

          if (is401) {
            this.platform?.log?.warn?.(
              `[HomeKitCamera][${this.entityId}] RTSP authentication failed; keeping the configured URL and credentials unchanged.`,
            );
          }

          const isAudioFailure =
            stderr.includes("matches no streams") ||
            stderr.includes("0:a:0") ||
            stderr.includes("does not contain any stream") ||
            stderr.includes("Output file #1");

          if (isAudioFailure) {
            this.capabilities.hasAudio = false;
          }

          // Keep passthrough active: do not force transcoding which is prohibited
          const retryTranscode = false;

          this.platform?.log?.notice?.(
            `[HomeKitCamera][${this.entityId}] Retrying stream with safe fallback: forceTranscode=${retryTranscode} hasAudio=${this.capabilities.hasAudio}`,
          );
          this.spawnFfmpegProcess(session, request, settle, retryTranscode);
          return;
        }

        this.finishTelemetry(
          session,
          code === 0 ? "finished" : "failed",
          code === 0 ? undefined : stderr || `FFmpeg exited with code ${code}`,
        );
        settle(new Error(`FFmpeg exited during HAP startup (code ${code})`));
        // Clean up the ghost session entry so the next HomeKit reconnect
        // finds a clean Map — otherwise stopStream() later can't properly
        // emit session-end and activeSessions grows with stale entries.
        session.videoRelay?.close();
        session.audioRelay?.close();
        session.releaseReader?.();
        this.activeSessions.delete(session.sessionId);
        if (this.activeSessions.size === 0) {
          this.emit("session-end");
        }
      });
    } catch (error) {
      settle(error as Error);
    }
  }

  public buildStreamArgs(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    forceTranscode = false,
  ): string[] {
    if (["hevc", "h265"].includes(this.capabilities.videoCodec))
      throw new Error("HEVC requires SecureVideoController");
    const sourceUrl = this.getCleanSourceUrl();
    if (!sourceUrl) {
      return [];
    }
    const video = request.video;
    const measuredFps = this.capabilities.measuredVideo?.fps;
    const declaredFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.round(measuredFps) : 30);
    const requestedFps = video.fps;
    const cameraMaxFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0
        ? Math.max(15, Math.round(measuredFps))
        : 30);
    const resolvedFps = resolveLiveViewFps(
      requestedFps,
      measuredFps,
      this.capabilities.maxFps,
      cameraMaxFps,
    );
    const mtu = video.mtu || 1378;
    const host = formatHost(session.targetAddress);
    const videoUrl = session.videoRelay
      ? `srtp://127.0.0.1:${session.videoRelay.inputPort}?rtcpport=${session.videoRelay.inputPort}&pkt_size=${mtu}`
      : `srtp://${host}:${session.videoPort}` +
        `?rtcpport=${session.videoPort}&localrtcpport=${session.localVideoPort}&pkt_size=${mtu}&buffer_size=1048576${session.localAddress ? `&localaddr=${encodeURIComponent(session.localAddress)}` : ""}`;

    const isHaProxyStream =
      this.streamSource.sourceType === "ha_proxy" ||
      this.streamSource.sourceType === "mjpeg" ||
      Boolean(
        sourceUrl &&
        (sourceUrl.includes("/api/camera_proxy_stream/") ||
          sourceUrl.includes("/api/camera_proxy/")),
      );
    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      // Info is required only to observe FFmpeg's output stream header. The
      // parser retains structured fields and discards every raw log line.
      "info",
      "-protocol_whitelist",
      "pipe,udp,rtp,file,crypto,srtp,tcp,tls,http,https,lavfi,rtsp,rtsps",
    ];
    args.push("-progress", "pipe:1", "-stats_period", "0.25");

    if (isHaProxyStream) {
      // Home Assistant's continuous camera proxy emits multipart JPEG frames.
      // The old PNG decoder rejected those frames, so HAP published but never
      // received video when the C402 fell back from HLS to camera_proxy_stream.
      args.push(
        "-f",
        "image2pipe",
        "-c:v",
        "mjpeg",
        "-r",
        "15",
        "-i",
        "pipe:0",
      );
    } else if (
      sourceUrl.startsWith("rtsp://") ||
      sourceUrl.startsWith("rtsps://")
    ) {
      args.push(
        "-rtsp_transport",
        "tcp",
        "-timeout",
        "10000000",
        "-probesize",
        "2097152",
        "-analyzeduration",
        "3000000",
        "-fflags",
        "+genpts+discardcorrupt",
        "-flags",
        "low_delay",
        "-thread_queue_size",
        "512",
        "-i",
        sourceUrl,
      );
    } else if (
      sourceUrl.startsWith("http://") ||
      sourceUrl.startsWith("https://")
    ) {
      args.push(
        "-reconnect",
        "1",
        "-reconnect_at_eof",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "2",
        "-rw_timeout",
        "10000000",
        "-probesize",
        "1048576",
        "-analyzeduration",
        "1000000",
        "-fflags",
        "+nobuffer+flush_packets+genpts",
        "-flags",
        "low_delay",
        "-max_delay",
        "500000",
      );
      if (sourceUrl.startsWith("https://")) {
        args.push("-tls_verify", "0");
      }
      args.push(
        ...new CameraSourceAdapter(
          this.platform,
          this.entityId,
          this.streamSource,
          this.capabilities,
          this.record,
        ).inputArguments(),
      );
      args.push("-i", sourceUrl);
    } else {
      args.push("-i", sourceUrl);
    }

    const audioPlan = h264AudioPlan(this.capabilities);
    const hasAudioRequested = Boolean(
      request.audio &&
      session.audioPort &&
      session.localAudioPort &&
      session.audioSsrc &&
      session.audioKeySalt &&
      audioPlan.codec !== "unavailable",
    );
    const sampleRate =
      audioPlan.codec === "unavailable" ? 24000 : audioPlan.sampleRate;
    const codec = (this.capabilities.videoCodec || "h264").toLowerCase();
    // HAP's RTP VideoStream service advertises H.264 profiles only.  Copying
    // HEVC into that RTP session makes FFmpeg appear healthy while Apple Home
    // receives packets it did not negotiate, ending in "No Response".  HEVC
    // remains native up to this output boundary, then is converted solely for
    // Both Tapo C402 and C120 are native 1080p H.264 streams; they use pure copy passthrough
    // (-c:v copy) with zero software transcoding and zero CPU load.
    const h264Plan =
      this.capabilities.videoCodec === "h264"
        ? h264VideoPlan(
            this.capabilities,
            verifiedH264Encoder(),
            forceTranscode,
            { width: video.width, height: video.height, fps: resolvedFps },
          )
        : undefined;
    const needsTapoVideoNormalization = h264Plan?.mode === "normalization";
    const isHevc =
      codec === "hevc" ||
      codec === "h265" ||
      this.capabilities.strategy === "passthrough_hevc";
    const canPassthrough =
      !forceTranscode &&
      !needsTapoVideoNormalization &&
      !isHaProxyStream &&
      (isHevc ||
        (codec === "h264" &&
          (this.capabilities.strategy === "passthrough_h264" ||
            this.streamSource.supportsPassthrough ||
            !this.capabilities.requiresTranscoding)));

    if (canPassthrough) {
      const passOutput = this.sourceOutputMetadata();
      passOutput.declaredFps = declaredFps;
      passOutput.requestedFps = requestedFps;
      passOutput.measuredFps = measuredFps;
      passOutput.effectiveFps = resolvedFps;
      passOutput.configuredFps = resolvedFps;
      this.startTelemetry(
        session,
        request,
        session.retried ? "fallback" : "copy",
        passOutput,
        session.retried
          ? "FFmpeg restarted after an initial stream failure"
          : undefined,
      );
      // Pure passthrough remuxing without transcoding CPU overhead (native 4K, 2K, 1080p, 720p @ max fps)
      // Preserve the native H.264 or HEVC stream negotiated by Apple Home.
      const videoPassArgs: string[] = ["-map", "0:v:0", "-an", "-c:v", "copy"];
      // Only apply H.264 bitstream filter to H.264 streams; HEVC streams do not use dump_extra
      if (!isHevc) {
        videoPassArgs.push("-bsf:v", "dump_extra=freq=keyframe");
      }
      videoPassArgs.push(
        "-f",
        "rtp",
        "-fflags",
        "+nobuffer+flush_packets",
        "-max_delay",
        "0",
        "-max_interleave_delta",
        "100000",
        "-payload_type",
        String(video.pt || 99),
        "-ssrc",
        String(session.videoSsrc),
        "-srtp_out_suite",
        suiteName(session.videoCryptoSuite),
        "-srtp_out_params",
        session.videoKeySalt.toString("base64"),
        videoUrl,
      );
      args.push(...videoPassArgs);
    } else if (
      needsTapoVideoNormalization &&
      h264Plan?.mode === "normalization"
    ) {
      this.startTelemetry(session, request, "normalization", {
        codec: "h264",
        width: h264Plan.width,
        height: h264Plan.height,
        fps: resolvedFps,
        pixFmt: "yuv420p",
        metadataSource: "effective-command",
      });
      args.push(
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `scale=${h264Plan.width}:${h264Plan.height}:force_original_aspect_ratio=decrease:flags=fast_bilinear,pad=${h264Plan.width}:${h264Plan.height}:(ow-iw)/2:(oh-ih)/2,setsar=1${h264Plan.fps ? `,fps=${h264Plan.fps}` : ""}`,
        "-c:v",
        h264Plan.encoder,
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level:v",
        "4.0",
        ...(h264Plan.encoder === "libx264"
          ? ["-preset", "veryfast", "-tune", "zerolatency"]
          : ["-realtime", "1"]),
        "-f",
        "rtp",
        "-payload_type",
        String(video.pt || 99),
        "-ssrc",
        String(session.videoSsrc),
        "-srtp_out_suite",
        suiteName(session.videoCryptoSuite),
        "-srtp_out_params",
        session.videoKeySalt.toString("base64"),
        videoUrl,
      );
    } else {
      const encoder = verifiedH264Encoder();
      if (!encoder)
        throw new Error("No verified H264 encoder for source normalization");
      const sourceWidth =
        this.capabilities.resolution?.width || video.width || 1920;
      const sourceHeight =
        this.capabilities.resolution?.height || video.height || 1080;
      const scale = Math.min(1, 1920 / sourceWidth, 1080 / sourceHeight);
      const targetWidth = Math.max(
        2,
        Math.floor((sourceWidth * scale) / 2) * 2,
      );
      const targetHeight = Math.max(
        2,
        Math.floor((sourceHeight * scale) / 2) * 2,
      );
      const hevcFps = resolvedFps ?? this.capabilities.maxFps ?? 20;
      const keyframeInterval = Math.max(15, hevcFps * 2);
      const targetBitrate =
        targetWidth >= 2560 ? 4500 : targetWidth >= 1920 ? 3500 : 2000;
      this.platform?.log?.notice?.(
        `[Stream][${this.entityId}] Source normalization to H.264 ${targetWidth}x${targetHeight}@${hevcFps}fps bitrate=${targetBitrate}k (source codec: ${this.capabilities.videoCodec || "unknown"})`,
      );
      this.startTelemetry(
        session,
        request,
        session.retried ? "fallback" : "transcode",
        {
          codec: "h264",
          profile: "high",
          level: "4.0",
          width: targetWidth,
          height: targetHeight,
          declaredFps,
          requestedFps,
          measuredFps,
          effectiveFps: hevcFps,
          configuredFps: hevcFps,
          bitrateKbps: targetBitrate,
          pixFmt: "yuv420p",
          metadataSource: "effective-command",
        },
        session.retried
          ? "FFmpeg restarted after an initial stream failure"
          : undefined,
      );
      args.push(
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `scale=${targetWidth}:${targetHeight}:flags=fast_bilinear`,
        "-c:v",
        encoder,
        ...(encoder === "libx264"
          ? ["-preset", "veryfast", "-tune", "zerolatency"]
          : ["-realtime", "1"]),
        "-profile:v",
        "high",
        "-level:v",
        "4.0",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(hevcFps),
        "-g",
        String(keyframeInterval),
        "-keyint_min",
        String(hevcFps),
        ...(encoder === "libx264" ? ["-sc_threshold", "0"] : []),
        "-b:v",
        `${targetBitrate}k`,
        "-maxrate",
        `${targetBitrate + 500}k`,
        "-bufsize",
        `${targetBitrate + 500}k`,
        "-f",
        "rtp",
        "-fflags",
        "+nobuffer+flush_packets",
        "-max_delay",
        "0",
        "-payload_type",
        String(video.pt || 99),
        "-ssrc",
        String(session.videoSsrc),
        "-srtp_out_suite",
        suiteName(session.videoCryptoSuite),
        "-srtp_out_params",
        session.videoKeySalt.toString("base64"),
        videoUrl,
      );
    }

    if (
      hasAudioRequested &&
      session.audioKeySalt &&
      session.audioSsrc &&
      request.audio
    ) {
      const localAudioPort =
        session.localAudioPort || session.localVideoPort + 1;
      const audioUrl = session.audioRelay
        ? `srtp://127.0.0.1:${session.audioRelay.inputPort}?rtcpport=${session.audioRelay.inputPort}&pkt_size=188`
        : `srtp://${host}:${session.audioPort}` +
          `?rtcpport=${session.audioPort}&localrtcpport=${localAudioPort}&pkt_size=188`;

      const isOpus =
        audioPlan.codec === "opus" &&
        request.audio.codec === AudioStreamingCodecType.OPUS;
      if (request.audio.codec === AudioStreamingCodecType.OPUS && !isOpus)
        throw new Error("Opus requires a validated native Opus source");
      if (audioPlan.codec === "opus" && !isOpus)
        throw new Error(
          "Audio codec was not advertised for this native Opus source",
        );
      const targetCodec = isOpus ? "opus" : "aac_eld";

      // Apple HomeKit RTP Live View expects AAC-ELD (or Opus) audio packets.
      // RTSP cameras provide AAC-LC, PCMA, or PCMU, which must be transcoded to AAC-ELD/AAC mono
      // with aresample=async=1:first_pts=0 so iOS/macOS audio decoder receives valid packets and audio clock is smooth.
      const targetReq = {
        expectedCodec: targetCodec,
        allowedSampleRates: [sampleRate],
        expectedChannels: 1,
      };

      const audioCompat = checkAudioPassthroughCompatibility(
        this.capabilities.audioCodec,
        this.capabilities.audioSampleRate,
        this.capabilities.audioChannels,
        targetReq,
      );

      if (isOpus && audioCompat.compatible) {
        this.platform?.log?.notice?.(
          `[Stream][${this.entityId}] Audio fuente es Opus nativo compatible: transmitiendo con passthrough (-c:a copy)`,
        );
        args.push(
          "-map",
          "0:a:0?",
          "-vn",
          "-c:a",
          "copy",
          "-f",
          "rtp",
          "-fflags",
          "+nobuffer+flush_packets",
          "-max_delay",
          "0",
          "-payload_type",
          String(request.audio.pt || 110),
          "-ssrc",
          String(session.audioSsrc),
          "-srtp_out_suite",
          suiteName(session.audioCryptoSuite || session.videoCryptoSuite),
          "-srtp_out_params",
          session.audioKeySalt.toString("base64"),
          audioUrl,
        );
      } else if (!isOpus && supportsFdkAac()) {
        this.platform?.log?.notice?.(
          `[Stream][${this.entityId}] Transcodificando exclusivamente audio fuente (${this.capabilities.audioCodec || "desconocido"}) a AAC-ELD para Apple Home`,
        );
        const audioBitrate = Math.min(request.audio.max_bit_rate || 24, 24);

        args.push(
          "-map",
          "0:a:0?",
          "-vn",
          "-c:a",
          "libfdk_aac",
          "-profile:a",
          "aac_eld",
          "-frame_length",
          "480",
          "-flags",
          "+global_header",
        );

        args.push(
          "-af",
          "aresample=async=1:first_pts=0",
          "-ar",
          String(sampleRate),
          "-ac",
          "1",
          "-b:a",
          `${audioBitrate}k`,
          "-f",
          "rtp",
          "-fflags",
          "+nobuffer+flush_packets",
          "-max_delay",
          "0",
          "-max_interleave_delta",
          "100000",
          "-payload_type",
          String(request.audio.pt || 110),
          "-ssrc",
          String(session.audioSsrc),
          "-srtp_out_suite",
          suiteName(session.audioCryptoSuite || session.videoCryptoSuite),
          "-srtp_out_params",
          session.audioKeySalt.toString("base64"),
          audioUrl,
        );
      } else {
        // Never send AAC-LC to a HomeKit session that negotiated AAC-ELD.
        // Audio remains unavailable when the negotiated codec cannot be produced.
        this.platform?.log?.warn?.(
          `[Stream][${this.entityId}] Omitiendo audio AAC-ELD: FFmpeg no incluye libfdk_aac; se conserva el video para HomeKit`,
        );
      }
    }

    // Omni Tuya feeders allow one signed RTSP reader. Reuse this live FFmpeg
    // input for low-rate frame-difference motion analysis while Casa is open.
    // The detector's separate RTSP reader is paused during Live View.
    if (
      this.streamSource.metadata?.isOmniTuyaDirect === true &&
      /^rtsps?:\/\//i.test(sourceUrl)
    ) {
      args.push(
        "-map",
        "0:v:0",
        "-vf",
        "fps=1,scale=160:90,format=gray,tblend=all_mode=difference,blackframe=amount=0:thresh=12",
        "-an",
        "-f",
        "null",
        "-",
      );
      // Keep HKSV alive during Live View without asking Omni for a second
      // signed RTSP session. The accessory feeds this fMP4 pipe into the
      // recording delegate while its normal prebuffer reader is paused.
      args.push(
        "-map",
        "0:v:0",
        "-c:v",
        "copy",
        "-bsf:v",
        "dump_extra=freq=keyframe",
      );
      if (this.capabilities.hasAudio) {
        const recordingAudio = (this.record as any)?.hksvRecordingConfiguration
          ?.audioCodec;
        const sampleRate = 48000;
        const channels = 1;
        args.push(
          "-map",
          "0:a:0?",
          "-c:a",
          "aac",
          "-af",
          "aresample=async=1:first_pts=0",
          "-ar",
          String(sampleRate),
          "-ac",
          String(channels),
          "-b:a",
          `${Math.max(16, Math.min(64, Number(recordingAudio?.bitrate) || 32))}k`,
        );
      } else {
        args.push("-an");
      }
      args.push(
        "-avoid_negative_ts",
        "make_zero",
        "-max_interleave_delta",
        "0",
        "-muxdelay",
        "0",
        "-muxpreload",
        "0",
        // Some Omni firmwares use a long GOP. If we fragment only on source
        // keyframes, HKSV can receive the initial fragment and then wait past
        // Apple's recording window even though Live View video is flowing.
        // Also cut at the Home Hub's negotiated interval so recording keeps
        // receiving timestamped fMP4 media during the same RTSP session.
        "-frag_duration",
        String(
          Math.max(
            1000,
            Math.min(
              10000,
              Number(
                (this.record as any)?.hksvRecordingConfiguration
                  ?.mediaContainerConfiguration?.fragmentLength,
              ) || 4000,
            ),
          ) * 1000,
        ),
        "-f",
        "mp4",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof+skip_sidx+skip_trailer",
        "pipe:3",
      );
    }

    return args;
  }

  private startHaCameraProxyPipe(
    session: HomeKitStreamSession,
    process: ChildProcess,
    sourceUrl: string,
  ): void {
    const controller = new AbortController();
    session.pipeController = controller;
    const cleanup = () => {
      try {
        controller.abort();
      } catch {}
    };
    process.once("close", cleanup);
    process.once("error", cleanup);

    const token =
      this.platform?.ha?.getAccessToken?.() || this.platform?.ha?.wsAccessToken;

    void (async () => {
      try {
        const res = await fetch(sourceUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          this.platform?.log?.warn?.(
            `[HomeKitCamera][${this.entityId}] Failed to connect to HA camera proxy: HTTP ${res.status}`,
          );
          return;
        }

        const reader = res.body.getReader();
        let buffer = Buffer.alloc(0);

        while (!controller.signal.aborted && process.exitCode === null) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            buffer = Buffer.concat([buffer, Buffer.from(value)]);

            // Extract complete frames from buffer (supports both PNG and JPEG)
            while (buffer.length > 8) {
              const pngIdx = buffer.indexOf(
                Buffer.from([0x89, 0x50, 0x4e, 0x47]),
              );
              const jpegIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]));

              if (pngIdx !== -1 && (jpegIdx === -1 || pngIdx < jpegIdx)) {
                const iendIdx = buffer.indexOf(
                  Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
                  pngIdx,
                );
                if (iendIdx !== -1) {
                  const frameEnd = iendIdx + 8;
                  const frame = buffer.subarray(pngIdx, frameEnd);
                  buffer = buffer.subarray(frameEnd);
                  if (process.stdin && !process.stdin.destroyed) {
                    process.stdin.write(frame);
                  }
                  continue;
                } else {
                  if (pngIdx > 0) buffer = buffer.subarray(pngIdx);
                  break;
                }
              } else if (jpegIdx !== -1) {
                const eoiIdx = buffer.indexOf(
                  Buffer.from([0xff, 0xd9]),
                  jpegIdx + 2,
                );
                if (eoiIdx !== -1) {
                  const frameEnd = eoiIdx + 2;
                  const frame = buffer.subarray(jpegIdx, frameEnd);
                  buffer = buffer.subarray(frameEnd);
                  if (process.stdin && !process.stdin.destroyed) {
                    process.stdin.write(frame);
                  }
                  continue;
                } else {
                  if (jpegIdx > 0) buffer = buffer.subarray(jpegIdx);
                  break;
                }
              } else {
                buffer = buffer.subarray(-8);
                break;
              }
            }
          }
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] HA camera pipe ended: ${err?.message || String(err)}`,
          );
        }
      }
    })();
  }

  private stopStream(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    session?.videoRelay?.close();
    session?.audioRelay?.close();
    if (!session) return;
    session.releaseReader?.();

    // Clear prepare watchdog timer if still pending
    const timer = this.prepareTimeouts.get(sessionId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.prepareTimeouts.delete(sessionId);
    }

    if (session.pipeController) {
      try {
        session.pipeController.abort();
      } catch {}
      session.pipeController = undefined;
    }
    if (session.process) {
      const proc = session.process;
      session.process = undefined;
      try {
        // SIGKILL immediately — SIGTERM can be ignored by FFmpeg when blocked
        // on RTSP reads or SRTP writes, leaving a zombie that holds the camera
        // RTSP connection and prevents the next session from connecting.
        proc.kill("SIGKILL");
      } catch {}
      // Belt-and-suspenders: ensure the OS reclaims the process handle
      const killTimer = setTimeout(() => {
        try {
          if (proc.exitCode === null && !proc.killed) proc.kill("SIGKILL");
        } catch {}
      }, 300);
      killTimer.unref();
    }
    this.finishTelemetry(session, "finished");
    this.activeSessions.delete(sessionId);
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] [Session][${sessionId}] session-stop activeSessions=${this.activeSessions.size}`,
    );
    if (this.activeSessions.size === 0) {
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] [Session] session-end (all sessions ended)`,
      );
      this.emit("session-end");
    }
  }

  public cleanupAllSessions(): void {
    for (const sessionId of [...this.activeSessions.keys()]) {
      this.stopStream(sessionId);
    }
    for (const [, t] of this.prepareTimeouts) {
      clearTimeout(t);
    }
    this.prepareTimeouts.clear();
    if (this.activeSessions.size === 0) {
      this.emit("session-end");
    }
  }
}

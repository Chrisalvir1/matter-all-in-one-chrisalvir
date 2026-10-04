import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
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
  targetAddress: string;
  videoPort: number;
  localVideoPort: number;
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

  const upperLimit = max !== undefined ? Math.min(max, 60) : 60;
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
    const model = String(this.streamSource?.metadata?.model || "").toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const fullText = `${model} ${entityId} ${name} ${sourceUrl}`;
    if (/wyze/i.test(fullText)) return false;
    const isEzvizToken = (s: string) => /(?:\bezviz\b|\bh6c\b|4661fae4|patio[-_ ]?trasero|ezviz[-_ ]?patio)/i.test(s);
    return isEzvizToken(model) || isEzvizToken(entityId) || isEzvizToken(name) || isEzvizToken(sourceUrl);
  }

  public isWyze(): boolean {
    const sourceUrl = (this.getCleanSourceUrl() || "").toLowerCase();
    const name = String(this.streamSource?.metadata?.name || "").toLowerCase();
    const model = String(this.streamSource?.metadata?.model || "").toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const isWyzeToken = (s: string) => /(?:\bwyze\b|cba17b87)/i.test(s);
    return isWyzeToken(model) || isWyzeToken(entityId) || isWyzeToken(name) || isWyzeToken(sourceUrl);
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
      fps: measured?.avgFrameRate ? measured.fps : undefined,
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
          this.lastSnapshotTime = Date.now();
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
        this.lastSnapshotTime = Date.now();
        void this.persistSnapshotToDisk(selected);
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
            `[HomeKitCamera][${this.entityId}] Snapshot HTTP failed: ${String(error)}`,
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
      if (sourceUrl.startsWith("rtsp://")) {
        const isDemandingCam =
          this.isTapoC402() ||
          this.isWyze() ||
          this.isEzviz();
        args.push(
          "-probesize",
          isDemandingCam ? "1048576" : this.isTapoC120() ? "131072" : "65536",
          "-analyzeduration",
          isDemandingCam ? "1000000" : "0",
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
        `[HomeKitCamera][${this.entityId}] Snapshot fatal error: ${String(error)}`,
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
        if (!s.process || s.process.killed || s.process.exitCode !== null) {
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
        const audioPort = localAudioPort || (localVideoPort + 1);
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

      // Install watchdog timer: if startStream is never called by iOS (e.g. user cancelled
      // live view before connection established), auto-clean the orphaned session after 45s.
      const zombieTimer = setTimeout(() => {
        this.prepareTimeouts.delete(request.sessionID);
        const s = this.activeSessions.get(request.sessionID);
        if (s && !s.process) {
          this.platform?.log?.warn?.(
            `[HomeKitCamera][${this.entityId}] [Session][${request.sessionID}] session-timeout: prepareStream completed but startStream was not called after ${HomeKitCameraStreamingDelegate.PREPARE_TIMEOUT_MS / 1000}s — clearing orphan session`,
          );
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
      const addressOverride =
        request.addressVersion === "ipv4"
          ? isIPv4(sourceAddress || "")
            ? sourceAddress
            : detectPrimaryNetworkInterface()?.ip
          : isIPv6(sourceAddress || "")
            ? sourceAddress
            : undefined;
      const response: PrepareStreamResponse = {
        ...(addressOverride ? { addressOverride } : {}),
        video: {
          port: localVideoPort,
          ssrc: session.videoSsrc,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
      };
      if (request.audio) {
        const audioPort = session.localAudioPort || localAudioPort || (localVideoPort + 1);
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
        `[HomeKitCamera][${this.entityId}] HAP SetupEndpoints failed: ${String(error)}`,
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
      void this.startStream(session, request as StartStreamRequest, callback);
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
    const video = request.video;
    const isC120 = this.isTapoC120();
    const measuredFps = this.capabilities.measuredVideo?.fps;
    const declaredFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.round(measuredFps) : isC120 ? 15 : 30);
    const requestedFps = video?.fps;
    const cameraMaxFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.max(15, Math.round(measuredFps)) : isC120 ? 20 : 30);
    const effectiveFps = resolveLiveViewFps(
      requestedFps,
      measuredFps,
      this.capabilities.maxFps,
      cameraMaxFps,
    );

    const ffmpegPath = resolveFfmpegPath();
    let sourceUrl = this.getCleanSourceUrl();

    // Dynamically refresh ephemeral HA stream URLs (e.g. C402 HLS tokens or missing URLs)
    if (
      !sourceUrl ||
      this.streamSource.sourceType === "hls" ||
      this.streamSource.sourceType === "ha_proxy" ||
      this.isTapoC402()
    ) {
      let haEntityId =
        (this.streamSource.metadata as any)?.sourceCameraEntityId ||
        this.entityId;
      if (
        this.streamSource.metadata?.isCameraUi ||
        this.entityId.startsWith("cameraui_")
      ) {
        const realCam = (this.streamSource.metadata as any)?.realEntities?.find(
          (e: any) =>
            /^camera\.[a-z0-9_]+$/.test(e.id || "") &&
            this.platform?.ha?.hassStates?.has(e.id),
        );
        if (realCam?.id) {
          haEntityId = realCam.id;
        } else if (this.isTapoC402()) {
          haEntityId = this.platform?.ha?.hassStates?.has("camera.tapo_frente_de_calle")
            ? "camera.tapo_frente_de_calle"
            : this.platform?.ha?.hassStates?.has("camera.tapo_c402")
            ? "camera.tapo_c402"
            : "";
        } else if (this.isTapoC120()) {
          haEntityId = this.platform?.ha?.hassStates?.has("camera.tapo_c120")
            ? "camera.tapo_c120"
            : this.platform?.ha?.hassStates?.has("camera.tapo_spot")
            ? "camera.tapo_spot"
            : this.platform?.ha?.hassStates?.has("camera.c120")
            ? "camera.c120"
            : this.platform?.ha?.hassStates?.has("camera.tapo_c120_hd")
            ? "camera.tapo_c120_hd"
            : "";
        }
      }
      if (
        !/^camera\.[a-z0-9_]+$/.test(haEntityId) ||
        !this.platform?.ha?.hassStates?.has(haEntityId)
      ) {
        haEntityId = "";
      }
      if (!haEntityId && this.streamSource.sourceType === "ha_proxy") {
        sourceUrl = "";
      }
      if (this.platform?.ha) {
        const state = haEntityId
          ? this.platform.ha.hassStates?.get(haEntityId)
          : undefined;
        if (state) {
          try {
            const fresh = await CameraSourceResolver.resolve(
              this.platform,
              haEntityId,
              state,
            );
            if (fresh && fresh.url) {
              this.streamSource = fresh;
              sourceUrl = this.getCleanSourceUrl();
            }
          } catch {}
        }
        if (
          haEntityId &&
          (!sourceUrl || this.streamSource.sourceType === "ha_proxy") &&
          this.platform.ha.requestCameraStream
        ) {
          try {
            const freshUrl = await this.platform.ha.requestCameraStream(haEntityId);
            if (freshUrl) {
              this.streamSource.url = freshUrl;
              this.streamSource.sourceType = "hls";
              sourceUrl = this.getCleanSourceUrl();
            }
          } catch {}
        }
        if (haEntityId && !sourceUrl && this.platform.ha.getCameraProxyStreamUrl) {
          const proxyUrl = this.platform.ha.getCameraProxyStreamUrl(haEntityId);
          if (proxyUrl) {
            this.streamSource.url = proxyUrl;
            this.streamSource.sourceType = "ha_proxy";
            sourceUrl = this.getCleanSourceUrl();
          }
        }
      }
    }

    if (!ffmpegPath || !sourceUrl) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] HAP START rejected: ${!ffmpegPath ? "FFmpeg unavailable" : "stream source unavailable"}`,
      );
      callback(new Error("FFmpeg or RTSP source is unavailable"));
      return;
    }
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

    this.emit("session-start", session.sessionId);
    // Yield event loop without artificial delay so background listeners handle pause immediately
    await new Promise((resolve) => setImmediate(resolve));

    let callbackSettled = false;
    const settle = (error?: Error): void => {
      if (callbackSettled) return;
      callbackSettled = true;
      callback(error);
    };
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
    const isTapoC120 = this.isTapoC120();
    const measuredFps = this.capabilities.measuredVideo?.fps;
    const declaredFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.round(measuredFps) : isTapoC120 ? 15 : 30);
    const requestedFps = video?.fps;
    const cameraMaxFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.max(15, Math.round(measuredFps)) : isTapoC120 ? 20 : 30);
    const effectiveFps = resolveLiveViewFps(
      requestedFps,
      measuredFps,
      this.capabilities.maxFps,
      cameraMaxFps,
    );
    const mtu = video.mtu || 1378;

    const args = this.buildStreamArgs(session, request, forceTranscode);
    const isTapoC402 = this.isTapoC402();
    const isTapoCamera = isTapoC402 || isTapoC120;

    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] HAP START ${video.width}x${video.height} forceTranscode=${forceTranscode} profile=${h264Profile(video.profile)} level=${h264Level(video.level)} mtu=${mtu} fps[declarado=${declaredFps}, solicitado=${requestedFps ?? "omitted"}, medido=${measuredFps ?? "unmeasured"}, efectivo=${effectiveFps ?? "auto"}] source=${sanitizeUrlCredentials(sourceUrl || "")} ffmpeg=${ffmpegPath} ${getFfmpegVersion(ffmpegPath) || "unknown"}`,
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
      const process = spawn(ffmpegPath, args, {
        stdio: [
          isHaProxyStream ? "pipe" : "ignore",
          isTapoC402 ? "pipe" : "ignore",
          "pipe",
        ],
      });
      session.process = process;
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
        if (!isTapoC402 || startupConfirmed) return;
        progress = `${progress}${chunk.toString()}`.slice(-2048);
        for (const match of progress.matchAll(/(?:^|\n)frame=\s*(\d+)/g)) {
          if (Number(match[1]) > 0) {
            startupConfirmed = true;
            if (startupTimer) clearTimeout(startupTimer);
            this.platform?.log?.notice?.(
              `[HomeKitCamera][${this.entityId}] C402 HAP startup confirmed by first video frame`,
            );
            settle();
            break;
          }
        }
      });
      process.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split(/\r?\n/)) {
          this.recordFfmpegProgress(session, line);
        }
        // Keep a short, pre-sanitized failure summary only. Raw FFmpeg stderr
        // can contain source URLs or HTTP authorization headers.
        const safe = sanitizeDiagnosticText(text);
        if (safe) stderr = `${stderr}\n${safe}`.slice(-1200);
      });
      const guard = setTimeout(
        () => {
          if (process.exitCode === null && !process.killed) {
            this.platform?.log?.notice?.(
              `[HomeKitCamera][${this.entityId}] HAP START callback success; FFmpeg active session=${session.sessionId}`,
            );
            settle();
          } else {
            settle(new Error("FFmpeg exited during HAP startup"));
          }
        },
        400,
      );
      process.once("error", (error) => {
        clearTimeout(guard);
        settle(error);
      });
      process.once("close", (code) => {
        clearTimeout(guard);
        session.process = undefined;
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
          this.finishTelemetry(
            session,
            "failed",
            stderr || `FFmpeg exited with code ${code}`,
          );

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
    const sourceUrl = this.getCleanSourceUrl();
    if (!sourceUrl) {
      return [];
    }
    const video = request.video;
    const isTapoC120 = this.isTapoC120();
    const measuredFps = this.capabilities.measuredVideo?.fps;
    const declaredFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.round(measuredFps) : isTapoC120 ? 15 : 30);
    const requestedFps = video.fps;
    const cameraMaxFps =
      this.capabilities.maxFps ||
      (measuredFps && measuredFps > 0 ? Math.max(15, Math.round(measuredFps)) : isTapoC120 ? 20 : 30);
    const resolvedFps = resolveLiveViewFps(
      requestedFps,
      measuredFps,
      this.capabilities.maxFps,
      cameraMaxFps,
    );
    const mtu = video.mtu || 1378;
    const host = formatHost(session.targetAddress);
    const videoUrl =
      `srtp://${host}:${session.videoPort}` +
      `?rtcpport=${session.videoPort}&localrtcpport=${session.localVideoPort}&pkt_size=${mtu}&buffer_size=1048576`;

    const isHaProxyStream =
      this.streamSource.sourceType === "ha_proxy" ||
      this.streamSource.sourceType === "mjpeg" ||
      Boolean(
        sourceUrl &&
        (sourceUrl.includes("/api/camera_proxy_stream/") ||
          sourceUrl.includes("/api/camera_proxy/")),
      );
    // Camera.UI/go2rtc can accept RTSP before its next keyframe is available.
    // A 32 KiB / zero-duration probe then exits with "non-existing PPS" after
    // HAP has already accepted the Live View request.  C402 needs a complete
    // GOP to join reliably; video remains strict H.264 passthrough.
    const isTapoC402 = this.isTapoC402();

    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      // Info is required only to observe FFmpeg's output stream header. The
      // parser retains structured fields and discards every raw log line.
      "info",
      "-protocol_whitelist",
      "pipe,udp,rtp,file,crypto,srtp,tcp,tls,http,https,lavfi,rtsp,rtsps",
    ];
    if (isTapoC402) {
      args.push("-progress", "pipe:1", "-stats_period", "0.25");
    } else {
      // Progress is diagnostics only. It does not alter RTP/SRTP, codecs, or media flow.
      args.push("-progress", "pipe:2", "-stats_period", "0.5");
    }

    if (isHaProxyStream) {
      args.push("-f", "image2pipe", "-c:v", "png", "-r", "15", "-i", "pipe:0");
    } else if (
      sourceUrl.startsWith("rtsp://") ||
      sourceUrl.startsWith("rtsps://")
    ) {
      args.push(
        "-rtsp_transport",
        "tcp",
        "-timeout",
        "10000000",
        // C402 needs 2MB for its long GOP analysis.
        // C120 at 1080p passthrough uses 128KB and 200ms for instant start.
        // EZVIZ 1080p uses 128KB and 200ms analyze duration for instant startup without waiting.
        // Wyze and other network RTSP cameras use 64KB-128KB for fast startup.
        "-probesize",
        isTapoC402 ? "2097152" : (isTapoC120 || this.isEzviz()) ? "131072" : "65536",
        "-analyzeduration",
        isTapoC402 ? "3000000" : (isTapoC120 || this.isEzviz()) ? "200000" : "100000",
      );
      if (isTapoC402) {
        args.push("-fflags", "+genpts+discardcorrupt", "-flags", "low_delay");
      } else if (isTapoC120) {
        // C120 1080p pure copy passthrough: enable low_delay and nobuffer for zero lag
        args.push(
          "-fflags",
          "+nobuffer+flush_packets+genpts+igndts+discardcorrupt",
          "-flags",
          "low_delay",
        );
      } else {
        args.push(
          "-fflags",
          "+nobuffer+flush_packets+genpts+discardcorrupt",
          "-flags",
          "low_delay",
        );
      }
      args.push(
        "-thread_queue_size",
        isTapoC120 ? "1024" : "512",
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
      if (this.streamSource.metadata?.scryptedToken) {
        const sToken = String(this.streamSource.metadata.scryptedToken).trim();
        if (sToken) {
          args.push(
            "-headers",
            `Authorization: ${sToken.startsWith("Bearer ") ? sToken : `Bearer ${sToken}`}\r\n`,
          );
        }
      }
      args.push("-i", sourceUrl);
    } else {
      args.push("-i", sourceUrl);
    }

    const hasAudioRequested = Boolean(
      request.audio &&
      session.audioPort &&
      session.localAudioPort &&
      session.audioSsrc &&
      session.audioKeySalt,
    );
    const needsSilentAudio =
      hasAudioRequested &&
      (isHaProxyStream ||
        this.capabilities.hasAudio === false ||
        this.capabilities.audioCodec === "none");

    const sampleRate =
      request.audio?.sample_rate === AudioStreamingSamplerate.KHZ_24
        ? 24000
        : 16000;

    if (needsSilentAudio) {
      args.push(
        "-re",
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=mono:sample_rate=${sampleRate}`,
      );
    }

    const codec = (this.capabilities.videoCodec || "h264").toLowerCase();
    // HAP's RTP VideoStream service advertises H.264 profiles only.  Copying
    // HEVC into that RTP session makes FFmpeg appear healthy while Apple Home
    // receives packets it did not negotiate, ending in "No Response".  HEVC
    // remains native up to this output boundary, then is converted solely for
    // Both Tapo C402 and C120 are native 1080p H.264 streams; they use pure copy passthrough
    // (-c:v copy) with zero software transcoding and zero CPU load.
    const needsTapoVideoNormalization = false;
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
      const videoPassArgs: string[] = [
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "copy",
      ];
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

    } else if (needsTapoVideoNormalization) {
      // HAP supports H.264 only through level 4.0, whose maximum frame size
      // is 1920x1080. Clamp a cached 2K request as well, so an existing Home
      // pairing recovers before it receives the refreshed capabilities.
      const targetWidth = Math.min(
        1920,
        Math.max(2, Math.floor((video.width || 1920) / 2) * 2),
      );
      const targetHeight = Math.min(
        1080,
        Math.max(2, Math.floor((video.height || 1080) / 2) * 2),
      );
      const tapoFps = Math.min(resolvedFps ?? 15, isTapoC120 ? 20 : 15);
      const keyframeInterval = Math.max(15, tapoFps * 2);
      this.startTelemetry(
        session,
        request,
        session.retried ? "fallback" : "normalization",
        {
          codec: "h264",
          profile: "high",
          level: "4.0",
          width: targetWidth,
          height: targetHeight,
          declaredFps,
          requestedFps,
          measuredFps,
          effectiveFps: tapoFps,
          configuredFps: tapoFps,
          bitrateKbps: 4500,
          pixFmt: "yuv420p",
          metadataSource: "effective-command",
        },
        session.retried
          ? "FFmpeg restarted after an initial stream failure"
          : isTapoC120 && video.width === 1920
            ? "Apple Home solicitó 1080p; normalizando flujo 2K C120 a HAP High L4.0"
            : undefined,
      );
      this.platform?.log?.notice?.(
        `[Stream][${this.entityId}] Normalizando Tapo ${isTapoC402 ? "C402" : "C120"} H.264 a HAP High L4.0 ${targetWidth}x${targetHeight}@${tapoFps} (declarado=${declaredFps}, solicitado=${requestedFps ?? "omitted"}, medido=${measuredFps ?? "unmeasured"}, efectivo=${tapoFps})`,
      );
      args.push(
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `scale=${targetWidth}:${targetHeight}:flags=fast_bilinear`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-profile:v",
        "high",
        "-level:v",
        "4.0",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(tapoFps),
        "-g",
        String(keyframeInterval),
        "-keyint_min",
        String(tapoFps),
        "-sc_threshold",
        "0",
        "-b:v",
        "4500k",
        "-maxrate",
        "5000k",
        "-bufsize",
        "5000k",
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
    } else {
      // HEVC source or requiresTranscoding=true: transcode to H.264 for HAP.
      // Apple Home only accepts H.264 RTP. HEVC cameras (Vimtag PTZ, any camera
      // whose stored strategy was passthrough_hevc) must go through libx264.
      const targetWidth = Math.max(2, Math.floor((video.width || 1920) / 2) * 2);
      const targetHeight = Math.max(2, Math.floor((video.height || 1080) / 2) * 2);
      const hevcFps = resolvedFps ?? this.capabilities.maxFps ?? 20;
      const keyframeInterval = Math.max(15, hevcFps * 2);
      const targetBitrate = targetWidth >= 2560 ? 4500 : targetWidth >= 1920 ? 3500 : 2000;
      this.platform?.log?.notice?.(
        `[Stream][${this.entityId}] HEVC→H.264 transcoding ${targetWidth}x${targetHeight}@${hevcFps}fps bitrate=${targetBitrate}k (source codec: ${this.capabilities.videoCodec || "unknown"})`,
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
        session.retried ? "FFmpeg restarted after an initial stream failure" : undefined,
      );
      args.push(
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        `scale=${targetWidth}:${targetHeight}:flags=fast_bilinear`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
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
        "-sc_threshold",
        "0",
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
      const localAudioPort = session.localAudioPort || (session.localVideoPort + 1);
      const audioUrl =
        `srtp://${host}:${session.audioPort}` +
        `?rtcpport=${session.audioPort}&localrtcpport=${localAudioPort}&pkt_size=188`;

      const isOpus = request.audio.codec === AudioStreamingCodecType.OPUS;
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

      if (audioCompat.compatible) {
        this.platform?.log?.notice?.(
          `[Stream][${this.entityId}] Audio fuente es AAC compatible: transmitiendo con passthrough (-c:a copy)`,
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
      } else if (isOpus || supportsFdkAac()) {
        this.platform?.log?.notice?.(
          `[Stream][${this.entityId}] Transcodificando exclusivamente audio fuente (${this.capabilities.audioCodec || "desconocido"}) a ${isOpus ? "Opus" : "AAC-ELD"} para Apple Home`,
        );
        const audioBitrate = Math.min(request.audio.max_bit_rate || 24, 24);

        if (needsSilentAudio) {
          args.push("-map", "1:a:0", "-vn");
        } else {
          args.push("-map", "0:a:0?", "-vn");
        }

        if (isOpus) {
          args.push(
            "-c:a",
            "libopus",
            "-application",
            "lowdelay",
            "-frame_duration",
            "20",
            "-packet_loss",
            "5",
          );
        } else {
          args.push(
            "-c:a",
            "libfdk_aac",
            "-profile:a",
            "aac_eld",
            "-flags",
            "+global_header",
          );
        }

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
        // The accessory advertises Opus instead when libfdk_aac is missing;
        // this guard also protects an older pairing with cached capabilities.
        this.platform?.log?.warn?.(
          `[Stream][${this.entityId}] Omitiendo audio AAC-ELD: FFmpeg no incluye libfdk_aac; se conserva el video para HomeKit`,
        );
      }
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
    if (!session) return;

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

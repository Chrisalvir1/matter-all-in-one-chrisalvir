import {
  CameraStreamingDelegate,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  SnapshotRequest,
  SnapshotRequestCallback,
  StreamingRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  StartStreamRequest,
  ReconfigureStreamRequest,
  SRTPCryptoSuites,
} from "hap-nodejs";
import { spawn, ChildProcess } from "child_process";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";
import { CameraSourceResolver } from "../camera-source-resolver.js";
import {
  resolveFfmpegPath,
  getFfmpegVersion,
  sanitizeUrlCredentials,
  buildFfmpegStreamArgs,
  StreamPipelineConfig,
} from "./ffmpeg-helper.js";

export interface HomeKitStreamSession {
  sessionId: string;
  process?: ChildProcess;
  videoPort: number;
  audioPort?: number;
  targetAddress: string;
  videoSsrc: number;
  audioSsrc?: number;
  videoCryptoSuite: SRTPCryptoSuites;
  videoKeySalt: Buffer;
  audioKeySalt?: Buffer;
  stopTimer?: NodeJS.Timeout;
}

const FALLBACK_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYwLjMuMTAwAP/bAEMACAYGBwYHCAgICAgICQkJCgoKCQkJCQoKCgoKCgwMDAoKCgoKCgoMDAwMDQ4NDQ0MDQ4ODw8PEhIRERUVFRkZH//EAEwAAQEAAAAAAAAAAAAAAAAAAAAHAQEBAAAAAAAAAAAAAAAAAAAAARABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AI2AoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=",
  "base64",
);

export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {
  private activeSessions = new Map<string, HomeKitStreamSession>();
  private lastSnapshotBuffer: Buffer = FALLBACK_JPEG_BUFFER;

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private streamSource: ResolvedStreamSource,
  ) {}

  /**
   * Snapshot handler: returns a high-speed JPEG snapshot from Scrypted, Home Assistant,
   * FFmpeg extraction, or a cached valid frame. Never calls back with error so Apple Home
   * remains alive and allows user to tap and launch Live View.
   */
  public async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] Snapshot requested: ${request.width}x${request.height}`,
    );

    try {
      // 1. Try to fetch direct snapshot from Scrypted snapshotUrl if available
      const snapshotUrl = this.streamSource.snapshotUrl;
      if (
        snapshotUrl &&
        (snapshotUrl.startsWith("http://") ||
          snapshotUrl.startsWith("https://"))
      ) {
        try {
          const res = await fetch(snapshotUrl, {
            signal: AbortSignal.timeout(2000),
          });
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 0) {
              this.lastSnapshotBuffer = buf;
              callback(undefined, buf);
              return;
            }
          }
        } catch (snapErr: any) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] Direct HTTP snapshot failed: ${snapErr?.message || snapErr}`,
          );
        }
      }

      // 2. Try to fetch direct JPEG from Home Assistant proxy
      if (this.platform?.ha?.fetchSnapshot) {
        try {
          const imageBuffer = await this.platform.ha.fetchSnapshot(
            this.entityId,
          );
          if (
            imageBuffer &&
            Buffer.isBuffer(imageBuffer) &&
            imageBuffer.length > 0
          ) {
            this.lastSnapshotBuffer = imageBuffer;
            callback(undefined, imageBuffer);
            return;
          }
        } catch {}
      }

      // 3. Fallback: extract single JPEG frame from stream source via ffmpeg with 2.0s timeout
      const ffmpegPath = resolveFfmpegPath();
      const sourceUrl = this.streamSource.url;
      if (ffmpegPath && sourceUrl) {
        const ffmpegArgs = ["-hide_banner", "-loglevel", "error"];
        if (sourceUrl.startsWith("rtsp://")) {
          ffmpegArgs.push("-rtsp_transport", "tcp", "-stimeout", "2000000");
        }
        ffmpegArgs.push(
          "-i",
          sourceUrl,
          "-frames:v",
          "1",
          "-f",
          "image2",
          "-q:v",
          "3",
          "pipe:1",
        );

        const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
          stdio: ["ignore", "pipe", "ignore"],
        });
        const chunks: Buffer[] = [];
        let settled = false;

        const killTimer = setTimeout(() => {
          if (!settled) {
            settled = true;
            try {
              ffmpeg.kill("SIGKILL");
            } catch {}
            this.platform?.log?.notice?.(
              `[HomeKitCamera][${this.entityId}] Snapshot extraction delayed — serving cached frame to keep Apple Home active`,
            );
            callback(undefined, this.lastSnapshotBuffer);
          }
        }, 2000);

        ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
        ffmpeg.on("close", (code) => {
          clearTimeout(killTimer);
          if (settled) return;
          settled = true;
          if (code === 0 && chunks.length > 0) {
            const buf = Buffer.concat(chunks);
            this.lastSnapshotBuffer = buf;
            callback(undefined, buf);
          } else {
            callback(undefined, this.lastSnapshotBuffer);
          }
        });
        ffmpeg.on("error", () => {
          clearTimeout(killTimer);
          if (settled) return;
          settled = true;
          callback(undefined, this.lastSnapshotBuffer);
        });
        return;
      }

      callback(undefined, this.lastSnapshotBuffer);
    } catch {
      callback(undefined, this.lastSnapshotBuffer);
    }
  }

  /**
   * Prepare stream handler: negotiates SRTP crypto keys and target ports with Apple Home.
   */
  public prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): void {
    const sessionId = request.sessionID;
    const targetAddress = request.targetAddress;

    const videoPort = request.video.port;
    const videoCryptoSuite = request.video.srtpCryptoSuite;
    const videoKey = request.video.srtp_key;
    const videoSalt = request.video.srtp_salt;
    const videoKeySalt = Buffer.concat([videoKey, videoSalt]);

    const session: HomeKitStreamSession = {
      sessionId,
      targetAddress,
      videoPort,
      videoSsrc: 1,
      videoCryptoSuite,
      videoKeySalt,
    };

    if (request.audio) {
      session.audioPort = request.audio.port;
      session.audioSsrc = 2;
      session.audioKeySalt = Buffer.concat([
        request.audio.srtp_key,
        request.audio.srtp_salt,
      ]);
    }

    this.activeSessions.set(sessionId, session);

    const response: PrepareStreamResponse = {
      video: {
        port: videoPort,
        ssrc: session.videoSsrc,
        srtp_key: videoKey,
        srtp_salt: videoSalt,
      },
    };

    if (request.audio && session.audioPort) {
      response.audio = {
        port: session.audioPort,
        ssrc: session.audioSsrc!,
        srtp_key: request.audio.srtp_key,
        srtp_salt: request.audio.srtp_salt,
      };
    }

    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] 🎬 Prepare stream session ${sessionId} (target: ${targetAddress}:${videoPort})`,
    );

    callback(undefined, response);
  }

  /**
   * Stream lifecycle handler: starts, reconfigures, or stops the RTP stream process.
   */
  public handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback,
  ): void {
    const sessionId = request.sessionID;
    const session = this.activeSessions.get(sessionId);

    if (request.type === StreamRequestTypes.START) {
      if (!session) {
        callback(
          new Error(`Cannot start stream: session ${sessionId} not prepared`),
        );
        return;
      }

      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] 🟢 Starting live stream for Apple Home (Session: ${sessionId})`,
      );

      void this.startFfmpegStream(
        session,
        request as StartStreamRequest,
        callback,
      );
    } else if (request.type === StreamRequestTypes.STOP) {
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] 🔴 Stopping live stream for Apple Home (Session: ${sessionId})`,
      );
      this.stopFfmpegStream(sessionId);
      callback();
    } else if (request.type === StreamRequestTypes.RECONFIGURE) {
      const reconfig = request as ReconfigureStreamRequest;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] 🔄 Reconfigure stream: ${reconfig.video.width}x${reconfig.video.height} @ ${reconfig.video.max_bit_rate} kbps`,
      );
      callback();
    }
  }

  /**
   * Spawns ffmpeg with optimal stream strategy (H.264 Passthrough / Video-only / Transcode fallback).
   */
  private async startFfmpegStream(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    callback: StreamRequestCallback,
  ): Promise<void> {
    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      const errMsg =
        "FFmpeg binary not found on system. Please ensure FFmpeg is installed in the container.";
      this.platform?.log?.error?.(
        `[HomeKitCamera][${this.entityId}] ${errMsg}`,
      );
      callback(new Error(errMsg));
      return;
    }

    // Refresh stream URL dynamically on demand if missing or dynamic
    let sourceUrl = this.streamSource.url;
    if (
      !sourceUrl ||
      this.streamSource.sourceType === "hls" ||
      this.streamSource.sourceType === "ha_proxy" ||
      this.streamSource.sourceType === "unknown"
    ) {
      const state = this.platform?.ha?.hassStates?.get(this.entityId);
      if (state) {
        try {
          const fresh = await CameraSourceResolver.resolve(
            this.platform,
            this.entityId,
            state,
          );
          if (fresh && fresh.url) {
            this.streamSource = fresh;
            sourceUrl = fresh.url;
          }
        } catch (err) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] Dynamic stream resolve attempt: ${err}`,
          );
        }
      }
    }

    if (!sourceUrl) {
      const errMsg =
        "Sin fuente de stream verificada. Configura o verifica el stream RTSP en la UI de Matter All-in-One.";
      this.platform?.log?.error?.(
        `[HomeKitCamera][${this.entityId}] ${errMsg}`,
      );
      callback(new Error(errMsg));
      return;
    }

    // Guard: block FFmpeg against obviously invented RTSP paths (/:digits pattern)
    try {
      const parsedUrl = new URL(sourceUrl);
      if (/^\/\d+$/.test(parsedUrl.pathname)) {
        const errMsg = `URL de stream inválida (ruta '${parsedUrl.pathname}' parece un ID de dispositivo, no una ruta RTSP real). Verifica el stream en la UI.`;
        this.platform?.log?.error?.(
          `[HomeKitCamera][${this.entityId}] Bloqueando FFmpeg: ${errMsg}`,
        );
        callback(new Error(errMsg));
        return;
      }
    } catch {
      // URL parse failed — let FFmpeg handle it
    }

    // Guard: block FFmpeg if stream is known to be in an error/unreachable state
    const metadata = this.streamSource?.metadata || {};
    let validationStatus = metadata.validationStatus;

    if (
      validationStatus === "not_found" ||
      validationStatus === "unauthorized" ||
      validationStatus === "timeout" ||
      validationStatus === "unsupported" ||
      validationStatus === "invalid" ||
      validationStatus === "source_offline"
    ) {
      const errMsg = `El stream no está disponible (estado: ${validationStatus}). Verifica el stream en la interfaz antes de iniciar Live View.`;
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Bloqueando FFmpeg: ${errMsg}`,
      );
      callback(new Error(errMsg));
      return;
    }

    if (validationStatus === "not_checked" && sourceUrl) {
      try {
        const { ScryptedStreamValidator } =
          await import("../scrypted/scrypted-stream-validator.js");
        const probe = await ScryptedStreamValidator.validateStreamUrl(
          sourceUrl,
          metadata.scryptedCameraId,
          3000,
        );
        validationStatus = probe.status;
        metadata.validationStatus = probe.status;
        this.platform?.log?.debug?.(
          `[HomeKitCamera][${this.entityId}] On-demand probe result: ${probe.status}`,
        );
        // Only block on confirmed fatal errors — port_reachable and verified are both fine
        const fatalProbeError =
          probe.status === "not_found" ||
          probe.status === "unauthorized" ||
          probe.status === "unsupported" ||
          probe.status === "invalid" ||
          probe.status === "source_offline";
        if (fatalProbeError) {
          const errMsg = `El stream no está disponible (${probe.status}: ${probe.error || "error desconocido"}). Verifica el stream en la interfaz.`;
          this.platform?.log?.warn?.(
            `[HomeKitCamera][${this.entityId}] Bloqueando FFmpeg: ${errMsg}`,
          );
          callback(new Error(errMsg));
          return;
        }
        // timeout during probe: proceed optimistically — FFmpeg will fail fast if truly unreachable
        if (probe.status === "timeout") {
          this.platform?.log?.warn?.(
            `[HomeKitCamera][${this.entityId}] Probe timeout — intentando FFmpeg de todas formas`,
          );
        }
      } catch (err: any) {
        // Import or network error — proceed optimistically; FFmpeg will report failure
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] Error en validación on-demand: ${err?.message || err} — continuando`,
        );
      }
    }

    const token =
      this.platform?.ha?.getAccessToken?.() || this.platform?.ha?.wsAccessToken;
    const ffmpegVer = getFfmpegVersion(ffmpegPath) || "unknown";
    const sanitizedSource = sanitizeUrlCredentials(sourceUrl);
    const videoReq = request.video;
    const fps = videoReq.fps || this.capabilities.maxFps || 30;

    const pipelineConfig: StreamPipelineConfig = {
      sourceUrl,
      targetAddress: session.targetAddress,
      videoPort: session.videoPort,
      videoSsrc: session.videoSsrc,
      videoPayloadType: videoReq.pt || 99,
      videoCryptoSuite: session.videoCryptoSuite,
      videoKeySaltBase64: session.videoKeySalt.toString("base64"),
      strategy:
        // HA's camera_proxy_stream endpoint is multipart MJPEG even when the
        // physical camera itself encodes H.264, so it must be transcoded.
        this.streamSource.sourceType === "ha_proxy" ||
        this.capabilities.strategy === "transcode_required"
          ? "transcode_required"
          : this.capabilities.strategy === "passthrough_video_only"
            ? "passthrough_video_only"
            : "passthrough_h264",
      fps,
      bitrateKbps: videoReq.max_bit_rate || 2000,
      httpBearerToken: token,
      needsDumpExtra: Boolean(metadata.needsDumpExtra),
      transport: metadata.transport || "tcp",
      includeAudio:
        this.capabilities.hasAudio &&
        Boolean(session.audioPort && session.audioKeySalt && request.audio),
      audioPort: session.audioPort,
      audioSsrc: session.audioSsrc,
      audioPayloadType: request.audio?.pt || 110,
      audioKeySaltBase64: session.audioKeySalt
        ? session.audioKeySalt.toString("base64")
        : undefined,
      audioCodec:
        metadata.enableLocalAudioAdaptation && this.capabilities.hasAudio
          ? "opus"
          : this.capabilities.audioCodec === "aac_lc"
            ? "aac"
            : "transcode",
    };

    const ffmpegArgs = buildFfmpegStreamArgs(pipelineConfig);

    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] Starting stream with FFmpeg (${ffmpegPath} v${ffmpegVer}) | Source: ${sanitizedSource} | Codec: ${this.capabilities.videoCodec} | Strategy: ${this.capabilities.strategy} | Target: ${session.targetAddress}:${session.videoPort}`,
    );

    try {
      const proc = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ["ignore", "ignore", "pipe"],
      });
      session.process = proc;

      proc.stderr.on("data", (data) => {
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}][ffmpeg] ${data.toString().trim()}`,
        );
      });

      proc.on("close", (code) => {
        this.platform?.log?.debug?.(
          `[HomeKitCamera][${this.entityId}] FFmpeg process closed with code ${code}`,
        );
        session.process = undefined;
      });

      proc.on("error", (err) => {
        this.platform?.log?.error?.(
          `[HomeKitCamera][${this.entityId}] FFmpeg process error: ${err.message}`,
        );
      });

      callback();
    } catch (err) {
      this.platform?.log?.error?.(
        `[HomeKitCamera][${this.entityId}] Failed to spawn FFmpeg: ${err}`,
      );
      callback(err as Error);
    }
  }

  /**
   * Gracefully stops the FFmpeg process with SIGTERM followed by SIGKILL timeout.
   */
  private stopFfmpegStream(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    if (session.process) {
      const proc = session.process;
      try {
        proc.kill("SIGTERM");
        const killTimer = setTimeout(() => {
          try {
            if (proc.killed === false) proc.kill("SIGKILL");
          } catch {}
        }, 2000);
        proc.once("close", () => clearTimeout(killTimer));
      } catch {
        try {
          proc.kill("SIGKILL");
        } catch {}
      }
      session.process = undefined;
    }

    this.activeSessions.delete(sessionId);
    this.platform?.log?.debug?.(
      `[HomeKitCamera][${this.entityId}] Stopped and cleaned up stream session ${sessionId}`,
    );
  }

  /**
   * Cleans up all active sessions (e.g. on unpublish or bridge shutdown).
   */
  public cleanupAllSessions(): void {
    for (const sessionId of this.activeSessions.keys()) {
      this.stopFfmpegStream(sessionId);
    }
    this.activeSessions.clear();
  }
}

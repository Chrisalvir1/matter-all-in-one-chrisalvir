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

export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {
  private activeSessions = new Map<string, HomeKitStreamSession>();

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
  ) {}

  /**
   * Snapshot handler: returns a high-speed JPEG snapshot from Home Assistant.
   */
  public async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    this.platform?.log?.debug?.(
      `[HomeKitCamera][${this.entityId}] Snapshot requested: ${request.width}x${request.height}`,
    );

    try {
      // 1. Try to fetch direct JPEG from Home Assistant proxy
      if (this.platform?.ha?.fetchSnapshot) {
        const imageBuffer = await this.platform.ha.fetchSnapshot(this.entityId);
        if (
          imageBuffer &&
          Buffer.isBuffer(imageBuffer) &&
          imageBuffer.length > 0
        ) {
          callback(undefined, imageBuffer);
          return;
        }
      }

      // 2. Fallback: extract single JPEG frame from stream source via ffmpeg
      const ffmpegPath = resolveFfmpegPath();
      const sourceUrl = this.streamSource.url;
      if (ffmpegPath && sourceUrl) {
        const ffmpegArgs = [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          sourceUrl,
          "-frames:v",
          "1",
          "-f",
          "image2",
          "-q:v",
          "3",
          "pipe:1",
        ];

        const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
          stdio: ["ignore", "pipe", "ignore"],
        });
        const chunks: Buffer[] = [];

        ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
        ffmpeg.on("close", (code) => {
          if (code === 0 && chunks.length > 0) {
            callback(undefined, Buffer.concat(chunks));
          } else {
            callback(
              new Error(`ffmpeg snapshot extraction exited with code ${code}`),
            );
          }
        });
        ffmpeg.on("error", (err) => callback(err));
        return;
      }

      callback(
        new Error("No usable stream or snapshot source found for camera"),
      );
    } catch (err) {
      callback(err as Error);
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

    this.platform?.log?.debug?.(
      `[HomeKitCamera][${this.entityId}] Prepared stream session ${sessionId} (target: ${targetAddress}:${videoPort})`,
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

      this.startFfmpegStream(session, request as StartStreamRequest, callback);
    } else if (request.type === StreamRequestTypes.STOP) {
      this.stopFfmpegStream(sessionId);
      callback();
    } else if (request.type === StreamRequestTypes.RECONFIGURE) {
      const reconfig = request as ReconfigureStreamRequest;
      this.platform?.log?.debug?.(
        `[HomeKitCamera][${this.entityId}] Reconfigure stream: ${reconfig.video.width}x${reconfig.video.height} @ ${reconfig.video.max_bit_rate} kbps`,
      );
      callback();
    }
  }

  /**
   * Spawns ffmpeg with optimal stream strategy (H.264 Passthrough / Video-only / Transcode fallback).
   */
  private startFfmpegStream(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    callback: StreamRequestCallback,
  ): void {
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

    const sourceUrl = this.streamSource.url;
    if (!sourceUrl) {
      const errMsg =
        "Cannot start stream: resolved stream source URL is missing.";
      this.platform?.log?.error?.(
        `[HomeKitCamera][${this.entityId}] ${errMsg}`,
      );
      callback(new Error(errMsg));
      return;
    }

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
        this.capabilities.strategy === "transcode_required"
          ? "transcode_required"
          : this.capabilities.strategy === "passthrough_video_only"
            ? "passthrough_video_only"
            : "passthrough_h264",
      fps,
      bitrateKbps: videoReq.max_bit_rate || 2000,
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
        this.capabilities.audioCodec === "aac_lc" ? "aac" : "transcode",
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
        this.platform?.log?.debug?.(
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

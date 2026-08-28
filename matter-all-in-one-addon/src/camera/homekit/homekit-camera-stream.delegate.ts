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
import type { CameraCapabilitiesInfo, ResolvedStreamSource } from "../camera-types.js";

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
      "[HomeKitCamera][" + this.entityId + "] Snapshot requested: " + request.width + "x" + request.height,
    );

    try {
      // 1. Try to fetch direct JPEG from Home Assistant proxy if available
      if (this.platform?.ha?.fetchSnapshot) {
        const imageBuffer = await this.platform.ha.fetchSnapshot(this.entityId);
        if (imageBuffer && Buffer.isBuffer(imageBuffer) && imageBuffer.length > 0) {
          callback(undefined, imageBuffer);
          return;
        }
      }

      // 2. Fallback: extract single JPEG frame from stream source via ffmpeg
      const sourceUrl = this.streamSource.url;
      if (sourceUrl) {
        const ffmpegArgs = [
          "-hide_banner",
          "-loglevel", "error",
          "-i", sourceUrl,
          "-frames:v", "1",
          "-f", "image2",
          "-q:v", "3",
          "pipe:1",
        ];

        const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "pipe", "ignore"] });
        const chunks: Buffer[] = [];
        ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
        ffmpeg.on("close", (code) => {
          if (code === 0 && chunks.length > 0) {
            callback(undefined, Buffer.concat(chunks));
          } else {
            callback(new Error("ffmpeg snapshot extraction exited with code " + code));
          }
        });
        ffmpeg.on("error", (err) => callback(err));
        return;
      }

      callback(new Error("No usable stream or snapshot source found for camera"));
    } catch (err) {
      callback(err as Error);
    }
  }

  /**
   * Prepare stream handler: negotiates SRTP crypto keys and target ports.
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
      session.audioKeySalt = Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]);
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

    callback(undefined, response);
  }

  /**
   * Stream lifecycle handler: starts or stops the RTP stream process.
   */
  public handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback,
  ): void {
    const sessionId = request.sessionID;
    const session = this.activeSessions.get(sessionId);

    if (request.type === StreamRequestTypes.START) {
      if (!session) {
        callback(new Error("Cannot start stream: session " + sessionId + " not prepared"));
        return;
      }

      this.startFfmpegStream(session, request as StartStreamRequest);
      callback();
    } else if (request.type === StreamRequestTypes.STOP) {
      if (session?.process) {
        session.process.kill("SIGKILL");
        session.process = undefined;
      }
      this.activeSessions.delete(sessionId);
      this.platform?.log?.debug?.("[HomeKitCamera][" + this.entityId + "] Stopped stream session " + sessionId);
      callback();
    } else if (request.type === StreamRequestTypes.RECONFIGURE) {
      const reconfig = request as ReconfigureStreamRequest;
      this.platform?.log?.debug?.(
        "[HomeKitCamera][" + this.entityId + "] Reconfigure stream requested: " +
          reconfig.video.width + "x" + reconfig.video.height + " @ " + reconfig.video.max_bit_rate + " kbps",
      );
      callback();
    }
  }

  /**
   * Spawns ffmpeg with optimal stream strategy (H.264 Passthrough / Video-only / Transcode fallback).
   */
  private startFfmpegStream(session: HomeKitStreamSession, request: StartStreamRequest): void {
    const sourceUrl = this.streamSource.url;
    if (!sourceUrl) {
      this.platform?.log?.error?.("[HomeKitCamera][" + this.entityId + "] Cannot start stream: source URL missing");
      return;
    }

    const videoReq = request.video;
    const fps = videoReq.fps || this.capabilities.maxFps || 30;
    const srtpSuiteStr = session.videoCryptoSuite === SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80
      ? "AES_CM_256_HMAC_SHA1_80"
      : "AES_CM_128_HMAC_SHA1_80";

    const videoPayload: string[] = ["-map", "0:v:0"];

    if (this.capabilities.strategy === "passthrough_h264" || this.capabilities.strategy === "passthrough_video_only") {
      // H.264 Passthrough (Zero transcoding overhead)
      videoPayload.push("-vcodec", "copy");
    } else {
      // Transcode Fallback for H.265 / MJPEG sources
      const bitrate = videoReq.max_bit_rate || 2000;
      videoPayload.push(
        "-vcodec", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", String(fps),
        "-b:v", bitrate + "k",
        "-bufsize", (bitrate * 2) + "k",
        "-maxrate", bitrate + "k",
        "-preset", "ultrafast",
        "-tune", "zerolatency",
      );
    }

    const videoSrtpUrl = "srtp://" + session.targetAddress + ":" + session.videoPort + "?rtcpport=" + session.videoPort + "&localrtcpport=" + session.videoPort + "&pkt_size=1316";

    const ffmpegArgs = [
      "-hide_banner",
      "-loglevel", "warning",
      "-fflags", "+nobuffer",
      "-flags", "low_delay",
      "-i", sourceUrl,
      ...videoPayload,
      "-f", "rtp",
      "-payload_type", String(videoReq.pt || 99),
      "-ssrc", String(session.videoSsrc),
      "-srtp_out_suite", srtpSuiteStr,
      "-srtp_out_params", session.videoKeySalt.toString("base64"),
      videoSrtpUrl,
    ];

    // Audio handling: only enable if audio is available and compatible
    if (this.capabilities.hasAudio && session.audioPort && session.audioKeySalt && request.audio) {
      const audioReq = request.audio;
      const audioSrtpUrl = "srtp://" + session.targetAddress + ":" + session.audioPort + "?rtcpport=" + session.audioPort + "&localrtcpport=" + session.audioPort + "&pkt_size=188";

      ffmpegArgs.push(
        "-map", "0:a:0",
        "-acodec", "libfdk_aac",
        "-profile:a", "aac_eld",
        "-flags", "+global_header",
        "-ar", "16k",
        "-b:a", "32k",
        "-ac", "1",
        "-f", "rtp",
        "-payload_type", String(audioReq.pt || 110),
        "-ssrc", String(session.audioSsrc || 2),
        "-srtp_out_suite", srtpSuiteStr,
        "-srtp_out_params", session.audioKeySalt.toString("base64"),
        audioSrtpUrl,
      );
    }

    this.platform?.log?.notice?.(
      "[HomeKitCamera][" + this.entityId + "] Starting HomeKit stream: " + this.capabilities.strategy + " (target " + session.targetAddress + ":" + session.videoPort + ")",
    );

    try {
      const process = spawn("ffmpeg", ffmpegArgs, { stdio: ["ignore", "ignore", "pipe"] });
      session.process = process;

      process.stderr.on("data", (data) => {
        this.platform?.log?.debug?.("[HomeKitCamera][" + this.entityId + "][ffmpeg] " + data.toString().trim());
      });

      process.on("close", (code) => {
        this.platform?.log?.debug?.("[HomeKitCamera][" + this.entityId + "] ffmpeg stream process closed with code " + code);
        session.process = undefined;
      });

      process.on("error", (err) => {
        this.platform?.log?.error?.("[HomeKitCamera][" + this.entityId + "] ffmpeg process error: " + err.message);
      });
    } catch (err) {
      this.platform?.log?.error?.("[HomeKitCamera][" + this.entityId + "] Failed to spawn ffmpeg: " + err);
    }
  }
}

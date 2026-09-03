import {
  AudioStreamingCodecType,
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
} from "hap-nodejs";
import { spawn, type ChildProcess } from "node:child_process";
import dgram from "node:dgram";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";
import {
  getFfmpegVersion,
  resolveFfmpegPath,
  sanitizeUrlCredentials,
  supportsFdkAac,
} from "./ffmpeg-helper.js";

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
}

const FALLBACK_JPEG_BUFFER = Buffer.from(
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

function formatHost(address: string): string {
  if (!address.includes(":")) return address;
  const escaped = address.replaceAll("%", "%25");
  return escaped.startsWith("[") ? escaped : `[${escaped}]`;
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

export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {
  private readonly activeSessions = new Map<string, HomeKitStreamSession>();
  private lastSnapshotBuffer: Buffer = FALLBACK_JPEG_BUFFER;

  private isTakingSnapshot = false;
  private lastSnapshotTime = 0;

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
  ) {}

  public async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    const started = Date.now();
    let completed = false;
    const finish = (source: string, buffer: Buffer): void => {
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

    const now = Date.now();
    if (
      this.lastSnapshotBuffer &&
      this.lastSnapshotBuffer !== FALLBACK_JPEG_BUFFER &&
      (this.isTakingSnapshot || now - this.lastSnapshotTime < 5000)
    ) {
      finish("cached-session-guard", this.lastSnapshotBuffer);
      return;
    }

    this.isTakingSnapshot = true;

    try {
      const snapshotUrl = this.streamSource.snapshotUrl;
      if (snapshotUrl?.startsWith("http://") || snapshotUrl?.startsWith("https://")) {
        try {
          const response = await fetch(snapshotUrl!, {
            signal: AbortSignal.timeout(2500),
          });
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            if (isJpeg(buffer) && buffer.length > 512) {
              finish("http-snapshot", buffer);
              return;
            }
          }
        } catch (error) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] Snapshot HTTP failed: ${String(error)}`,
          );
        }
      }

      const ffmpegPath = resolveFfmpegPath();
      const sourceUrl = this.streamSource.url;
      if (!ffmpegPath || !sourceUrl) {
        finish("fallback-no-source", this.lastSnapshotBuffer);
        return;
      }

      const args = ["-hide_banner", "-loglevel", "error"];
      if (sourceUrl.startsWith("rtsp://")) {
        args.push(
          "-rtsp_transport",
          "tcp",
          "-timeout",
          "4000000",
          "-fflags",
          "+genpts+discardcorrupt",
        );
      }
      args.push(
        "-skip_frame",
        "nokey",
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
      }, 4500);
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
    try {
      const localVideoPort = await this.allocateUdpPort([
        request.video.port,
      ]);
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
      if (request.audio && localAudioPort) {
        session.audioPort = request.audio.port;
        session.localAudioPort = localAudioPort;
        session.audioSsrc = CameraController.generateSynchronisationSource();
        session.audioCryptoSuite = request.audio.srtpCryptoSuite;
        session.audioKeySalt = Buffer.concat([
          request.audio.srtp_key,
          request.audio.srtp_salt,
        ]);
      }
      this.activeSessions.set(request.sessionID, session);

      const response: PrepareStreamResponse = {
        video: {
          port: localVideoPort,
          ssrc: session.videoSsrc,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
      };
      if (request.audio && localAudioPort) {
        response.audio = {
          port: localAudioPort,
          ssrc: session.audioSsrc!,
          srtp_key: request.audio.srtp_key,
          srtp_salt: request.audio.srtp_salt,
        };
      }
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] HAP SetupEndpoints session=${request.sessionID} remote=${request.targetAddress}:${request.video.port} localVideoRTCP=${localVideoPort} videoSSRC=${session.videoSsrc}${localAudioPort ? ` localAudioRTCP=${localAudioPort} audioSSRC=${session.audioSsrc}` : ""}`,
      );
      callback(undefined, response);
    } catch (error) {
      callback(error as Error);
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

  private async startStream(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    callback: StreamRequestCallback,
  ): Promise<void> {
    const ffmpegPath = resolveFfmpegPath();
    const sourceUrl = this.streamSource.url;
    if (!ffmpegPath || !sourceUrl) {
      callback(new Error("FFmpeg or RTSP source is unavailable"));
      return;
    }

    const video = request.video;
    const fps = Math.max(1, Math.min(video.fps || 30, 30));
    // HomeKit on iOS can request default low bitrates (e.g. 299k).
    // Ensure a high-fidelity floor: at least 2500k for 1080p, 4000k for 1440p (Tapo) / 4K.
    const qualityFloor =
      video.width >= 2560 ? 2000 : video.width >= 1920 ? 1500 : 1000;
    const bitrate = Math.max(
      qualityFloor,
      Math.min(video.max_bit_rate || 2000, 4000),
    );
    const mtu = video.mtu || 1378;
    const host = formatHost(session.targetAddress);
    const videoUrl =
      `srtp://${host}:${session.videoPort}` +
      `?rtcpport=${session.videoPort}&localrtcpport=${session.localVideoPort}&pkt_size=${mtu}`;
    const args: string[] = ["-hide_banner", "-loglevel", "warning"];
    if (sourceUrl.startsWith("rtsp://")) {
      args.push(
        "-rtsp_transport",
        "tcp",
        "-stimeout",
        "5000000",
        "-fflags",
        "+nobuffer+genpts",
      );
    }
    args.push("-i", sourceUrl);

    const videoBitrate = Math.max(
      2500,
      Math.min(video.max_bit_rate || 3000, 4000),
    );
    args.push(
      "-map",
      "0:v:0",
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-r",
      String(fps),
      "-g",
      String(fps),
      "-keyint_min",
      String(fps),
      "-b:v",
      `${videoBitrate}k`,
      "-maxrate",
      `${videoBitrate}k`,
      "-bufsize",
      `${videoBitrate * 2}k`,
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

    if (
      request.audio &&
      session.audioPort &&
      session.localAudioPort &&
      session.audioSsrc &&
      session.audioKeySalt
    ) {
      const audioUrl =
        `srtp://${host}:${session.audioPort}` +
        `?rtcpport=${session.audioPort}&localrtcpport=${session.localAudioPort}&pkt_size=188`;
      const isOpus = request.audio.codec === AudioStreamingCodecType.OPUS;
      const hasFdk = supportsFdkAac();
      const audioBitrate = Math.min(request.audio.max_bit_rate || 24, 24);

      args.push(
        "-map",
        "0:a:0?",
        "-vn",
        "-af",
        "aresample=async=1:first_pts=0,volume=2.5",
      );

      if (isOpus) {
        args.push(
          "-c:a",
          "libopus",
          "-application",
          "lowdelay",
        );
      } else {
        args.push(
          "-c:a",
          hasFdk ? "libfdk_aac" : "aac",
          "-profile:a",
          hasFdk ? "aac_eld" : "aac_low",
        );
        if (hasFdk) {
          args.push("-flags", "+global_header");
        }
      }

      args.push(
        "-ar",
        "16000",
        "-ac",
        "1",
        "-b:a",
        `${audioBitrate}k`,
        "-f",
        "rtp",
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
    }

    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] HAP START ${video.width}x${video.height}@${fps} profile=${h264Profile(video.profile)} level=${h264Level(video.level)} mtu=${mtu} source=${sanitizeUrlCredentials(sourceUrl)} ffmpeg=${ffmpegPath} ${getFfmpegVersion(ffmpegPath) || "unknown"}`,
    );

    let callbackSettled = false;
    const settle = (error?: Error): void => {
      if (callbackSettled) return;
      callbackSettled = true;
      callback(error);
    };
    try {
      const process = spawn(ffmpegPath, args, {
        stdio: ["ignore", "ignore", "pipe"],
      });
      session.process = process;
      let stderr = "";
      process.stderr.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-6000);
      });
      const guard = setTimeout(() => {
        if (process.exitCode === null && !process.killed) {
          this.platform?.log?.notice?.(
            `[HomeKitCamera][${this.entityId}] HAP START callback success; FFmpeg active session=${session.sessionId}`,
          );
          settle();
        } else {
          settle(new Error("FFmpeg exited during HAP startup"));
        }
      }, 1200);
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
        if (!callbackSettled) {
          settle(new Error(`FFmpeg exited during HAP startup (code ${code})`));
        }
      });
    } catch (error) {
      settle(error as Error);
    }
  }

  private stopStream(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    if (session.process) {
      try {
        session.process.kill("SIGTERM");
      } catch {}
    }
    this.activeSessions.delete(sessionId);
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] HAP STOP cleanup session=${sessionId}`,
    );
  }

  public cleanupAllSessions(): void {
    for (const sessionId of [...this.activeSessions.keys()]) {
      this.stopStream(sessionId);
    }
  }
}

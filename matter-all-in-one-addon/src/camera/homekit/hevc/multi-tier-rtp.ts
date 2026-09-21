import { spawn, type ChildProcess } from "node:child_process";
import dgram, { type Socket } from "node:dgram";
import crypto from "node:crypto";
import { SRTPCryptoSuites } from "@homebridge/hap-nodejs";
import {
  type MultiTierPrepareStreamRequest,
  type MultiTierPrepareStreamResponse,
  type MultiTierStreamStartRequest,
  type MultiTierRTPStreamingDelegate,
  type SecureVideoVideoTier,
  type AudioStreamTier,
} from "./types.js";
import { resolveFfmpegPath, sanitizeUrlCredentials } from "../ffmpeg-helper.js";
import type { ResolvedStreamSource, CameraCapabilitiesInfo } from "../../camera-types.js";

interface ActiveSession {
  sessionIdentifier: string;
  ffmpegProcess?: ChildProcess;
  targetAddress: string;
  controllerVideoPort: number;
  controllerAudioPort: number;
  targetVideoKey: Buffer;
  targetVideoSalt: Buffer;
  targetAudioKey: Buffer;
  targetAudioSalt: Buffer;
  videoPort: number;
  audioPort: number;
  videoSsrc: number;
  audioSsrc: number;
  videoKey: Buffer;
  videoSalt: Buffer;
  audioKey: Buffer;
  audioSalt: Buffer;
  videoSocket?: Socket;
  audioSocket?: Socket;
}

export interface MultiTierConfig {
  videoTiers: SecureVideoVideoTier[];
  audioTier: AudioStreamTier;
  videoPayloadType: number;
  audioPayloadType: number;
}

export class MultiTierRtpDelegate implements MultiTierRTPStreamingDelegate {
  private sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
    private readonly config: MultiTierConfig,
  ) {}

  public get isStreaming(): boolean {
    return this.sessions.size > 0;
  }

  public async prepareStream(request: MultiTierPrepareStreamRequest): Promise<MultiTierPrepareStreamResponse> {
    this.platform?.log?.notice?.(
      `[Multi-RTP][${this.entityId}] Preparing stream session ${request.sessionIdentifier.slice(0, 8)}...`,
    );

    const videoPort = await this.allocatePort();
    const audioPort = await this.allocatePort();

    const videoKey = crypto.randomBytes(16);
    const videoSalt = crypto.randomBytes(14);
    const audioKey = crypto.randomBytes(16);
    const audioSalt = crypto.randomBytes(14);

    const videoSsrc = crypto.randomBytes(4).readUInt32BE(0) || 10001;
    const audioSsrc = crypto.randomBytes(4).readUInt32BE(0) || 10002;

    const session: ActiveSession = {
      sessionIdentifier: request.sessionIdentifier,
      targetAddress: request.targetAddress,
      controllerVideoPort: request.controllerVideoPort,
      controllerAudioPort: request.controllerAudioPort,
      targetVideoKey: request.video.masterKey,
      targetVideoSalt: request.video.masterSalt,
      targetAudioKey: request.audio.masterKey,
      targetAudioSalt: request.audio.masterSalt,
      videoPort,
      audioPort,
      videoSsrc,
      audioSsrc,
      videoKey,
      videoSalt,
      audioKey,
      audioSalt,
    };
    this.sessions.set(request.sessionIdentifier, session);

    return {
      addressOverride: request.sourceAddress,
      videoPort,
      audioPort,
      videoSSRC: videoSsrc,
      audioSSRC: audioSsrc,
      video: {
        cryptoSuite: request.video.cryptoSuite || SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        masterKey: videoKey,
        masterSalt: videoSalt,
      },
      audio: {
        cryptoSuite: request.audio.cryptoSuite || SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        masterKey: audioKey,
        masterSalt: audioSalt,
      },
    };
  }

  public async startStream(request: MultiTierStreamStartRequest): Promise<void> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session) {
      throw new Error(`No prepared multi-tier session ${request.sessionIdentifier}`);
    }

    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      throw new Error("FFmpeg not found for Multi-Tier RTP stream");
    }

    const sourceUrl = this.streamSource.url;
    if (!sourceUrl) {
      throw new Error("Stream URL missing for Multi-Tier RTP stream");
    }

    this.platform?.log?.notice?.(
      `[Multi-RTP][${this.entityId}] Starting REAL HEVC Passthrough stream (-c:v copy) to Apple Home`,
    );

    const targetAddress = session.targetAddress || "127.0.0.1";
    const videoOutParams = Buffer.concat([session.targetVideoKey, session.targetVideoSalt]).toString("base64");
    const videoUrl = `srtp://${targetAddress}:${session.controllerVideoPort}?rtcpport=${session.controllerVideoPort}&pkt_size=1316`;

    // Strict passthrough: Video is ALWAYS -c:v copy. No libx264, libx265, or filters.
    const args: string[] = [
      "-hide_banner",
      "-loglevel", "warning",
    ];

    if (sourceUrl.startsWith("rtsp://") || sourceUrl.startsWith("rtsps://")) {
      args.push(
        "-rtsp_transport", "tcp",
        "-timeout", "5000000",
        "-probesize", "65536",
        "-analyzeduration", "100000",
        "-fflags", "+nobuffer+flush_packets+genpts+igndts",
        "-flags", "low_delay",
      );
    } else {
      args.push(
        "-probesize", "65536",
        "-analyzeduration", "100000",
        "-fflags", "+nobuffer+flush_packets+genpts+igndts",
        "-flags", "low_delay",
      );
    }

    args.push("-i", sourceUrl);

    // Video stream mapping: STRICT COPY
    args.push(
      "-map", "0:v:0",
      "-an",
      "-c:v", "copy",
      "-f", "rtp",
      "-payload_type", String(this.config.videoPayloadType || 99),
      "-ssrc", String(session.videoSsrc),
      "-srtp_out_suite", "AES_CM_128_HMAC_SHA1_80",
      "-srtp_out_params", videoOutParams,
      videoUrl,
    );

    // Audio stream validation: strict check for AAC passthrough
    const audioCodec = this.capabilities.audioCodec?.toLowerCase();
    const isAac = audioCodec === "aac";

    if (isAac && session.controllerAudioPort > 0) {
      const audioOutParams = Buffer.concat([session.targetAudioKey, session.targetAudioSalt]).toString("base64");
      const audioUrl = `srtp://${targetAddress}:${session.controllerAudioPort}?rtcpport=${session.controllerAudioPort}&pkt_size=188`;

      this.platform?.log?.notice?.(
        `[Multi-RTP][${this.entityId}] Audio fuente es AAC compatible: transmitiendo con passthrough (-c:a copy)`,
      );

      args.push(
        "-map", "0:a:0?",
        "-vn",
        "-c:a", "copy",
        "-f", "rtp",
        "-payload_type", String(this.config.audioPayloadType || 110),
        "-ssrc", String(session.audioSsrc),
        "-srtp_out_suite", "AES_CM_128_HMAC_SHA1_80",
        "-srtp_out_params", audioOutParams,
        audioUrl,
      );
    } else {
      this.platform?.log?.notice?.(
        `[Multi-RTP][${this.entityId}] Audio fuente (${audioCodec || "desconocido"}) no es AAC compatible sin transcodificación. Transmitiendo solo vídeo en passthrough.`,
      );
    }

    const sanitizedUrl = sanitizeUrlCredentials(sourceUrl);
    this.platform?.log?.debug?.(
      `[Multi-RTP][${this.entityId}] Spawning FFmpeg: ${ffmpegPath} from ${sanitizedUrl}`,
    );

    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    session.ffmpegProcess = proc;

    proc.stderr?.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        this.platform?.log?.debug?.(`[Multi-RTP][${this.entityId}][stderr] ${msg}`);
      }
    });

    proc.once("close", (code) => {
      this.platform?.log?.notice?.(
        `[Multi-RTP][${this.entityId}] FFmpeg process closed with code ${code}`,
      );
      session.ffmpegProcess = undefined;
    });

    proc.once("error", (err) => {
      this.platform?.log?.error?.(
        `[Multi-RTP][${this.entityId}] FFmpeg process error: ${err.message}`,
      );
    });
  }

  public async stopStream(sessionIdentifier: string): Promise<void> {
    const session = this.sessions.get(sessionIdentifier);
    if (!session) return;
    this.sessions.delete(sessionIdentifier);

    this.platform?.log?.notice?.(
      `[Multi-RTP][${this.entityId}] Stopping stream session ${sessionIdentifier.slice(0, 8)}`,
    );

    if (session.ffmpegProcess) {
      try {
        session.ffmpegProcess.kill("SIGKILL");
      } catch {}
      session.ffmpegProcess = undefined;
    }
  }

  public async stopAll(): Promise<void> {
    for (const id of [...this.sessions.keys()]) {
      await this.stopStream(id);
    }
  }

  private allocatePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.once("error", reject);
      socket.bind(0, "127.0.0.1", () => {
        const addr = socket.address();
        const port = typeof addr === "object" ? addr.port : 0;
        socket.close(() => resolve(port));
      });
    });
  }
}

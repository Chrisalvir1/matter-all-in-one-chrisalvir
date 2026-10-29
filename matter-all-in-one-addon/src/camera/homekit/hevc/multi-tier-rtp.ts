import { StreamStartupTiming } from "../startup-timing.js";
import { hevcRecordingOutput } from "./recording-output.js";
import { EventEmitter } from "node:events";
import { SrtpSession, SrtcpSession } from "werift";
import { RtpDatagramRelay } from "../rtp-relay.js";
import { HevcBootstrapGate } from "./bootstrap.js";
import { CameraSourceAdapter } from "../../source-adapter.js";
import { sanitizeDiagnosticText } from "../live-view-telemetry.js";
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
import type {
  ResolvedStreamSource,
  CameraCapabilitiesInfo,
} from "../../camera-types.js";

interface ActiveSession {
  sessionIdentifier: string;
  ffmpegProcess?: ChildProcess;
  releaseReader?: () => void;
  startup?: StreamStartupTiming;
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
  videoRelay?: RtpDatagramRelay;
  audioRelay?: RtpDatagramRelay;
  starting?: boolean;
  timeout?: ReturnType<typeof setTimeout>;
}

export interface MultiTierConfig {
  videoTiers: SecureVideoVideoTier[];
  audioTier: AudioStreamTier;
  videoPayloadType: number;
  audioPayloadType: number;
}

export class MultiTierRtpDelegate
  extends EventEmitter
  implements MultiTierRTPStreamingDelegate
{
  private readonly recentStartup: {
    sessionId: string;
    timing?: StreamStartupTiming;
  }[] = [];
  private sessions = new Map<string, ActiveSession>();

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
    private readonly config: MultiTierConfig,
  ) {
    super();
  }

  public getStartupDiagnostics() {
    return {
      active: [...this.sessions.values()].map((session) => ({
        sessionId: session.sessionIdentifier,
        timing: session.startup,
      })),
      recent: [...this.recentStartup],
    };
  }

  public get hasActiveReader(): boolean {
    return [...this.sessions.values()].some(
      (session) => !!session.releaseReader,
    );
  }

  public get isStreaming(): boolean {
    return this.sessions.size > 0;
  }

  public async prepareStream(
    request: MultiTierPrepareStreamRequest,
  ): Promise<MultiTierPrepareStreamResponse> {
    this.platform?.log?.notice?.(
      `[Multi-RTP][${this.entityId}] Preparing stream session ${request.sessionIdentifier.slice(0, 8)}...`,
    );

    if (this.sessions.has(request.sessionIdentifier) || this.sessions.size >= 8)
      throw new Error("Secure Video RTP capacity reached");
    if (request.video.cryptoSuite !== 0 || request.audio.cryptoSuite !== 0)
      throw new Error("Unsupported SRTP suite");
    if (
      [request.video, request.audio].some(
        (p) => p.masterKey.length !== 16 || p.masterSalt.length !== 14,
      )
    )
      throw new Error("Invalid SRTP material");
    const videoPort = 0;
    const audioPort = 0;

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
      targetVideoKey: Buffer.from(request.video.masterKey),
      targetVideoSalt: Buffer.from(request.video.masterSalt),
      targetAudioKey: Buffer.from(request.audio.masterKey),
      targetAudioSalt: Buffer.from(request.audio.masterSalt),
      videoPort,
      audioPort,
      videoSsrc,
      audioSsrc,
      videoKey,
      videoSalt,
      audioKey,
      audioSalt,
    };
    const gate = new HevcBootstrapGate();
    const keys = {
      localMasterKey: session.targetVideoKey,
      localMasterSalt: session.targetVideoSalt,
      remoteMasterKey: session.targetVideoKey,
      remoteMasterSalt: session.targetVideoSalt,
    };
    const inspect = new SrtpSession({ profile: 1, keys });
    const feedback = new SrtcpSession({
      profile: 1,
      keys: { ...keys, remoteMasterKey: videoKey, remoteMasterSalt: videoSalt },
    });
    this.sessions.set(request.sessionIdentifier, session);
    try {
      session.videoRelay = await RtpDatagramRelay.create(
        request.targetAddress,
        request.controllerVideoPort,
        () => session.startup?.mark("T5"),
        (packet) =>
          packet[1] >= 192 && packet[1] <= 223
            ? [packet]
            : gate.push(inspect.decrypt(packet), packet),
        (packet) => feedback.decrypt(packet),
        () => {
          void this.stopStream(request.sessionIdentifier);
        },
      );
      if (request.controllerAudioPort > 0) {
        const audioFeedback = new SrtcpSession({
          profile: 1,
          keys: {
            localMasterKey: session.targetAudioKey,
            localMasterSalt: session.targetAudioSalt,
            remoteMasterKey: audioKey,
            remoteMasterSalt: audioSalt,
          },
        });
        session.audioRelay = await RtpDatagramRelay.create(
          request.targetAddress,
          request.controllerAudioPort,
          () => session.startup?.mark("T6"),
          undefined,
          (packet) => audioFeedback.decrypt(packet),
          () => {
            void this.stopStream(request.sessionIdentifier);
          },
        );
      }
    } catch (error) {
      if (this.sessions.get(request.sessionIdentifier) === session)
        await this.stopStream(request.sessionIdentifier);
      session.videoRelay?.close();
      session.audioRelay?.close();
      throw error;
    }
    if (this.sessions.get(request.sessionIdentifier) !== session) {
      session.videoRelay?.close();
      session.audioRelay?.close();
      throw new Error("Secure Video session stopped during prepare");
    }
    session.timeout = setTimeout(() => {
      void this.stopStream(request.sessionIdentifier);
    }, 45000);
    session.timeout.unref();
    this.sessions.set(request.sessionIdentifier, session);

    return {
      addressOverride: session.videoRelay.address,
      videoPort: session.videoRelay.outputPort,
      audioPort: session.audioRelay?.outputPort || 0,
      videoSSRC: videoSsrc,
      audioSSRC: audioSsrc,
      video: {
        cryptoSuite:
          request.video.cryptoSuite || SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        masterKey: videoKey,
        masterSalt: videoSalt,
      },
      audio: {
        cryptoSuite:
          request.audio.cryptoSuite || SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        masterKey: audioKey,
        masterSalt: audioSalt,
      },
    };
  }

  public async startStream(
    request: MultiTierStreamStartRequest,
  ): Promise<void> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session) {
      throw new Error(
        `No prepared multi-tier session ${request.sessionIdentifier}`,
      );
    }

    if (
      !this.config.videoTiers.some(
        (tier) => tier.identifier === request.videoTier,
      )
    )
      throw new Error("Unadvertised HEVC tier");
    if (session.ffmpegProcess || session.starting)
      throw new Error("Secure Video session already started");
    if (
      request.audioTier !== undefined &&
      request.audioTier !== this.config.audioTier.identifier
    )
      throw new Error("Unadvertised audio tier");
    session.startup = new StreamStartupTiming();
    try {
      session.starting = true;
      session.videoSsrc = request.videoSSRC;
      session.audioSsrc = request.audioSSRC || session.audioSsrc;

      const ffmpegPath = resolveFfmpegPath();
      if (!ffmpegPath) {
        throw new Error("FFmpeg not found for Multi-Tier RTP stream");
      }

      const adapter = new CameraSourceAdapter(
        this.platform,
        this.entityId,
        this.streamSource,
        this.capabilities,
      );
      session.releaseReader = adapter.acquireReader(session);
      this.emit("session-start");
      const allocationStart = performance.now();
      const source = await adapter.resolveSession();
      session.startup?.mark("T1");
      session.startup?.mark("T2");
      if (session.startup)
        session.startup.metrics.allocation1Ms =
          performance.now() - allocationStart;
      if (this.sessions.get(request.sessionIdentifier) !== session)
        throw new Error(
          "Secure Video session stopped during source resolution",
        );
      const sourceUrl = source.url;
      if (!sourceUrl) {
        throw new Error("Stream URL missing for Multi-Tier RTP stream");
      }

      this.platform?.log?.notice?.(
        `[Multi-RTP][${this.entityId}] Starting REAL HEVC Passthrough stream (-c:v copy) to Apple Home`,
      );

      const targetAddress = session.targetAddress || "127.0.0.1";
      const videoOutParams = Buffer.concat([
        session.targetVideoKey,
        session.targetVideoSalt,
      ]).toString("base64");
      const videoUrl = `srtp://127.0.0.1:${session.videoRelay!.inputPort}?rtcpport=${session.videoRelay!.inputPort}&pkt_size=1200`;

      // Strict passthrough: Video is ALWAYS -c:v copy. No libx264, libx265, or filters.
      const args: string[] = ["-hide_banner", "-loglevel", "info"];

      if (sourceUrl.startsWith("rtsp://") || sourceUrl.startsWith("rtsps://")) {
        args.push(
          "-rtsp_transport",
          "tcp",
          "-timeout",
          "5000000",
          "-probesize",
          "2097152",
          "-analyzeduration",
          "3000000",
          "-fflags",
          "+nobuffer+flush_packets+genpts+igndts",
          "-flags",
          "low_delay",
        );
      } else {
        args.push(
          "-probesize",
          "2097152",
          "-analyzeduration",
          "3000000",
          "-fflags",
          "+nobuffer+flush_packets+genpts+igndts",
          "-flags",
          "low_delay",
        );
      }

      args.push(...adapter.inputArguments(source), "-i", sourceUrl);

      // Video stream mapping: STRICT COPY
      args.push(
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "copy",
        "-bsf:v",
        "hevc_mp4toannexb,dump_extra=freq=keyframe",
        "-f",
        "rtp",
        "-payload_type",
        String(this.config.videoPayloadType || 99),
        "-ssrc",
        String(session.videoSsrc | 0),
        "-srtp_out_suite",
        "AES_CM_128_HMAC_SHA1_80",
        "-srtp_out_params",
        videoOutParams,
        videoUrl,
      );

      // Audio stream: Apple HKSV3 Open Source Guide mandates Opus (48kHz mono 20ms)
      const audioCodec = this.capabilities.audioCodec?.toLowerCase();
      const isOpus =
        audioCodec === "opus" &&
        this.capabilities.audioSampleRate === 48000 &&
        this.capabilities.audioChannels === 1 &&
        ["PROBED", "OBSERVED", "CACHED"].includes(
          this.capabilities.audioProvenance || "",
        );

      if (
        session.controllerAudioPort > 0 &&
        this.capabilities.hasAudio !== false &&
        audioCodec !== "none"
      ) {
        const audioOutParams = Buffer.concat([
          session.targetAudioKey,
          session.targetAudioSalt,
        ]).toString("base64");
        const audioUrl = `srtp://127.0.0.1:${session.audioRelay!.inputPort}?rtcpport=${session.audioRelay!.inputPort}&pkt_size=188`;

        if (isOpus) {
          this.platform?.log?.notice?.(
            `[Multi-RTP][${this.entityId}] Audio fuente es Opus nativo: transmitiendo con passthrough (-c:a copy)`,
          );
          args.push(
            "-map",
            "0:a:0?",
            "-vn",
            "-c:a",
            "copy",
            "-f",
            "rtp",
            "-payload_type",
            String(this.config.audioPayloadType || 110),
            "-ssrc",
            String(session.audioSsrc | 0),
            "-srtp_out_suite",
            "AES_CM_128_HMAC_SHA1_80",
            "-srtp_out_params",
            audioOutParams,
            audioUrl,
          );
        } else {
          this.platform?.log?.notice?.(
            `[Multi-RTP][${this.entityId}] Adaptando exclusivamente audio fuente (${audioCodec || "desconocido"}) a Opus 48kHz mono (20ms) conforme a especificación Apple HKSV3`,
          );
          args.push(
            "-map",
            "0:a:0?",
            "-vn",
            "-c:a",
            "libopus",
            "-application",
            "lowdelay",
            "-frame_duration",
            "20",
            "-packet_loss",
            "5",
            "-ar",
            "48000",
            "-ac",
            "1",
            "-b:a",
            "32k",
            "-f",
            "rtp",
            "-payload_type",
            String(this.config.audioPayloadType || 110),
            "-ssrc",
            String(session.audioSsrc | 0),
            "-srtp_out_suite",
            "AES_CM_128_HMAC_SHA1_80",
            "-srtp_out_params",
            audioOutParams,
            audioUrl,
          );
        }
      }

      const sanitizedUrl = sanitizeUrlCredentials(sourceUrl);
      this.platform?.log?.debug?.(
        `[Multi-RTP][${this.entityId}] Spawning FFmpeg: ${ffmpegPath} from [camera-source]`,
      );

      if (session.timeout) {
        clearTimeout(session.timeout);
        session.timeout = undefined;
      }
      args.push(...hevcRecordingOutput(this.capabilities.hasAudio));
      const spawnStart = performance.now();
      const proc = spawn(ffmpegPath, args, {
        stdio: ["ignore", "ignore", "pipe", "pipe"],
      });
      session.ffmpegProcess = proc;
      proc.once("spawn", () => {
        if (session.startup)
          session.startup.metrics.ffmpegSpawnMs =
            performance.now() - spawnStart;
      });
      session.startup?.mark("T7");
      (proc.stdio[3] as NodeJS.ReadableStream | null)?.on(
        "data",
        (chunk: Buffer) => this.emit("recording-data", chunk),
      );

      proc.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (/Input #|Stream #0/.test(text)) session.startup?.mark("T3");
        if (/Output #/.test(text)) session.startup?.mark("T4");
        const msg = sanitizeDiagnosticText(chunk.toString());
        if (msg) {
          this.platform?.log?.debug?.(
            `[Multi-RTP][${this.entityId}][stderr] ${msg}`,
          );
        }
      });

      proc.once("close", (code) => {
        if (this.sessions.get(request.sessionIdentifier) !== session) return;
        this.platform?.log?.notice?.(
          `[Multi-RTP][${this.entityId}] FFmpeg process closed with code ${code}`,
        );
        session.ffmpegProcess = undefined;
        void this.stopStream(request.sessionIdentifier);
      });

      proc.once("error", (err) => {
        if (this.sessions.get(request.sessionIdentifier) !== session) return;
        this.platform?.log?.error?.(
          `[Multi-RTP][${this.entityId}] FFmpeg process error: ${sanitizeDiagnosticText(err.message)}`,
        );
        void this.stopStream(request.sessionIdentifier);
      });
    } catch (error) {
      if (this.sessions.get(request.sessionIdentifier) === session)
        await this.stopStream(request.sessionIdentifier);
      session.releaseReader?.();
      throw error;
    }
  }

  public async stopStream(sessionIdentifier: string): Promise<void> {
    const session = this.sessions.get(sessionIdentifier);
    if (!session) return;
    this.sessions.delete(sessionIdentifier);
    this.recentStartup.unshift({
      sessionId: sessionIdentifier,
      timing: session.startup,
    });
    this.recentStartup.splice(32);
    session.releaseReader?.();
    if (session.timeout) clearTimeout(session.timeout);
    session.videoRelay?.close();
    session.audioRelay?.close();
    for (const key of [
      session.targetVideoKey,
      session.targetVideoSalt,
      session.targetAudioKey,
      session.targetAudioSalt,
      session.videoKey,
      session.videoSalt,
      session.audioKey,
      session.audioSalt,
    ])
      key.fill(0);
    this.emit("session-end");

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

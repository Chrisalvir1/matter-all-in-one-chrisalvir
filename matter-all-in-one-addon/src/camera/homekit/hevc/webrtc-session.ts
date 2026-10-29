import { StreamStartupTiming } from "../startup-timing.js";
import { EventEmitter } from "node:events";
import { hevcRecordingOutput } from "./recording-output.js";
import { spawn, type ChildProcess } from "node:child_process";
import dgram from "node:dgram";
import {
  MediaStreamTrack,
  RTCPeerConnection,
  RTCRtpCodecParameters,
  RtpPacket,
  RTCRtpHeaderExtensionParameters,
} from "werift";
import {
  type WebRTCStreamingDelegate,
  type WebRTCOffer,
  type WebRTCProvideAnswerRequest,
  type WebRTCReofferRequest,
  type WebRTCReofferAnswer,
  type WebRTCUpdateSessionRequest,
  type WebRTCSolicitOfferRequest,
  type SecureVideoVideoTier,
} from "./types.js";
import { SecureVideoSFrame } from "./sframe.js";
import { HevcAccessUnitAssembler, SFrameRtpPacketizer } from "./sframe-rtp.js";
import { CameraSourceAdapter } from "../../source-adapter.js";
import { HevcBootstrapGate } from "./bootstrap.js";
import { sanitizeDiagnosticText } from "../live-view-telemetry.js";
import { resolveFfmpegPath } from "../ffmpeg-helper.js";
import type {
  ResolvedStreamSource,
  CameraCapabilitiesInfo,
} from "../../camera-types.js";

const VIDEO_PAYLOAD_TYPE = 99;
const AUDIO_PAYLOAD_TYPE = 110;

const hevcCodec = new RTCRtpCodecParameters({
  mimeType: "video/H265",
  clockRate: 90000,
  payloadType: VIDEO_PAYLOAD_TYPE,
  parameters: "tx-mode=SRST",
  rtcpFeedback: [
    { type: "nack" },
    { type: "nack", parameter: "pli" },
    { type: "ccm", parameter: "fir" },
  ],
});

interface ActiveWebRtcSession {
  sessionIdentifier: string;
  pc: RTCPeerConnection;
  vtrack: MediaStreamTrack;
  atrack: MediaStreamTrack;
  sframe: SecureVideoSFrame;
  sframeEnabled: boolean;
  ffmpegProcess?: ChildProcess;
  releaseReader?: () => void;
  startup?: StreamStartupTiming;
  rtpSocket?: dgram.Socket;
  answered: boolean;
  closed: boolean;
  startedAt: number;
  videoSsrc: number;
  audioSsrc: number;
  mediaStarting?: boolean;
  timeout?: NodeJS.Timeout;
  packetTimer?: NodeJS.Timeout;
  videoSender: import("werift").RTCRtpSender;
  audioSender: import("werift").RTCRtpSender;
}

export class WebRtcSessionManager
  extends EventEmitter
  implements WebRTCStreamingDelegate
{
  private readonly recentStartup: {
    sessionId: string;
    timing?: StreamStartupTiming;
  }[] = [];
  private readonly sessions = new Map<string, ActiveWebRtcSession>();

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
    private readonly videoTiers: SecureVideoVideoTier[],
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

  public async handleSolicitOffer(
    request: WebRTCSolicitOfferRequest,
  ): Promise<WebRTCOffer> {
    if (this.sessions.has(request.sessionIdentifier) || this.sessions.size >= 6)
      throw new Error("WebRTC session unavailable");
    this.platform?.log?.notice?.(
      `[WebRTC][${this.entityId}] Preparing WebRTC stream offer (session ${request.sessionIdentifier.slice(0, 8)})...`,
    );

    const pc = new RTCPeerConnection({
      codecs: {
        video: [hevcCodec],
        audio: [
          new RTCRtpCodecParameters({
            mimeType: "audio/opus",
            clockRate: 48000,
            channels: 2,
            payloadType: AUDIO_PAYLOAD_TYPE,
            parameters: "minptime=20;useinbandfec=1;stereo=0;sprop-stereo=0",
          }),
        ],
      },
      headerExtensions: {
        video: [
          new RTCRtpHeaderExtensionParameters({
            id: 1,
            uri: "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
          }),
        ],
      },
      iceServers: [],
      iceUseIpv6: false,
    });

    const vtrack = new MediaStreamTrack({ kind: "video" });
    const atrack = new MediaStreamTrack({ kind: "audio" });
    const nativeTier = this.videoTiers[0];
    if (!nativeTier) {
      await pc.close();
      throw new Error("No HEVC source tier");
    }
    const rid = `tier${nativeTier.identifier}`;
    const vsender = pc.addTransceiver(vtrack, {
      direction: "sendonly",
      simulcast: [{ direction: "send", rid }],
      sendEncodings: [{ rid, maxBitrate: nativeTier.peakBitrate * 1000 }],
    }).sender;
    const asender = pc.addTransceiver(atrack, { direction: "sendonly" }).sender;

    const candidates: WebRTCOffer["candidates"] = [];
    pc.onIceCandidate.subscribe((candidate: any) => {
      const json = candidate?.toJSON ? candidate.toJSON() : candidate;
      if (json?.candidate) {
        candidates.push({
          candidate: json.candidate,
          sdpMid: json.sdpMid ?? undefined,
          sdpMLineIndex: json.sdpMLineIndex ?? undefined,
        });
      }
    });

    const sframe = new SecureVideoSFrame(request.options.sframeEnabled);
    const session: ActiveWebRtcSession = {
      sessionIdentifier: request.sessionIdentifier,
      pc,
      vtrack,
      atrack,
      sframe,
      sframeEnabled: request.options.sframeEnabled,
      answered: false,
      closed: false,
      startedAt: Date.now(),
      startup: new StreamStartupTiming(),
      videoSender: vsender,
      audioSender: asender,
      videoSsrc: vsender.ssrc,
      audioSsrc: asender.ssrc,
    };
    this.sessions.set(request.sessionIdentifier, session);
    session.timeout = setTimeout(
      () => void this.handleEndSession(request.sessionIdentifier),
      45000,
    );
    session.timeout.unref();

    pc.connectionStateChange.subscribe((state: string) => {
      if (this.sessions.get(request.sessionIdentifier) !== session) return;
      this.platform?.log?.debug?.(
        `[WebRTC][${this.entityId}] Peer connection state: ${state}`,
      );
      if (state === "connected" && !session.mediaStarting && !session.closed) {
        session.mediaStarting = true;
        clearTimeout(session.timeout);
        session.packetTimer = setInterval(() => {
          void this.observeSentPackets(session);
        }, 100);
        session.packetTimer.unref();
        this.startMediaPipeline(session).catch((err) => {
          this.platform?.log?.error?.(
            `[WebRTC][${this.entityId}] Failed to start media: ${sanitizeDiagnosticText(String(err))}`,
          );
          if (this.sessions.get(request.sessionIdentifier) === session)
            void this.handleEndSession(request.sessionIdentifier);
        });
      } else if (
        state === "failed" ||
        state === "closed" ||
        state === "disconnected"
      ) {
        void this.handleEndSession(request.sessionIdentifier);
      }
    });

    const gatheringStart = performance.now();
    let offer;
    try {
      offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    } catch {
      if (this.sessions.get(request.sessionIdentifier) === session)
        await this.handleEndSession(request.sessionIdentifier);
      throw new Error("WebRTC offer failed");
    }

    if (
      session.closed ||
      this.sessions.get(request.sessionIdentifier) !== session
    )
      throw new Error("WebRTC session ended during offer");
    this.platform?.log?.debug?.(
      `[WebRTC][${this.entityId}] offerGatheringMs=${Math.round(performance.now() - gatheringStart)} candidates=${candidates.length}`,
    );
    return {
      sdpOffer: pc.localDescription?.sdp ?? offer.sdp,
      candidates,
      sframe: sframe.senderKey,
    };
  }

  public async handleProvideAnswer(
    request: WebRTCProvideAnswerRequest,
  ): Promise<void> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session || session.answered) {
      throw new Error("Unknown or already-answered WebRTC session");
    }

    await session.pc.setRemoteDescription({
      type: "answer",
      sdp: request.sdpAnswer,
    } as any);
    session.answered = true;
    this.platform?.log?.debug?.(
      `[WebRTC][${this.entityId}] Applied remote SDP answer for session ${request.sessionIdentifier.slice(0, 8)}`,
    );

    for (const candidate of request.candidates || []) {
      try {
        await session.pc.addIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        });
      } catch (err) {
        this.platform?.log?.warn?.(
          `[WebRTC][${this.entityId}] Failed to add ICE candidate: ${sanitizeDiagnosticText(String(err))}`,
        );
      }
    }
  }

  public async handleReoffer(
    request: WebRTCReofferRequest,
  ): Promise<WebRTCReofferAnswer> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session) {
      throw new Error("Unknown WebRTC session");
    }
    await session.pc.setRemoteDescription({
      type: "offer",
      sdp: request.sdpOffer,
    } as any);
    const answer = await session.pc.createAnswer();
    await session.pc.setLocalDescription(answer);
    return {
      sdpAnswer:
        (session.pc.localDescription as any)?.sdp ?? (answer as any).sdp,
    };
  }

  public async handleUpdateSession(
    request: WebRTCUpdateSessionRequest,
  ): Promise<void> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session) return;
    session.sframe.addReceiveKeys(request.receiveKeysToAdd);
    session.sframe.removeReceiveKeys(request.receiveKIDsToRemove);
  }

  public async handleEndSession(sessionIdentifier: string): Promise<void> {
    const session = this.sessions.get(sessionIdentifier);
    if (!session) return;
    this.sessions.delete(sessionIdentifier);
    this.recentStartup.unshift({
      sessionId: sessionIdentifier,
      timing: session.startup,
    });
    this.recentStartup.splice(32);
    session.closed = true;
    session.releaseReader?.();
    clearTimeout(session.timeout);
    clearInterval(session.packetTimer);
    session.sframe.close();
    this.emit("session-end");

    this.platform?.log?.notice?.(
      `[WebRTC][${this.entityId}] Ending WebRTC session ${sessionIdentifier.slice(0, 8)}`,
    );

    if (session.ffmpegProcess) {
      try {
        session.ffmpegProcess.kill("SIGKILL");
      } catch {}
      session.ffmpegProcess = undefined;
    }

    if (session.rtpSocket) {
      try {
        session.rtpSocket.close();
      } catch {}
      session.rtpSocket = undefined;
    }

    await session.pc.close().catch(() => undefined);
  }

  public async closeAll(): Promise<void> {
    await Promise.all(
      [...this.sessions.keys()].map((id) => this.handleEndSession(id)),
    );
  }

  private async observeSentPackets(
    session: ActiveWebRtcSession,
  ): Promise<void> {
    try {
      for (const [sender, stage, ssrc] of [
        [session.videoSender, "T5", session.videoSsrc],
        [session.audioSender, "T6", session.audioSsrc],
      ] as const) {
        if (session.startup?.stages[stage] !== undefined || session.closed)
          continue;
        const report = await sender.getStats();
        if (
          [...report.values()].some(
            (stat: any) =>
              stat.type === "outbound-rtp" &&
              stat.ssrc === ssrc &&
              stat.packetsSent > 0,
          )
        )
          session.startup?.mark(stage);
      }
      if (
        session.startup?.stages.T5 !== undefined &&
        (!this.capabilities.hasAudio || session.startup.stages.T6 !== undefined)
      )
        clearInterval(session.packetTimer);
    } catch {
      /* No packet observation is recorded when stats are unavailable. */
    }
  }

  private async startMediaPipeline(
    session: ActiveWebRtcSession,
  ): Promise<void> {
    const ffmpegPath = resolveFfmpegPath();
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
    if (session.closed) return;
    const sourceUrl = source.url;
    if (!ffmpegPath || !sourceUrl) {
      throw new Error("FFmpeg or stream URL unavailable");
    }

    let localPort = 0;
    const rtpSocket = dgram.createSocket("udp4");
    session.rtpSocket = rtpSocket;

    const videoSsrc = session.videoSsrc;
    const audioCryptor = session.sframe.audioStream(session.audioSsrc);
    const audioPacketizer = new SFrameRtpPacketizer({
      ssrc: session.audioSsrc,
      payloadType: AUDIO_PAYLOAD_TYPE,
      maxPayload: 1200,
    });
    const bootstrap = new HevcBootstrapGate();
    const videoCryptor = session.sframe.videoStream(videoSsrc);
    const assembler = new HevcAccessUnitAssembler();
    const packetizer = new SFrameRtpPacketizer({
      ssrc: videoSsrc,
      payloadType: VIDEO_PAYLOAD_TYPE,
      maxPayload: 1200,
    });

    rtpSocket.on("message", (msg) => {
      if (session.closed || msg.length < 12) return;
      try {
        const rtp = RtpPacket.deSerialize(msg);
        if (rtp.header.payloadType === AUDIO_PAYLOAD_TYPE) {
          if (!session.sframeEnabled) {
            session.atrack.writeRtp(rtp);
            return;
          }
          const sealed = audioCryptor.protectFrame(rtp.payload);
          for (const packet of audioPacketizer.packetize(
            sealed,
            rtp.header.timestamp,
            true,
          ))
            session.atrack.writeRtp(packet);
          return;
        }
        if (rtp.header.payloadType !== VIDEO_PAYLOAD_TYPE) return;
        const released = bootstrap.push(msg);
        for (const wire of released) {
          const rtp = RtpPacket.deSerialize(wire);
          if (!session.sframeEnabled) {
            session.vtrack.writeRtp(rtp);
            continue;
          }
          const frame = assembler.push(rtp);
          if (!frame) continue;

          const sealed = videoCryptor.protectFrame(frame.data);
          for (const packet of packetizer.packetize(
            sealed,
            frame.timestamp,
            frame.marker,
          )) {
            session.vtrack.writeRtp(packet);
          }
        }
      } catch (err: any) {
        this.platform?.log?.error?.(
          `[WebRTC][${this.entityId}] RTP forward error: ${sanitizeDiagnosticText(String(err))}`,
        );
      }
    });

    await new Promise<void>((resolve, reject) => {
      rtpSocket.once("error", reject);
      rtpSocket.bind(0, "127.0.0.1", () => {
        const address = rtpSocket.address();
        localPort = typeof address === "object" ? address.port : 0;
        rtpSocket.removeListener("error", reject);
        resolve();
      });
    });

    rtpSocket.on(
      "error",
      () => void this.handleEndSession(session.sessionIdentifier),
    );
    if (session.closed) {
      try {
        rtpSocket.close();
      } catch {}
      return;
    }
    // FFmpeg reads RTSP and emits standard RFC 7798 HEVC RTP packets with -c:v copy
    const args = [
      "-hide_banner",
      "-loglevel",
      "info",
      ...(/^rtsps?:\/\//.test(sourceUrl)
        ? ["-rtsp_transport", "tcp", "-timeout", "5000000"]
        : []),
      ...adapter.inputArguments(source),
      "-i",
      sourceUrl,
      "-map",
      "0:v:0",
      "-an",
      "-bsf:v",
      "hevc_mp4toannexb,dump_extra=freq=keyframe",
      "-c:v",
      "copy",
      "-f",
      "rtp",
      "-payload_type",
      String(VIDEO_PAYLOAD_TYPE),
      "-ssrc",
      String(videoSsrc | 0),
      `rtp://127.0.0.1:${localPort}`,
    ];

    const nativeOpus =
      this.capabilities.audioCodec === "opus" &&
      this.capabilities.audioSampleRate === 48000 &&
      this.capabilities.audioChannels === 1 &&
      ["PROBED", "OBSERVED", "CACHED"].includes(
        this.capabilities.audioProvenance || "",
      );
    if (this.capabilities.hasAudio)
      args.push(
        "-map",
        "0:a:0",
        "-vn",
        "-c:a",
        nativeOpus ? "copy" : "libopus",
        ...(nativeOpus
          ? []
          : ["-ar", "48000", "-ac", "1", "-frame_duration", "20"]),
        "-f",
        "rtp",
        "-payload_type",
        String(AUDIO_PAYLOAD_TYPE),
        "-ssrc",
        String(session.audioSsrc | 0),
        `rtp://127.0.0.1:${localPort}?pkt_size=1100`,
      );
    this.platform?.log?.notice?.(
      `[WebRTC][${this.entityId}] Spawning WebRTC HEVC Passthrough FFmpeg pipeline to 127.0.0.1:${localPort}`,
    );

    args.push(...hevcRecordingOutput(this.capabilities.hasAudio));
    const spawnStart = performance.now();
    const proc = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe", "pipe"],
    });
    session.ffmpegProcess = proc;
    proc.once("spawn", () => {
      if (session.startup)
        session.startup.metrics.ffmpegSpawnMs = performance.now() - spawnStart;
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
      this.platform?.log?.debug?.(
        `[WebRTC][${this.entityId}][stderr] ${sanitizeDiagnosticText(chunk.toString().trim())}`,
      );
    });

    proc.once("close", (code) => {
      if (this.sessions.get(session.sessionIdentifier) !== session) return;
      this.platform?.log?.notice?.(
        `[WebRTC][${this.entityId}] FFmpeg process closed (code ${code})`,
      );
      session.ffmpegProcess = undefined;
      void this.handleEndSession(session.sessionIdentifier);
    });
    proc.once("error", () => {
      if (this.sessions.get(session.sessionIdentifier) === session)
        void this.handleEndSession(session.sessionIdentifier);
    });
  }
}

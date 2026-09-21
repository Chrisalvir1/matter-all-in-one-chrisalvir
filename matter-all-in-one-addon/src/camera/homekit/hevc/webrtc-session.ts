import { spawn, type ChildProcess } from "node:child_process";
import dgram from "node:dgram";
import { MediaStreamTrack, RTCPeerConnection, RTCRtpCodecParameters, type RtpPacket } from "werift";
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
import { resolveFfmpegPath } from "../ffmpeg-helper.js";
import type { ResolvedStreamSource, CameraCapabilitiesInfo } from "../../camera-types.js";

const VIDEO_PAYLOAD_TYPE = 99;
const AUDIO_PAYLOAD_TYPE = 110;

const hevcCodec = new RTCRtpCodecParameters({
  mimeType: "video/H265",
  clockRate: 90000,
  payloadType: VIDEO_PAYLOAD_TYPE,
  parameters: "profile-id=1;tier-flag=0;level-id=153;tx-mode=SRST",
  rtcpFeedback: [{ type: "nack" }, { type: "nack", parameter: "pli" }, { type: "ccm", parameter: "fir" }],
});

interface ActiveWebRtcSession {
  sessionIdentifier: string;
  pc: RTCPeerConnection;
  vtrack: MediaStreamTrack;
  atrack: MediaStreamTrack;
  sframe: SecureVideoSFrame;
  ffmpegProcess?: ChildProcess;
  rtpSocket?: dgram.Socket;
  answered: boolean;
  closed: boolean;
  startedAt: number;
}

export class WebRtcSessionManager implements WebRTCStreamingDelegate {
  private readonly sessions = new Map<string, ActiveWebRtcSession>();

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
    private readonly videoTiers: SecureVideoVideoTier[],
  ) {}

  public get isStreaming(): boolean {
    return this.sessions.size > 0;
  }

  public async handleSolicitOffer(request: WebRTCSolicitOfferRequest): Promise<WebRTCOffer> {
    this.platform?.log?.notice?.(
      `[WebRTC][${this.entityId}] Preparing WebRTC stream offer (session ${request.sessionIdentifier.slice(0, 8)})...`,
    );

    const pc = new RTCPeerConnection({
      codecs: { video: [hevcCodec] },
      iceUseIpv6: false,
    });

    const vtrack = new MediaStreamTrack({ kind: "video" });
    const atrack = new MediaStreamTrack({ kind: "audio" });
    pc.addTransceiver(vtrack, { direction: "sendonly" });
    pc.addTransceiver(atrack, { direction: "sendonly" });

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

    const sframe = new SecureVideoSFrame(true);
    const session: ActiveWebRtcSession = {
      sessionIdentifier: request.sessionIdentifier,
      pc,
      vtrack,
      atrack,
      sframe,
      answered: false,
      closed: false,
      startedAt: Date.now(),
    };
    this.sessions.set(request.sessionIdentifier, session);

    pc.connectionStateChange.subscribe((state: string) => {
      this.platform?.log?.debug?.(`[WebRTC][${this.entityId}] Peer connection state: ${state}`);
      if (state === "connected") {
        this.startMediaPipeline(session).catch((err) => {
          this.platform?.log?.error?.(`[WebRTC][${this.entityId}] Failed to start media: ${err.message}`);
          void this.handleEndSession(request.sessionIdentifier);
        });
      } else if (state === "failed" || state === "closed" || state === "disconnected") {
        void this.handleEndSession(request.sessionIdentifier);
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    return {
      sdpOffer: pc.localDescription?.sdp ?? offer.sdp,
      candidates,
      sframe: sframe.senderKey,
    };
  }

  public async handleProvideAnswer(request: WebRTCProvideAnswerRequest): Promise<void> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session || session.answered) {
      throw new Error("Unknown or already-answered WebRTC session");
    }

    await session.pc.setRemoteDescription({ type: "answer", sdp: request.sdpAnswer } as any);
    session.answered = true;
    this.platform?.log?.debug?.(
      `[WebRTC][${this.entityId}] Applied remote SDP answer for session ${request.sessionIdentifier.slice(0, 8)}`,
    );

    for (const candidate of request.candidates) {
      try {
        await session.pc.addIceCandidate({
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid,
          sdpMLineIndex: candidate.sdpMLineIndex,
        });
      } catch (err) {
        this.platform?.log?.warn?.(`[WebRTC][${this.entityId}] Failed to add ICE candidate: ${err}`);
      }
    }
  }

  public async handleReoffer(request: WebRTCReofferRequest): Promise<WebRTCReofferAnswer> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session) {
      throw new Error("Unknown WebRTC session");
    }
    await session.pc.setRemoteDescription({ type: "offer", sdp: request.sdpOffer } as any);
    const answer = await session.pc.createAnswer();
    await session.pc.setLocalDescription(answer);
    return { sdpAnswer: (session.pc.localDescription as any)?.sdp ?? (answer as any).sdp };
  }

  public async handleUpdateSession(request: WebRTCUpdateSessionRequest): Promise<void> {
    const session = this.sessions.get(request.sessionIdentifier);
    if (!session) return;
    session.sframe.addReceiveKeys(request.receiveKeysToAdd);
    session.sframe.removeReceiveKeys(request.receiveKIDsToRemove);
  }

  public async handleEndSession(sessionIdentifier: string): Promise<void> {
    const session = this.sessions.get(sessionIdentifier);
    if (!session) return;
    this.sessions.delete(sessionIdentifier);
    session.closed = true;

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

  public closeAll(): void {
    for (const id of [...this.sessions.keys()]) {
      void this.handleEndSession(id);
    }
  }

  private async startMediaPipeline(session: ActiveWebRtcSession): Promise<void> {
    const ffmpegPath = resolveFfmpegPath();
    const sourceUrl = this.streamSource.url;
    if (!ffmpegPath || !sourceUrl) {
      throw new Error("FFmpeg or stream URL unavailable");
    }

    const localPort = await this.allocatePort();
    const rtpSocket = dgram.createSocket("udp4");
    session.rtpSocket = rtpSocket;

    const videoSsrc = 10001;
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
        const rtp = {
          header: {
            payloadType: msg[1] & 0x7f,
            marker: (msg[1] & 0x80) !== 0,
            sequenceNumber: msg.readUInt16BE(2),
            timestamp: msg.readUInt32BE(4),
            ssrc: msg.readUInt32BE(8),
          },
          payload: msg.subarray(12),
        } as unknown as RtpPacket;

        const frame = assembler.push(rtp);
        if (!frame) return;

        const sealed = videoCryptor.protectFrame(frame.data);
        for (const packet of packetizer.packetize(sealed, frame.timestamp, frame.marker)) {
          session.vtrack.writeRtp(packet);
        }
      } catch (err: any) {
        this.platform?.log?.error?.(`[WebRTC][${this.entityId}] RTP forward error: ${err.message}`);
      }
    });

    await new Promise<void>((resolve, reject) => {
      rtpSocket.once("error", reject);
      rtpSocket.bind(localPort, "127.0.0.1", () => resolve());
    });

    // FFmpeg reads RTSP and emits standard RFC 7798 HEVC RTP packets with -c:v copy
    const args = [
      "-hide_banner",
      "-loglevel", "warning",
      "-rtsp_transport", "tcp",
      "-timeout", "5000000",
      "-i", sourceUrl,
      "-map", "0:v:0",
      "-an",
      "-c:v", "copy",
      "-f", "rtp",
      "-payload_type", String(VIDEO_PAYLOAD_TYPE),
      "-ssrc", String(videoSsrc),
      `rtp://127.0.0.1:${localPort}`,
    ];

    this.platform?.log?.notice?.(
      `[WebRTC][${this.entityId}] Spawning WebRTC HEVC Passthrough FFmpeg pipeline to 127.0.0.1:${localPort}`,
    );

    const proc = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    session.ffmpegProcess = proc;

    proc.stderr?.on("data", (chunk: Buffer) => {
      this.platform?.log?.debug?.(`[WebRTC][${this.entityId}][stderr] ${chunk.toString().trim()}`);
    });

    proc.once("close", (code) => {
      this.platform?.log?.notice?.(`[WebRTC][${this.entityId}] FFmpeg process closed (code ${code})`);
      session.ffmpegProcess = undefined;
    });
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

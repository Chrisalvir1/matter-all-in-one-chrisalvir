import { spawn } from "node:child_process";
import dgram from "node:dgram";
import {
  RTCPeerConnection,
  MediaStreamTrack,
  RTCRtpCodecParameters,
} from "werift";
import { resolveFfmpegPath } from "../homekit/ffmpeg-helper.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";
import {
  CameraSessionManager,
  MatterActiveSession,
} from "./camera-session-manager.js";

function sanitizeUrlForLog(rawUrl?: string): string {
  if (!rawUrl) return "<empty>";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) parsed.password = "******";
    return parsed.toString();
  } catch {
    return rawUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  }
}

export class CameraWebRtcAdapter {
  constructor(
    public readonly platform: any,
    public readonly entityId: string,
    public readonly capabilities: CameraCapabilitiesInfo,
    public readonly streamSource: ResolvedStreamSource,
    public readonly sessionManager: CameraSessionManager,
  ) {}

  /**
   * Flow A: Controller provides SDP Offer -> Bridge responds with Answer.
   */
  public async handleProvideOffer(
    request: {
      webRtcSessionId: number | null;
      sdp: string;
      streamUsage?: number;
      originatingEndpointId?: number;
      iceServers?: any[];
      iceTransportPolicy?: string;
    },
    endpoint?: any,
  ): Promise<{
    webRtcSessionId: number;
    videoStreamId?: number;
    audioStreamId?: number;
  }> {
    const session = request.webRtcSessionId
      ? this.sessionManager.getSession(request.webRtcSessionId) ||
        this.sessionManager.allocateSession(
          request.streamUsage || 3,
          request.originatingEndpointId,
        )
      : this.sessionManager.allocateSession(
          request.streamUsage || 3,
          request.originatingEndpointId,
        );

    session.offerSdp = request.sdp;
    this.sessionManager.touchSession(session.sessionId);

    this.platform?.log?.info?.(
      `[MatterCameraWebRtc][${this.entityId}] Received provideOffer for session ${session.sessionId}`,
    );

    try {
      await this.initializeWebRtcPipeline(session, request.sdp, false);

      // If remote Requestor client is accessible, deliver answer
      if (endpoint && session.answerSdp && session.remoteEndpointId) {
        try {
          await endpoint.invokeBehaviorCommand?.(
            "webRtcTransportRequestor",
            "answer",
            {
              webRtcSessionId: session.sessionId,
              sdp: session.answerSdp,
            },
          );
        } catch {
          // Standard response fallback
        }
      }
    } catch (err: any) {
      this.platform?.log?.error?.(
        `[MatterCameraWebRtc][${this.entityId}] Pipeline setup error in provideOffer: ${err.message || err}`,
      );
    }

    return {
      webRtcSessionId: session.sessionId,
      videoStreamId: session.videoStreamId,
      audioStreamId: session.audioStreamId,
    };
  }

  /**
   * Flow B: Controller solicits SDP Offer -> Bridge creates Offer.
   */
  public async handleSolicitOffer(
    request: {
      streamUsage: number;
      originatingEndpointId: any;
      iceServers?: any[];
      iceTransportPolicy?: string;
    },
    endpoint?: any,
  ): Promise<{
    webRtcSessionId: number;
    deferredOffer: boolean;
    videoStreamId?: number;
    audioStreamId?: number;
  }> {
    const session = this.sessionManager.allocateSession(
      request.streamUsage || 3,
      request.originatingEndpointId,
    );

    this.platform?.log?.info?.(
      `[MatterCameraWebRtc][${this.entityId}] Received solicitOffer for session ${session.sessionId}`,
    );

    try {
      await this.initializeWebRtcPipeline(session, "", true);

      // Deliver offer to Requestor client
      if (endpoint && session.offerSdp && session.remoteEndpointId) {
        try {
          await endpoint.invokeBehaviorCommand?.(
            "webRtcTransportRequestor",
            "offer",
            {
              webRtcSessionId: session.sessionId,
              sdp: session.offerSdp,
            },
          );
        } catch {
          // Fallback
        }
      }
    } catch (err: any) {
      this.platform?.log?.error?.(
        `[MatterCameraWebRtc][${this.entityId}] Pipeline setup error in solicitOffer: ${err.message || err}`,
      );
    }

    return {
      webRtcSessionId: session.sessionId,
      deferredOffer: false,
      videoStreamId: session.videoStreamId,
      audioStreamId: session.audioStreamId,
    };
  }

  /**
   * Flow B part 2: Controller provides Answer after Bridge offered.
   */
  public async handleProvideAnswer(request: {
    webRtcSessionId: number;
    sdp: string;
  }): Promise<void> {
    const session = this.sessionManager.getSession(request.webRtcSessionId);
    if (!session || !session.peerConnection) {
      this.platform?.log?.warn?.(
        `[MatterCameraWebRtc][${this.entityId}] Session ${request.webRtcSessionId} not found for provideAnswer`,
      );
      return;
    }

    session.answerSdp = request.sdp;
    this.sessionManager.touchSession(session.sessionId);

    try {
      await session.peerConnection.setRemoteDescription({
        type: "answer",
        sdp: request.sdp,
      });
      this.platform?.log?.info?.(
        `[MatterCameraWebRtc][${this.entityId}] Remote answer SDP applied for session ${session.sessionId}`,
      );
    } catch (err: any) {
      this.platform?.log?.error?.(
        `[MatterCameraWebRtc][${this.entityId}] Failed applying remote answer: ${err.message || err}`,
      );
    }
  }

  public async handleProvideIceCandidates(request: {
    webRtcSessionId: number;
    iceCandidates: any[];
  }): Promise<void> {
    const session = this.sessionManager.getSession(request.webRtcSessionId);
    if (session && Array.isArray(request.iceCandidates)) {
      session.iceCandidates.push(...request.iceCandidates);
      this.sessionManager.touchSession(session.sessionId);

      if (session.peerConnection) {
        for (const candidate of request.iceCandidates) {
          try {
            await session.peerConnection.addIceCandidate(candidate);
          } catch {}
        }
      }
    }
  }

  public async handleEndSession(request: {
    webRtcSessionId: number;
    reason?: number;
  }): Promise<void> {
    await this.sessionManager.cleanupSession(request.webRtcSessionId);
    this.platform?.log?.info?.(
      `[MatterCameraWebRtc][${this.entityId}] Session ${request.webRtcSessionId} ended cleanly (reason ${request.reason ?? 0})`,
    );
  }

  /**
   * Initializes local UDP sockets, Werift RTCPeerConnection and FFmpeg pipeline.
   */
  private async initializeWebRtcPipeline(
    session: MatterActiveSession,
    remoteSdp: string,
    isInitiator: boolean,
  ): Promise<void> {
    // 1. Allocate local loopback UDP ports
    const videoPort = 37000 + Math.floor(Math.random() * 5000);
    const audioPort = videoPort + 2;

    const videoSocket = dgram.createSocket("udp4");
    const audioSocket = dgram.createSocket("udp4");

    await new Promise<void>((resolve) =>
      videoSocket.bind(videoPort, "127.0.0.1", () => resolve()),
    );
    await new Promise<void>((resolve) =>
      audioSocket.bind(audioPort, "127.0.0.1", () => resolve()),
    );

    session.videoSocket = videoSocket;
    session.audioSocket = audioSocket;
    session.videoPort = videoPort;
    session.audioPort = audioPort;

    // 2. Setup Werift RTCPeerConnection
    const hasAudio = Boolean(this.capabilities.hasAudio);

    const pc = new RTCPeerConnection({
      iceServers: [],
      codecs: {
        video: [
          new RTCRtpCodecParameters({
            mimeType: "video/H264",
            clockRate: 90000,
            rtcpFeedback: [
              { type: "nack" },
              { type: "nack", parameter: "pli" },
              { type: "goog-remb" },
            ],
            parameters: "packetization-mode=1;profile-level-id=42e01f",
            payloadType: 96,
          }),
        ],
        audio: hasAudio
          ? [
              new RTCRtpCodecParameters({
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2,
                payloadType: 111,
              }),
            ]
          : [],
      },
    });

    session.peerConnection = pc;

    // Add Video Track
    const videoTrack = new MediaStreamTrack({ kind: "video" });
    const videoSender = pc.addTrack(videoTrack);

    // Audio Track if available (sendonly - talkback not supported by Scrypted backend)
    let audioTrack: MediaStreamTrack | undefined;
    if (hasAudio) {
      audioTrack = new MediaStreamTrack({ kind: "audio" });
      pc.addTrack(audioTrack);
      session.audioStreamId = session.videoStreamId
        ? session.videoStreamId + 1
        : 2;
    }

    // Forward incoming UDP RTP packets directly to WebRTC tracks
    videoSocket.on("message", (buf) => {
      try {
        videoTrack.writeRtp(buf);
        session.metrics.videoPackets++;
        session.metrics.lastPacketAt = Date.now();
        this.sessionManager.touchSession(session.sessionId);
      } catch {}
    });

    if (hasAudio && audioTrack) {
      audioSocket.on("message", (buf) => {
        try {
          audioTrack!.writeRtp(buf);
          session.metrics.audioPackets++;
          session.metrics.lastPacketAt = Date.now();
        } catch {}
      });
    }

    // Monitor ICE connection state
    pc.iceConnectionStateChange.subscribe((state) => {
      session.metrics.iceConnectionState = state;
      if (state === "disconnected" || state === "failed") {
        void this.sessionManager.cleanupSession(session.sessionId);
      }
    });

    // Handle PLI from remote client
    videoSender.onPictureLossIndication.subscribe(() => {
      this.platform?.log?.debug?.(
        `[MatterCameraWebRtc][${this.entityId}] Received PLI for session ${session.sessionId}`,
      );
    });

    // 3. Negotiate SDP
    if (!isInitiator && remoteSdp) {
      await pc.setRemoteDescription({ type: "offer", sdp: remoteSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      session.answerSdp = answer.sdp;
    } else if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      session.offerSdp = offer.sdp;
    }

    // 4. Start FFmpeg source process
    this.startFfmpegStream(session);
  }

  /**
   * Starts FFmpeg to stream from the validated camera source to local loopback ports.
   */
  private startFfmpegStream(session: MatterActiveSession): void {
    const rawUrl =
      this.streamSource?.url || (this.streamSource?.metadata as any)?.directUrl;

    if (!rawUrl) {
      this.platform?.log?.warn?.(
        `[MatterCameraWebRtc][${this.entityId}] No valid direct stream URL found for session ${session.sessionId}`,
      );
      return;
    }

    const ffmpegBinary = resolveFfmpegPath() || "ffmpeg";
    const sanitizedUrl = sanitizeUrlForLog(rawUrl);

    this.platform?.log?.info?.(
      `[MatterCameraWebRtc][${this.entityId}] Starting FFmpeg stream from ${sanitizedUrl} for session ${session.sessionId}`,
    );

    const isH264 = this.capabilities.videoCodec === "h264";
    const hasAudio = Boolean(this.capabilities.hasAudio);

    const ffmpegArgs: string[] = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-rtsp_transport",
      "tcp",
      "-i",
      rawUrl,
    ];

    // Video output parameters
    ffmpegArgs.push("-map", "0:v:0");
    if (isH264 && !this.capabilities.requiresTranscoding) {
      ffmpegArgs.push("-c:v", "copy", "-bsf:v", "dump_extra=freq=keyframe");
    } else {
      ffmpegArgs.push(
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-profile:v",
        "baseline",
        "-level",
        "3.1",
        "-pix_fmt",
        "yuv420p",
        "-g",
        "30",
        "-keyint_min",
        "30",
        "-b:v",
        "1500k",
        "-bsf:v",
        "dump_extra=freq=keyframe",
      );
    }
    ffmpegArgs.push(
      "-payload_type",
      "96",
      "-f",
      "rtp",
      `rtp://127.0.0.1:${session.videoPort}`,
    );

    // Audio output parameters (transcode to Opus 48kHz for WebRTC)
    if (hasAudio) {
      ffmpegArgs.push(
        "-map",
        "0:a:0?",
        "-c:a",
        "libopus",
        "-b:a",
        "64k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-payload_type",
        "111",
        "-f",
        "rtp",
        `rtp://127.0.0.1:${session.audioPort}`,
      );
    }

    try {
      const proc = spawn(ffmpegBinary, ffmpegArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      session.ffmpegProcess = proc;

      proc.stderr?.on("data", (chunk) => {
        const msg = chunk.toString().trim();
        if (msg && (msg.includes("error") || msg.includes("fatal"))) {
          this.platform?.log?.warn?.(
            `[MatterCameraWebRtc][${this.entityId}][FFmpeg] ${msg}`,
          );
        }
      });

      proc.on("exit", (code, signal) => {
        this.platform?.log?.debug?.(
          `[MatterCameraWebRtc][${this.entityId}] FFmpeg exited with code ${code}, signal ${signal}`,
        );
      });
    } catch (err: any) {
      this.platform?.log?.error?.(
        `[MatterCameraWebRtc][${this.entityId}] Failed to spawn FFmpeg: ${err.message || err}`,
      );
    }
  }
}

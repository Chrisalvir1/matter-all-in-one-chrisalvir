import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";
import {
  CameraSessionManager,
  MatterActiveSession,
} from "./camera-session-manager.js";

export class CameraWebRtcAdapter {
  constructor(
    public readonly platform: any,
    public readonly entityId: string,
    public readonly capabilities: CameraCapabilitiesInfo,
    public readonly streamSource: ResolvedStreamSource,
    public readonly sessionManager: CameraSessionManager,
  ) {}

  public async handleProvideOffer(request: {
    webRtcSessionId: number | null;
    sdp: string;
    streamUsage?: number;
  }): Promise<{ webRtcSessionId: number; videoStreamId?: number }> {
    const session = request.webRtcSessionId
      ? this.sessionManager.getSession(request.webRtcSessionId) ||
        this.sessionManager.allocateSession(request.streamUsage || 1)
      : this.sessionManager.allocateSession(request.streamUsage || 1);

    session.offerSdp = request.sdp;
    this.sessionManager.touchSession(session.sessionId);

    this.platform?.log?.debug?.(
      "[MatterCameraWebRtc][" +
        this.entityId +
        "] Handled provideOffer for session " +
        session.sessionId,
    );

    return {
      webRtcSessionId: session.sessionId,
      videoStreamId: session.videoStreamId,
    };
  }

  public async handleSolicitOffer(request: {
    streamUsage: number;
    originatingEndpointId: any;
  }): Promise<{
    webRtcSessionId: number;
    deferredOffer: boolean;
    videoStreamId?: number;
  }> {
    const session = this.sessionManager.allocateSession(
      request.streamUsage || 1,
    );

    this.platform?.log?.debug?.(
      "[MatterCameraWebRtc][" +
        this.entityId +
        "] Handled solicitOffer for session " +
        session.sessionId,
    );

    return {
      webRtcSessionId: session.sessionId,
      deferredOffer: false,
      videoStreamId: session.videoStreamId,
    };
  }

  public async handleProvideIceCandidates(request: {
    webRtcSessionId: number;
    iceCandidates: any[];
  }): Promise<void> {
    const session = this.sessionManager.getSession(request.webRtcSessionId);
    if (session && Array.isArray(request.iceCandidates)) {
      session.iceCandidates.push(...request.iceCandidates);
      this.sessionManager.touchSession(session.sessionId);
    }
  }

  public async handleEndSession(request: {
    webRtcSessionId: number;
    reason: number;
  }): Promise<void> {
    this.sessionManager.endSession(request.webRtcSessionId);
    this.platform?.log?.debug?.(
      "[MatterCameraWebRtc][" +
        this.entityId +
        "] Session " +
        request.webRtcSessionId +
        " ended (reason " +
        request.reason +
        ")",
    );
  }
}

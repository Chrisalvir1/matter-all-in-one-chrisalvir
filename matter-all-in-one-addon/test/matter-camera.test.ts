import { describe, expect, it, vi } from "vitest";
import { CameraSessionManager } from "../src/camera/matter/camera-session-manager.js";
import { CameraWebRtcAdapter } from "../src/camera/matter/camera-webrtc-adapter.js";
import { CameraEndpointBuilder } from "../src/camera/matter/camera-endpoint.builder.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import { RTCPeerConnection, RTCRtpCodecParameters } from "werift";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    spawn: vi.fn().mockImplementation(() => {
      return {
        pid: 12345,
        kill: vi.fn(),
        exitCode: null,
        killed: false,
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
    }),
  };
});

const mockPlatform = {
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

describe("CameraSessionManager (Matter 1.5/1.6 WebRTC)", () => {
  it("allocates and touches active streaming sessions", () => {
    const mgr = new CameraSessionManager();
    const s1 = mgr.allocateSession(3);
    expect(s1).toBeDefined();
    expect(s1.state).toBe("active");
    expect(s1.sessionId).toBeGreaterThan(0);
    expect(s1.videoStreamId).toBeDefined();

    expect(mgr.getSession(s1.sessionId)).toBe(s1);
    expect(mgr.getActiveSessions().length).toBe(1);

    mgr.touchSession(s1.sessionId);
    expect(s1.state).toBe("active");

    mgr.endSession(s1.sessionId);
    expect(mgr.getSession(s1.sessionId)).toBeUndefined();
  });

  it("handles automatic session rollover when capacity is reached", () => {
    const mgr = new CameraSessionManager();
    const s1 = mgr.allocateSession(3);
    const s2 = mgr.allocateSession(3);
    const s3 = mgr.allocateSession(3);
    expect(s3).toBeDefined();
    expect(mgr.getActiveSessions().length).toBeLessThanOrEqual(2);
  });

  it("cleans up resources safely on cleanupSession and cleanupAllSessions", async () => {
    const mgr = new CameraSessionManager();
    const s1 = mgr.allocateSession(3);
    const s2 = mgr.allocateSession(3);

    // Attach mock resources
    const mockProc: any = {
      kill: vi.fn(),
      exitCode: null,
      killed: false,
    };
    const mockSocket: any = {
      close: vi.fn(),
    };
    const mockPc: any = {
      close: vi.fn().mockResolvedValue(undefined),
    };

    s1.ffmpegProcess = mockProc;
    s1.videoSocket = mockSocket;
    s1.peerConnection = mockPc;

    await mgr.cleanupSession(s1.sessionId);
    expect(mockProc.kill).toHaveBeenCalledWith("SIGTERM");
    expect(mockSocket.close).toHaveBeenCalled();
    expect(mockPc.close).toHaveBeenCalled();
    expect(mgr.getSession(s1.sessionId)).toBeUndefined();

    await mgr.cleanupAllSessions();
    expect(mgr.getActiveSessions().length).toBe(0);
  });
});

describe("CameraWebRtcAdapter (Matter WebRTC Transport Provider 0x0553)", () => {
  const capabilities = {
    hasLiveStream: true,
    streamSourceType: "rtsp" as const,
    videoCodec: "h264" as const,
    hasAudio: true,
    audioCodec: "aac_lc" as const,
    resolution: { width: 1920, height: 1080 },
    maxFps: 30,
    strategy: "passthrough_h264" as const,
    requiresTranscoding: false,
    supportedFeatures: 2,
  };

  const streamSource = {
    sourceType: "rtsp" as const,
    url: "rtsp://127.0.0.1:8554/cam1",
    supportsPassthrough: true,
    requiresBridge: false,
  };

  it("handles solicitOffer command and creates local WebRTC offer", async () => {
    const mgr = new CameraSessionManager();
    const adapter = new CameraWebRtcAdapter(
      mockPlatform,
      "camera.hallway",
      capabilities,
      streamSource,
      mgr,
    );

    const res = await adapter.handleSolicitOffer({
      streamUsage: 3,
      originatingEndpointId: 1,
    });

    expect(res).toBeDefined();
    expect(res.webRtcSessionId).toBeGreaterThan(0);
    expect(res.deferredOffer).toBe(false);

    const session = mgr.getSession(res.webRtcSessionId);
    expect(session).toBeDefined();
    expect(session?.offerSdp).toBeTruthy();

    await mgr.cleanupAllSessions();
  });

  it("handles provideOffer command and creates answer SDP", async () => {
    const mgr = new CameraSessionManager();
    const adapter = new CameraWebRtcAdapter(
      mockPlatform,
      "camera.garden",
      capabilities,
      streamSource,
      mgr,
    );

    // Create a real WebRTC client offer using werift
    const clientPc = new RTCPeerConnection({
      codecs: {
        video: [
          new RTCRtpCodecParameters({
            mimeType: "video/H264",
            clockRate: 90000,
            payloadType: 96,
            parameters: "packetization-mode=1;profile-level-id=42e01f",
          }),
        ],
      },
    });
    clientPc.addTransceiver("video", { direction: "recvonly" });
    const realOffer = await clientPc.createOffer();

    const res = await adapter.handleProvideOffer({
      webRtcSessionId: null,
      sdp: realOffer.sdp,
      streamUsage: 3,
      originatingEndpointId: 1,
    });

    expect(res).toBeDefined();
    expect(res.webRtcSessionId).toBeGreaterThan(0);

    const session = mgr.getSession(res.webRtcSessionId);
    expect(session).toBeDefined();
    expect(session?.answerSdp).toBeTruthy();

    // Test ICE candidates injection
    await adapter.handleProvideIceCandidates({
      webRtcSessionId: res.webRtcSessionId,
      iceCandidates: [
        {
          candidate: "candidate:1 1 UDP 2130706431 192.168.1.1 5000 typ host",
          sdpMid: "0",
          sdpMLineIndex: 0,
        },
      ],
    });
    expect(session?.iceCandidates.length).toBeGreaterThan(0);

    // Test session end
    await adapter.handleEndSession({
      webRtcSessionId: res.webRtcSessionId,
      reason: 0,
    });
    expect(mgr.getSession(res.webRtcSessionId)).toBeUndefined();
    await clientPc.close();
  });
});

describe("CameraEndpointBuilder", () => {
  it("builds a Matter camera endpoint with 0x0551 and 0x0553 clusters", async () => {
    const mgr = new CameraSessionManager();
    const capabilities = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: true,
      audioCodec: "aac_lc" as const,
      resolution: { width: 1920, height: 1080 },
      maxFps: 30,
      strategy: "passthrough_h264" as const,
      requiresTranscoding: false,
    };
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://127.0.0.1:8554/live",
      supportsPassthrough: true,
      requiresBridge: false,
      metadata: {
        isScrypted: true,
        model: "C120",
        manufacturer: "TP-Link",
        serialNumber: "SN123456",
      },
    };
    const adapter = new CameraWebRtcAdapter(
      mockPlatform,
      "camera.driveway",
      capabilities,
      streamSource,
      mgr,
    );

    const endpoint = await CameraEndpointBuilder.build(
      mockPlatform,
      "camera.driveway",
      MatterDeviceTypes.camera,
      capabilities,
      streamSource,
      mgr,
      adapter,
      "Driveway Camera",
    );

    expect(endpoint).toBeDefined();
    expect(endpoint.deviceName).toBe("Driveway Camera");
    expect(endpoint.deviceType).toBe(MatterDeviceTypes.camera.code);
  });
});

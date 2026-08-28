import { describe, expect, it, vi } from "vitest";
import { CameraSessionManager } from "../src/camera/matter/camera-session-manager.js";
import { CameraWebRtcAdapter } from "../src/camera/matter/camera-webrtc-adapter.js";

const mockPlatform = {
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  ha: {
    callService: vi.fn().mockResolvedValue({ sdp: "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n" }),
  },
};

describe("CameraSessionManager (Matter 1.5/1.6 WebRTC)", () => {
  it("allocates and touches active streaming sessions", () => {
    const mgr = new CameraSessionManager(2, 5000);
    const s1 = mgr.allocateSession(1);
    expect(s1).toBeDefined();
    expect(s1.state).toBe("active");
    expect(s1.sessionId).toBeGreaterThan(0);

    expect(mgr.getSession(s1.sessionId)).toBe(s1);
    expect(mgr.getActiveSessions().length).toBe(1);

    mgr.touchSession(s1.sessionId);
    expect(s1.state).toBe("active");

    mgr.endSession(s1.sessionId);
    expect(mgr.getSession(s1.sessionId)).toBeUndefined();
  });

  it("handles automatic session rollover when capacity is reached", () => {
    const mgr = new CameraSessionManager(2);
    const s1 = mgr.allocateSession(1);
    const s2 = mgr.allocateSession(1);
    const s3 = mgr.allocateSession(1);
    expect(s3).toBeDefined();
    expect(mgr.getActiveSessions().length).toBeLessThanOrEqual(2);
  });
});

describe("CameraWebRtcAdapter (Matter WebRTC Transport Provider 0x0553)", () => {
  it("handles solicitOffer command and interacts with HA webrtc bridge", async () => {
    const mgr = new CameraSessionManager();
    const capabilities = {
      hasLiveStream: true,
      streamSourceType: "webrtc" as const,
      videoCodec: "h264" as const,
      hasAudio: true,
      audioCodec: "opus" as const,
      resolution: { width: 1920, height: 1080 },
      maxFps: 30,
      strategy: "passthrough_h264" as const,
      requiresTranscoding: false,
      supportedFeatures: 2,
    };
    const streamSource = {
      sourceType: "webrtc" as const,
      url: "http://ha.local:8123/api/webrtc",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const adapter = new CameraWebRtcAdapter(mockPlatform, "camera.hallway", capabilities, streamSource, mgr);
    const res = await adapter.handleSolicitOffer({ streamUsage: 1, originatingEndpointId: 1 });
    expect(res).toBeDefined();
    expect(res.webRtcSessionId).toBeGreaterThan(0);
  });
});

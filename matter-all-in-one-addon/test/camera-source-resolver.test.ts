import { describe, expect, it, vi } from "vitest";
import { CameraSourceResolver } from "../src/camera/camera-source-resolver.js";

function makeState(attrs: Record<string, any> = {}) {
  return {
    entity_id: "camera.driveway",
    state: "idle",
    attributes: attrs,
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  };
}

describe("CameraSourceResolver", () => {
  it("resolves direct RTSP URL from attributes", async () => {
    const state = makeState({
      stream_source: "rtsp://admin:secret123@192.168.1.100:554/ch0",
    });
    const res = await CameraSourceResolver.resolve(
      {},
      "camera.driveway",
      state,
    );

    expect(res.sourceType).toBe("rtsp");
    expect(res.url).toBe("rtsp://admin:secret123@192.168.1.100:554/ch0");
    expect(res.supportsPassthrough).toBe(true);
    expect(res.snapshotUrl).toBe("/api/camera_proxy/camera.driveway");
  });

  it("resolves native WebRTC frontend stream type", async () => {
    const state = makeState({ frontend_stream_type: "webrtc" });
    const res = await CameraSourceResolver.resolve(
      {},
      "camera.driveway",
      state,
    );

    expect(res.sourceType).toBe("webrtc");
    expect(res.supportsPassthrough).toBe(true);
  });

  it("calls Home Assistant play_stream service when available", async () => {
    const mockPlatform = {
      ha: {
        callService: vi.fn().mockResolvedValue({
          url: "http://ha.local:8123/api/hls/master.m3u8",
        }),
      },
    };
    const state = makeState({ supported_features: 2 });
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.driveway",
      state,
    );

    expect(mockPlatform.ha.callService).toHaveBeenCalledWith(
      "camera",
      "play_stream",
      "camera.driveway",
      { format: "hls" },
    );
    expect(res.sourceType).toBe("hls");
    expect(res.url).toBe("http://ha.local:8123/api/hls/master.m3u8");
  });

  it("resolves native WebSocket camera/stream URL when available", async () => {
    const mockPlatform = {
      ha: {
        requestCameraStream: vi
          .fn()
          .mockResolvedValue("http://127.0.0.1:8123/api/hls/test-stream/master.m3u8"),
        getAccessToken: vi.fn().mockReturnValue("secret-ha-token"),
      },
    };
    const state = makeState();
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.playroom_camara_de_playroom",
      state,
    );

    expect(mockPlatform.ha.requestCameraStream).toHaveBeenCalledWith(
      "camera.playroom_camara_de_playroom",
    );
    expect(res.sourceType).toBe("hls");
    expect(res.url).toBe(
      "http://127.0.0.1:8123/api/hls/test-stream/master.m3u8",
    );
  });

  it("falls back to getCameraProxyStreamUrl when other streams are unavailable", async () => {
    const mockPlatform = {
      ha: {
        requestCameraStream: vi.fn().mockResolvedValue(null),
        getCameraProxyStreamUrl: vi
          .fn()
          .mockReturnValue(
            "http://127.0.0.1:8123/api/camera_proxy_stream/camera.playroom_camara_de_playroom",
          ),
      },
    };
    const state = makeState();
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.playroom_camara_de_playroom",
      state,
    );

    expect(res.sourceType).toBe("ha_proxy");
    expect(res.url).toBe(
      "http://127.0.0.1:8123/api/camera_proxy_stream/camera.playroom_camara_de_playroom",
    );
  });

  it("sanitizes passwords and query tokens in URLs for logging", () => {
    const rawUrl =
      "rtsp://admin:mySecretPass@192.168.1.50:554/live?token=abc123xyz";
    const sanitized = CameraSourceResolver.sanitizeUrl(rawUrl);

    expect(sanitized).not.toContain("mySecretPass");
    expect(sanitized).not.toContain("abc123xyz");
    expect(sanitized).toContain(
      "rtsp://admin:***@192.168.1.50:554/live?token=***",
    );
  });
});

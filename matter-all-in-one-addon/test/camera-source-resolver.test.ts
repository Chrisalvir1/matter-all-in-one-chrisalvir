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
  it("uses a fresh HA stream when Omni Tuya cannot renew its signed URL", async () => {
    const requestCameraStream = vi
      .fn()
      .mockResolvedValue("http://ha.local/api/hls/fresh/master.m3u8");
    const platform = {
      ha: {
        requestCameraStream,
        getCameraProxyStreamUrl: vi.fn(),
      },
    };

    const fallback = await CameraSourceResolver.resolveOmniTuyaFallback(
      platform,
      "camera.feeder",
      makeState(),
    );

    expect(requestCameraStream).toHaveBeenCalledWith("camera.feeder");
    expect(fallback).toMatchObject({
      sourceType: "hls",
      url: "http://ha.local/api/hls/fresh/master.m3u8",
      requiresBridge: true,
      metadata: { isOmniTuyaFallback: true },
    });
  });

  it("uses the HA camera proxy if the fresh HA stream cannot be created", async () => {
    const platform = {
      ha: {
        requestCameraStream: vi.fn().mockResolvedValue(null),
        getCameraProxyStreamUrl: vi
          .fn()
          .mockReturnValue("http://ha.local/api/camera_proxy_stream/camera.feeder"),
      },
    };

    const fallback = await CameraSourceResolver.resolveOmniTuyaFallback(
      platform,
      "camera.feeder",
      makeState(),
    );

    expect(fallback).toMatchObject({
      sourceType: "ha_proxy",
      url: "http://ha.local/api/camera_proxy_stream/camera.feeder",
      requiresBridge: true,
      metadata: { isOmniTuyaFallback: true },
    });
  });

  it("resolves Omni Tuya camera from a fresh signed RTSP URL", async () => {
    const streamUrl = "rtsps://tuya.example/session?token=ephemeral";
    const mockPlatform = {
      ha: {
        hassEntities: new Map([
          ["camera.feeder", { platform: "omni_tuya_local" }],
        ]),
        requestOmniTuyaCameraStream: vi.fn().mockResolvedValue(streamUrl),
        requestCameraStream: vi.fn(),
      },
    };

    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.feeder",
      makeState({
        supported_features: 2,
        stream_source: "http://ha.local/api/hls/stale-token/master_playlist.m3u8",
      }),
    );

    expect(mockPlatform.ha.requestOmniTuyaCameraStream).toHaveBeenCalledWith(
      "camera.feeder",
    );
    expect(mockPlatform.ha.requestCameraStream).not.toHaveBeenCalled();
    expect(res).toMatchObject({
      sourceType: "rtsp",
      url: streamUrl,
      supportsPassthrough: true,
      requiresBridge: false,
      metadata: {
        isOmniTuyaDirect: true,
        sourceCameraEntityId: "camera.feeder",
      },
    });
  });

  it("prefers Omni's fresh RTSP URL over HA's short-lived HLS worker", async () => {
    const streamUrl = "rtsps://tuya.example/session?token=renewed";
    const requestOmniTuyaCameraStream = vi.fn().mockResolvedValue(streamUrl);
    const mockPlatform = {
      ha: {
        hassEntities: new Map([
          ["camera.feeder", { platform: "omni_tuya_local" }],
        ]),
        requestOmniTuyaCameraStream,
      },
    };

    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.feeder",
      makeState({
        supported_features: 2,
        stream_source: "http://ha.local/api/hls/expired/master_playlist.m3u8",
      }),
    );

    expect(requestOmniTuyaCameraStream).toHaveBeenCalledWith("camera.feeder");
    expect(res.sourceType).toBe("rtsp");
    expect(res.url).toBe(streamUrl);
  });

  it("only requests a direct Tuya URL for cameras registered by Omni Tuya Local", async () => {
    const requestOmniTuyaCameraStream = vi.fn();
    const mockPlatform = {
      ha: {
        hassEntities: new Map([
          ["camera.generic", { platform: "generic" }],
        ]),
        requestOmniTuyaCameraStream,
        requestCameraStream: vi
          .fn()
          .mockResolvedValue("http://ha.local/api/hls/generic/master.m3u8"),
        getAccessToken: vi.fn(),
      },
    };

    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.generic",
      makeState({ supported_features: 2 }),
    );

    expect(requestOmniTuyaCameraStream).not.toHaveBeenCalled();
    expect(res.sourceType).toBe("hls");
    expect(res.metadata?.isOmniTuyaDirect).toBeUndefined();
  });

  it("resolves direct RTSP URL from stream_source attribute", async () => {
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

  it("never calls the media-player-only play_stream service", async () => {
    const mockPlatform = {
      ha: {
        callService: vi.fn(),
        getCameraProxyStreamUrl: vi
          .fn()
          .mockReturnValue(
            "http://ha.local:8123/api/camera_proxy_stream/camera.driveway",
          ),
      },
    };
    const state = makeState({ supported_features: 2 });
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.driveway",
      state,
    );

    expect(mockPlatform.ha.callService).not.toHaveBeenCalled();
    expect(res.sourceType).toBe("ha_proxy");
    expect(res.url).toBe(
      "http://ha.local:8123/api/camera_proxy_stream/camera.driveway",
    );
  });

  it("does NOT call play_stream or camera/stream when camera lacks STREAM feature, falls back to camera_proxy_stream", async () => {
    const mockPlatform = {
      ha: {
        requestCameraStream: vi.fn(),
        callService: vi.fn(),
        getCameraProxyStreamUrl: vi
          .fn()
          .mockReturnValue(
            "http://127.0.0.1:8123/api/camera_proxy_stream/camera.playroom_camara_de_playroom",
          ),
      },
    };
    const state = makeState({ supported_features: 1 }); // only ON_OFF, no STREAM
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.playroom_camara_de_playroom",
      state,
    );

    expect(mockPlatform.ha.requestCameraStream).not.toHaveBeenCalled();
    expect(mockPlatform.ha.callService).not.toHaveBeenCalled();
    expect(res.sourceType).toBe("ha_proxy");
    expect(res.url).toBe(
      "http://127.0.0.1:8123/api/camera_proxy_stream/camera.playroom_camara_de_playroom",
    );
  });

  it("resolves native WebSocket camera/stream URL when supported_features has STREAM", async () => {
    const mockPlatform = {
      ha: {
        requestCameraStream: vi
          .fn()
          .mockResolvedValue(
            "http://127.0.0.1:8123/api/hls/test-stream/master.m3u8",
          ),
        getAccessToken: vi.fn().mockReturnValue("secret-ha-token"),
      },
    };
    const state = makeState({ supported_features: 2 });
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
    expect(res.metadata?.sourceCameraEntityId).toBe(
      "camera.playroom_camara_de_playroom",
    );
  });

  it("requests Tapo HLS even when the integration omits the STREAM feature bit", async () => {
    const mockPlatform = {
      ha: {
        requestCameraStream: vi
          .fn()
          .mockResolvedValue("http://127.0.0.1:8123/api/hls/c402/master.m3u8"),
        getCameraProxyStreamUrl: vi.fn(),
      },
    };
    const state = makeState({
      friendly_name: "Tapo C402",
      supported_features: 0,
    });
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.tapo_c402",
      state,
    );

    expect(mockPlatform.ha.requestCameraStream).toHaveBeenCalledWith(
      "camera.tapo_c402",
    );
    expect(res.sourceType).toBe("hls");
    expect(res.metadata?.sourceCameraEntityId).toBe("camera.tapo_c402");
  });

  it("returns unknown when no stream endpoint can be resolved", async () => {
    const mockPlatform = {
      ha: {
        requestCameraStream: vi.fn().mockResolvedValue(null),
        getCameraProxyStreamUrl: vi.fn().mockReturnValue(null),
      },
    };
    const state = makeState({ supported_features: 2 });
    const res = await CameraSourceResolver.resolve(
      mockPlatform,
      "camera.driveway",
      state,
    );

    expect(res.sourceType).toBe("unknown");
    expect(res.url).toBeUndefined();
    expect(res.snapshotUrl).toBe("/api/camera_proxy/camera.driveway");
  });
});

import { describe, expect, it } from "vitest";
import { detectCameraCapabilities } from "../src/camera/camera-capabilities.js";

function makeState(state = "idle", attrs: Record<string, any> = {}) {
  return {
    entity_id: "camera.test_camera",
    state,
    attributes: attrs,
    last_changed: "",
    last_updated: "",
    context: { id: "", parent_id: null, user_id: null },
  };
}

describe("detectCameraCapabilities", () => {
  it("detects H.264 passthrough with compatible AAC audio", () => {
    const state = makeState("streaming", {
      frontend_stream_type: "hls",
      supported_features: 2,
      video_codec: "h264",
      audio_codec: "aac",
      has_audio: true,
      width: 1920,
      height: 1080,
      fps: 30,
    });

    const cap = detectCameraCapabilities(state);
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.videoCodec).toBe("h264");
    expect(cap.hasAudio).toBe(true);
    expect(cap.audioCodec).toBe("aac_lc");
    expect(cap.strategy).toBe("passthrough_h264");
    expect(cap.requiresTranscoding).toBe(false);
    expect(cap.resolution).toEqual({ width: 1920, height: 1080 });
  });

  it("detects H.264 RTSP with no audio_codec attribute as passthrough_h264 (v1.6.3: assume audio)", () => {
    // Many real RTSP cameras don't advertise audio_codec in HA state but DO have audio.
    // v1.6.3: always passthrough_h264 for H.264 RTSP, FFmpeg handles no-audio track gracefully.
    const state = makeState("idle", {
      stream_source: "rtsp://192.168.1.100/stream",
      video_codec: "h264",
      // no audio_codec, no has_audio declared
    });

    const cap = detectCameraCapabilities(state, {
      sourceType: "rtsp",
      url: "rtsp://192.168.1.100/stream",
      snapshotUrl: "/api/camera_proxy/camera.test_camera",
      supportsPassthrough: true,
      requiresBridge: false,
    });
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.videoCodec).toBe("h264");
    expect(cap.hasAudio).toBe(true); // assumed true for direct RTSP
    expect(cap.audioCodec).toBe("aac_lc");
    // MUST be passthrough_h264, never passthrough_video_only
    expect(cap.strategy).toBe("passthrough_h264");
    expect(cap.requiresTranscoding).toBe(false);
  });

  it("detects H.265 / HEVC stream and marks passthrough_hevc with zero transcoding", () => {
    const state = makeState("streaming", {
      stream_source: "rtsp://camera.local/hevc",
      video_codec: "hevc",
      audio_codec: "aac",
      has_audio: true,
      supported_features: 2,
    });

    const cap = detectCameraCapabilities(state);
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.videoCodec).toBe("h265");
    expect(cap.strategy).toBe("passthrough_hevc");
    expect(cap.requiresTranscoding).toBe(false);
    expect(cap.hasAudio).toBe(true);
    expect(cap.audioCodec).toBe("aac_lc");
  });

  it("marks unavailable cameras as unsupported", () => {
    const state = makeState("unavailable", {
      supported_features: 2,
    });

    const cap = detectCameraCapabilities(state);
    expect(cap.hasLiveStream).toBe(false);
    expect(cap.strategy).toBe("unsupported");
  });

  it("v1.6.3: WebRTC camera without URL (Nest FAILED_PRECONDITION) → unsupported, not transcode", () => {
    const state = makeState("idle", {
      frontend_stream_type: "webrtc",
      video_codec: "h264",
      has_audio: true,
    });

    // sourceType is webrtc but no URL (go2rtc not configured, Google API error)
    const cap = detectCameraCapabilities(state, {
      sourceType: "webrtc",
      url: undefined,
      snapshotUrl: "/api/camera_proxy/camera.test_camera",
      supportsPassthrough: false,
      requiresBridge: true,
    });
    expect(cap.hasLiveStream).toBe(false);
    expect(cap.strategy).toBe("unsupported");
    // Must mention go2rtc in the reason
    expect(cap.transcodingReason).toContain("go2rtc");
    expect(cap.requiresTranscoding).toBe(false);
  });

  it("v1.6.3: RTSP camera with PCM/ALAW audio → passthrough_h264 (delegate will re-encode to AAC-ELD)", () => {
    const state = makeState("streaming", {
      stream_source: "rtsp://192.168.1.50/stream",
      video_codec: "h264",
      audio_codec: "pcm_alaw",
      has_audio: true,
    });

    const cap = detectCameraCapabilities(state, {
      sourceType: "rtsp",
      url: "rtsp://192.168.1.50/stream",
      snapshotUrl: "/api/camera_proxy/camera.test_camera",
      supportsPassthrough: true,
      requiresBridge: false,
    });
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.videoCodec).toBe("h264");
    expect(cap.audioCodec).toBe("pcm");
    expect(cap.hasAudio).toBe(true);
    // Must be passthrough_h264 even with PCM — delegate handles re-encoding to AAC-ELD
    expect(cap.strategy).toBe("passthrough_h264");
    expect(cap.requiresTranscoding).toBe(false);
  });

  it("v1.6.3: WebRTC camera WITH go2rtc RTSP URL → passthrough_h264 (Nest via go2rtc bridge)", () => {
    const state = makeState("idle", {
      frontend_stream_type: "webrtc",
      video_codec: "h264",
      has_audio: true,
    });

    // go2rtc provided RTSP URL — resolver returns rtsp sourceType
    const cap = detectCameraCapabilities(state, {
      sourceType: "rtsp",
      url: "rtsp://127.0.0.1:8554/camera_nest_sala",
      snapshotUrl: "/api/camera_proxy/camera.test_camera",
      supportsPassthrough: true,
      requiresBridge: false,
      metadata: { isGo2rtc: true, isNest: true },
    });
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.strategy).toBe("passthrough_h264");
    expect(cap.requiresTranscoding).toBe(false);
  });
});

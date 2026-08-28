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

  it("detects H.264 with incompatible audio and selects passthrough_video_only", () => {
    const state = makeState("idle", {
      frontend_stream_type: "webrtc",
      video_codec: "h264",
      audio_codec: "mp3",
      has_audio: true,
    });

    const cap = detectCameraCapabilities(state);
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.videoCodec).toBe("h264");
    expect(cap.hasAudio).toBe(false);
    expect(cap.audioCodec).toBe("incompatible");
    expect(cap.strategy).toBe("passthrough_video_only");
    expect(cap.requiresTranscoding).toBe(false);
  });

  it("detects H.265 / HEVC stream and marks transcode_required", () => {
    const state = makeState("streaming", {
      stream_source: "rtsp://camera.local/hevc",
      video_codec: "hevc",
      supported_features: 2,
    });

    const cap = detectCameraCapabilities(state);
    expect(cap.hasLiveStream).toBe(true);
    expect(cap.videoCodec).toBe("h265");
    expect(cap.strategy).toBe("transcode_required");
    expect(cap.requiresTranscoding).toBe(true);
    expect(cap.transcodingReason).toContain("h265");
  });

  it("marks unavailable cameras as unsupported", () => {
    const state = makeState("unavailable", {
      supported_features: 2,
    });

    const cap = detectCameraCapabilities(state);
    expect(cap.hasLiveStream).toBe(false);
    expect(cap.strategy).toBe("unsupported");
  });
});

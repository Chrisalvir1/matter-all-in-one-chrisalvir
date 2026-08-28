import { describe, it, expect } from "vitest";
import { cameraConverter } from "../../src/converters/camera.converter.js";

describe("cameraConverter", () => {
  it("should map HA camera recording/streaming state to streaming status", () => {
    const recordingState = { state: "recording", attributes: {} } as any;
    const streamingState = { state: "streaming", attributes: {} } as any;
    const idleState = { state: "idle", attributes: {} } as any;
    const offState = { state: "off", attributes: {} } as any;

    expect(cameraConverter.toStreamingState(recordingState)).toBe(true);
    expect(cameraConverter.toStreamingState(streamingState)).toBe(true);
    expect(cameraConverter.toStreamingState(idleState)).toBe(false);
    expect(cameraConverter.toStreamingState(offState)).toBe(false);
  });

  it("should determine whether camera is active / powered on", () => {
    expect(
      cameraConverter.isCameraOn({ state: "idle", attributes: {} } as any),
    ).toBe(true);
    expect(
      cameraConverter.isCameraOn({ state: "streaming", attributes: {} } as any),
    ).toBe(true);
    expect(
      cameraConverter.isCameraOn({ state: "off", attributes: {} } as any),
    ).toBe(false);
    expect(
      cameraConverter.isCameraOn({
        state: "unavailable",
        attributes: {},
      } as any),
    ).toBe(false);
  });

  it("should identify WebRTC capabilities", () => {
    expect(
      cameraConverter.hasWebRtc({
        state: "idle",
        attributes: { frontend_stream_type: "webrtc" },
      } as any),
    ).toBe(true);
    expect(
      cameraConverter.hasWebRtc({
        state: "idle",
        attributes: { supported_features: 2 },
      } as any),
    ).toBe(true);
    expect(
      cameraConverter.hasWebRtc({ state: "idle", attributes: {} } as any),
    ).toBe(false);
  });
});

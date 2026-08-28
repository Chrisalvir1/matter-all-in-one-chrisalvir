/**
 * Converter utility for camera domain (Matter 1.6 / Live Streaming).
 */
import { HassState } from "../utils/ha-state.js";

export const cameraConverter = {
  /**
   * Determine stream options or active streaming states.
   */
  toStreamingState(state: HassState): boolean {
    const s = (state?.state || "").toLowerCase();
    return s === "recording" || s === "streaming" || s === "on";
  },

  /**
   * Determine whether the camera is active / powered on.
   */
  isCameraOn(state: HassState): boolean {
    const s = (state?.state || "").toLowerCase();
    return s !== "off" && s !== "unavailable" && s !== "unknown";
  },

  /**
   * Check if camera provides WebRTC capabilities.
   */
  hasWebRtc(state: HassState): boolean {
    return (
      state.attributes?.frontend_stream_type === "webrtc" ||
      (Number(state.attributes?.supported_features || 0) & 2) !== 0
    );
  },
};

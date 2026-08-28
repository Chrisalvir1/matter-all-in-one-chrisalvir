import type { HassState } from "../utils/ha-state.js";
import type { ResolvedStreamSource, StreamSourceType } from "./camera-types.js";

export class CameraSourceResolver {
  /**
   * Resolves the actual stream source and snapshot URL from Home Assistant.
   * Redacts sensitive tokens or passwords in log outputs.
   */
  public static async resolve(
    platform: any,
    entityId: string,
    state: HassState,
  ): Promise<ResolvedStreamSource> {
    const attrs = state?.attributes || {};

    // 1. Check direct attributes (e.g. RTSP url provided by camera integration)
    const directRtsp = attrs.stream_source || attrs.rtsp_url || attrs.stream_url;
    if (typeof directRtsp === "string" && directRtsp.startsWith("rtsp")) {
      platform?.log?.debug?.(`[CameraSourceResolver][${entityId}] Resolved direct RTSP stream source`);
      return {
        sourceType: "rtsp",
        url: directRtsp,
        snapshotUrl: `/api/camera_proxy/${entityId}`,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    // 2. Check for native WebRTC stream type in HA
    if (attrs.frontend_stream_type === "webrtc") {
      platform?.log?.debug?.(`[CameraSourceResolver][${entityId}] Resolved native WebRTC stream`);
      return {
        sourceType: "webrtc",
        url: typeof directRtsp === "string" ? directRtsp : undefined,
        snapshotUrl: `/api/camera_proxy/${entityId}`,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    // 3. Check for go2rtc / WebRTC component integrations
    if (typeof attrs.webrtc_url === "string") {
      return {
        sourceType: "webrtc",
        url: attrs.webrtc_url,
        snapshotUrl: `/api/camera_proxy/${entityId}`,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    // 4. Request dynamic stream URL via Home Assistant websocket / service if supported
    if (platform?.ha?.callService && (Number(attrs.supported_features || 0) & 2) !== 0) {
      try {
        // Home Assistant stream service request
        const result = await platform.ha.callService("camera", "play_stream", entityId, { format: "hls" });
        if (result && typeof result === "object" && typeof (result as any).url === "string") {
          const streamUrl = (result as any).url;
          return {
            sourceType: "hls",
            url: streamUrl,
            snapshotUrl: `/api/camera_proxy/${entityId}`,
            supportsPassthrough: true,
            requiresBridge: true,
          };
        }
      } catch (err) {
        platform?.log?.debug?.(`[CameraSourceResolver][${entityId}] Dynamic stream request returned: ${err}`);
      }
    }

    // 5. Default fallback to HA Camera Proxy stream
    return {
      sourceType: "ha_proxy",
      url: `/api/camera_proxy_stream/${entityId}`,
      snapshotUrl: `/api/camera_proxy/${entityId}`,
      supportsPassthrough: false,
      requiresBridge: true,
    };
  }

  /**
   * Safely sanitize URLs for logs without printing passwords or authentication tokens.
   */
  public static sanitizeUrl(url?: string): string {
    if (!url) return "";
    return url.replace(/(:[^:@/]+)@/g, ":***@").replace(/([?&][^=]+)=[^&]+/gi, "$1=***");
  }
}

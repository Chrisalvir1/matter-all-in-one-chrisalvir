import type { HassState } from "../utils/ha-state.js";
import type { ResolvedStreamSource } from "./camera-types.js";
import {
  sanitizeUrlCredentials,
  probeCameraSource,
} from "./homekit/ffmpeg-helper.js";

export class CameraSourceResolver {
  /**
   * Resolves the actual stream source and snapshot URL from Home Assistant in strict order:
   * 1. stream_source attribute
   * 2. Direct RTSP URL (rtsp_url, stream_url, rtsp_stream, rtsp_stream_url)
   * 3. WebRTC / go2rtc source
   * 4. HLS stream (camera/stream or play_stream) ONLY if supported_features has STREAM (bit 2)
   * 5. unknown (if no continuous stream exists, return unknown; never inject snapshot endpoints as streams)
   */
  public static async resolve(
    platform: any,
    entityId: string,
    state: HassState,
  ): Promise<ResolvedStreamSource> {
    const attrs = state?.attributes || {};
    const snapshotUrl = `/api/camera_proxy/${entityId}`;
    const supportedFeatures = Number(attrs.supported_features || 0);
    const hasStreamSupport = (supportedFeatures & 2) !== 0; // CameraEntityFeature.STREAM = 2

    // 1. Check state.attributes.stream_source
    const streamSourceAttr = attrs.stream_source;
    if (
      typeof streamSourceAttr === "string" &&
      streamSourceAttr.trim().length > 0
    ) {
      const sanitized = sanitizeUrlCredentials(streamSourceAttr);
      platform?.log?.debug?.(
        `[CameraSourceResolver][${entityId}] Resolved from stream_source: ${sanitized}`,
      );
      return {
        sourceType: streamSourceAttr.startsWith("rtsp") ? "rtsp" : "ha_proxy",
        url: streamSourceAttr,
        snapshotUrl,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    // 2. Direct RTSP URL (rtsp_url, stream_url, rtsp_stream, rtsp_stream_url)
    const directRtsp =
      attrs.rtsp_url ||
      attrs.stream_url ||
      attrs.rtsp_stream ||
      attrs.rtsp_stream_url;
    if (typeof directRtsp === "string" && directRtsp.startsWith("rtsp")) {
      const sanitized = sanitizeUrlCredentials(directRtsp);
      platform?.log?.debug?.(
        `[CameraSourceResolver][${entityId}] Resolved direct RTSP stream source: ${sanitized}`,
      );
      return {
        sourceType: "rtsp",
        url: directRtsp,
        snapshotUrl,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    // 3. WebRTC / go2rtc source
    if (
      typeof attrs.webrtc_url === "string" &&
      attrs.webrtc_url.trim().length > 0
    ) {
      const sanitized = sanitizeUrlCredentials(attrs.webrtc_url);
      platform?.log?.debug?.(
        `[CameraSourceResolver][${entityId}] Resolved go2rtc/webrtc_url: ${sanitized}`,
      );
      return {
        sourceType: "webrtc",
        url: attrs.webrtc_url,
        snapshotUrl,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    if (attrs.frontend_stream_type === "webrtc") {
      platform?.log?.debug?.(
        `[CameraSourceResolver][${entityId}] Camera frontend_stream_type is webrtc`,
      );
      return {
        sourceType: "webrtc",
        url: undefined,
        snapshotUrl,
        supportsPassthrough: true,
        requiresBridge: false,
      };
    }

    // 4. HA Native HLS stream via WebSocket (camera/stream) ONLY if supported_features has STREAM
    if (hasStreamSupport && platform?.ha?.requestCameraStream) {
      try {
        const streamUrl = await platform.ha.requestCameraStream(entityId);
        if (streamUrl && typeof streamUrl === "string") {
          const token =
            platform.ha.getAccessToken?.() || platform.ha.wsAccessToken;
          let isH264 = true;
          try {
            const probe = await probeCameraSource(streamUrl, {
              timeoutMs: 2500,
              httpBearerToken: token,
            });
            if (probe.valid && probe.videoCodec) {
              isH264 = probe.videoCodec === "h264";
            }
          } catch {}

          platform?.log?.debug?.(
            `[CameraSourceResolver][${entityId}] Resolved native HA HLS stream: ${sanitizeUrlCredentials(streamUrl)}`,
          );
          return {
            sourceType: "hls",
            url: streamUrl,
            snapshotUrl,
            supportsPassthrough: isH264,
            requiresBridge: true,
          };
        }
      } catch (err) {
        platform?.log?.debug?.(
          `[CameraSourceResolver][${entityId}] Native camera/stream request returned: ${err}`,
        );
      }
    }

    // 4b. HA camera.play_stream service fallback (ONLY if supported_features has STREAM)
    if (hasStreamSupport && platform?.ha?.callService) {
      try {
        const result = await platform.ha.callService(
          "camera",
          "play_stream",
          entityId,
          {
            format: "hls",
          },
        );
        if (
          result &&
          typeof result === "object" &&
          typeof (result as any).url === "string"
        ) {
          const hlsUrl = (result as any).url;
          const fullHlsUrl = hlsUrl.startsWith("http")
            ? hlsUrl
            : `${platform?.ha?.getHttpBaseUrl?.() || platform?.ha?.baseUrl || ""}${hlsUrl}`;

          return {
            sourceType: "hls",
            url: fullHlsUrl,
            snapshotUrl,
            supportsPassthrough: true,
            requiresBridge: true,
          };
        }
      } catch (err) {
        platform?.log?.debug?.(
          `[CameraSourceResolver][${entityId}] Dynamic play_stream service returned: ${err}`,
        );
      }
    }

    // 5. If camera does not support streaming, log clearly and return unknown
    if (!hasStreamSupport) {
      platform?.log?.debug?.(
        `[CameraSourceResolver][${entityId}] Camera does not have STREAM feature (supported_features=${supportedFeatures}). Live stream not exposed by Home Assistant.`,
      );
    }

    // 6. Fallback: unknown (never guess or inject snapshot endpoints as streams)
    return {
      sourceType: "unknown",
      url: undefined,
      snapshotUrl,
      supportsPassthrough: false,
      requiresBridge: false,
    };
  }

  /**
   * Safely sanitize URLs for logs without printing passwords or authentication tokens.
   */
  public static sanitizeUrl(url?: string): string {
    return sanitizeUrlCredentials(url || "");
  }
}

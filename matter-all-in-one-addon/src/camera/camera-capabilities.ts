import type { HassState } from "../utils/ha-state.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  StreamSourceType,
  VideoCodecType,
  AudioCodecType,
  StreamStrategy,
} from "./camera-types.js";
import {
  type ProbeResult,
  resolveFfmpegPath,
} from "./homekit/ffmpeg-helper.js";

/**
 * Detects real camera capabilities and determines the optimal streaming strategy.
 *
 * Rules:
 * - H.264 streams use passthrough / remux copy mode (no transcoding).
 * - Compatible audio (AAC-LC, AAC-ELD, Opus, PCM) is forwarded; incompatible audio is omitted (video-only).
 * - H.265 or MJPEG streams are flagged as requiring transcoding.
 * - Unknown or invalid stream sources are marked as unsupported.
 */
export function detectCameraCapabilities(
  state: HassState,
  resolvedSource?: ResolvedStreamSource,
  probeResult?: ProbeResult,
): CameraCapabilitiesInfo {
  const attrs = state.attributes || {};
  const isAvailable =
    state.state !== "unavailable" && state.state !== "unknown";

  // Determine Source Protocol
  let streamSourceType: StreamSourceType = "unknown";
  if (resolvedSource?.sourceType) {
    streamSourceType = resolvedSource.sourceType;
  } else if (attrs.frontend_stream_type === "webrtc") {
    streamSourceType = "webrtc";
  } else if (attrs.frontend_stream_type === "hls") {
    streamSourceType = "hls";
  } else if (
    typeof attrs.stream_source === "string" &&
    attrs.stream_source.startsWith("rtsp")
  ) {
    streamSourceType = "rtsp";
  }

  // Detect Video Codec (prefer probe result if valid)
  let videoCodec: VideoCodecType = "h264";
  if (probeResult?.videoCodec) {
    const pCode = probeResult.videoCodec.toLowerCase();
    if (pCode.includes("265") || pCode.includes("hevc")) {
      videoCodec = "h265";
    } else if (pCode.includes("mjpeg") || pCode.includes("jpeg")) {
      videoCodec = "mjpeg";
    } else if (pCode.includes("264") || pCode.includes("avc")) {
      videoCodec = "h264";
    }
  } else {
    const rawVideoCodec = (attrs.video_codec || "").toLowerCase();
    if (rawVideoCodec.includes("265") || rawVideoCodec.includes("hevc")) {
      videoCodec = "h265";
    } else if (
      rawVideoCodec.includes("mjpeg") ||
      rawVideoCodec.includes("jpeg")
    ) {
      videoCodec = "mjpeg";
    } else if (rawVideoCodec.includes("264") || rawVideoCodec.includes("avc")) {
      videoCodec = "h264";
    }
  }

  // Detect Audio Codec
  let audioCodec: AudioCodecType = "none";
  let hasAudio = false;

  if (probeResult) {
    hasAudio = probeResult.hasAudio;
    if (probeResult.audioCodec) {
      const pAudio = probeResult.audioCodec.toLowerCase();
      if (pAudio.includes("aac") || pAudio.includes("mp4a")) {
        audioCodec = "aac_lc";
      } else if (pAudio.includes("opus")) {
        audioCodec = "opus";
      } else if (
        pAudio.includes("pcm") ||
        pAudio.includes("alaw") ||
        pAudio.includes("ulaw") ||
        pAudio.includes("g711") ||
        pAudio.includes("g722") ||
        pAudio.includes("adpcm")
      ) {
        audioCodec = "pcm";
      } else {
        // FFmpeg resamples and transcodes any camera audio codec to AAC-ELD
        audioCodec = "aac_lc";
      }
    } else if (hasAudio) {
      audioCodec = "aac_lc";
    }
  } else {
    const rawAudioCodec = (attrs.audio_codec || "").toLowerCase();
    // For RTSP cameras without an explicit audio_codec attribute, assume audio is present
    // (AAC-LC is the safest default). FFmpeg will use `-map 0:a:0?` which silently
    // skips the audio track if the stream truly has none. This prevents silent-audio
    // forced mode on cameras that actually do have audio but don't advertise it in HA.
    const isDirectRtsp =
      streamSourceType === "rtsp" ||
      (resolvedSource?.sourceType === "rtsp" &&
        !resolvedSource?.url?.includes("/api/camera_proxy"));
    hasAudio =
      attrs.has_audio !== false &&
      rawAudioCodec !== "none" &&
      (isDirectRtsp || rawAudioCodec !== "");
    if (hasAudio) {
      if (rawAudioCodec.includes("aac") || rawAudioCodec.includes("mp4a")) {
        audioCodec = "aac_lc";
      } else if (rawAudioCodec.includes("opus")) {
        audioCodec = "opus";
      } else if (
        rawAudioCodec.includes("pcm") ||
        rawAudioCodec.includes("alaw") ||
        rawAudioCodec.includes("ulaw") ||
        rawAudioCodec.includes("g711") ||
        rawAudioCodec.includes("g722") ||
        rawAudioCodec.includes("adpcm")
      ) {
        audioCodec = "pcm";
      } else if (rawAudioCodec && !isDirectRtsp) {
        // Non-RTSP cameras with unknown codec: skip audio
        audioCodec = "incompatible";
        hasAudio = false;
      } else {
        // Empty audio_codec on RTSP → assume AAC (transcoded to AAC-ELD by delegate)
        audioCodec = "aac_lc";
      }
    }
    // Direct RTSP cameras: always treat as having audio unless explicitly disabled.
    // FFmpeg -map 0:a:0? handles streams with no audio track gracefully.
    if (isDirectRtsp && !hasAudio && attrs.has_audio !== false && rawAudioCodec !== "none") {
      hasAudio = true;
      audioCodec = "aac_lc";
    }
  }

  // Determine Dimensions & FPS
  const width =
    probeResult?.width || Number(attrs.video_width || attrs.width || 1920);
  const height =
    probeResult?.height || Number(attrs.video_height || attrs.height || 1080);
  const maxFps =
    probeResult?.fps || Number(attrs.fps || attrs.frame_rate || 30);

  // Strategy Determination
  let strategy: StreamStrategy = "unsupported";
  let requiresTranscoding = false;
  let transcodingReason: string | undefined;

  // WebRTC cameras (e.g. Google Nest) without a concrete stream URL are unsupported
  // until go2rtc or another bridge provides an RTSP endpoint.
  const isWebRtcWithoutUrl =
    resolvedSource?.sourceType === "webrtc" && !resolvedSource?.url;

  const hasStreamSource = isWebRtcWithoutUrl
    ? false
    : resolvedSource
      ? Boolean(resolvedSource.url) || resolvedSource.sourceType === "webrtc"
      : streamSourceType !== "unknown" || state.state === "streaming";
  const hasLiveStream = hasStreamSource && isAvailable;

  if (!hasLiveStream) {
    strategy = "unsupported";
    transcodingReason = isWebRtcWithoutUrl
      ? "Google Nest / WebRTC no disponible: configura go2rtc en HA para obtener un stream RTSP local (rtsp://127.0.0.1:8554/nombre_camara)."
      : "Live View no disponible: Home Assistant no expone una fuente reproducible.";
    // camera_proxy_stream is an HTTP multipart/JPEG representation generated by
    // Home Assistant.  Camera attributes may say H.264, but copying that proxy
    // response as H.264 produces an invalid RTP stream for Apple Home.
  } else if (
    videoCodec === "h264" &&
    resolvedSource?.sourceType !== "ha_proxy" &&
    !resolvedSource?.url?.includes("/api/camera_proxy")
  ) {
    // Always use passthrough_h264 for H.264 streams regardless of whether audio was
    // detected. The delegate uses -map 0:a:0? which skips gracefully if no audio track
    // exists. This eliminates the silent-audio forced mode for RTSP cameras.
    strategy = "passthrough_h264";
  } else {
    strategy = "transcode_required";
    requiresTranscoding = true;
    transcodingReason = `Video codec is ${videoCodec} and requires ultra-low-latency H.264 transcoding. Audio will be re-encoded to AAC-ELD.`;
  }

  return {
    hasLiveStream,
    streamSourceType,
    videoCodec,
    audioCodec,
    hasAudio,
    resolution: { width, height },
    maxFps,
    strategy,
    requiresTranscoding,
    transcodingReason,
    snapshotSupported: true,
    hksvCapable: hasLiveStream && Boolean(resolveFfmpegPath()),
    snapshotUrl:
      resolvedSource?.snapshotUrl || `/api/camera_proxy/${state.entity_id}`,
  };
}

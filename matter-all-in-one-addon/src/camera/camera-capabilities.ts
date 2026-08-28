import type { HassState } from "../utils/ha-state.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  StreamSourceType,
  VideoCodecType,
  AudioCodecType,
  StreamStrategy,
} from "./camera-types.js";

/**
 * Detects real camera capabilities and determines the optimal streaming strategy.
 *
 * Rules:
 * - H.264 streams use passthrough / copy mode (no transcoding).
 * - Compatible audio (AAC-LC, AAC-ELD, Opus, PCM) is forwarded; incompatible audio is omitted (video-only).
 * - H.265 or MJPEG streams are flagged as requiring transcoding.
 * - Does NOT claim or advertise features that are not physically present.
 */
export function detectCameraCapabilities(
  state: HassState,
  resolvedSource?: ResolvedStreamSource,
): CameraCapabilitiesInfo {
  const attrs = state.attributes || {};
  const supportedFeatures = Number(attrs.supported_features || 0);
  const frontendStreamType = attrs.frontend_stream_type as string | undefined;

  // Feature bit 2 indicates STREAM support in Home Assistant Camera domain
  const hasStreamFeature = (supportedFeatures & 2) !== 0 || Boolean(frontendStreamType) || Boolean(attrs.stream_source);
  const isAvailable = state.state !== "unavailable" && state.state !== "unknown";

  // Determine Source Protocol
  let streamSourceType: StreamSourceType = "unknown";
  if (resolvedSource?.sourceType) {
    streamSourceType = resolvedSource.sourceType;
  } else if (frontendStreamType === "webrtc") {
    streamSourceType = "webrtc";
  } else if (frontendStreamType === "hls") {
    streamSourceType = "hls";
  } else if (typeof attrs.stream_source === "string" && attrs.stream_source.startsWith("rtsp")) {
    streamSourceType = "rtsp";
  } else if (hasStreamFeature) {
    streamSourceType = "ha_proxy";
  }

  // Detect Video Codec
  const rawVideoCodec = (attrs.video_codec || "").toLowerCase();
  let videoCodec: VideoCodecType = "h264"; // Default assumption for standard RTSP / WebRTC camera streams
  if (rawVideoCodec.includes("265") || rawVideoCodec.includes("hevc")) {
    videoCodec = "h265";
  } else if (rawVideoCodec.includes("mjpeg") || rawVideoCodec.includes("jpeg")) {
    videoCodec = "mjpeg";
  } else if (rawVideoCodec.includes("264") || rawVideoCodec.includes("avc")) {
    videoCodec = "h264";
  }

  // Detect Audio Codec
  const rawAudioCodec = (attrs.audio_codec || "").toLowerCase();
  const hasAudio = Boolean(attrs.has_audio ?? (rawAudioCodec && rawAudioCodec !== "none"));
  let audioCodec: AudioCodecType = "none";
  if (hasAudio) {
    if (rawAudioCodec.includes("aac") || rawAudioCodec.includes("mp4a")) {
      audioCodec = "aac_lc";
    } else if (rawAudioCodec.includes("opus")) {
      audioCodec = "opus";
    } else if (rawAudioCodec.includes("pcm") || rawAudioCodec.includes("alaw") || rawAudioCodec.includes("ulaw")) {
      audioCodec = "pcm";
    } else if (rawAudioCodec) {
      audioCodec = "incompatible";
    } else {
      audioCodec = "aac_lc"; // standard stream default if audio is present
    }
  }

  // Determine Dimensions & FPS
  const width = Number(attrs.video_width || attrs.width || 1920);
  const height = Number(attrs.video_height || attrs.height || 1080);
  const maxFps = Number(attrs.fps || attrs.frame_rate || 30);

  // Strategy Determination
  let strategy: StreamStrategy = "unsupported";
  let requiresTranscoding = false;
  let transcodingReason: string | undefined;

  const hasLiveStream = hasStreamFeature && isAvailable;

  if (!hasLiveStream) {
    strategy = "unsupported";
    transcodingReason = "No stream source available or entity is unavailable.";
  } else if (videoCodec === "h264") {
    if (hasAudio && audioCodec !== "incompatible" && audioCodec !== "none") {
      strategy = "passthrough_h264";
    } else {
      strategy = "passthrough_video_only";
    }
  } else {
    strategy = "transcode_required";
    requiresTranscoding = true;
    transcodingReason = "Video codec is " + videoCodec + " and requires transcoding.";
  }

  // Snapshot URL
  const entityId = state.entity_id;
  const snapshotUrl = "/api/camera_proxy/" + entityId;

  return {
    hasLiveStream,
    streamSourceType,
    videoCodec,
    hasAudio: hasAudio && audioCodec !== "none" && audioCodec !== "incompatible",
    audioCodec,
    resolution: { width, height },
    maxFps,
    strategy,
    requiresTranscoding,
    transcodingReason,
    snapshotUrl,
    frontendStreamType,
    supportedFeatures,
  };
}

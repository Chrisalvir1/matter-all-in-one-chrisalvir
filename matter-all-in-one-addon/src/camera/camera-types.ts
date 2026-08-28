/**
 * Unified camera definitions and interfaces for Dual-Track Camera Support.
 *
 * TRACK A (HomeKit/HAP): Primary for Apple Home live view, snapshots, and audio.
 * TRACK B (Matter 1.5/1.6): Experimental backend for Matter camera clusters (0x0551/0x0553).
 */

export type StreamSourceType =
  "webrtc" | "rtsp" | "hls" | "mjpeg" | "ha_proxy" | "unknown";

export type VideoCodecType = "h264" | "h265" | "mjpeg" | "unknown";

export type AudioCodecType =
  "aac_eld" | "opus" | "aac_lc" | "pcm" | "incompatible" | "none";

export type StreamStrategy =
  | "passthrough_h264"
  | "passthrough_video_only"
  | "transcode_required"
  | "unsupported";

export interface CameraCapabilitiesInfo {
  /** True if a live stream source is available and active in Home Assistant. */
  hasLiveStream: boolean;
  /** Resolved source protocol / stream type. */
  streamSourceType: StreamSourceType;
  /** Detected video codec. */
  videoCodec: VideoCodecType;
  /** True if audio is available and compatible with HomeKit / Matter. */
  hasAudio: boolean;
  /** Detected audio codec. */
  audioCodec: AudioCodecType;
  /** Target resolution width and height. */
  resolution: { width: number; height: number };
  /** Maximum frame rate (FPS). */
  maxFps: number;
  /** Selected stream execution strategy. */
  strategy: StreamStrategy;
  /** True if the stream cannot be forwarded with passthrough and requires ffmpeg transcoding. */
  requiresTranscoding: boolean;
  /** Explanation if transcoding or special handling is required. */
  transcodingReason?: string;
  /** Resolved snapshot image endpoint URL (JPEG). */
  snapshotUrl?: string;
  /** True if snapshot image fetching is supported. */
  snapshotSupported?: boolean;
  /** True if camera and system satisfy all technical requirements for HKSV. */
  hksvCapable?: boolean;
  /** Original Home Assistant frontend_stream_type attribute. */
  frontendStreamType?: string;
  /** Raw supported_features bitmask from Home Assistant. */
  supportedFeatures?: number;
}

export interface ResolvedStreamSource {
  sourceType: StreamSourceType;
  url?: string;
  snapshotUrl?: string;
  supportsPassthrough: boolean;
  requiresBridge: boolean;
  metadata?: Record<string, any>;
}

export interface HomeKitCameraStorageRecord {
  entityId: string;
  uuid: string;
  username: string;
  pincode: string;
  setupId: string;
  port: number;
  published: boolean;
  strategy: StreamStrategy;
  state: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  /** Explicit motion sensor for cameras whose HA entities are not co-registered. */
  motionEntityId?: string;
  isPaired?: boolean;
  hksvCapable?: boolean;
  hksvEnabled?: boolean;
  hksvVerified?: boolean;
  hksvState?:
    | "not_capable"
    | "configurable"
    | "waiting_hub"
    | "ready"
    | "verified"
    | "error";
  lastUpdated?: string;
}

export type CameraActivationPhase =
  | "discovery"
  | "profile"
  | "endpoint"
  | "registration"
  | "server-start"
  | "commissioning"
  | "stream";

export interface CameraActivationResult {
  entityId: string;
  published: boolean;
  phase: CameraActivationPhase;
  homekit?: {
    published: boolean;
    port: number;
    pincode: string;
    setupUri: string;
    qrCodeText: string;
    username: string;
    strategy: StreamStrategy;
  };
  matter?: {
    published: boolean;
    nodeId?: string;
    pairingCode?: string;
    manualPairingCode?: string;
    qrCode?: string;
    experimental: boolean;
  };
  capabilities: CameraCapabilitiesInfo;
  warnings: string[];
  error?: string;
}

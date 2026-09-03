/**
 * Scrypted Camera Integration Types & Data Contracts
 * Schema version: 2
 */

export type ScryptedConnectionStatus =
  | "not_configured"
  | "connected"
  | "disconnected_using_cache"
  | "error"
  | "reconnecting";

export type ScryptedErrorCode =
  | "invalid_url"
  | "network_error"
  | "tls_error"
  | "authentication_failed"
  | "unsupported_api"
  | "permission_denied"
  | "no_cameras_found"
  | "timeout"
  | "server_error"
  | "invalid_json"
  | "incomplete_response"
  | "unknown";

export interface EncryptedSecret {
  iv: string; // Base64 (12 bytes)
  authTag: string; // Base64 (16 bytes)
  ciphertext: string; // Base64
  purpose: string;
  version: number;
}

export interface ScryptedCredentials {
  username?: string;
  passwordEncrypted?: EncryptedSecret;
  apiTokenEncrypted?: EncryptedSecret;
  authenticationMode: "username_password" | "api_token" | "auto";
}

export type StreamValidationStatus =
  | "not_checked"
  | "port_reachable"
  | "verified"
  | "not_found"
  | "unauthorized"
  | "timeout"
  | "unsupported"
  | "invalid"
  | "source_offline";

export interface StreamReference {
  protocol: "rtsp" | "webrtc" | "snapshot";
  host?: string;
  port?: number;
  path?: string;
  directUrl?: string;
  verifiedAt?: string;
  validationStatus?: StreamValidationStatus;
  validationError?: string;
}

export interface ScryptedStreamProfile {
  id: string;
  name: string;
  purpose?: "hd" | "remote" | "local" | "low_resolution" | "stream" | string;
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: { width: number; height: number };
  fps?: number;
  bitrateKbps?: number;
  hasAudio?: boolean;
  directUrl?: string;
  discoveredAt: string;
  validationStatus: StreamValidationStatus;
  validationError?: string;
  lastValidatedAt?: string;
  gopSeconds?: number;
  needsDumpExtra?: boolean;
}

export interface StreamCapabilities {
  videoCodec: "h264" | "h265" | "unknown";
  profile?: "baseline" | "main" | "high" | "unknown";
  level?: number;
  resolution: { width: number; height: number };
  fps?: number;
  pixelFormat?: string;
  keyframeIntervalSeconds?: number;
  gopSeconds?: number;
  needsDumpExtra?: boolean;
  hasAudio: boolean;
  audioCodec?: "aac" | "opus" | "pcma" | "pcmu" | "none" | "unknown";
  audioSampleRate?: number;
  audioChannels?: number;
}

export interface CameraSensorRecord {
  sensorId: string;
  type:
    | "motion"
    | "doorbell"
    | "light"
    | "siren"
    | "ptz"
    | "person"
    | "package"
    | "vehicle"
    | "occupancy";
  name: string;
  enabled: boolean;
  state?: boolean;
  lastEventAt?: string;
}

export type HomeKitCameraMode = "h264_legacy" | "hevc_preview" | "auto";
export type RtspTransportPreference = "auto" | "tcp" | "udp";

export type MetricConfidence = "high" | "medium" | "low";
export type MetricSource =
  | "rtsp_probe"
  | "ffprobe"
  | "ffmpeg"
  | "scrypted_sdk"
  | "host_sample"
  | "unavailable";

export interface MetricValue<T> {
  value: T;
  source: MetricSource;
  confidence: MetricConfidence;
  measuredAt: string;
}

export interface StreamLatencyMetrics {
  validatedAt: string;
  sourceType: "local_rtsp" | "scrypted_rebroadcast" | "cloud";
  timeToDescribeMs?: MetricValue<number>;
  timeToFirstPacketMs?: MetricValue<number>;
  timeToFirstKeyframeMs?: MetricValue<number>;
  timeToFirstFrameMs?: MetricValue<number>;
  observedGopSeconds?: MetricValue<number>;
  observedFps?: MetricValue<number>;
  observedBitrateKbps?: MetricValue<number>;
  selectedTransport: MetricValue<"tcp" | "udp">;
  packetLossEstimate?: MetricValue<number>;
  ffmpegRestartCount: number;
  hostCpuPercent?: MetricValue<number>;
  hostMemoryMb?: MetricValue<number>;
  cameraToScryptedMs?: MetricValue<number>;
  scryptedToAddonMs?: MetricValue<number>;
  addonToHomeKitMs?: MetricValue<number>;
  controllerFirstFrameMs?: MetricValue<number>;
  error?: string;
  failureCause?:
    | "missing_stream_url"
    | "unauthorized"
    | "not_found"
    | "timeout"
    | "source_offline"
    | "ffprobe_missing"
    | "invalid_stream";
}

export interface HevcStreamTierInfo {
  tier: "highest" | "high" | "medium" | "low";
  profileId: string;
  width: number;
  height: number;
  fps: number;
  bitrateAverageKbps?: number;
  bitrateMaxKbps?: number;
  directUrl?: string;
  verified: boolean;
}

export interface HevcTierAvailability {
  high?: HevcStreamTierInfo;
  medium?: HevcStreamTierInfo;
  low?: HevcStreamTierInfo;
  highest?: HevcStreamTierInfo;
  concurrentVerified: boolean;
  concurrencyTestedAt?: string;
}

export interface HevcAudioSpec {
  opusTierCount: number;
  captureSampleRate: 16000 | 24000;
  transmissionSampleRate: 48000;
  channels: 1;
  packetTimeMs: 20;
  codec: "opus";
  requiresLocalAdaptation: boolean;
}

export interface HevcEligibilityCheck {
  id: string;
  name: string;
  category: "source" | "bridge" | "interop";
  passed: boolean;
  details: string;
}

export interface HevcEligibilityResult {
  eligible: boolean;
  reason?: string;
  evaluatedAt: string;
  tierAvailability?: HevcTierAvailability;
  audioSpec?: HevcAudioSpec;
  checks: HevcEligibilityCheck[];
}

export interface HomeKitExportConfig {
  mode: HomeKitCameraMode;
  fallbackToH264: boolean;
  rtspTransportPreference?: RtspTransportPreference;
  selectedH264ProfileId?: string;
  selectedHevcProfileId?: string;
  hevcEligibility?: HevcEligibilityResult;
  enableLocalAudioAdaptation?: boolean;
}

export interface HomeKitAccessoryIdentity {
  hapUsername: string;
  accessoryUuid: string;
  displayName: string;
  storagePath?: string;
}

export interface MatterFabricSummary {
  fabricIndex: number;
  fabricId: string;
  nodeId: string;
  label?: string;
  ecosystemHint?:
    | "apple_home"
    | "google_home"
    | "amazon_alexa"
    | "samsung_smartthings"
    | "other";
}

export interface CameraBindingState {
  matterCommissioned: boolean;
  matterState: "commissioned" | "pending" | "unknown";
  fabricCount: number;
  fabrics: MatterFabricSummary[];
  fabricsCheckedAt?: string;
  multiAdminState: "available" | "in_use" | "full" | "unavailable";
  homeKitPairingState: "paired" | "not_paired" | "unverifiable";
  homeName?: string;
}

export interface CameraExportConfig {
  matterEnabled: boolean;
  homeKitEnabled: boolean;
  hksvEnabledByDefault: boolean;
  googleHomeEnabled: boolean;
  alexaEnabled: boolean;
  smartThingsEnabled: boolean;
  nasEnabled: boolean;
  rtspTransportPreference?: RtspTransportPreference;
  homeKitExportConfig?: HomeKitExportConfig;
}

export interface CameraNasConfig {
  enabled: boolean;
  protocol?: "smb" | "nfs";
  endpoint?: string;
  credentialsEncrypted?: EncryptedSecret;
  path?: string;
  retentionDays?: number;
  maxSpaceGb?: number;
  format?: "fmp4" | "mp4";
}

export interface CameraLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  category: "rtsp" | "homekit" | "matter" | "hksv" | "sensor" | "general";
  message: string;
  details?: Record<string, any> | string;
}

/**
 * Manual identity override — editable per camera by the user within Matter All-in-One.
 * Never modifies Scrypted configuration.
 */
export interface CameraIdentityOverride {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  manufacturerSource: "scrypted" | "manual" | "unknown";
  modelSource: "scrypted" | "manual" | "unknown";
  serialNumberSource?: "scrypted" | "manual" | "unknown";
  updatedAt?: string;
}

export interface CameraRecord {
  cameraId: string; // Scrypted unique ID
  sourceId: string;
  deviceId: string;
  name: string;
  enabled: boolean;

  /** Raw manufacturer as reported by Scrypted. Updated on sync. Never overrides identityOverride. */
  sourceManufacturer?: string;
  /** Raw model as reported by Scrypted. Updated on sync. Never overrides identityOverride. */
  sourceModel?: string;

  /** Manual override for brand/model. Preserved across syncs, restarts, reconnections. */
  identityOverride?: CameraIdentityOverride;

  /** Resolved display manufacturer: override → source → 'Marca no identificada' */
  displayManufacturer: string;
  /** Resolved display model: override → source → 'Modelo no identificado' */
  displayModel?: string;
  /** Resolved display serial number: override → source → 'Serial no disponible' */
  displaySerialNumber?: string;

  /** @deprecated Use sourceModel / displayModel. Kept for backwards compat. */
  model?: string;

  /** Real serial number reported by Scrypted / device */
  serialNumber?: string;

  identity: {
    matterNodeId?: number;
    matterEndpointId?: number;
    matterPairingCode?: string;
    homeKitAccessoryId?: string;
    homeKitPairingState?: "not_paired" | "paired" | "unpaired";
    homeKitSetupUri?: string;
    homeKitPincode?: string;
    homeKitSetupId?: string;
    homeKitPort?: number;
    homeKitPairedHome?: string;
  };

  /** Consolidated binding and administration state (Matter fabrics, multi-admin, HAP) */
  bindingState?: CameraBindingState;

  source: {
    kind: "scrypted";
    serverId: string;
    deviceId: string;
    streamReference?: StreamReference;
    snapshotReference?: StreamReference;
    profiles?: ScryptedStreamProfile[];
    selectedProfileId?: string;
    streamValidationStatus?: StreamValidationStatus;
    streamValidationError?: string;
    streamValidatedAt?: string;
  };

  capabilities: {
    observed?: StreamCapabilities;
    lastVerified?: string;
    lastFetched?: string;
    fingerprint?: string;
    configurationFingerprint?: string;
    qualityMode?:
      "maximum_compatible" | "manual_profile" | "optimized_compatible";
    allowAutomaticFallback?: boolean;
    latencyMetrics?: StreamLatencyMetrics;
  };

  sensors: CameraSensorRecord[];

  sensorClusters?: {
    motion?: { endpointId: number; clusterId: 0x040d; enabled: boolean };
    doorbell?: { endpointId: number; clusterId: 0x0552; enabled: boolean };
    occupancy?: { endpointId: number; clusterId: 0x040d; enabled: boolean };
    light?: { endpointId: number; clusterId: 0x0101; enabled: boolean };
    package?: { endpointId: number; clusterId: number; enabled: boolean };
  };

  exportConfig: CameraExportConfig;

  status: {
    connection: "online" | "offline" | "unknown";
    cache: "fresh" | "stale" | "unverified" | "source_missing";
    lastFetched?: string;
    lastVerified?: string;
    lastSourceChangeDetected?: string;
    sourceUpdatedAt?: string;
    lastError?: string;
    lastErrorAt?: string;
    errorCode?: ScryptedErrorCode;
    logs?: CameraLogEntry[];
  };
}

export interface ScryptedPersistentStore {
  schemaVersion: number; // Current: 2

  installation: {
    installationId: string;
    createdAt: string;
    encryptionKeyRef: string;
  };

  scrypted: {
    serverId: string;
    serverUrl: string;
    credentials: ScryptedCredentials;
    allowSelfSignedCertificate: boolean;
    lastConnected?: string;
    connectionStatus: ScryptedConnectionStatus;
    autoReconnect: boolean;
    pollIntervalMinutes: number;
    /** @deprecated Schema v1. Migrated to credentials.apiTokenEncrypted. Kept only for migration. */
    tokenEncrypted?: EncryptedSecret;
  };

  cameras: {
    lastFetched?: string;
    cameras: CameraRecord[];
  };

  nas?: Record<string, CameraNasConfig>;
}

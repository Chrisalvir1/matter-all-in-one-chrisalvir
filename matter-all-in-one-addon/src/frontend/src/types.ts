export interface EntityRecord {
  entityId: string;
  name: string;
  domain: string;
  device_id?: string;
  device_name?: string;
  area_name?: string;
  area?: string;
  manufacturer?: string;
  model?: string;
  exported?: boolean;
  commissioned?: boolean;
  pairingCode?: string;
  manualPairingCode?: string;
  qrCode?: string;
  isBridge?: boolean;
  hasIssue?: boolean;
  origin?: string;
  auxiliary?: boolean;
  compositeDeviceId?: string;
  compositePrimaryEntityId?: string;
  logs?: Array<{ timestamp: string; level: string; message: string }>;
  /** HAP generic accessory info (null if not exported as HAP generic) */
  hapAccessory?: HapAccessoryInfo | null;
  [key: string]: any;
}

/** HAP profile identifier — matches HapProfile in hap-generic-accessory.ts */
export type HapProfile =
  | "humidifier" | "dehumidifier" | "air_purifier"
  | "television" | "television_speaker"
  | "valve_irrigation" | "valve_faucet" | "valve_shower"
  | "security_system" | "garage_door" | "doorbell"
  | "fan_hap" | "heater_cooler" | "thermostat_hap"
  | "outlet_hap" | "switch_hap" | "lightbulb_hap" | "lock_hap"
  | "window_covering_hap" | "door_hap" | "window_hap"
  | "motion_sensor_hap" | "contact_sensor_hap" | "smoke_sensor_hap"
  | "carbon_monoxide_sensor_hap" | "carbon_dioxide_sensor_hap"
  | "leak_sensor_hap" | "occupancy_sensor_hap" | "temperature_sensor_hap"
  | "humidity_sensor_hap" | "light_sensor_hap" | "air_quality_sensor_hap"
  | "battery_hap" | "speaker_hap" | "irrigation_system";

export interface HapAccessoryInfo {
  published: boolean;
  isPaired: boolean;
  hapProfile: HapProfile;
  profileLabel: string;
  pincode: string;
  port: number;
  username?: string;
  setupId?: string;
  setupUri?: string;
  pairingState?: string;
}

export interface HapProfileOption {
  id: HapProfile;
  label: string;
}


export interface DeviceRecord {
  id: string;
  name: string;
  area?: string;
  manufacturer?: string;
  model?: string;
  entities: EntityRecord[];
}

export interface CameraSensorRecord {
  sensorId: string;
  name: string;
  type:
    | "motion"
    | "doorbell"
    | "person"
    | "package"
    | "vehicle"
    | "animal"
    | "light"
    | "siren"
    | "ptz"
    | "other";
  scryptedInterface?: string;
  enabled: boolean;
  state?: boolean | string | number;
}

export interface LatencyMetric {
  value: number;
  unit: "ms" | "s";
  thresholdMs?: number;
  acceptable?: boolean;
}

export interface StreamLatencyMetrics {
  timeToDescribeMs?: LatencyMetric;
  timeToFirstFrameMs?: LatencyMetric;
  observedGopSeconds?: { value: number; unit: "s"; optimal?: boolean };
  selectedTransport?: { value: "tcp" | "udp" };
  recommendedTransport?: "tcp" | "udp";
  probeSuccess?: boolean;
  measuredAt?: string;
  error?: string;
}

export interface LiveViewVideoMetadata {
  codec?: string;
  profile?: string;
  level?: string;
  width?: number;
  height?: number;
  rFrameRate?: string;
  avgFrameRate?: string;
  fps?: number;
  bitrateKbps?: number;
  pixFmt?: string;
  metadataSource?: string;
}

export interface LiveViewTelemetry {
  active: LiveViewSessionTelemetry[];
  recent: LiveViewSessionTelemetry[];
}

export interface LiveViewSessionTelemetry {
  sessionId: string;
  videoSsrc?: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  state: "active" | "finished" | "failed";
  requestedVideo: LiveViewVideoMetadata & { maxBitrateKbps?: number };
  requestedAudio?: {
    codec?: string;
    sampleRate?: number;
    maxBitrateKbps?: number;
  };
  effectiveMode: "copy" | "normalization" | "transcode" | "fallback";
  output?: LiveViewVideoMetadata;
  fallbackReason?: string;
  error?: string;
}

export interface LiveViewCapabilities {
  codec: string;
  profiles: string[];
  levels: string[];
  resolutions: Array<[number, number, number]>;
}

export interface CameraRecord {
  cameraId: string;
  name: string;
  model?: string;
  displayModel?: string;
  manufacturer?: string;
  displayManufacturer?: string;
  serialNumber?: string;
  displaySerialNumber?: string;
  sourceManufacturer?: string;
  sourceModel?: string;
  identityOverride?: {
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
  };
  fps?: number;
  resolution?: { width: number; height: number };
  status?: {
    connection?: "online" | "offline";
    isOnline?: boolean;
    cache?: "fresh" | "stale" | "expired";
    lastError?: string;
    logs?: Array<{
      timestamp: string;
      level: string;
      message: string;
      details?: any;
    }>;
  };
  sensors?: CameraSensorRecord[];
  realEntities?: CameraRealEntity[];
  capabilities?: {
    observed?: {
      videoCodec?: string;
      audioCodec?: string;
      profile?: string;
      resolution?: { width: number; height: number };
      fps?: number;
      gopSeconds?: number;
      hasAudio?: boolean;
      streamSourceType?: string;
      strategy?: string;
    };
    latencyMetrics?: StreamLatencyMetrics;
  };
  identity?: {
    homeKitSetupId?: string;
    homeKitPincode?: string;
    homeKitSetupUri?: string;
    homeKitPort?: number;
    homeKitPairingState?: "paired" | "not_paired";
    homeKitPairedHome?: string;
    matterPairingCode?: string;
  };
  source?: {
    deviceId?: string;
    streamValidationStatus?: string;
    streamReference?: {
      protocol?: string;
      directUrl?: string;
    };
    profiles?: Array<{
      id: string;
      name: string;
      directUrl?: string;
    }>;
  };
  exportConfig?: {
    matterEnabled?: boolean;
    homeKitEnabled?: boolean;
    hksvEnabledByDefault?: boolean;
    exportMode?: "auto" | "passthrough_h264" | "passthrough_hevc" | "disabled";
    googleHomeEnabled?: boolean;
    alexaEnabled?: boolean;
    smartThingsEnabled?: boolean;
    nasEnabled?: boolean;
    rtspTransportPreference?: "tcp" | "udp";
  };
  bindingState?: {
    homeName?: string;
    matterCommissioned?: boolean;
    fabrics?: Array<{ label?: string; fabricIndex?: number }>;
  };
  liveViewCapabilities?: LiveViewCapabilities;
  liveViewTelemetry?: LiveViewTelemetry;
  hksvConfiguration?: {
    resolution: [number, number, number];
    fragmentLength: number;
    prebufferLength: number;
    audioSamplerate: number;
  };
  recordingCapabilities?: Array<[number, number, number]>;
}

export interface StatusResponse {
  haStatus: "conectado" | "desconectado" | "error";
  haUrl?: string;
  version?: string;
  bridgeName?: string;
  bridgeId?: string;
  homeName?: string;
  fabricLabel?: string;
  pairingCode?: string;
  manualPairingCode?: string;
  qrCode?: string;
  exportedNodes?: number;
  commissionedNodes?: number;
  fabrics?: Array<{ label?: string; fabricIndex?: number }>;
}

export interface ScryptedConfigResponse {
  configured: boolean;
  serverUrl?: string;
  username?: string;
  allowSelfSignedCertificate?: boolean;
  connectionStatus?: "connected" | "disconnected" | "error";
  lastError?: string;
  cameraCount?: number;
}

export interface CameraUiConfigResponse {
  enabled: boolean;
  serverUrl?: string;
  username?: string;
  hasPassword?: boolean;
  rtspUsername?: string;
  hasRtspPassword?: boolean;
  mqttEnabled?: boolean;
  mqttTopicPrefix?: string;
  allowSelfSignedCertificate?: boolean;
  pollIntervalSeconds?: number;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  connectionStatus?: "connected" | "disconnected" | "error";
}

export interface CameraRealEntity {
  id: string;
  domain: "binary_sensor" | "light" | "siren" | "switch" | "event";
  type: "motion" | "light" | "siren" | "doorbell" | "switch";
  name: string;
  state: boolean;
  matterExported?: boolean;
  matterPairingCode?: string;
  matterManualCode?: string;
  topic?: string;
}

export interface CameraUiCameraItem {
  id: string;
  name: string;
  sourceProvider?: "camera_ui" | "home_assistant" | "manual";
  rtspUrl: string;
  subRtspUrl?: string;
  snapshotUrl?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  hasAudio?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  videoCodec?: string;
  videoCodecSource?: "ffprobe" | "camera_ui" | "unknown";
  codecProbeUrl?: string;
  codecProbedAt?: string;
  videoProfile?: string;
  videoLevel?: string;
  rFrameRate?: string;
  avgFrameRate?: string;
  videoBitrateKbps?: number;
  videoPixFmt?: string;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  strategy?: string;
  motionTopic?: string;
  doorbellTopic?: string;
  motionActive?: boolean;
  motionSource?: string;
  doorbellActive?: boolean;
  hasLight?: boolean;
  lightActive?: boolean;
  hasSiren?: boolean;
  sirenActive?: boolean;
  realEntities?: CameraRealEntity[];
  status?: "online" | "offline" | "unknown";
  homeKitEnabled?: boolean;
  setupUri?: string;
  isPaired?: boolean;
  port?: number;
  pincode?: string;
  setupId?: string;
  uuid?: string;
  lightEntityId?: string;
  sirenEntityId?: string;
  motionEntityId?: string;
  liveViewCapabilities?: LiveViewCapabilities;
  liveViewTelemetry?: LiveViewTelemetry;
  hksvConfiguration?: {
    resolution: [number, number, number];
    fragmentLength: number;
    prebufferLength: number;
    audioSamplerate: number;
  };
  recordingCapabilities?: Array<[number, number, number]>;
}

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
  [key: string]: any;
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
  type: "motion" | "doorbell" | "person" | "package" | "vehicle" | "animal" | "light" | "siren" | "ptz" | "other";
  scryptedInterface: string;
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
  fps?: number;
  resolution?: { width: number; height: number };
  status?: {
    connection?: "online" | "offline";
    isOnline?: boolean;
    cache?: "fresh" | "stale" | "expired";
    lastError?: string;
    logs?: Array<{ timestamp: string; level: string; message: string; details?: any }>;
  };
  sensors?: CameraSensorRecord[];
  capabilities?: {
    observed?: {
      videoCodec?: string;
      audioCodec?: string;
      profile?: string;
      resolution?: { width: number; height: number };
      fps?: number;
      gopSeconds?: number;
      hasAudio?: boolean;
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

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

export interface StreamReference {
  protocol: "rtsp" | "webrtc" | "snapshot";
  host?: string;
  port?: number;
  path?: string;
  directUrl?: string;
  verifiedAt?: string;
}

export interface StreamCapabilities {
  videoCodec: "h264" | "h265" | "unknown";
  profile?: "baseline" | "main" | "high" | "unknown";
  level?: number;
  resolution: { width: number; height: number };
  fps?: number;
  pixelFormat?: string;
  keyframeIntervalSeconds?: number;
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
    | "person"
    | "package"
    | "vehicle"
    | "light"
    | "occupancy";
  name: string;
  enabled: boolean;
  state?: boolean;
  lastEventAt?: string;
}

export interface CameraExportConfig {
  matterEnabled: boolean;
  homeKitEnabled: boolean;
  hksvEnabledByDefault: boolean;
  googleHomeEnabled: boolean;
  alexaEnabled: boolean;
  smartThingsEnabled: boolean;
  nasEnabled: boolean;
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
  manufacturerSource: "scrypted" | "manual" | "unknown";
  modelSource: "scrypted" | "manual" | "unknown";
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
  };

  source: {
    kind: "scrypted";
    serverId: string;
    deviceId: string;
    streamReference?: StreamReference;
    snapshotReference?: StreamReference;
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

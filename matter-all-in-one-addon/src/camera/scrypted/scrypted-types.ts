/**
 * Scrypted Camera Integration Types & Data Contracts
 * Spec: Matter 1.6 (Joint Fabric) / Matter Camera 1.5 / HomeKit HAP & HKSV (iOS 27)
 */

export type ScryptedConnectionStatus =
  | "not_configured"
  | "connected"
  | "disconnected_using_cache"
  | "error"
  | "reconnecting";

export interface EncryptedSecret {
  iv: string; // Base64 (12 bytes)
  authTag: string; // Base64 (16 bytes)
  ciphertext: string; // Base64
  purpose: string;
  version: number;
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

export interface CameraRecord {
  cameraId: string; // Scrypted unique ID
  sourceId: string;
  deviceId: string;
  name: string;
  enabled: boolean;
  model: string; // Camera model (e.g. "Tapo C125", "Aqara G3", "Generic")

  identity: {
    matterNodeId?: number;
    matterEndpointId?: number;
    matterPairingCode?: string;
    homeKitAccessoryId?: string;
    homeKitPairingState?: "not_paired" | "paired" | "unpaired";
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
    fingerprint?: string;
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
    cache: "fresh" | "stale" | "unverified";
    lastFetched?: string;
    lastVerified?: string;
    lastSourceChangeDetected?: string;
  };
}

export interface ScryptedPersistentStore {
  installation: {
    installationId: string;
    createdAt: string;
    encryptionKeyRef: string;
  };
  scrypted: {
    serverId: string;
    serverUrl: string;
    tokenEncrypted?: EncryptedSecret;
    lastConnected?: string;
    connectionStatus: ScryptedConnectionStatus;
    autoReconnect: boolean;
    pollIntervalMinutes: number;
  };
  cameras: {
    lastFetched?: string;
    cameras: CameraRecord[];
  };
  nas?: Record<string, CameraNasConfig>;
}

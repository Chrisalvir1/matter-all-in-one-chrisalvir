/**
 * Type definitions for Camera.UI (cameraui / homebridge-camera-ui) integration.
 */

export interface CameraUiConfig {
  enabled: boolean;
  serverUrl: string;
  username?: string;
  password?: string;
  mqttEnabled?: boolean;
  mqttTopicPrefix?: string;
  allowSelfSignedCertificate?: boolean;
  pollIntervalSeconds?: number;
  lastSyncedAt?: string;
  lastError?: string;
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

export interface CameraUiCameraRecord {
  id: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  rtspUrl?: string;
  subRtspUrl?: string;
  snapshotUrl?: string;
  hasAudio: boolean;
  width?: number;
  height?: number;
  fps?: number;
  motionTopic?: string;
  doorbellTopic?: string;
  motionActive?: boolean;
  motionSource?: string;
  lastMotionAt?: string;
  doorbellActive?: boolean;
  lastDoorbellAt?: string;
  hasLight?: boolean;
  lightActive?: boolean;
  lightTopic?: string;
  hasSiren?: boolean;
  sirenActive?: boolean;
  sirenTopic?: string;
  realEntities?: CameraRealEntity[];
  status: "online" | "offline" | "unknown";
  homeKitEnabled: boolean;
  port?: number;
  username?: string;
  pincode?: string;
  setupId?: string;
  uuid?: string;
  isPaired?: boolean;
  setupUri?: string;
  videoCodec?: string;
  strategy?: "passthrough_h264" | "passthrough_hevc" | "transcode";
}

export interface CameraUiStore {
  config: CameraUiConfig;
  cameras: CameraUiCameraRecord[];
}

export interface CameraUiMotionPayload {
  camera?: string;
  name?: string;
  state?: boolean | string;
  motion?: boolean | string;
  active?: boolean | string;
  time?: number;
  timestamp?: number | string;
}

export interface CameraUiDoorbellPayload {
  camera?: string;
  name?: string;
  state?: boolean | string;
  doorbell?: boolean | string;
  time?: number;
}

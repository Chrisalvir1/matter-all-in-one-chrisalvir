/**
 * Types, Enums and Constants for HKSV3 / HEVC Secure Video.
 * Self-contained definitions matching the Apple Secure Video Open Source Compatibility Guide (HKSV3/HEVC).
 */

import type { CameraRecordingDelegate, CameraRecordingOptions, Service } from "@homebridge/hap-nodejs";

export enum StreamTierVideoCodec {
  H264 = 1,
  H265 = 2,
}

export enum StreamTierAudioCodec {
  OPUS = 3,
}

export enum CameraVideoQuality {
  HIGHEST = 1,
  HIGH = 2,
  MEDIUM = 3,
  LOW = 4,
}

export enum StreamTierAudioSampleRate {
  KHZ_16 = 1,
  KHZ_24 = 2,
  KHZ_32 = 3,
  KHZ_48 = 4,
}

export enum StreamTierAudioBitDepth {
  BITS_8 = 1,
  BITS_16 = 2,
  BITS_24 = 3,
}

export enum CameraSensorType {
  UNKNOWN = 0,
  PRIMARY = 1,
  GENERIC = 255,
}

export enum CameraSensorIntent {
  UNKNOWN = 0,
  MAIN = 1,
  PACKAGE = 2,
  GENERIC = 255,
}

export interface RTPSRTPParameters {
  cryptoSuite: number;
  masterKey: Buffer;
  masterSalt: Buffer;
}

export interface SFrameKeyData {
  key: Buffer;
  kid: bigint;
  keyId?: number;
  salt?: Buffer;
}

export interface SecureVideoVideoTier {
  identifier: number;
  quality: CameraVideoQuality;
  width: number;
  height: number;
  frameRate: number;
  targetAverageBitrate: number;
  peakBitrate: number;
}

export interface AudioStreamTier {
  identifier: number;
  targetAverageBitrate: number;
  sampleRate: StreamTierAudioSampleRate;
  bitDepth: StreamTierAudioBitDepth;
  packetTime: number;
  channels: number;
}

export interface MultiTierPrepareStreamRequest {
  sessionIdentifier: string;
  addressVersion: "ipv4" | "ipv6";
  targetAddress: string;
  sourceAddress: string;
  controllerVideoPort: number;
  controllerAudioPort: number;
  video: RTPSRTPParameters;
  audio: RTPSRTPParameters;
}

export interface MultiTierPrepareStreamResponse {
  addressOverride?: string;
  videoPort: number;
  audioPort: number;
  videoSSRC: number;
  audioSSRC: number;
  video: RTPSRTPParameters;
  audio: RTPSRTPParameters;
}

export interface MultiTierStreamStartRequest {
  sessionIdentifier: string;
  videoTier: number;
  videoSSRC: number;
  audioTier?: number;
  audioSSRC?: number;
}

export interface MultiTierRTPStreamingDelegate {
  prepareStream(request: MultiTierPrepareStreamRequest): Promise<MultiTierPrepareStreamResponse>;
  startStream(request: MultiTierStreamStartRequest): Promise<void>;
  stopStream(sessionIdentifier: string): Promise<void>;
}

export interface WebRTCOfferOptions {
  sframeEnabled: boolean;
}

export interface WebRTCICECandidate {
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface WebRTCSolicitOfferRequest {
  sessionIdentifier: string;
  options: WebRTCOfferOptions;
}

export interface WebRTCOffer {
  sdpOffer: string;
  candidates?: WebRTCICECandidate[];
  sframe?: SFrameKeyData;
}

export interface WebRTCProvideAnswerRequest {
  sessionIdentifier: string;
  sdpAnswer: string;
  candidates: WebRTCICECandidate[];
}

export interface WebRTCReofferRequest {
  sessionIdentifier: string;
  sdpOffer: string;
  options?: WebRTCOfferOptions;
}

export interface WebRTCReofferAnswer {
  sdpAnswer: string;
  sframe?: SFrameKeyData;
}

export interface WebRTCUpdateSessionRequest {
  sessionIdentifier: string;
  receiveKeysToAdd: SFrameKeyData[];
  receiveKIDsToRemove: bigint[];
}

export interface WebRTCStreamingDelegate {
  handleSolicitOffer(request: WebRTCSolicitOfferRequest): Promise<WebRTCOffer>;
  handleProvideAnswer(request: WebRTCProvideAnswerRequest): Promise<void>;
  handleReoffer(request: WebRTCReofferRequest): Promise<WebRTCReofferAnswer>;
  handleUpdateSession(request: WebRTCUpdateSessionRequest): Promise<void>;
  handleEndSession(sessionIdentifier: string): Promise<void>;
}

export interface SecureVideoControllerOptions {
  sensor: {
    uuid: string;
    width: number;
    height: number;
    type?: CameraSensorType;
    intent?: CameraSensorIntent;
  };
  video: {
    codec: StreamTierVideoCodec;
    payloadType?: number;
    tiers: SecureVideoVideoTier[];
  };
  audio?: {
    payloadType?: number;
    tier: AudioStreamTier;
    twoWayAudio?: boolean;
  };
  webrtc: {
    delegate: WebRTCStreamingDelegate;
    maxSessions?: number;
  };
  rtp: {
    delegate: MultiTierRTPStreamingDelegate;
  };
  recording: {
    options: CameraRecordingOptions;
    delegate: CameraRecordingDelegate;
  };
  motionService?: Service;
  snapshot?: (request: any) => Promise<Buffer>;
}

export const DEFAULT_HEVC_VIDEO_TIERS: SecureVideoVideoTier[] = [
  { identifier: 1, quality: CameraVideoQuality.HIGHEST, width: 3840, height: 2160, frameRate: 30, targetAverageBitrate: 4500, peakBitrate: 5000 },
  { identifier: 2, quality: CameraVideoQuality.HIGHEST, width: 3840, height: 2160, frameRate: 24, targetAverageBitrate: 4500, peakBitrate: 5000 },
  { identifier: 3, quality: CameraVideoQuality.HIGH, width: 2560, height: 1440, frameRate: 30, targetAverageBitrate: 2800, peakBitrate: 3000 },
  { identifier: 4, quality: CameraVideoQuality.HIGH, width: 1920, height: 1080, frameRate: 30, targetAverageBitrate: 1700, peakBitrate: 1800 },
  { identifier: 5, quality: CameraVideoQuality.MEDIUM, width: 1920, height: 1080, frameRate: 30, targetAverageBitrate: 1700, peakBitrate: 1800 },
  { identifier: 6, quality: CameraVideoQuality.MEDIUM, width: 1280, height: 720, frameRate: 30, targetAverageBitrate: 768, peakBitrate: 800 },
  { identifier: 7, quality: CameraVideoQuality.LOW, width: 640, height: 360, frameRate: 30, targetAverageBitrate: 180, peakBitrate: 190 },
  { identifier: 8, quality: CameraVideoQuality.LOW, width: 640, height: 360, frameRate: 15, targetAverageBitrate: 180, peakBitrate: 190 },
  { identifier: 9, quality: CameraVideoQuality.LOW, width: 320, height: 240, frameRate: 30, targetAverageBitrate: 180, peakBitrate: 190 },
];

export const DEFAULT_HEVC_AUDIO_TIER: AudioStreamTier = {
  identifier: 1,
  targetAverageBitrate: 32000,
  sampleRate: StreamTierAudioSampleRate.KHZ_32,
  bitDepth: StreamTierAudioBitDepth.BITS_16,
  packetTime: 20,
  channels: 1,
};

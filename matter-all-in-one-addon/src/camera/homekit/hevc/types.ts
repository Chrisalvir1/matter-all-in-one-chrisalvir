/**
 * Types, Enums and Constants for HKSV3 / HEVC Secure Video.
 * Re-exports definitions directly from vendored @homebridge/hap-nodejs.
 */

import {
  StreamTierVideoCodec,
  StreamTierAudioSampleRate,
  StreamTierAudioBitDepth,
  CameraVideoQuality,
  type SecureVideoVideoTier,
  type AudioStreamTier,
  type SecureVideoControllerOptions,
  type MultiTierPrepareStreamRequest,
  type MultiTierPrepareStreamResponse,
  type MultiTierStreamStartRequest,
  type MultiTierRTPStreamingDelegate,
  type WebRTCStreamingDelegate,
  type WebRTCOffer,
  type WebRTCProvideAnswerRequest,
  type WebRTCReofferRequest,
  type WebRTCReofferAnswer,
  type WebRTCUpdateSessionRequest,
  type WebRTCSolicitOfferRequest,
  type SFrameKeyData,
} from "@homebridge/hap-nodejs";

export {
  StreamTierVideoCodec,
  StreamTierAudioSampleRate,
  StreamTierAudioBitDepth,
  CameraVideoQuality,
  type SecureVideoVideoTier,
  type AudioStreamTier,
  type SecureVideoControllerOptions,
  type MultiTierPrepareStreamRequest,
  type MultiTierPrepareStreamResponse,
  type MultiTierStreamStartRequest,
  type MultiTierRTPStreamingDelegate,
  type WebRTCStreamingDelegate,
  type WebRTCOffer,
  type WebRTCProvideAnswerRequest,
  type WebRTCReofferRequest,
  type WebRTCReofferAnswer,
  type WebRTCUpdateSessionRequest,
  type WebRTCSolicitOfferRequest,
  type SFrameKeyData,
};

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

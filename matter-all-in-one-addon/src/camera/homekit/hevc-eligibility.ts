/**
 * HomeKit Secure Video HEVC Preview Eligibility Evaluator
 * Based on Apple HomeKit Secure Video Open Source Compatibility Guide (June 2026).
 *
 * This evaluator is strictly isolated from the H.264 Legacy production path.
 * If any requirement is not met, cameras stay in h264_legacy.
 */

import type {
  CameraRecord,
  HevcEligibilityCheck,
  HevcEligibilityResult,
  HevcTierAvailability,
  HevcAudioSpec,
  HevcStreamTierInfo,
} from "../scrypted/scrypted-types.js";

// Bitrate maximum limits specified by Apple Guide per resolution
const MAX_BITRATE_BY_RES: Record<string, number> = {
  "3840x2160": 5000,
  "2560x1440": 3000,
  "1920x1080": 1800,
  "1280x720": 800,
  "640x360": 190,
};

export function evaluateHevcEligibility(
  camera: CameraRecord,
  bridgeCapabilities?: {
    hasHapPreviewServices?: boolean;
    hasTlv8Handlers?: boolean;
    maxConcurrentRtpSessions?: number;
    maxConcurrentWebRtcSessions?: number;
    hasSframeOnDemand?: boolean;
    hasCmafRecordingPipeline?: boolean;
  },
): HevcEligibilityResult {
  const now = new Date().toISOString();
  const checks: HevcEligibilityCheck[] = [];

  // --- 1. Source Video Codec Check ---
  const observedCodec =
    camera.capabilities?.observed?.videoCodec?.toLowerCase();
  const profiles = camera.source?.profiles || [];
  const hevcProfiles = profiles.filter(
    (p) =>
      p.videoCodec?.toLowerCase() === "hevc" ||
      p.videoCodec?.toLowerCase() === "h265",
  );

  const hasHevc = observedCodec === "h265" || hevcProfiles.length > 0;
  checks.push({
    id: "source_hevc_codec",
    name: "Códec de fuente HEVC nativo",
    category: "source",
    passed: hasHevc,
    details: hasHevc
      ? `Fuente entrega HEVC (${hevcProfiles.length} perfiles encontrados)`
      : "La fuente no entrega códec HEVC/H.265 nativo",
  });

  // --- 2. Stream Tiers Check (High, Medium, Low) ---
  const tierAvailability: HevcTierAvailability = {
    concurrentVerified: false,
  };

  let hasHigh = false;
  let hasMedium = false;
  let hasLow = false;
  let hasHighest = false;

  for (const p of hevcProfiles) {
    if (!p.resolution) continue;
    const { width, height } = p.resolution;
    const resKey = `${width}x${height}`;
    const maxAllowed = MAX_BITRATE_BY_RES[resKey];
    const bitrate = p.bitrateKbps || 0;

    const tierInfo: HevcStreamTierInfo = {
      tier: "low",
      profileId: p.id,
      width,
      height,
      fps: p.fps || 30,
      bitrateAverageKbps: bitrate,
      directUrl: p.directUrl,
      verified: p.validationStatus === "verified",
    };

    if (width >= 3840 && height >= 2160) {
      tierInfo.tier = "highest";
      tierAvailability.highest = tierInfo;
      hasHighest = true;
    } else if (width >= 1920 && height >= 1080) {
      tierInfo.tier = "high";
      tierAvailability.high = tierInfo;
      hasHigh = true;
    } else if (width >= 1280 && height >= 720) {
      tierInfo.tier = "medium";
      tierAvailability.medium = tierInfo;
      hasMedium = true;
    } else if (width <= 640) {
      tierInfo.tier = "low";
      tierAvailability.low = tierInfo;
      hasLow = true;
    }
  }

  const hasMandatoryTiers = hasHigh && hasMedium && hasLow;
  checks.push({
    id: "source_stream_tiers",
    name: "Tiers concurrentes High, Medium y Low",
    category: "source",
    passed: hasMandatoryTiers,
    details: hasMandatoryTiers
      ? `Tiers disponibles (High: ${tierAvailability.high?.width}x${tierAvailability.high?.height}, Medium: ${tierAvailability.medium?.width}x${tierAvailability.medium?.height}, Low: ${tierAvailability.low?.width}x${tierAvailability.low?.height})`
      : "Faltan tiers obligatorios High, Medium o Low para HEVC Preview",
  });

  // Highest tier is strictly optional; only eligible if 4K and 2K are both present
  const highestValid = !hasHighest || (hasHighest && hasHigh);
  checks.push({
    id: "highest_tier_optional_rule",
    name: "Tier Highest opcional conforme a guía Apple",
    category: "source",
    passed: highestValid,
    details: hasHighest
      ? "Highest presente y respaldado por tier High"
      : "Highest no anunciado (opcional, conforme a especificación)",
  });

  // --- 3. Audio Spec Check ---
  const audioCodec = camera.capabilities?.observed?.audioCodec;
  const isOpus = audioCodec === "opus";
  const audioSpec: HevcAudioSpec = {
    opusTierCount: 1,
    captureSampleRate: 16000,
    transmissionSampleRate: 48000,
    channels: 1,
    packetTimeMs: 20,
    codec: "opus",
    requiresLocalAdaptation: !isOpus,
  };

  const audioPassed =
    camera.capabilities?.observed?.hasAudio === false ||
    isOpus ||
    audioSpec.requiresLocalAdaptation;

  checks.push({
    id: "audio_opus_spec",
    name: "Especificación de Audio Opus (Mono 20ms)",
    category: "source",
    passed: audioPassed,
    details: isOpus
      ? "Audio Opus nativo detectado"
      : "Requiere adaptación local a Opus mono 20ms",
  });

  // --- 4. Bridge Implementation Checks ---
  const bridge = bridgeCapabilities || {};
  const bridgeReady =
    Boolean(bridge.hasHapPreviewServices) &&
    Boolean(bridge.hasTlv8Handlers) &&
    (bridge.maxConcurrentRtpSessions ?? 0) >= 5 &&
    (bridge.maxConcurrentWebRtcSessions ?? 0) >= 6;

  checks.push({
    id: "bridge_preview_services",
    name: "Servicios HAP Preview y capacidad concurrente en Bridge",
    category: "bridge",
    passed: bridgeReady,
    details: bridgeReady
      ? "Bridge soporta HAP Preview y concurrencia requerida"
      : "Bridge en modo producción estable H.264 Legacy (servicios preview aislados)",
  });

  const allPassed = checks.every((c) => c.passed);
  const failureReasons = checks.filter((c) => !c.passed).map((c) => c.name);

  return {
    eligible: allPassed,
    reason: allPassed
      ? "Cumple todos los requisitos de compatibilidad HEVC Preview"
      : `No elegible: ${failureReasons.join("; ")}`,
    evaluatedAt: now,
    tierAvailability,
    audioSpec,
    checks,
  };
}

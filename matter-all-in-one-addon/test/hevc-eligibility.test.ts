import { describe, it, expect } from "vitest";
import { evaluateHevcEligibility } from "../src/camera/homekit/hevc-eligibility.js";
import type { CameraRecord } from "../src/camera/scrypted/scrypted-types.js";

function createMockCamera(overrides?: Partial<CameraRecord>): CameraRecord {
  return {
    cameraId: "cam_hevc_1",
    sourceId: "scrypted_cam_hevc_1",
    deviceId: "51",
    name: "Cámara Prueba 4K",
    enabled: true,
    displayManufacturer: "Prueba Corp",
    displayModel: "Pro 4K",
    identity: {
      homeKitPairingState: "not_paired",
    },
    source: {
      kind: "scrypted",
      serverId: "http://192.168.1.50:10080",
      deviceId: "51",
      profiles: [],
    },
    capabilities: {
      qualityMode: "maximum_compatible",
      allowAutomaticFallback: true,
      observed: {
        videoCodec: "h264",
        resolution: { width: 1920, height: 1080 },
        fps: 30,
        hasAudio: true,
        audioCodec: "aac",
      },
    },
    sensors: [],
    exportConfig: {
      matterEnabled: true,
      homeKitEnabled: true,
      hksvEnabledByDefault: true,
      googleHomeEnabled: false,
      alexaEnabled: false,
      smartThingsEnabled: false,
      nasEnabled: false,
    },
    status: {
      connection: "online",
      cache: "fresh",
    },
    ...overrides,
  };
}

describe("evaluateHevcEligibility", () => {
  it("rejects cameras whose source is only H.264", () => {
    const cam = createMockCamera();
    const result = evaluateHevcEligibility(cam);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("Códec de fuente HEVC nativo");
    const check = result.checks.find((c) => c.id === "source_hevc_codec");
    expect(check?.passed).toBe(false);
  });

  it("fails if mandatory tiers High, Medium, or Low are missing", () => {
    const cam = createMockCamera({
      capabilities: {
        observed: {
          videoCodec: "h265",
          resolution: { width: 3840, height: 2160 },
          fps: 30,
          hasAudio: true,
          audioCodec: "opus",
        },
      },
      source: {
        kind: "scrypted",
        serverId: "http://192.168.1.50:10080",
        deviceId: "51",
        profiles: [
          {
            id: "p_4k",
            name: "4K Stream",
            videoCodec: "hevc",
            resolution: { width: 3840, height: 2160 },
            fps: 30,
            bitrateKbps: 4500,
            directUrl: "rtsp://192.168.1.50:8554/stream1",
            validationStatus: "verified",
          },
        ],
      },
    });

    const result = evaluateHevcEligibility(cam);
    expect(result.eligible).toBe(false);
    const tierCheck = result.checks.find((c) => c.id === "source_stream_tiers");
    expect(tierCheck?.passed).toBe(false);
  });

  it("treats Highest tier as optional and passes rule when absent", () => {
    const cam = createMockCamera({
      source: {
        kind: "scrypted",
        serverId: "http://192.168.1.50:10080",
        deviceId: "51",
        profiles: [
          {
            id: "p_high",
            name: "1080p High",
            videoCodec: "hevc",
            resolution: { width: 1920, height: 1080 },
            fps: 30,
            bitrateKbps: 1500,
            directUrl: "rtsp://192.168.1.50:8554/p_high",
            validationStatus: "verified",
          },
          {
            id: "p_med",
            name: "720p Medium",
            videoCodec: "hevc",
            resolution: { width: 1280, height: 720 },
            fps: 30,
            bitrateKbps: 700,
            directUrl: "rtsp://192.168.1.50:8554/p_med",
            validationStatus: "verified",
          },
          {
            id: "p_low",
            name: "360p Low",
            videoCodec: "hevc",
            resolution: { width: 640, height: 360 },
            fps: 30,
            bitrateKbps: 180,
            directUrl: "rtsp://192.168.1.50:8554/p_low",
            validationStatus: "verified",
          },
        ],
      },
    });

    const result = evaluateHevcEligibility(cam);
    const highestCheck = result.checks.find(
      (c) => c.id === "highest_tier_optional_rule",
    );
    expect(highestCheck?.passed).toBe(true);
  });

  it("passes all checks when HEVC source, tiers, audio, and bridge capabilities are satisfied", () => {
    const cam = createMockCamera({
      capabilities: {
        observed: {
          videoCodec: "h265",
          resolution: { width: 3840, height: 2160 },
          fps: 30,
          hasAudio: true,
          audioCodec: "opus",
        },
      },
      source: {
        kind: "scrypted",
        serverId: "http://192.168.1.50:10080",
        deviceId: "51",
        profiles: [
          {
            id: "p_highest",
            name: "4K Highest",
            videoCodec: "hevc",
            resolution: { width: 3840, height: 2160 },
            fps: 30,
            bitrateKbps: 4500,
            directUrl: "rtsp://192.168.1.50:8554/p_highest",
            validationStatus: "verified",
          },
          {
            id: "p_high",
            name: "1080p High",
            videoCodec: "hevc",
            resolution: { width: 1920, height: 1080 },
            fps: 30,
            bitrateKbps: 1500,
            directUrl: "rtsp://192.168.1.50:8554/p_high",
            validationStatus: "verified",
          },
          {
            id: "p_med",
            name: "720p Medium",
            videoCodec: "hevc",
            resolution: { width: 1280, height: 720 },
            fps: 30,
            bitrateKbps: 700,
            directUrl: "rtsp://192.168.1.50:8554/p_med",
            validationStatus: "verified",
          },
          {
            id: "p_low",
            name: "360p Low",
            videoCodec: "hevc",
            resolution: { width: 640, height: 360 },
            fps: 30,
            bitrateKbps: 180,
            directUrl: "rtsp://192.168.1.50:8554/p_low",
            validationStatus: "verified",
          },
        ],
      },
    });

    const bridgeCapabilities = {
      hasHapPreviewServices: true,
      hasTlv8Handlers: true,
      maxConcurrentRtpSessions: 5,
      maxConcurrentWebRtcSessions: 6,
      hasSframeOnDemand: true,
      hasCmafRecordingPipeline: true,
    };

    const result = evaluateHevcEligibility(cam, bridgeCapabilities);
    expect(result.eligible).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });
});

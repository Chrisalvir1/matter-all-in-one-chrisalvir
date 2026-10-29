import { describe, expect, it } from "vitest";
import hap from "@homebridge/hap-nodejs";

import {
  C120_HARDWARE_LIMITS,
  EXPERIMENTAL_VARIANTS,
  POC_CONFIG,
  POC_UUID,
  buildFfmpegArgs,
  evaluateStreamingDecision,
  parseSpsVuiFps,
  sanitizeRequest,
  sanitizeUrl,
} from "../scripts/poc-c120-2k-lab.mjs";

const { H264Profile, RTPStreamManagement } = hap;

describe("Tapo C120 2K Lab PoC: Variantes TLV y Fallo Cerrado Estricto", () => {
  it("enforces isolated configuration parameters and hardware limits", () => {
    expect(POC_CONFIG.port).toBe(51845);
    expect(POC_CONFIG.setupId).toBe("C12E");
    expect(POC_CONFIG.pincode).toBe("246-81-357");
    expect(POC_CONFIG.name).toBe("Tapo C120 2K Lab");
    expect(POC_CONFIG.storagePath).toContain(".poc-c120-lab-storage");
    expect(POC_UUID).toBeDefined();
    expect(typeof POC_UUID).toBe("string");

    // Límites específicos del hardware C120 (sin fallbacks genéricos)
    expect(C120_HARDWARE_LIMITS.maxFps).toBe(20);
    expect(C120_HARDWARE_LIMITS.nativeWidth).toBe(2560);
    expect(C120_HARDWARE_LIMITS.nativeHeight).toBe(1440);
    expect(C120_HARDWARE_LIMITS.h264Level).toBe("5.0");
  });

  it("announces a single strict profile (2560x1440 @ 20 fps) in the initial test", () => {
    expect(POC_CONFIG.announcedResolutions).toEqual([[2560, 1440, 20]]);
    expect(POC_CONFIG.announcedResolutions.length).toBe(1);
  });

  it("defines mutually exclusive experimental variants (0x32 vs 0x03)", () => {
    const var32 = EXPERIMENTAL_VARIANTS["0x32"];
    const var03 = EXPERIMENTAL_VARIANTS["0x03"];

    expect(var32).toBeDefined();
    expect(var32.announcedLevels).toEqual([50]);
    expect(var32.announcedLevels).not.toContain(3);

    expect(var03).toBeDefined();
    expect(var03.announcedLevels).toEqual([3]);
    expect(var03.announcedLevels).not.toContain(50);
  });

  it("fails closed when source has no valid FPS or metadata (No medido)", () => {
    // Sin metadata de la fuente
    const decision = evaluateStreamingDecision(2560, 1440, 20, {});
    expect(decision.decision).toBe("reject");
    expect(decision.reason).toContain("No valid FPS or metadata measured");
    expect(decision.effectiveOutputFps).toBeNull();
  });

  it("fails closed when Apple requests invalid or missing FPS", () => {
    const decision = evaluateStreamingDecision(2560, 1440, undefined, {
      nominalFps: 20,
    });
    expect(decision.decision).toBe("reject");
    expect(decision.reason).toContain("invalid or missing FPS");
  });

  it("evaluates 2560x1440 @ 20 fps as passthrough (-c:v copy) when valid FPS is measured", () => {
    const decision = evaluateStreamingDecision(2560, 1440, 20, {
      nominalFps: 20,
      observedFps: 20,
    });
    expect(decision.decision).toBe("passthrough");
    expect(decision.vcodec).toBe("copy");
    expect(decision.targetWidth).toBe(2560);
    expect(decision.targetHeight).toBe(1440);
    expect(decision.requestedFps).toBe(20);
    expect(decision.effectiveOutputFps).toBe(20);
  });

  it("evaluates 2560x1440 @ 15 fps as passthrough with effective rate clamped to delivered rate", () => {
    const decision = evaluateStreamingDecision(2560, 1440, 15, {
      nominalFps: 20,
      observedFps: 15,
    });
    expect(decision.decision).toBe("passthrough");
    expect(decision.requestedFps).toBe(15);
    expect(decision.effectiveOutputFps).toBe(15);
  });

  it("does not force 20 fps if source delivers less (e.g. 14 fps)", () => {
    const decision = evaluateStreamingDecision(1920, 1080, 20, {
      nominalFps: 20,
      observedFps: 14,
    });
    expect(decision.decision).toBe("transcode");
    expect(decision.requestedFps).toBe(20);
    expect(decision.effectiveOutputFps).toBe(14); // Clamped al valor real
  });

  it("builds passthrough FFmpeg command without libx264, scaling, or rigid -r", () => {
    const decisionInfo = evaluateStreamingDecision(2560, 1440, 20, {
      nominalFps: 20,
      observedFps: 20,
    });
    const args = buildFfmpegArgs({
      rtspUrl: "rtsp://192.168.110.147:8554/tapo_c120",
      decisionInfo,
      targetAddress: "192.168.110.50",
      targetVideoPort: 50100,
      videoSrtpKey: Buffer.alloc(16, 0xaa),
    });

    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-r");
  });

  it("fails closed in buildFfmpegArgs if effectiveOutputFps is missing for transcode", () => {
    const invalidDecision = {
      decision: "transcode",
      targetWidth: 1920,
      targetHeight: 1080,
      effectiveOutputFps: undefined,
    };
    expect(() =>
      buildFfmpegArgs({
        rtspUrl: "rtsp://192.168.110.147:8554/tapo_c120",
        decisionInfo: invalidDecision,
        targetAddress: "192.168.110.50",
        targetVideoPort: 50100,
        videoSrtpKey: Buffer.alloc(16, 0xaa),
      }),
    ).toThrow("Cannot transcode: effectiveOutputFps is missing or invalid");
  });

  it("serializes variant 0x32 with single resolution [2560, 1440, 20] in TLV", () => {
    const b64 = RTPStreamManagement._supportedVideoStreamConfiguration({
      codec: {
        profiles: [H264Profile.HIGH],
        levels: EXPERIMENTAL_VARIANTS["0x32"].announcedLevels,
      },
      resolutions: POC_CONFIG.announcedResolutions,
    });

    expect(b64).toBeDefined();
    const hex = Buffer.from(b64, "base64").toString("hex");

    // Ancho 2560 (000a) y Alto 1440 (a005) a 20 fps (14 hex)
    expect(hex).toContain("0102000a0202a005030114");
    // Nivel 0x32 (32 hex = 50 dec)
    expect(hex).toContain("020132");
    // NO contiene nivel 0x03
    expect(hex).not.toContain("020103");
  });

  it("serializes variant 0x03 with single resolution [2560, 1440, 20] in TLV", () => {
    const b64 = RTPStreamManagement._supportedVideoStreamConfiguration({
      codec: {
        profiles: [H264Profile.HIGH],
        levels: EXPERIMENTAL_VARIANTS["0x03"].announcedLevels,
      },
      resolutions: POC_CONFIG.announcedResolutions,
    });

    expect(b64).toBeDefined();
    const hex = Buffer.from(b64, "base64").toString("hex");

    // Nivel 0x03 (03 hex)
    expect(hex).toContain("020103");
    // NO contiene nivel 0x32
    expect(hex).not.toContain("020132");
  });

  it("parses SPS VUI timing without fallback", () => {
    const spsB64 = "Z2QAMqzSAKAC1oQAAA+kAAJxoBA=";
    const fps = parseSpsVuiFps(spsB64);
    expect(fps).toBe(20);

    // SPS inválido o sin VUI devuelve undefined
    const invalidFps = parseSpsVuiFps("invalid-base64");
    expect(invalidFps).toBeUndefined();
  });

  it("sanitizes URLs and SRTP keys from requests", () => {
    const maskedUrl = sanitizeUrl(
      "rtsp://admin:SecretPass123@192.168.1.50:554/stream",
    );
    expect(maskedUrl).toBe("rtsp://admin:***@192.168.1.50:554/stream");

    const req = {
      sessionID: "test-session",
      video: {
        width: 2560,
        height: 1440,
        fps: 20,
        srtp_key: "TopSecretKeyBase64==",
      },
      audio: {
        srtp_key: "TopSecretAudioKey==",
      },
    };
    const sanitized = sanitizeRequest(req);
    expect(sanitized.video.srtp_key).toBe("***MASKED***");
    expect(sanitized.audio.srtp_key).toBe("***MASKED***");
    expect(sanitized.video.width).toBe(2560);
    expect(sanitized.video.fps).toBe(20);
  });
});

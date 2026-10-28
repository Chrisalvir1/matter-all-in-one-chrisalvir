import { describe, expect, it } from "vitest";
import { buildCameraAiDiagnostics } from "../src/camera/ai/camera-diagnostics.js";
import { isCameraDiagnosticsAuthorized } from "../src/camera/ai/diagnostics-auth.js";

describe("opt-in, read-only camera diagnostics", () => {
  it("stays disabled without a secret and requires the correct bearer token", () => {
    const secret = "a-minimum-of-24-random-characters";
    expect(isCameraDiagnosticsAuthorized(undefined, `Bearer ${secret}`)).toBe(
      false,
    );
    expect(isCameraDiagnosticsAuthorized("short", "Bearer short")).toBe(false);
    expect(isCameraDiagnosticsAuthorized(secret, undefined)).toBe(false);
    expect(isCameraDiagnosticsAuthorized(secret, "Bearer wrong")).toBe(false);
    expect(isCameraDiagnosticsAuthorized(secret, `Bearer ${secret}`)).toBe(
      true,
    );
  });

  it("reports Omni allocation and HAP/HKSV state without credentials or camera URLs", () => {
    const result = buildCameraAiDiagnostics({
      entityId: "camera.omni_feeder",
      sourceType: "rtsp",
      available: true,
      hapPublished: true,
      hapPaired: true,
      motionEntityId: "binary_sensor.omni_feeder_motion",
      audioAvailable: true,
      hksvState: "ready",
      hksvVerified: true,
      activeLiveView: [],
      recentLiveView: [
        {
          cameraId: "camera.omni_feeder",
          sessionId: "not-for-external-diagnostics",
          startedAt: "2026-10-28T10:00:00.000Z",
          durationMs: 1200,
          state: "failed",
          effectiveMode: "fallback",
          requestedVideo: {},
          error: "RTSP failure at rtsps://camera.example/live?token=PRIVATE",
        },
      ],
      omniAllocation: {
        entityId: "camera.omni_feeder",
        requests: 4,
        successes: 3,
        failures: 1,
        lastAttemptCount: 2,
        lastDurationMs: 350,
        lastResult: "success",
        lastAt: "2026-10-28T10:00:00.000Z",
      },
    });
    expect(result.homekit.hksvVerified).toBe(true);
    expect(result.omniRtspAllocation?.lastAttemptCount).toBe(2);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).not.toContain("rtsps://");
    expect(serialized).not.toContain("not-for-external-diagnostics");
    expect(serialized).not.toContain("setupUri");
  });
});

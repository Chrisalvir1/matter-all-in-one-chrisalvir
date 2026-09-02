import { describe, expect, it } from "vitest";
import {
  groupNormalizedScryptedCameras,
  normalizeScryptedCamera,
  UNKNOWN_BRAND,
} from "../src/camera/scrypted/scrypted-camera-normalizer.js";

describe("normalizeScryptedCamera", () => {
  it("prefers display metadata and never exposes transport details", () => {
    const camera = normalizeScryptedCamera({
      id: "ring-1",
      name: "  Entrada  ",
      manufacturer: "Ring",
      displayManufacturer: "  Ring  ",
      model: "Doorbell",
      displayModel: "  Doorbell Pro  ",
      sensors: [{ id: "motion" }],
      entities: [{ id: "light" }],
      online: true,
      homeKitEnabled: true,
    });

    expect(camera).toEqual({
      id: "ring-1",
      name: "Entrada",
      brand: "Ring",
      model: "Doorbell Pro",
      source: "scrypted",
      online: true,
      entityCount: 2,
      homeKit: { managedByScrypted: true, enabled: true },
      matter: { experimental: true, enabled: false },
    });
    expect(camera).not.toHaveProperty("rtspUrl");
    expect(camera).not.toHaveProperty("ffmpeg");
    expect(camera).not.toHaveProperty("webrtc");
  });

  it("uses a stable fallback for missing brand and model", () => {
    const camera = normalizeScryptedCamera({ id: "unknown-1" });
    expect(camera.brand).toBe(UNKNOWN_BRAND);
    expect(camera.model).toBeNull();
    expect(camera.name).toBe("unknown-1");
    expect(camera.online).toBeNull();
    expect(camera.entityCount).toBe(0);
  });

  it("groups cameras by normalized brand", () => {
    const groups = groupNormalizedScryptedCameras([
      { id: "a", manufacturer: "Ring" },
      { id: "b", displayManufacturer: "Ring" },
      { id: "c" },
    ]);

    expect(groups.Ring).toHaveLength(2);
    expect(groups[UNKNOWN_BRAND]).toHaveLength(1);
  });
});

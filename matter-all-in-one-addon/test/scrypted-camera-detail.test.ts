import { describe, expect, it } from "vitest";
import { normalizeScryptedCamera } from "../src/camera/scrypted/scrypted-camera-normalizer.js";
import { toScryptedCameraDetail } from "../src/camera/scrypted/scrypted-camera-detail.js";

describe("Scrypted camera detail", () => {
  it("keeps HomeKit ownership explicit and recording disabled", () => {
    const camera = normalizeScryptedCamera({
      id: "cam-1",
      name: "Entrada",
      manufacturer: "Ring",
      model: "Doorbell",
      online: true,
      homeKitEnabled: true,
      matterEnabled: false,
      sensors: [{ id: "motion" }],
    });

    const detail = toScryptedCameraDetail(camera);
    expect(detail.identity.source).toBe("Scrypted");
    expect(detail.integrations.homeKit.owner).toBe("Scrypted");
    expect(detail.integrations.homeKit.instruction).toContain("no genera");
    expect(detail.integrations.matter.experimental).toBe(true);
    expect(detail.diagnostics.recordingEnabledByDefault).toBe(false);
    expect(detail.diagnostics.nvrEnabledByDefault).toBe(false);
  });
});

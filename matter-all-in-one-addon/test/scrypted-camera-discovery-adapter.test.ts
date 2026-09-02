import { describe, expect, it } from "vitest";
import { adaptScryptedDiscovery } from "../src/camera/scrypted/scrypted-camera-discovery-adapter.js";

describe("Scrypted discovery adapter", () => {
  it("returns only camera-like devices and keeps each view derived from one normalized model", () => {
    const result = adaptScryptedDiscovery([
      {
        id: "cam-1",
        name: "Entrada",
        manufacturer: "Ring",
        type: "Camera",
        sensors: [{ id: "motion" }],
      },
      { id: "nvr-1", name: "NVR", type: "NVR" },
    ]);

    expect(result.cameras).toHaveLength(1);
    const camera = result.cameras[0];
    expect(camera.normalized.id).toBe("cam-1");
    expect(camera.card.source).toBe("scrypted");
    expect(camera.presentation.primaryAction).toBe("configurar");
    expect(camera.detail.identity.source).toBe("Scrypted");
  });

  it("accepts devices without a reported type as camera candidates", () => {
    const result = adaptScryptedDiscovery([{ id: "cam-unknown", name: "Cámara" }]);
    expect(result.cameras).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import { toCameraPresentation } from "../src/camera/scrypted/scrypted-camera-presentation.js";
import { normalizeScryptedCamera } from "../src/camera/scrypted/scrypted-camera-normalizer.js";

describe("Scrypted camera presentation", () => {
  it("keeps the card minimal and sends configuration to the detail view", () => {
    const camera = normalizeScryptedCamera({
      id: "cam-1",
      name: "Entrada",
      manufacturer: "Ring",
      model: "Doorbell",
      online: true,
      sensors: [{ id: "motion" }],
      entities: [{ id: "light" }],
    });

    expect(toCameraPresentation(camera)).toEqual({
      title: "Entrada",
      subtitle: "Ring · Doorbell",
      status: "online",
      statusLabel: "En línea",
      entityLabel: "2 entidades",
      showTechnicalTransport: false,
      showMatterPairingInSummary: false,
      homeKitLabel: "Gestionado por Scrypted",
      primaryAction: "configurar",
    });
  });

  it("does not promise a stream when the status is unknown", () => {
    const camera = normalizeScryptedCamera({ id: "cam-2" });
    const presentation = toCameraPresentation(camera);
    expect(presentation.status).toBe("unknown");
    expect(presentation.statusLabel).toBe("Estado no verificado");
    expect(presentation.showTechnicalTransport).toBe(false);
  });
});

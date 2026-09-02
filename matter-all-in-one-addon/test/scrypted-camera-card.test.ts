import { describe, expect, it } from "vitest";
import {
  groupScryptedCameraCards,
  toScryptedCameraCard,
} from "../src/camera/scrypted/scrypted-camera-card.js";

describe("Scrypted camera discovery cards", () => {
  it("keeps the list model independent from streaming transport", () => {
    const card = toScryptedCameraCard({
      id: "ring-1",
      name: "Entrada",
      manufacturer: "Ring",
      model: "Doorbell",
      sensors: [{ id: "motion" }],
      entities: [{ id: "light" }],
      homeKitEnabled: true,
      matterEnabled: false,
    });

    expect(card.source).toBe("scrypted");
    expect(card.brand).toBe("Ring");
    expect(card.entityCount).toBe(2);
    expect(card.homeKit.managedByScrypted).toBe(true);
    expect(card.matter.experimental).toBe(true);
  });

  it("groups cameras by brand and preserves unknown brands", () => {
    const groups = groupScryptedCameraCards([
      { id: "a", manufacturer: "Ring" },
      { id: "b", displayManufacturer: "Ring" },
      { id: "c", name: "Sin marca" },
    ]);

    expect(groups.Ring).toHaveLength(2);
    expect(groups["Marca no identificada"]).toHaveLength(1);
  });
});

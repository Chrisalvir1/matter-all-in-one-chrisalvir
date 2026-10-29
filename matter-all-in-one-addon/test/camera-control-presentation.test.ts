import { describe, it, expect } from "vitest";
import { describeCameraControl } from "../src/frontend/src/utils/camera-control-presentation";
describe("camera control presentation", () => {
  it("describes the real feeder switch without claiming motion", () => {
    const view = describeCameraControl({
      id: "switch.alimentador_michi_alimentar_ahora",
      name: "Alimentar ahora",
      domain: "switch",
      type: "switch",
      state: false,
    });
    expect(view.description).toContain("alimentación");
    expect(view.stateLabel).toBe("Desactivado");
  });
  it("does not invent motion for an unclassified sensor", () => {
    const view = describeCameraControl({
      id: "binary_sensor.battery",
      name: "Batería",
      domain: "binary_sensor",
      type: "other",
      state: true,
    });
    expect(JSON.stringify(view)).not.toMatch(
      /Movimiento|presencia|instantánea/,
    );
  });
});

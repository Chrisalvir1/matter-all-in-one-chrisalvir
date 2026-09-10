import { describe, expect, it } from "vitest";
import { detectDevice } from "../src/frontend/src/utils/deviceDetector";
import { DeviceRecord } from "../src/frontend/src/types";

describe("deviceDetector hardware and brand intelligence", () => {
  it("detects Govee H7133 Smart Tower Fan accurately", () => {
    const device: DeviceRecord = {
      id: "dev_govee_fan",
      name: "Govee Tower Fan H7133",
      manufacturer: "Govee",
      model: "H7133",
      area: "Sala",
      entities: [
        {
          entityId: "fan.govee_h7133_fan",
          name: "Ventilador Torre",
          domain: "fan",
          state: "on",
          attributes: { percentage: 75, oscillating: true },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(device);
    expect(info.brand).toBe("Govee");
    expect(info.model).toBe("H7133");
    expect(info.isTowerFan).toBe(true);
    expect(info.subtype).toBe("tower_fan");
    expect(info.category).toBe("Ventilador de Torre");
  });

  it("detects Tapo L530 smart bulb accurately", () => {
    const device: DeviceRecord = {
      id: "dev_tapo_bulb",
      name: "Tapo L530 Bombilla Color",
      manufacturer: "TP-Link",
      model: "L530E",
      area: "Recámara",
      entities: [
        {
          entityId: "light.tapo_l530_light",
          name: "Luz Recámara",
          domain: "light",
          state: "on",
          attributes: { brightness: 200, color_temp_kelvin: 2700 },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(device);
    expect(info.brand).toBe("Tapo");
    expect(info.model).toBe("L530E");
    expect(info.subtype).toBe("bulb");
    expect(info.category).toBe("Bombilla Inteligente");
  });

  it("detects Roborock robot vacuum accurately", () => {
    const device: DeviceRecord = {
      id: "dev_roborock",
      name: "Roborock S8 Pro Ultra",
      manufacturer: "Roborock",
      model: "S8 Pro Ultra",
      area: "Toda la Casa",
      entities: [
        {
          entityId: "vacuum.roborock_s8",
          name: "Roborock S8",
          domain: "vacuum",
          state: "cleaning",
          attributes: { battery_level: 95 },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(device);
    expect(info.brand).toBe("Roborock");
    expect(info.model).toContain("S8");
    expect(info.subtype).toBe("vacuum");
    expect(info.category).toBe("Aspiradora Robot");
  });

  it("detects ceiling fan with light (composite) accurately", () => {
    const device: DeviceRecord = {
      id: "dev_ceiling_fan",
      name: "Ventilador de Sala",
      manufacturer: "",
      model: "",
      area: "Sala",
      entities: [
        {
          entityId: "fan.ventilador_de_sala",
          name: "Ventilador",
          domain: "fan",
          state: "on",
          attributes: { percentage: 60 },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
        {
          entityId: "light.ventilador_de_sala_luz",
          name: "Luz",
          domain: "light",
          state: "on",
          attributes: { brightness: 255, color_temp_kelvin: 3500 },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(device);
    expect(info.isCeilingFan).toBe(true);
    expect(info.subtype).toBe("ceiling_fan");
    expect(info.category).toBe("Ventilador de Techo con Luz");
  });

  it("detects Govee RGBIC strip accurately", () => {
    const device: DeviceRecord = {
      id: "dev_govee_strip",
      name: "Govee Neon Rope H618A",
      manufacturer: "Govee",
      model: "H618A",
      area: "Estudio",
      entities: [
        {
          entityId: "light.govee_neon",
          name: "Tira Neón",
          domain: "light",
          state: "on",
          attributes: { rgb_color: [0, 240, 255] },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(device);
    expect(info.brand).toBe("Govee");
    expect(info.model).toBe("H618A");
    expect(info.isLedStrip).toBe(true);
    expect(info.subtype).toBe("led_strip");
    expect(info.category).toBe("Tira LED RGBIC / Neón");
  });
});

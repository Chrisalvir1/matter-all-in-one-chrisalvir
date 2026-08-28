import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { HumidifierEntity } from "../src/entities/humidifier.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";

const platform = {
  matterbridge: { matterbridgeVersion: "3.10.0" },
  log: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
  },
  ha: {
    callService: vi.fn().mockResolvedValue(undefined),
    hassEntities: new Map([
      [
        "humidifier.aroma_diffuser",
        { id: "entity-diffuser", device_id: "device-diffuser" },
      ],
    ]),
    hassDevices: new Map([
      ["device-diffuser", { serial_number: "DIFFUSER-REAL-SN" }],
    ]),
  },
};

function diffuserState(attributes: Record<string, unknown> = {}) {
  return {
    entity_id: "humidifier.aroma_diffuser",
    state: "on",
    attributes: {
      friendly_name: "Aroma Diffuser",
      min_humidity: 0,
      max_humidity: 100,
      humidity: 50,
      mode: "manual",
      available_modes: ["manual", "auto", "low", "high"],
      ...attributes,
    },
    last_changed: "",
    last_updated: "",
  } as any;
}

describe("HumidifierEntity diffuser vapor & mode controls", () => {
  it("maps slider 10% to set_humidity on humidity-based diffusers", async () => {
    const entity = new HumidifierEntity(
      platform as any,
      diffuserState({ available_modes: [] }),
      MatterDeviceTypes.fan,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    // Slide to 10%
    await endpoint.invokeAttributeChange(514, "percentSetting", 10);
    await new Promise((r) => setTimeout(r, 60));
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "humidifier",
      "set_humidity",
      "humidifier.aroma_diffuser",
      {
        humidity: 10,
      },
    );

    // Slide to 0% (turn off)
    await endpoint.invokeAttributeChange(514, "percentSetting", 0);
    await new Promise((r) => setTimeout(r, 60));
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "humidifier",
      "turn_off",
      "humidifier.aroma_diffuser",
    );
  });

  it("maps slider to mode for mode-based diffusers without humidity range", async () => {
    const entity = new HumidifierEntity(
      platform as any,
      diffuserState({
        humidity: undefined,
        min_humidity: undefined,
        max_humidity: undefined,
        available_modes: ["low", "high"],
      }),
      MatterDeviceTypes.fan,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    // Slide to 10% -> maps to 'low'
    await endpoint.invokeAttributeChange(514, "percentSetting", 10);
    await new Promise((r) => setTimeout(r, 60));
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "humidifier",
      "set_mode",
      "humidifier.aroma_diffuser",
      {
        mode: "low",
      },
    );

    // Slide to 90% -> maps to 'high'
    await endpoint.invokeAttributeChange(514, "percentSetting", 90);
    await new Promise((r) => setTimeout(r, 60));
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "humidifier",
      "set_mode",
      "humidifier.aroma_diffuser",
      {
        mode: "high",
      },
    );
  });

  it("handles fanMode writes (Auto vs Manual) via set_mode", async () => {
    const entity = new HumidifierEntity(
      platform as any,
      diffuserState(),
      MatterDeviceTypes.fan,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    // Select Auto (fanMode 5)
    await endpoint.invokeAttributeChange(514, "fanMode", 5);
    await new Promise((r) => setTimeout(r, 60));
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "humidifier",
      "set_mode",
      "humidifier.aroma_diffuser",
      {
        mode: "auto",
      },
    );

    // Select Manual (fanMode 4)
    await endpoint.invokeAttributeChange(514, "fanMode", 4);
    await new Promise((r) => setTimeout(r, 60));
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "humidifier",
      "set_mode",
      "humidifier.aroma_diffuser",
      {
        mode: "manual",
      },
    );
  });
});

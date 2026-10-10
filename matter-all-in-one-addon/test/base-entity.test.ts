import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { ColorControl, LevelControl } from "matterbridge/matter/clusters";
import { BaseEntity } from "../src/entities/base.entity.js";
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
        "light.govee_test",
        { id: "entity-govee-test", device_id: "device-govee-test" },
      ],
    ]),
    hassDevices: new Map([
      ["device-govee-test", { serial_number: "GOVEE-H6076-REAL-SN" }],
    ]),
  },
};

function state(attributes: Record<string, unknown>) {
  return {
    entity_id: "light.govee_test",
    state: "on",
    attributes: { friendly_name: "Govee Test", ...attributes },
    last_changed: "",
    last_updated: "",
  } as any;
}

describe("BaseEntity direct colour lights", () => {
  it("uses the physical HA serial and the bridge manufacturer in Matter Basic Information", async () => {
    const entity = new BaseEntity(
      platform as any,
      state({ supported_color_modes: ["brightness"] }),
      MatterDeviceTypes.dimmableLight,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    expect(endpoint.serialNumber).toBe("GOVEE-H6076-REAL-SN");
    expect(endpoint.vendorName).toBe("Matter All-in-One Chrisalvir");
  });

  it("publishes ColorControl, mirrors HA hue/saturation, and sends Matter colour commands to HA", async () => {
    const entity = new BaseEntity(
      platform as any,
      state({
        brightness: 128,
        color_mode: "hs",
        hs_color: [120, 50],
        supported_color_modes: ["hs", "color_temp"],
        min_color_temp_kelvin: 2700,
        max_color_temp_kelvin: 6500,
      }),
      MatterDeviceTypes.extendedColorLight,
    );

    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint.clusterServers.has(ColorControl.id)).toBe(true);
    expect(endpoint.clusterServers.has(LevelControl.id)).toBe(true);
    await entity.syncInitialState();
    expect(endpoint.attributes.get(`${ColorControl.id}:currentHue`)).toBe(85);
    expect(
      endpoint.attributes.get(`${ColorControl.id}:currentSaturation`),
    ).toBe(127);

    await endpoint.invokeCommand("moveToHueAndSaturation", {
      hue: 127,
      saturation: 254,
    });
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "light",
      "turn_on",
      "light.govee_test",
      { hs_color: [180, 100] },
    );

    await endpoint.invokeCommand("moveToColorTemperature", {
      colorTemperatureMireds: 250,
    });
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "light",
      "turn_on",
      "light.govee_test",
      {
        color_temp_kelvin: 4000,
      },
    );
  });

  it("maps Matter XY colour commands to Home Assistant XY coordinates", async () => {
    const entity = new BaseEntity(
      platform as any,
      state({
        color_mode: "xy",
        xy_color: [0.3, 0.4],
        supported_color_modes: ["xy"],
      }),
      MatterDeviceTypes.extendedColorLight,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await endpoint.invokeCommand("moveToColor", {
      colorX: 32768,
      colorY: 16384,
    });
    expect(platform.ha.callService).toHaveBeenLastCalledWith(
      "light",
      "turn_on",
      "light.govee_test",
      {
        xy_color: [32768 / 65536, 16384 / 65536],
      },
    );
  });
});

describe("BaseEntity fan devices (On/Off vs MultiSpeed)", () => {
  it("creates default FanControl server for pure On/Off fans and does not call set_percentage", async () => {
    const onOffFanState = {
      entity_id: "fan.oficina_apagador_oficina",
      state: "off",
      attributes: {
        friendly_name: "Apagador Oficina Fan",
        supported_features: 0,
      },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new BaseEntity(
      platform as any,
      onOffFanState,
      MatterDeviceTypes.fan,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    // Turn ON via Matter command
    await endpoint.invokeCommand("on");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "fan",
      "turn_on",
      "fan.oficina_apagador_oficina",
    );

    // Simulate HA state update: turned ON with no percentage
    await entity.updateState({
      ...onOffFanState,
      state: "on",
      attributes: {
        friendly_name: "Apagador Oficina Fan",
        supported_features: 0,
      },
    });

    // Verify it did NOT send a false turn_off or set_percentage
    expect(platform.ha.callService).not.toHaveBeenCalledWith(
      "fan",
      "set_percentage",
      expect.anything(),
      expect.anything(),
    );
    expect(platform.ha.callService).not.toHaveBeenCalledWith(
      "fan",
      "turn_off",
      "fan.oficina_apagador_oficina",
    );
  });

  it("handles multi-speed fans and calls set_percentage only when speed is supported", async () => {
    const speedFanState = {
      entity_id: "fan.ceiling_speed_fan",
      state: "on",
      attributes: {
        friendly_name: "Ceiling Fan",
        supported_features: 1,
        percentage: 50,
      },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new BaseEntity(
      platform as any,
      speedFanState,
      MatterDeviceTypes.fan,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    // Simulate Matter percentSetting change from HomeKit
    await endpoint.invokeAttributeChange(0x0202, "percentSetting", 83.33);
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "fan",
      "set_percentage",
      "fan.ceiling_speed_fan",
      {
        percentage: 83.33,
      },
    );
  });

  it("clears onOff attribute and sets reachability to false when entity is set inactive", async () => {
    const light = new BaseEntity(
      platform as any,
      state({ supported_color_modes: ["brightness"] }),
      MatterDeviceTypes.dimmableLight,
    );
    const endpoint = (await light.createEndpoint()) as any;
    endpoint.setAttribute(0x0006, "onOff", true);
    expect(endpoint.getAttribute(0x0006, "onOff")).toBe(true);

    await light.setInactiveState();
    await light.setReachability(false);

    expect(endpoint.getAttribute(0x0006, "onOff")).toBe(true);
  });

  it("syncInitialState sets reachability to false and clears onOff when initialized unavailable", async () => {
    const unavailableState = {
      entity_id: "light.govee_test",
      state: "unavailable",
      attributes: { friendly_name: "Govee Test Offline" },
      last_changed: "",
      last_updated: "",
    } as any;

    const light = new BaseEntity(
      platform as any,
      unavailableState,
      MatterDeviceTypes.dimmableLight,
    );
    const endpoint = (await light.createEndpoint()) as any;
    endpoint.setAttribute(0x0006, "onOff", true);

    await light.syncInitialState();

    expect(endpoint.getAttribute(0x0006, "onOff")).toBe(true);
  });

  it("adoptEndpoint updates softwareVersionString to current Matterbridge version and registers command handlers", async () => {
    const platformWithNewVersion = {
      ...platform,
      matterbridge: { matterbridgeVersion: "3.10.13" },
    };
    const entity = new BaseEntity(
      platformWithNewVersion as any,
      state({ supported_color_modes: ["hs"] }),
      MatterDeviceTypes.extendedColorLight,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    // Simulate stale retained endpoint from version 3.10.11
    endpoint.softwareVersionString = "Matter 1.6.1 · Matterbridge 3.10.11";

    entity.adoptEndpoint(endpoint);

    expect(endpoint.softwareVersionString).toBe("Matter 1.6.1 · Matterbridge 3.10.13");

    // Verify toggle handler is available and functions
    await endpoint.invokeCommand("toggle");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "light",
      "turn_off",
      "light.govee_test",
    );
  });

  it("handles enhancedMoveToHueAndSaturation command and sends converted HS color to HA", async () => {
    const entity = new BaseEntity(
      platform as any,
      state({
        color_mode: "hs",
        supported_color_modes: ["hs"],
      }),
      MatterDeviceTypes.extendedColorLight,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await endpoint.invokeCommand("enhancedMoveToHueAndSaturation", {
      enhancedHue: 32768, // 180 degrees
      saturation: 254, // 100%
    });

    expect(platform.ha.callService).toHaveBeenCalledWith(
      "light",
      "turn_on",
      "light.govee_test",
      { hs_color: [180, 100] },
    );
  });

  it("handles color temperature commands for RGB-only Govee lights by synthesizing RGB/HS", async () => {
    const entity = new BaseEntity(
      platform as any,
      state({
        color_mode: "rgb",
        supported_color_modes: ["rgb"], // RGB only, no color_temp in modes!
      }),
      MatterDeviceTypes.extendedColorLight,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await endpoint.invokeCommand("moveToColorTemperature", {
      colorTemperatureMireds: 370, // ~2700K warm white
    });

    expect(platform.ha.callService).toHaveBeenCalledWith(
      "light",
      "turn_on",
      "light.govee_test",
      expect.objectContaining({
        rgb_color: expect.arrayContaining([expect.any(Number), expect.any(Number), expect.any(Number)]),
      }),
    );
  });
});


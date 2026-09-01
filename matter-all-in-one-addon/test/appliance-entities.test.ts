import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { CooktopEntity } from "../src/entities/cooktop.entity.js";
import { OvenEntity } from "../src/entities/oven.entity.js";
import { SoilSensorEntity } from "../src/entities/soil_sensor.entity.js";
import { PetFeederEntity } from "../src/entities/pet_feeder.entity.js";
import { EnergyTariffEntity } from "../src/entities/energy_tariff.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";

const platform = {
  matterbridge: { matterbridgeVersion: "3.10.7" },
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
      ["switch.stove", { id: "e-cooktop", device_id: "d-cooktop" }],
      ["climate.oven", { id: "e-oven", device_id: "d-oven" }],
      ["sensor.plant_moisture", { id: "e-soil", device_id: "d-soil" }],
      ["button.feeder_feed", { id: "e-feeder", device_id: "d-feeder" }],
      ["sensor.energy_price", { id: "e-tariff", device_id: "d-tariff" }],
    ]),
    hassDevices: new Map([
      ["d-cooktop", { serial_number: "COOKTOP-123" }],
      ["d-oven", { serial_number: "OVEN-456" }],
      ["d-soil", { serial_number: "SOIL-789" }],
      ["d-feeder", { serial_number: "FEEDER-321" }],
      ["d-tariff", { serial_number: "TARIFF-654" }],
    ]),
  },
};

describe("CooktopEntity", () => {
  it("creates Cooktop endpoint with surface and syncs cooking state", async () => {
    const state = {
      entity_id: "switch.stove",
      state: "on",
      attributes: { friendly_name: "Smart Cooktop" },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new CooktopEntity(platform as any, state, {
      code: 0x0078,
      name: "cooktop",
    } as any);
    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint).toBeDefined();
    expect(entity.surface).toBeDefined();

    // Initial state sync
    await entity.updateState(state, true);
    expect(entity.surface.attributes.get("onOff:onOff")).toBe(true);

    // State turned off
    await entity.updateState({ ...state, state: "off" });
    expect(entity.surface.attributes.get("onOff:onOff")).toBe(false);
  });
});

describe("OvenEntity", () => {
  it("creates Oven endpoint with cabinet and updates state", async () => {
    const state = {
      entity_id: "climate.oven",
      state: "heat",
      attributes: {
        friendly_name: "Smart Oven",
        current_temperature: 175,
        temperature: 180,
      },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new OvenEntity(platform as any, state, {
      code: 0x007b,
      name: "oven",
    } as any);
    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint).toBeDefined();
    expect(entity.cabinet).toBeDefined();

    await entity.updateState(state, true);
    expect(entity.endpoint).toBeDefined();
  });
});

describe("SoilSensorEntity", () => {
  it("converts moisture percentage to hundredths of percent", async () => {
    const state = {
      entity_id: "sensor.plant_moisture",
      state: "45.5",
      attributes: {
        friendly_name: "Plant Moisture",
        device_class: "moisture",
      },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new SoilSensorEntity(
      platform as any,
      state,
      MatterDeviceTypes.humiditySensor,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await entity.updateState(state, true);
    // 45.5 * 100 = 4550
    expect(endpoint.getAttribute(0x0405, "measuredValue")).toBe(4550);
  });

  it("converts temperature to hundredths of Celsius", async () => {
    const state = {
      entity_id: "sensor.plant_temperature",
      state: "22.3",
      attributes: {
        friendly_name: "Soil Temperature",
        device_class: "temperature",
      },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new SoilSensorEntity(
      platform as any,
      state,
      MatterDeviceTypes.temperatureSensor,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await entity.updateState(state, false);
    // 22.3 * 100 = 2230
    expect(endpoint.getAttribute(0x0402, "measuredValue")).toBe(2230);
  });
});

describe("PetFeederEntity", () => {
  it("triggers button.press when on command is sent for button entity", async () => {
    const state = {
      entity_id: "button.feeder_feed",
      state: "unknown",
      attributes: { friendly_name: "Pet Feeder Dispense" },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new PetFeederEntity(
      platform as any,
      state,
      MatterDeviceTypes.onOffPlugInUnit,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await endpoint.invokeCommand("on");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "button",
      "press",
      "button.feeder_feed",
    );
  });

  it("triggers switch.turn_on and switch.turn_off for switch feeder", async () => {
    const state = {
      entity_id: "switch.feeder_feed",
      state: "off",
      attributes: { friendly_name: "Pet Feeder Switch" },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new PetFeederEntity(
      platform as any,
      state,
      MatterDeviceTypes.onOffPlugInUnit,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    await endpoint.invokeCommand("on");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "switch",
      "turn_on",
      "switch.feeder_feed",
    );

    await endpoint.invokeCommand("off");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "switch",
      "turn_off",
      "switch.feeder_feed",
    );
  });
});

describe("EnergyTariffEntity", () => {
  it("creates EnergyTariff endpoint and required clusters", async () => {
    const state = {
      entity_id: "sensor.energy_price",
      state: "0.18",
      attributes: { friendly_name: "Electricity Tariff" },
      last_changed: "",
      last_updated: "",
    } as any;

    const entity = new EnergyTariffEntity(platform as any, state, {
      code: 0x00a0,
      name: "energyTariff",
    } as any);
    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint).toBeDefined();

    await entity.updateState(state);
    expect(entity.state.state).toBe("0.18");
  });
});

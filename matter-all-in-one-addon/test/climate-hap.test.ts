import { describe, expect, it, vi } from "vitest";
import { Categories, Characteristic, Service } from "@homebridge/hap-nodejs";
import {
  HapGenericAccessory,
  HAP_PROFILE_LABELS,
  type HapAccessoryRecord,
} from "../src/hap/hap-generic-accessory.js";

function acFixture(
  callService: ReturnType<typeof vi.fn>,
  profile: "heater_cooler" | "thermostat_hap" = "heater_cooler",
) {
  const entityId = "climate.bedroom_ac";
  const state = {
    entity_id: entityId,
    state: "cool",
    attributes: {
      friendly_name: "Bedroom AC",
      current_temperature: 25,
      temperature: 22,
      min_temp: 16,
      max_temp: 30,
      hvac_modes: ["off", "cool", "heat", "auto"],
      hvac_action: "cooling",
      fan_modes: ["low", "medium", "high", "auto"],
      fan_mode: "medium",
      swing_modes: ["off", "vertical"],
      swing_mode: "vertical",
      temperature_unit: "°C",
    },
  };
  const platform: any = {
    entities: new Map([[entityId, { state }]]),
    ha: {
      connected: true,
      hassStates: new Map([[entityId, state]]),
      hassEntities: new Map(),
      callService,
    },
    log: { info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
    recordEntityCommandFailure: vi.fn(),
  };

  const accessory = new HapGenericAccessory(platform, entityId, {
    entityId,
    hapProfile: profile,
    name: "Bedroom AC",
    pincode: "123-45-678",
    port: 52125,
    username: "1A:2B:3C:4D:5E:6F",
    setupId: "AC01",
    published: false,
  } as HapAccessoryRecord);

  return { platform, accessory, entityId, state };
}

describe("HAP HeaterCooler & Thermostat for Air Conditioners", () => {
  it("creates HeaterCooler accessory with AIR_CONDITIONER category and required characteristics", () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const { accessory } = acFixture(callService, "heater_cooler");

    expect(accessory.accessory.category).toBe(Categories.AIR_CONDITIONER);
    expect(HAP_PROFILE_LABELS.heater_cooler).toContain("Aire Acondicionado");

    const service = accessory.accessory.getService(Service.HeaterCooler);
    expect(service).toBeDefined();

    expect(service!.testCharacteristic(Characteristic.Active)).toBe(true);
    expect(
      service!.testCharacteristic(Characteristic.CurrentHeaterCoolerState),
    ).toBe(true);
    expect(
      service!.testCharacteristic(Characteristic.TargetHeaterCoolerState),
    ).toBe(true);
    expect(service!.testCharacteristic(Characteristic.CurrentTemperature)).toBe(
      true,
    );
    expect(
      service!.testCharacteristic(Characteristic.CoolingThresholdTemperature),
    ).toBe(true);
    expect(
      service!.testCharacteristic(Characteristic.HeatingThresholdTemperature),
    ).toBe(true);
    expect(service!.testCharacteristic(Characteristic.RotationSpeed)).toBe(
      true,
    );
    expect(service!.testCharacteristic(Characteristic.SwingMode)).toBe(true);
  });

  it("reads and synchronizes HeaterCooler states from Home Assistant", () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const { accessory, entityId } = acFixture(callService, "heater_cooler");
    const service = accessory.accessory.getService(Service.HeaterCooler)!;

    // Trigger updateFromHassState with new state
    const newState = {
      entity_id: entityId,
      state: "cool",
      attributes: {
        current_temperature: 23.5,
        temperature: 21,
        hvac_action: "cooling",
        fan_modes: ["low", "medium", "high", "auto"],
        fan_mode: "high", // 3rd of 4 -> 75%
        swing_mode: "vertical",
      },
    };

    accessory.updateFromHassState(newState);

    expect(service.getCharacteristic(Characteristic.Active).value).toBe(1);
    expect(
      service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).value,
    ).toBe(3); // COOLING
    expect(
      service.getCharacteristic(Characteristic.TargetHeaterCoolerState).value,
    ).toBe(2); // COOL
    expect(
      service.getCharacteristic(Characteristic.CurrentTemperature).value,
    ).toBe(23.5);
    expect(
      service.getCharacteristic(Characteristic.CoolingThresholdTemperature)
        .value,
    ).toBe(21);
    expect(service.getCharacteristic(Characteristic.RotationSpeed).value).toBe(
      75,
    );
    expect(service.getCharacteristic(Characteristic.SwingMode).value).toBe(1); // Enabled
  });

  it("dispatches Home Assistant service calls when characteristics are set in HomeKit", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const { accessory, entityId } = acFixture(callService, "heater_cooler");
    const service = accessory.accessory.getService(Service.HeaterCooler)!;

    // Change target temperature to 20°C
    await service
      .getCharacteristic(Characteristic.CoolingThresholdTemperature)
      .handleSetRequest(20);
    expect(callService).toHaveBeenCalledWith(
      "climate",
      "set_temperature",
      entityId,
      { temperature: 20 },
    );

    // Change Target State to Heat (1)
    await service
      .getCharacteristic(Characteristic.TargetHeaterCoolerState)
      .handleSetRequest(1);
    expect(callService).toHaveBeenCalledWith(
      "climate",
      "set_hvac_mode",
      entityId,
      { hvac_mode: "heat" },
    );

    // Change Fan speed to 100% -> "high" or "auto"
    await service
      .getCharacteristic(Characteristic.RotationSpeed)
      .handleSetRequest(100);
    expect(callService).toHaveBeenCalledWith(
      "climate",
      "set_fan_mode",
      entityId,
      { fan_mode: "auto" },
    );

    // Change SwingMode to 0 (disabled)
    await service
      .getCharacteristic(Characteristic.SwingMode)
      .handleSetRequest(0);
    expect(callService).toHaveBeenCalledWith(
      "climate",
      "set_swing_mode",
      entityId,
      { swing_mode: "off" },
    );

    // Turn off
    await service.getCharacteristic(Characteristic.Active).handleSetRequest(0);
    expect(callService).toHaveBeenCalledWith(
      "climate",
      "set_hvac_mode",
      entityId,
      { hvac_mode: "off" },
    );
  });

  it("creates and synchronizes Thermostat HAP accessory", async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const { accessory, entityId } = acFixture(callService, "thermostat_hap");
    const service = accessory.accessory.getService(Service.Thermostat)!;

    expect(accessory.accessory.category).toBe(Categories.THERMOSTAT);
    expect(service).toBeDefined();

    // Set temperature via HomeKit
    await service
      .getCharacteristic(Characteristic.TargetTemperature)
      .handleSetRequest(23);
    expect(callService).toHaveBeenCalledWith(
      "climate",
      "set_temperature",
      entityId,
      { temperature: 23 },
    );

    // Update from HA
    accessory.updateFromHassState({
      entity_id: entityId,
      state: "heat",
      attributes: {
        current_temperature: 19,
        temperature: 24,
        hvac_action: "heating",
      },
    });

    expect(
      service.getCharacteristic(Characteristic.CurrentTemperature).value,
    ).toBe(19);
    expect(
      service.getCharacteristic(Characteristic.TargetTemperature).value,
    ).toBe(24);
    expect(
      service.getCharacteristic(Characteristic.CurrentHeatingCoolingState)
        .value,
    ).toBe(1); // HEAT
    expect(
      service.getCharacteristic(Characteristic.TargetHeatingCoolingState).value,
    ).toBe(1); // HEAT
  });
});

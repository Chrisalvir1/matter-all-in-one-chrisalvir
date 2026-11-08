import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { ClimateEntity } from "../src/entities/climate.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import { Thermostat } from "matterbridge/matter/clusters";

const platform = {
  matterbridge: { matterbridgeVersion: "3.11.1" },
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
      ["climate.living_room_ac", { id: "entity-ac", device_id: "device-ac" }],
    ]),
    hassDevices: new Map([["device-ac", { serial_number: "AC-SERIAL-1234" }]]),
  },
};

function acState(attributes: Record<string, unknown> = {}, state = "cool") {
  return {
    entity_id: "climate.living_room_ac",
    state,
    attributes: {
      friendly_name: "Living Room AC",
      current_temperature: 24,
      temperature: 22,
      min_temp: 16,
      max_temp: 30,
      hvac_modes: ["off", "cool", "heat", "auto"],
      hvac_action: "cooling",
      fan_modes: ["low", "medium", "high", "auto"],
      fan_mode: "medium",
      swing_modes: ["off", "vertical"],
      swing_mode: "off",
      ...attributes,
    },
    last_changed: "",
    last_updated: "",
  } as any;
}

describe("ClimateEntity (Matter AC / Thermostat)", () => {
  it("creates endpoint with Thermostat cluster servers and initializes temperatures", async () => {
    const entity = new ClimateEntity(
      platform as any,
      acState(),
      MatterDeviceTypes.thermostat,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint.clusterServers.has(Thermostat.id)).toBe(true);

    await entity.syncInitialState();
    expect(endpoint.getAttribute(Thermostat.id, "localTemperature")).toBe(2400);
    expect(
      endpoint.getAttribute(Thermostat.id, "occupiedCoolingSetpoint"),
    ).toBe(2200);
    expect(endpoint.getAttribute(Thermostat.id, "systemMode")).toBe(3); // Cool
  });

  it("updates Matter attributes when Home Assistant state changes", async () => {
    const entity = new ClimateEntity(
      platform as any,
      acState(),
      MatterDeviceTypes.thermostat,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    const updatedState = acState(
      {
        current_temperature: 21.5,
        temperature: 20,
        hvac_action: "heating",
      },
      "heat",
    );

    await entity.updateState(updatedState);

    expect(endpoint.getAttribute(Thermostat.id, "localTemperature")).toBe(2150);
    expect(
      endpoint.getAttribute(Thermostat.id, "occupiedHeatingSetpoint"),
    ).toBe(2000);
    expect(endpoint.getAttribute(Thermostat.id, "systemMode")).toBe(4); // Heat
  });

  it("dispatches service calls to Home Assistant when Matter attributes are changed", async () => {
    const entity = new ClimateEntity(
      platform as any,
      acState(),
      MatterDeviceTypes.thermostat,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    // Controller changes cooling setpoint to 2300 (23°C)
    await endpoint.invokeAttributeChange(
      Thermostat.id,
      "occupiedCoolingSetpoint",
      2300,
    );
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "climate",
      "set_temperature",
      "climate.living_room_ac",
      { temperature: 23 },
    );

    // Controller changes systemMode to 0 (Off)
    await endpoint.invokeAttributeChange(Thermostat.id, "systemMode", 0);
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "climate",
      "set_hvac_mode",
      "climate.living_room_ac",
      { hvac_mode: "off" },
    );
  });

  it("handles setpointRaiseLower command correctly", async () => {
    const entity = new ClimateEntity(
      platform as any,
      acState({ temperature: 22 }),
      MatterDeviceTypes.thermostat,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    const handler = endpoint.commandHandlers.get("setpointRaiseLower");
    expect(handler).toBeDefined();

    // Raise by 1.0 degree (amount = 10 in tenths of degree)
    await handler({ request: { amount: 10 } });
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "climate",
      "set_temperature",
      "climate.living_room_ac",
      { temperature: 23 },
    );
  });
});

it("sends both HA setpoints when changing a Matter range", async () => {
  const entity = new ClimateEntity(
    platform as any,
    acState(
      { temperature: undefined, target_temp_low: 19, target_temp_high: 26 },
      "heat_cool",
    ),
    MatterDeviceTypes.thermostat,
  );
  const endpoint = (await entity.createEndpoint()) as any;
  await entity.syncInitialState();
  expect(endpoint.getAttribute(Thermostat.id, "occupiedHeatingSetpoint")).toBe(
    1900,
  );
  expect(endpoint.getAttribute(Thermostat.id, "occupiedCoolingSetpoint")).toBe(
    2600,
  );
  await endpoint.invokeAttributeChange(
    Thermostat.id,
    "occupiedCoolingSetpoint",
    2500,
  );
  expect(platform.ha.callService).toHaveBeenLastCalledWith(
    "climate",
    "set_temperature",
    "climate.living_room_ac",
    { target_temp_low: 19, target_temp_high: 25 },
  );
  const handler = endpoint.commandHandlers.get("setpointRaiseLower");
  await handler({
    request: { mode: Thermostat.SetpointRaiseLowerMode.Both, amount: 10 },
  });
  expect(platform.ha.callService).toHaveBeenLastCalledWith(
    "climate",
    "set_temperature",
    "climate.living_room_ac",
    { target_temp_low: 20, target_temp_high: 27 },
  );
});

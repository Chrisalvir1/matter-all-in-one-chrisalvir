// Regression coverage for defects reproduced against tag v2.3.16.
import { afterEach, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { HomeAssistant } from "../src/homeAssistant.js";
import { ClosureEntity } from "../src/entities/closure.entity.js";
import { BaseEntity } from "../src/entities/base.entity.js";
import { LockEntity } from "../src/entities/lock.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import { HapGenericAccessory } from "../src/hap/hap-generic-accessory.js";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import { sensorConverter } from "../src/converters/sensor.converter.js";

const state = (id: string, value: string, attributes: any = {}) =>
  ({
    entity_id: id,
    state: value,
    attributes,
    last_changed: "",
    last_updated: "",
  }) as any;
function platform(s: any) {
  return {
    matterbridge: { matterbridgeVersion: "3.11.2" },
    entities: new Map([[s.entity_id, { state: s }]]),
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      notice: vi.fn(),
    },
    ha: {
      connected: true,
      hassStates: new Map([[s.entity_id, s]]),
      hassEntities: new Map(),
      hassDevices: new Map(),
      callService: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}
afterEach(() => vi.useRealTimers());
it("Regression: latest dimmer value replaces queued intermediate values", async () => {
  vi.useFakeTimers();
  const ha = new HomeAssistant("ws://127.0.0.1:1", "audit", 0, 0);
  const calls: number[] = [];
  (ha as any).request = async (p: any) => {
    calls.push(p.service_data.brightness);
    await new Promise((r) => setTimeout(r, 200));
    return { success: true, result: {} };
  };
  const pending = Array.from({ length: 10 }, (_, i) =>
    ha.callService("light", "turn_on", "light.audit", {
      brightness: (i + 1) * 20,
    }),
  );
  await vi.advanceTimersByTimeAsync(1999);
  expect(calls).toEqual([200]);
  await vi.advanceTimersByTimeAsync(1);
  await Promise.all(pending);
});
it("Regression: real wrapped Matter cover request reaches HA", async () => {
  const s = state("cover.audit", "open", { current_position: 50 });
  const p = platform(s);
  const e = new ClosureEntity(p, s, MatterDeviceTypes.windowCovering);
  const ep: any = await e.createEndpoint();
  await ep.invokeCommand("goToLiftPercentage", {
    request: { liftPercent100thsValue: 3000 },
  });
  expect(p.ha.callService).toHaveBeenCalledWith(
    "cover",
    "set_cover_position",
    "cover.audit",
    { position: 70 },
  );
});
it("Regression: pressure sensor synchronizes its measurement", async () => {
  const s = state("sensor.pressure", "1013", {
    device_class: "pressure",
    unit_of_measurement: "hPa",
  });
  const p = platform(s);
  const e = new BaseEntity(p, s, MatterDeviceTypes.pressureSensor);
  const ep: any = await e.createEndpoint();
  ep.hasAttributeServer = (id: number) => id === 0x0403;
  await e.updateState(s, true);
  expect(ep.getAttribute(0x0403, "measuredValue")).toBe(1013);
});
it("Regression: jammed lock is not presented as unlocked", async () => {
  const s = state("lock.audit", "locked");
  const p = platform(s);
  const e = new LockEntity(p, s, MatterDeviceTypes.doorLock);
  const ep: any = await e.createEndpoint();
  await e.updateState(state("lock.audit", "jammed"));
  expect(ep.getAttribute(0x0101, "lockState")).toBe(0);
});
function hap(s: any, profile: string) {
  const p = platform(s);
  const a = new HapGenericAccessory(p, s.entity_id, {
    entityId: s.entity_id,
    hapProfile: profile,
    name: "Audit",
    pincode: "123-45-678",
    port: 52125,
    username: "AA:BB:CC:DD:EE:13",
    setupId: "ABCD",
    published: false,
  } as any);
  return { p, a };
}
it("Regression: HAP cover target reaches HA", async () => {
  const { p, a } = hap(
    state("cover.audit", "open", { current_position: 50 }),
    "window_covering_hap",
  );
  const target = a.accessory
    .getService(Service.WindowCovering)!
    .getCharacteristic(Characteristic.TargetPosition);
  await target.handleSetRequest(80);
  expect(p.ha.callService).toHaveBeenCalledWith(
    "cover",
    "set_cover_position",
    "cover.audit",
    { position: 80 },
  );
});
it("Regression: HAP lock target reaches HA", async () => {
  const { p, a } = hap(state("lock.audit", "locked"), "lock_hap");
  await a.accessory
    .getService(Service.LockMechanism)!
    .getCharacteristic(Characteristic.LockTargetState)
    .handleSetRequest(0);
  expect(p.ha.callService).toHaveBeenCalledWith(
    "lock",
    "unlock",
    "lock.audit",
    undefined,
  );
});
it("Regression: HAP primary temperature follows HA", () => {
  const { a } = hap(
    state("sensor.audit", "7", { device_class: "temperature" }),
    "temperature_sensor_hap",
  );
  a.updateFromHassState(
    state("sensor.audit", "9", { device_class: "temperature" }),
  );
  expect(
    a.accessory
      .getService(Service.TemperatureSensor)!
      .getCharacteristic(Characteristic.CurrentTemperature).value,
  ).toBe(9);
});
it("Regression: sensor conversion handles Fahrenheit and moderate air", () => {
  expect(
    sensorConverter.toTemperature(
      state("sensor.t", "68", { unit_of_measurement: "°F" }),
    ),
  ).toBe(2000);
  expect(sensorConverter.toAirQuality(state("sensor.air", "moderate"))).toBe(3);
});

import { MqttEntity } from "../src/mqtt/mqtt.entity.js";
function mqttEntity(component: string, config: any) {
  const s = state("sensor.audit", "0");
  const p = platform(s);
  const e = new MqttEntity(
    p,
    { publish: vi.fn(), deviceStates: new Map() } as any,
    {
      topic: "homeassistant/audit/config",
      component,
      objectId: "audit",
      config: {
        name: "Audit",
        unique_id: "audit",
        state_topic: "audit/state",
        ...config,
      },
    } as any,
  );
  const writes: any[] = [];
  e.endpoint = {
    hasAttributeServer: () => true,
    setAttribute: (...args: any[]) => {
      writes.push(args);
    },
  } as any;
  return { e, writes };
}
it("Regression: MQTT LOCK command is not interpreted as confirmed feedback", () => {
  const { e, writes } = mqttEntity("lock", {});
  e.handleStateUpdate("LOCK");
  expect(writes.find((x) => x[1] === "lockState")).toBeUndefined();
});
it("Regression: MQTT illuminance and pressure states update their measurements", () => {
  for (const device_class of ["illuminance", "pressure"]) {
    const { e, writes } = mqttEntity("sensor", { device_class });
    e.handleStateUpdate("1020");
    expect(writes).toHaveLength(1);
  }
});
it("Regression: dehumidifier exposes its own threshold writer", () => {
  const { a } = hap(
    state("humidifier.audit", "on", { humidity: 45 }),
    "dehumidifier",
  );
  const service = a.accessory.getService(Service.HumidifierDehumidifier)!;
  expect(
    (
      service.getCharacteristic(
        Characteristic.RelativeHumidityHumidifierThreshold,
      ) as any
    ).setHandler,
  ).toBeUndefined();
  expect(
    (
      service.getCharacteristic(
        Characteristic.RelativeHumidityDehumidifierThreshold,
      ) as any
    ).setHandler,
  ).toBeDefined();
});

it("keeps discrete off between brightness groups, coalesces pending values and isolates other devices", async () => {
  vi.useFakeTimers();
  const ha = new HomeAssistant("ws://127.0.0.1:1", "test", 0, 0);
  const calls: any[] = [];
  (ha as any).request = async (p: any) => {
    calls.push([p.target.entity_id, p.service, p.service_data]);
    await new Promise((r) => setTimeout(r, 100));
    return { success: true, result: {} };
  };
  const first = ha.callService("light", "turn_on", "light.one", {
    brightness: 10,
  });
  await vi.advanceTimersByTimeAsync(0);
  const second = ha.callService("light", "turn_on", "light.one", {
    brightness: 30,
  });
  const third = ha.callService("light", "turn_on", "light.one", {
    brightness: 90,
  });
  const off = ha.callService("light", "turn_off", "light.one");
  const next = ha.callService("light", "turn_on", "light.one", {
    brightness: 120,
  });
  const other = ha.callService("light", "turn_on", "light.two", {
    brightness: 100,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(calls.map((c) => c[0])).toEqual(["light.one", "light.two"]);
  await vi.advanceTimersByTimeAsync(500);
  await Promise.all([first, second, third, off, next, other]);
  expect(calls.filter((c) => c[0] === "light.one")).toEqual([
    ["light.one", "turn_on", { brightness: 10 }],
    ["light.one", "turn_on", { brightness: 90 }],
    ["light.one", "turn_off", {}],
    ["light.one", "turn_on", { brightness: 120 }],
  ]);
});
it("HAP keeps pairing credentials and UUID through primary sensor synchronization", () => {
  const { a } = hap(
    state("sensor.audit", "-5", { device_class: "temperature" }),
    "temperature_sensor_hap",
  );
  const original = { ...a.record };
  a.updateFromHassState(
    state("sensor.audit", "7", { device_class: "temperature" }),
  );
  for (const key of ["uuid", "port", "pincode", "username", "setupId"])
    expect((a.record as any)[key]).toBe((original as any)[key]);
  expect(
    a.accessory
      .getService(Service.TemperatureSensor)!
      .getCharacteristic(Characteristic.CurrentTemperature).value,
  ).toBe(7);
});
it("HAP lock preserves its last confirmed state while unavailable", () => {
  const { a } = hap(state("lock.audit", "locked"), "lock_hap");
  a.updateFromHassState(state("lock.audit", "unavailable"));
  expect(
    a.accessory
      .getService(Service.LockMechanism)!
      .getCharacteristic(Characteristic.LockCurrentState).value,
  ).toBe(1);
});
it("cover open, close and stop invoke the distinct HA services", async () => {
  const s = state("cover.audit", "open", { current_position: 50 });
  const p = platform(s);
  const e = new ClosureEntity(p, s, MatterDeviceTypes.windowCovering);
  const ep: any = await e.createEndpoint();
  for (const cmd of ["upOrOpen", "downOrClose", "stopMotion"])
    await ep.invokeCommand(cmd, {});
  expect(p.ha.callService.mock.calls.map((x: any) => x[1])).toEqual([
    "open_cover",
    "close_cover",
    "stop_cover",
  ]);
});
import { ClimateEntity } from "../src/entities/climate.entity.js";
it("Matter thermostat converts Fahrenheit both directions", async () => {
  const s = state("climate.audit", "cool", {
    current_temperature: 68,
    temperature: 77,
    min_temp: 50,
    max_temp: 95,
    temperature_unit: "°F",
    hvac_modes: ["off", "cool"],
  });
  const p = platform(s);
  const e = new ClimateEntity(p, s, MatterDeviceTypes.thermostat);
  const ep: any = await e.createEndpoint();
  await e.updateState(s, true);
  expect(ep.getAttribute(0x0201, "localTemperature")).toBe(2000);
  await ep.invokeAttributeChange(0x0201, "occupiedCoolingSetpoint", 2500);
  await Promise.resolve();
  await Promise.resolve();
  expect(p.ha.callService).toHaveBeenCalledWith(
    "climate",
    "set_temperature",
    "climate.audit",
    { temperature: 77 },
  );
});
import { EnergyTariffEntity } from "../src/entities/energy_tariff.entity.js";
it("energy distinguishes megawatts from milliwatts", async () => {
  for (const [unit, expected] of [
    ["MW", 1000000000],
    ["mW", 1],
  ] as const) {
    const s = state("sensor.audit", "1", {
      device_class: "power",
      unit_of_measurement: unit,
    });
    const p = platform(s);
    const e = new EnergyTariffEntity(p, s, MatterDeviceTypes.electricalSensor);
    const ep: any = await e.createEndpoint();
    await e.updateState(s, true);
    expect(ep.getAttribute(0x0090, "activePower")).toBe(expected);
  }
});

import { MockMatterbridgeEndpoint } from "./mocks/matterbridge.mock.js";
it("restores MQTT command handlers on the retained endpoint without changing identity", async () => {
  const s = state("switch.audit", "off");
  const p = platform(s);
  const publish = vi.fn();
  const e = new MqttEntity(
    p,
    { publish, publishCommand: publish, deviceStates: new Map() } as any,
    {
      topic: "homeassistant/switch/audit/config",
      component: "switch",
      objectId: "audit",
      config: {
        name: "Audit",
        unique_id: "audit",
        command_topic: "audit/set",
        state_topic: "audit/state",
      },
    } as any,
  );
  await e.createEndpoint();
  const retained = new MockMatterbridgeEndpoint(
    [MatterDeviceTypes.onOffPlugInUnit],
    {},
  ) as any;
  retained.uniqueId = "retained";
  retained.serialNumber = "retained-serial";
  e.adoptEndpoint(retained);
  await retained.invokeCommand("on", {});
  expect(publish).toHaveBeenCalledWith("audit/set", "ON");
  expect(retained.uniqueId).toBe("retained");
  expect(retained.serialNumber).toBe("retained-serial");
});
it("a closed HA contact is true in Matter and reopening is immediately false", async () => {
  const s = state("binary_sensor.audit", "off", { device_class: "door" });
  const p = platform(s);
  const e = new BaseEntity(p, s, MatterDeviceTypes.contactSensor);
  const ep: any = await e.createEndpoint();
  ep.hasAttributeServer = (id: number) => id === 0x0045;
  await e.updateState(s, true);
  expect(ep.getAttribute(0x0045, "stateValue")).toBe(true);
  await e.updateState({ ...s, state: "on" });
  expect(ep.getAttribute(0x0045, "stateValue")).toBe(false);
  await e.updateState(s);
  expect(ep.getAttribute(0x0045, "stateValue")).toBe(true);
});

import { MqttClientManager } from "../src/mqtt/mqtt-client.js";
it("MQTT command delivery rejects a disconnected broker and a failed acknowledgement", async () => {
  const manager = new MqttClientManager(
    platform(state("switch.audit", "off")).log,
    { host: "localhost" },
  );
  await expect(manager.publishCommand("audit/set", "ON")).rejects.toThrow(
    "unavailable",
  );
  (manager as any).client = {
    connected: true,
    publish: (_t: any, _m: any, _o: any, callback: any) =>
      callback(new Error("broker denied")),
  };
  await expect(manager.publishCommand("audit/set", "ON")).rejects.toThrow(
    "broker denied",
  );
});
it("MQTT command acknowledgement has a bounded wait", async () => {
  vi.useFakeTimers();
  const manager = new MqttClientManager(
    platform(state("switch.audit", "off")).log,
    { host: "localhost" },
  );
  (manager as any).client = { connected: true, publish: vi.fn() };
  const result = expect(
    manager.publishCommand("audit/set", "ON"),
  ).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(5000);
  await result;
});

it("HAP irrigation uses valve services and confirms open feedback", async () => {
  const { p, a } = hap(state("valve.audit", "open"), "irrigation_system");
  const service = a.accessory.getService(Service.IrrigationSystem)!;
  expect(service.getCharacteristic(Characteristic.InUse).value).toBe(1);
  await service.getCharacteristic(Characteristic.Active).handleSetRequest(0);
  expect(p.ha.callService).toHaveBeenCalledWith(
    "valve",
    "close_valve",
    "valve.audit",
    undefined,
  );
});

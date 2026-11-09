import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  setupTest,
  resetTest,
  createTestEnvironment,
  destroyTestEnvironment,
  createServerNode,
  flushServerNode,
  addBridgedEndpoint,
} from "matterbridge/test-utils/vitest";
import { BaseEntity } from "../src/entities/base.entity.js";
import { ClosureEntity } from "../src/entities/closure.entity.js";
import { CompositeDeviceEntity } from "../src/entities/composite-device.entity.js";
import { LockEntity } from "../src/entities/lock.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import type { HomeAssistantPlatform } from "../src/platform.js";
import type { HassState } from "../src/utils/ha-state.js";

// Deliberately use real Matterbridge endpoints, not the unit-test mock.
const platform = {
  matterbridge: { matterbridgeVersion: "3.11.2" },
  log: Object.fromEntries(
    ["debug", "info", "notice", "warn", "error"].map((key) => [key, vi.fn()]),
  ),
  ha: { callService: vi.fn(), hassEntities: new Map(), hassDevices: new Map() },
} as unknown as HomeAssistantPlatform;
const realEntities = new Map<string, BaseEntity>();
let aggregator: Awaited<ReturnType<typeof createServerNode>>[1];

describe("Matterbridge 3.11 real bridged endpoint conformance", () => {
  beforeAll(async () => {
    await setupTest("MiaoConformance311");
    await createTestEnvironment("strict");
    [, aggregator] = await createServerNode(5590);
  });
  afterAll(async () => {
    await flushServerNode();
    await destroyTestEnvironment();
    (resetTest as any)?.();
  });

  it.each([
    ["light.onoff", MatterDeviceTypes.onOffLight, {}],
    [
      "light.dimmer",
      MatterDeviceTypes.dimmableLight,
      { brightness: 128, supported_color_modes: ["brightness"] },
    ],
    [
      "light.color",
      MatterDeviceTypes.extendedColorLight,
      { brightness: 128, supported_color_modes: ["hs"], hs_color: [180, 50] },
    ],
    [
      "light.white",
      MatterDeviceTypes.colorTemperatureLight,
      {
        brightness: 128,
        supported_color_modes: ["color_temp"],
        color_temp_kelvin: 4000,
      },
    ],
    [
      "fan.speed",
      MatterDeviceTypes.fan,
      { percentage: 50, supported_features: 1 },
    ],
    [
      "sensor.humidity",
      MatterDeviceTypes.humiditySensor,
      { device_class: "humidity" },
    ],
    ["switch.outlet", MatterDeviceTypes.onOffPlugInUnit, {}],
    [
      "sensor.temperature",
      MatterDeviceTypes.temperatureSensor,
      { device_class: "temperature", unit_of_measurement: "°C" },
    ],
    [
      "binary_sensor.contact",
      MatterDeviceTypes.contactSensor,
      { device_class: "door" },
    ],
    [
      "binary_sensor.motion",
      MatterDeviceTypes.occupancySensor,
      { device_class: "motion" },
    ],
    [
      "cover.blind",
      MatterDeviceTypes.windowCovering,
      { current_position: 50, supported_features: 15 },
    ],
    ["lock.front", MatterDeviceTypes.doorLock, {}],
  ] as const)(
    "initializes %s under strict validation",
    async (entityId, deviceType, attributes) => {
      const state = {
        entity_id: entityId,
        state: entityId.startsWith("lock.") ? "locked" : "off",
        attributes: { friendly_name: entityId, ...attributes },
      } as HassState;
      const Entity = entityId.startsWith("lock.")
        ? LockEntity
        : entityId.startsWith("cover.")
          ? ClosureEntity
          : BaseEntity;
      const entity = new Entity(platform, state, deviceType);
      const endpoint = await entity.createEndpoint();
      realEntities.set(entityId, entity);
      expect(await addBridgedEndpoint(aggregator, endpoint)).toBe(true);
      expect(endpoint.lifecycle.isReady).toBe(true);
    },
  );
  it.each([
    [
      "sensor.pressure_audit",
      MatterDeviceTypes.pressureSensor,
      "pressure",
      "hPa",
      "1012",
      0x0403,
      1012,
    ],
    [
      "sensor.lux_audit",
      MatterDeviceTypes.lightSensor,
      "illuminance",
      "lx",
      "100",
      0x0400,
      20001,
    ],
    [
      "sensor.fahrenheit_audit",
      MatterDeviceTypes.temperatureSensor,
      "temperature",
      "°F",
      "68",
      0x0402,
      2000,
    ],
  ] as const)(
    "reports the correct real Matter measurement for %s",
    async (id, type, dc, unit, value, cluster, expected) => {
      const state = {
        entity_id: id,
        state: value,
        attributes: {
          friendly_name: id,
          device_class: dc,
          unit_of_measurement: unit,
        },
      } as HassState;
      const entity =
        realEntities.get("sensor.temperature") && dc === "temperature"
          ? realEntities.get("sensor.temperature")!
          : new BaseEntity(platform, state, type);
      const fresh = !entity.endpoint;
      const endpoint = fresh ? await entity.createEndpoint() : entity.endpoint;
      if (fresh)
        expect(await addBridgedEndpoint(aggregator, endpoint)).toBe(true);
      await entity.updateState(state, true);
      expect(endpoint.getAttribute(cluster as any, "measuredValue")).toBe(
        expected,
      );
    },
  );
  it("uses hundredths for the position reported to a real Matter cover", async () => {
    const state = {
      entity_id: "cover.position_audit",
      state: "open",
      attributes: {
        friendly_name: "Cover audit",
        current_position: 70,
        supported_features: 15,
      },
    } as HassState;
    const entity = realEntities.get("cover.blind")!;
    const endpoint = entity.endpoint;
    await entity.updateState(state, true);
    expect(
      endpoint.getAttribute(0x0102 as any, "currentPositionLiftPercent100ths"),
    ).toBe(3000);
  });
  it("initializes a composite outlet and contact sensor under strict validation", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "outlet-contact",
      "Outlet Contact",
      [
        {
          entityId: "switch.composite",
          state: {
            entity_id: "switch.composite",
            state: "off",
            attributes: {},
          } as HassState,
        },
        {
          entityId: "binary_sensor.composite",
          state: {
            entity_id: "binary_sensor.composite",
            state: "off",
            attributes: { device_class: "door" },
          } as HassState,
        },
      ],
    );
    const endpoint = await composite.createEndpoint();
    expect(endpoint).toBeDefined();
    expect(endpoint.id).toBe("device_outlet-contact");
    expect(composite.endpoints.size).toBe(2);
  });
});

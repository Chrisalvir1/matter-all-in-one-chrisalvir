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
  matterbridge: { matterbridgeVersion: "3.11.0" },
  log: Object.fromEntries(
    ["debug", "info", "notice", "warn", "error"].map((key) => [key, vi.fn()]),
  ),
  ha: { callService: vi.fn(), hassEntities: new Map(), hassDevices: new Map() },
} as unknown as HomeAssistantPlatform;
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
      expect(await addBridgedEndpoint(aggregator, endpoint)).toBe(true);
      expect(endpoint.lifecycle.isReady).toBe(true);
    },
  );
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

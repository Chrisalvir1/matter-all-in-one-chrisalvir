import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";
import net from "node:net";
import "./mocks/matterbridge.mock.js";
import "./mocks/ha-api.mock.js";
import { HomeAssistantPlatform } from "../src/platform.js";
import { mockMatterbridge, mockLog } from "./mocks/matterbridge.mock.js";

/** True when the OS allows binding a TCP server on loopback (false in sandboxed runners). */
let networkAvailable = false;
beforeAll(async () => {
  networkAvailable = await new Promise<boolean>((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(0, "127.0.0.1", () => s.close(() => resolve(true)));
  });
});

describe("HomeAssistantPlatform", () => {
  let platform: HomeAssistantPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    platform = new HomeAssistantPlatform(
      mockMatterbridge as any,
      mockLog as any,
      {
        name: "test-platform",
        type: "dynamic",
        host: "localhost",
        token: "fake-token",
      } as any,
    );
    // Use an OS-assigned ephemeral port in tests to avoid port conflicts and
    // EPERM errors in sandboxed / CI environments that restrict binding to 8285.
    (platform as any)._uiPort = 0;
  });

  afterEach(async () => {
    await platform.onShutdown("test-teardown");
  });

  it("should initialize and connect to Home Assistant", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    expect(platform.ha.connected).toBe(true);
  });

  it("should discover and register devices", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    // Simulate connection event triggering discovery
    platform.ha.emit("connected", "2026.6.0");

    // Wait for async discovery and registration to settle
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(platform.entities.size).toBeGreaterThan(0);
    expect(platform.entities.has("light.living_room")).toBe(true);
    expect(platform.entities.has("cover.garage_door")).toBe(true);
    expect(platform.entities.has("camera.backyard")).toBe(false);
    expect(platform.entities.has("sensor.garden_moisture")).toBe(true);
  });

  it.each(["unknown", "unavailable"])(
    "keeps a standalone Broadlink switch discoverable when its initial state is %s",
    async (initialState) => {
      if (!networkAvailable) return;
      await platform.onStart();
      const entityId = "switch.omni_broadlink_robot_limpiador";
      await (platform as any).registerHAEntity({
        entity_id: entityId,
        state: initialState,
        attributes: { friendly_name: "ROBOT LIMPIADOR" },
        last_changed: "now",
        last_updated: "now",
      });

      const entity = platform.entities.get(entityId);
      expect(entity).toBeDefined();
      expect(entity?.state.state).toBe(initialState);
      expect(entity?.state.attributes.friendly_name).toBe("ROBOT LIMPIADOR");
    },
  );

  it("refreshes a newly-created Omni Broadlink robot as an RVC in the devices API", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    const entityId = "switch.omni_broadlink_robot_limpiador";
    (platform as any).ha.hassStates.set(entityId, {
      entity_id: entityId,
      state: "off",
      attributes: { friendly_name: "EVERYBOT IRCEDGE ROBOT LIMPIADOR" },
      last_changed: "now",
      last_updated: "now",
    });

    const response = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/devices`,
    );
    const devices = (await response.json()) as any[];
    expect(
      devices.find((device) => device.entityId === entityId),
    ).toMatchObject({
      matterType: "roboticVacuumCleaner",
      deviceTypeLabel: "RoboticVacuumCleaner",
      profileId: "roboticVacuumCleaner",
    });
  });

  it("should expose Home Assistant device registry metadata in the custom devices API", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    platform.ha.emit("connected", "2026.6.0");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/devices`,
    );
    expect(res.ok).toBe(true);

    const devices = (await res.json()) as any[];
    const livingRoomLight = devices.find(
      (device) => device.entityId === "light.living_room",
    );

    expect(livingRoomLight).toMatchObject({
      device_id: "device-light-1",
      device_name: "Living Room Lamp",
      area_name: "Living Room",
      entity_registry_id: "entity-light-1",
      platform: "mock",
    });
  });

  it("treats existing Matter fabrics as commissioned even when legacy state is stale", () => {
    const connection = (platform as any).getMatterConnectionInfo({
      serverNode: {
        state: {
          commissioning: {
            commissioned: false,
            fabrics: { 1: { label: "Casa principal" } },
          },
        },
      },
    });

    expect(connection).toMatchObject({
      commissioned: true,
      homeName: "Casa principal",
      fabricCount: 1,
    });
  });

  it("uses current operational credential fabrics when compatibility state has not refreshed yet", () => {
    const connection = (platform as any).getMatterConnectionInfo({
      serverNode: {
        state: {
          commissioning: { commissioned: false, fabrics: [] },
          operationalCredentials: {
            fabrics: [
              {
                label: "Casa Matter",
                vendorId: 0x6006,
                fabricId: 123n,
                fabricIndex: 1,
              },
            ],
          },
        },
      },
    });

    expect(connection).toMatchObject({
      commissioned: true,
      homeName: "Casa Matter",
      fabricCount: 1,
    });
    expect(connection.fabrics).toEqual([
      expect.objectContaining({
        label: "Casa Matter",
        controller: "Google Home",
        vendorId: 0x6006,
        fabricId: "123",
        fabricIndex: "1",
      }),
    ]);
  });

  it("shows an accessory as unpaired when HomeKit removes its final live Matter fabric", () => {
    const connection = (platform as any).getMatterConnectionInfo({
      serverNode: {
        state: {
          commissioning: {
            commissioned: true,
            fabrics: [{ label: "Casa antigua" }],
          },
          operationalCredentials: { fabrics: [] },
        },
      },
    });

    expect(connection).toMatchObject({
      commissioned: false,
      homeName: null,
      fabricCount: 0,
    });
  });

  it("records the real Matter fabric transition without inventing a manual-removal cause", () => {
    const recordDiagnostic = vi.spyOn(
      platform as any,
      "recordEntityDiagnostic",
    );
    const paired = {
      commissioned: true,
      controllerNames: ["Apple Home"],
      homeName: "Apple Home",
      fabricCount: 1,
      pairingCode: null,
      manualPairingCode: null,
    };
    const unpaired = {
      ...paired,
      commissioned: false,
      controllerNames: [],
      homeName: null,
      fabricCount: 0,
    };

    (platform as any).observeMatterConnection("light.living_room", paired);
    (platform as any).observeMatterConnection("light.living_room", unpaired);

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        "Matter confirmó que se eliminó el último fabric",
      ),
    );
    expect(recordDiagnostic).toHaveBeenCalledWith(
      "light.living_room",
      expect.stringContaining(
        "Matter no informa si la retirada fue manual o automática",
      ),
      "warning",
    );
  });

  it("classifies an HA 502 as an HA or proxy response, not a network outage", () => {
    expect(
      (platform as any).describeHomeAssistantConnectionFailure(
        "WebSocket error: Unexpected server response: 502",
      ),
    ).toContain("respondió HTTP 502");
  });

  it("keeps a commissioned legacy endpoint visible while its composite replacement is not ready", () => {
    const legacyEndpoint = {
      serverNode: {
        state: {
          commissioning: {
            commissioned: true,
            fabrics: [{ label: "El Chante" }],
          },
        },
      },
    };
    (platform as any).matterbridgeDevices.set(
      "lock.front_door",
      legacyEndpoint,
    );
    (platform as any).matterbridgeDevices.set("device:front-door", {});

    expect(
      (platform as any).getMatterEndpointForEntity(
        "binary_sensor.front_door_contact",
        "front-door",
        "lock.front_door",
      ),
    ).toBe(legacyEndpoint);
  });

  it("reuses an already registered Matter endpoint instead of creating a duplicate after reconnect", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    platform.ha.emit("connected", "2026.6.0");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const existingEndpoint = {
      uniqueId: "light_living_room",
      deviceName: "Living Room Lamp",
      serverNode: { state: { commissioning: { commissioned: true } } },
    };
    (platform as any).getDeviceByUniqueId = vi
      .fn()
      .mockReturnValue(existingEndpoint);
    const entity = (platform as any).entities.get("light.living_room");
    const initialSync = vi.spyOn(entity, "syncInitialState");

    await (platform as any).activateEntity("light.living_room");

    expect((platform as any).matterbridgeDevices.get("light.living_room")).toBe(
      existingEndpoint,
    );
    expect(initialSync).toHaveBeenCalledOnce();
  });

  it("marks fan and light sharing a device_id as one composite before either is activated", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/devices`,
    );
    const devices = (await res.json()) as any[];
    const fan = devices.find((device) => device.entityId === "fan.ceiling_fan");
    const light = devices.find(
      (device) => device.entityId === "light.ceiling_fan_light",
    );

    expect(fan).toMatchObject({
      composite: true,
      compositeActive: false,
      compositeDeviceId: "device-ceiling-fan-1",
      compositePrimaryEntityId: "fan.ceiling_fan",
      exported: false,
    });
    expect(light).toMatchObject({
      composite: true,
      compositeActive: false,
      compositeDeviceId: "device-ceiling-fan-1",
      compositePrimaryEntityId: "fan.ceiling_fan",
      exported: false,
    });
  });

  it("allows explicit composite groups to include fan and light from different HA device_ids", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    const groupedPlatform = new HomeAssistantPlatform(
      mockMatterbridge as any,
      mockLog as any,
      {
        name: "test-platform",
        type: "dynamic",
        host: "localhost",
        token: "fake-token",
        devices: [
          {
            device_id: "device-guest-fan-group",
            primary_entity: "fan.guest_fan",
            include_entities: ["fan.guest_fan", "light.guest_fan_light"],
          },
        ],
      } as any,
    );
    (groupedPlatform as any)._uiPort = 0;

    try {
      await groupedPlatform.onStart();
      // Let the startup snapshot finish before injecting registry entries;
      // otherwise reconciliation can correctly remove this synthetic state.
      await new Promise((resolve) => setTimeout(resolve, 100));
      groupedPlatform.ha.hassEntities.set("fan.guest_fan", {
        id: "entity-guest-fan",
        entity_id: "fan.guest_fan",
        device_id: "device-guest-fan",
        platform: "mock",
      });
      groupedPlatform.ha.hassEntities.set("light.guest_fan_light", {
        id: "entity-guest-fan-light",
        entity_id: "light.guest_fan_light",
        device_id: "device-guest-light",
        platform: "mock",
      });
      await (groupedPlatform as any).registerHAEntity({
        entity_id: "fan.guest_fan",
        state: "on",
        attributes: { friendly_name: "Guest Fan", percentage: 50 },
      });
      await (groupedPlatform as any).registerHAEntity({
        entity_id: "light.guest_fan_light",
        state: "on",
        attributes: {
          friendly_name: "Guest Fan Light",
          brightness: 120,
          supported_color_modes: ["brightness"],
        },
      });

      const res = await fetch(
        `http://127.0.0.1:${groupedPlatform.uiServerPort}/api/custom/devices`,
      );
      const devices = (await res.json()) as any[];
      const fan = devices.find((device) => device.entityId === "fan.guest_fan");
      const light = devices.find(
        (device) => device.entityId === "light.guest_fan_light",
      );

      expect(fan).toMatchObject({
        composite: true,
        compositeDeviceId: "device-guest-fan-group",
        compositePrimaryEntityId: "fan.guest_fan",
      });
      expect(light).toMatchObject({
        composite: true,
        compositeDeviceId: "device-guest-fan-group",
        compositePrimaryEntityId: "fan.guest_fan",
        matterType: "dimmableLight",
      });
    } finally {
      await groupedPlatform.onShutdown("test-teardown");
    }
  });

  it("uses the HA lock entity as the primary Matter accessory for SwitchBot-style lock devices", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const res = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/devices`,
    );
    const devices = (await res.json()) as any[];
    const lock = devices.find(
      (device) => device.entityId === "lock.llavin_switchbot",
    );
    const contact = devices.find(
      (device) => device.entityId === "binary_sensor.llavin_switchbot_contact",
    );

    expect(lock).toMatchObject({
      composite: true,
      compositeActive: false,
      compositeDeviceId: "device-switchbot-lock-1",
      compositePrimaryEntityId: "lock.llavin_switchbot",
      matterType: "doorLock",
      exported: false,
    });
    expect(contact).toMatchObject({
      composite: true,
      compositeActive: false,
      compositeDeviceId: "device-switchbot-lock-1",
      compositePrimaryEntityId: "lock.llavin_switchbot",
      matterType: "contactSensor",
      exported: false,
    });
  });

  it("should fail closed for unsafe or incomplete Matter mappings", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();

    const unsafeStates = [
      {
        entity_id: "binary_sensor.connectivity_status",
        state: "off",
        attributes: { device_class: "connectivity" },
      },
      {
        entity_id: "sensor.water_pressure",
        state: "1013",
        attributes: { device_class: "pressure" },
      },
      {
        entity_id: "sensor.energy_price",
        state: "0.25",
        attributes: { device_class: "monetary" },
      },
      { entity_id: "camera.backyard", state: "recording", attributes: {} },
      {
        entity_id: "alarm_control_panel.home",
        state: "disarmed",
        attributes: {},
      },
    ];

    for (const state of unsafeStates)
      await (platform as any).registerHAEntity(state);

    for (const state of unsafeStates)
      expect(platform.entities.has(state.entity_id)).toBe(false);
  });

  it("should update entities state when a HA event occurs", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    platform.ha.emit("connected", "2026.6.0");
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lightEntity = platform.entities.get("light.living_room");
    expect(lightEntity).toBeDefined();

    // Trigger state change event
    platform.ha.emit("event", "device-1", "light.living_room", null, {
      entity_id: "light.living_room",
      state: "off",
      attributes: {
        friendly_name: "Living Room Light",
        brightness: 0,
      },
      last_changed: "now",
      last_updated: "now",
    });

    expect(lightEntity!.state.state).toBe("off");
  });

  it("preserves the last valid Matter state while a HA entity is unavailable", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lightEntity = platform.entities.get("light.living_room")!;
    platform.exportedDevices.add("light.living_room");
    const updateState = vi
      .spyOn(lightEntity, "updateState")
      .mockResolvedValue();

    (platform as any).handleEntityStateChange("light.living_room", {
      entity_id: "light.living_room",
      state: "unavailable",
      attributes: { friendly_name: "Living Room Light" },
      last_changed: "now",
      last_updated: "now",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(updateState).not.toHaveBeenCalled();
    expect(lightEntity.state.state).toBe("unavailable");

    (platform as any).handleEntityStateChange("light.living_room", {
      entity_id: "light.living_room",
      state: "on",
      attributes: { friendly_name: "Living Room Light", brightness: 180 },
      last_changed: "now",
      last_updated: "now",
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(updateState).toHaveBeenCalledOnce();
    expect(updateState.mock.calls[0][0].state).toBe("on");
  });

  it("identifies a multi-gang switch with a fan channel as a multi-switch device", async (ctx) => {
    if (!networkAvailable) return;
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Register Tuya multi-gang controller entities: 1 fan + 3 switches under device 'device-oficina-1'
    platform.ha.hassEntities.set("fan.oficina_apagador_oficina", {
      id: "entity-oficina-fan",
      entity_id: "fan.oficina_apagador_oficina",
      device_id: "device-oficina-1",
      platform: "tuya",
    });
    platform.ha.hassEntities.set("switch.apagador_salon", {
      id: "entity-oficina-sw1",
      entity_id: "switch.apagador_salon",
      device_id: "device-oficina-1",
      platform: "tuya",
    });
    platform.ha.hassEntities.set("switch.apagador_oficina_2", {
      id: "entity-oficina-sw2",
      entity_id: "switch.apagador_oficina_2",
      device_id: "device-oficina-1",
      platform: "tuya",
    });

    await (platform as any).registerHAEntity({
      entity_id: "fan.oficina_apagador_oficina",
      state: "off",
      attributes: { friendly_name: "Apagador oficina Canal 1", supported_features: 0 },
    });
    await (platform as any).registerHAEntity({
      entity_id: "switch.apagador_salon",
      state: "off",
      attributes: { friendly_name: "Apagador oficina Canal 2" },
    });
    await (platform as any).registerHAEntity({
      entity_id: "switch.apagador_oficina_2",
      state: "off",
      attributes: { friendly_name: "Apagador oficina Canal 3" },
    });

    expect(platform.isMultiSwitchDevice("device-oficina-1")).toBe(true);

    const res = await fetch(`http://127.0.0.1:${platform.uiServerPort}/api/custom/devices`);
    const devices = (await res.json()) as any[];
    const fanDev = devices.find((d) => d.entityId === "fan.oficina_apagador_oficina");
    const swDev = devices.find((d) => d.entityId === "switch.apagador_salon");

    // Must NOT be grouped as composite; each button is independent!
    expect(fanDev?.composite).toBe(false);
    expect(swDev?.composite).toBe(false);
  });

  it("allows setting profile override on entities", async (ctx) => {
    if (!networkAvailable) return;
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    platform.ha.hassEntities.set("switch.living_room_fan_switch", {
      id: "entity-fan-sw",
      entity_id: "switch.living_room_fan_switch",
      device_id: "device-fan-sw",
      platform: "mock",
    });

    await (platform as any).registerHAEntity({
      entity_id: "switch.living_room_fan_switch",
      state: "off",
      attributes: { friendly_name: "Fan Switch" },
    });

    const result = await platform.setDeviceProfile("switch.living_room_fan_switch", "fan");
    expect(result.success).toBe(true);
    expect(platform.deviceOverrides["switch.living_room_fan_switch"]).toBe("fan");
  });
});

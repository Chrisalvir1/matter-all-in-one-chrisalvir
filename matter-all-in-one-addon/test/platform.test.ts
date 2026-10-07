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
import { CameraUiStorage } from "../src/camera/cameraui/cameraui-storage.js";

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
    // Platform tests exercise HA/Matter registration. Do not let the host's
    // persisted Camera.UI cameras publish HAP listeners during those tests.
    // This is test isolation only; production storage and HAP behavior remain
    // untouched.
    vi.spyOn(CameraUiStorage, "load").mockResolvedValue({
      config: { ...CameraUiStorage.getDefaultStore().config, enabled: false },
      cameras: [],
    });
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
    expect(platform.entities.has("camera.backyard")).toBe(true);
    expect(platform.entities.has("sensor.garden_moisture")).toBe(true);
  });

  it("refreshes the HA snapshot and Matter endpoints from the UI action", async () => {
    (platform as any).ha = { connected: true, close: vi.fn() };
    const discover = vi
      .spyOn(platform as any, "discoverAndSync")
      .mockResolvedValue(true);
    const forceSync = vi
      .spyOn(platform as any, "forceSyncAllEntities")
      .mockResolvedValue(undefined);
    vi.spyOn(platform as any, "broadcastSseMessage").mockImplementation(() => {});

    const result = await platform.refreshHomeAssistantDevices();

    expect(discover).toHaveBeenCalledOnce();
    expect(forceSync).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true, entities: 0 });
  });

  it("returns a clear error when a device refresh is requested while HA is disconnected", async () => {
    (platform as any).ha = { connected: false, close: vi.fn() };
    const discover = vi.spyOn(platform as any, "discoverAndSync");

    await expect(platform.refreshHomeAssistantDevices()).rejects.toThrow(
      "Home Assistant is not connected",
    );
    expect(discover).not.toHaveBeenCalled();
  });

  it("marks an accessory unreachable and records a Matter command failure", async () => {
    const entityId = "switch.command_failure";
    const setReachability = vi.fn().mockResolvedValue(undefined);
    platform.entities.set(entityId, { setReachability } as any);
    const recordFailure = vi.spyOn(platform, "recordEntityCommandFailure");
    const endpoint = {
      commandHandler: {
        executeHandler: vi.fn().mockRejectedValue(new Error("HA rejected command")),
      },
    };
    (platform as any).installMatterCommandResponsePolicy(endpoint, entityId);

    await expect(
      endpoint.commandHandler.executeHandler("OnOff.off"),
    ).rejects.toThrow("HA rejected command");
    await Promise.resolve();

    expect(setReachability).toHaveBeenCalledWith(false);
    expect(recordFailure).toHaveBeenCalledWith(
      entityId,
      expect.stringContaining("HA rejected command"),
    );
  });

  it("exposes the full device refresh through the UI API", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    const refresh = vi
      .spyOn(platform, "refreshHomeAssistantDevices")
      .mockResolvedValue({ success: true, entities: 42 });
    await (platform as any).startUiServer();

    const response = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/sync-devices`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, entities: 42 });
    expect(refresh).toHaveBeenCalledOnce();
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

  it("reads pairing codes from the current Matter.js commissioning behavior", () => {
    const connection = (platform as any).getMatterConnectionInfo({
      serverNode: {
        state: {
          operationalCredentials: { fabrics: [{ label: "Apple Home" }] },
        },
        behaviors: {
          commissioning: {
            state: {
              pairingCodes: {
                qrPairingCode: "MT:Y.K9042C00KA0648G00",
                manualPairingCode: "34970112332",
              },
            },
          },
        },
      },
    });

    expect(connection.pairingCode).toBe("MT:Y.K9042C00KA0648G00");
    expect(connection.manualPairingCode).toBe("34970112332");
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

  it("forwards primary state and attribute changes to a HAP-only alarm export", () => {
    const entityId = "alarm_control_panel.argus_test";
    const entity: any = { state: { state: "arming", attributes: {} } };
    const updateFromHassState = vi.fn();
    platform.entities.set(entityId, entity);
    platform.hapAccessories.set(entityId, { entityId, updateFromHassState } as any);
    vi.spyOn(platform as any, "observeHomeAssistantAvailability").mockReturnValue(false);
    vi.spyOn(platform as any, "isEntityExported").mockReturnValue(false);

    const state = {
      entity_id: entityId,
      state: "arming",
      attributes: {
        argus_arming_transition: true,
        arming_target: "armed_away",
        arming_waiting_for_sensors: true,
      },
    };
    (platform as any).handleEntityStateChange(entityId, state);

    expect(updateFromHassState).toHaveBeenCalledWith(state, entityId);
  });

  it("preserves the last valid Matter state while a HA entity is unavailable", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    if ((platform as any).syncInFlight) {
      await (platform as any).syncInFlight;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!platform.entities.has("light.living_room")) {
      await (platform as any).registerHAEntity({
        entity_id: "light.living_room",
        state: "on",
        attributes: { friendly_name: "Living Room Light", brightness: 200 },
        last_changed: "now",
        last_updated: "now",
      });
    }

    const lightEntity = platform.entities.get("light.living_room");
    expect(lightEntity).toBeDefined();
    platform.exportedDevices.add("light.living_room");
    const updateState = vi
      .spyOn(lightEntity!, "updateState")
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
      attributes: {
        friendly_name: "Apagador oficina Canal 1",
        supported_features: 0,
      },
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

    const res = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/devices`,
    );
    const devices = (await res.json()) as any[];
    const fanDev = devices.find(
      (d) => d.entityId === "fan.oficina_apagador_oficina",
    );
    const swDev = devices.find((d) => d.entityId === "switch.apagador_salon");

    // Must NOT be grouped as composite; each button is independent!
    expect(fanDev?.composite).toBe(false);
    expect(swDev?.composite).toBe(false);
  });

  it("groups ceiling fan with integrated light into a single composite accessory and filters auxiliary switches", async (ctx) => {
    if (!networkAvailable) return;
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Register a ceiling fan device with fan + light + beep switch
    platform.ha.hassDevices.set("device-ventilador-sala-tuya", {
      id: "device-ventilador-sala-tuya",
      name: "VENTILADOR DE SALA",
    });
    platform.ha.hassEntities.set("fan.ventilador_de_sala_main_fan", {
      id: "entity-fan-sala",
      entity_id: "fan.ventilador_de_sala_main_fan",
      device_id: "device-ventilador-sala-tuya",
      platform: "tuya",
    });
    platform.ha.hassEntities.set("light.ventilador_de_sala_light", {
      id: "entity-light-sala",
      entity_id: "light.ventilador_de_sala_light",
      device_id: "device-ventilador-sala-tuya",
      platform: "tuya",
    });
    platform.ha.hassEntities.set(
      "switch.sala_tv_ventilador_de_sala_main_fan_beep",
      {
        id: "entity-switch-sala-beep",
        entity_id: "switch.sala_tv_ventilador_de_sala_main_fan_beep",
        device_id: "device-ventilador-sala-tuya",
        platform: "tuya",
      },
    );

    await (platform as any).registerHAEntity({
      entity_id: "fan.ventilador_de_sala_main_fan",
      state: "off",
      attributes: {
        friendly_name: "VENTILADOR DE SALA Fan",
        supported_features: 1, // percentage
        percentage: 50,
      },
    });
    await (platform as any).registerHAEntity({
      entity_id: "light.ventilador_de_sala_light",
      state: "on",
      attributes: {
        friendly_name: "VENTILADOR DE SALA Light",
        supported_color_modes: ["color_temp"],
        color_mode: "color_temp",
        color_temp_kelvin: 3000,
        min_color_temp_kelvin: 2700,
        max_color_temp_kelvin: 6500,
        brightness: 200,
      },
    });
    await (platform as any).registerHAEntity({
      entity_id: "switch.sala_tv_ventilador_de_sala_main_fan_beep",
      state: "on",
      attributes: {
        friendly_name: "Buzzer",
      },
    });

    // 1. isMultiSwitchDevice should return FALSE for fan with integrated light
    expect(platform.isMultiSwitchDevice("device-ventilador-sala-tuya")).toBe(
      false,
    );

    // 2. getCompositeCandidate should produce a composite candidate with fan + light, excluding auxiliary switches
    const candidate = (platform as any).getCompositeCandidate(
      "fan.ventilador_de_sala_main_fan",
    );
    expect(candidate).toBeDefined();
    expect(candidate.deviceId).toBe("device-ventilador-sala-tuya");
    // Should contain fan and light, but NOT the beep switch
    const memberIds = candidate.members.map((m: any) => m.entityId);
    expect(memberIds).toContain("fan.ventilador_de_sala_main_fan");
    expect(memberIds).toContain("light.ventilador_de_sala_light");
    expect(memberIds).not.toContain(
      "switch.sala_tv_ventilador_de_sala_main_fan_beep",
    );
    // Primary entity (Endpoint 1) should be the fan
    expect(memberIds[0]).toBe("fan.ventilador_de_sala_main_fan");
    expect(memberIds[1]).toBe("light.ventilador_de_sala_light");
  });

  it("classifies RGBIC light strip segments as auxiliary and excludes light strips from multi-switch", async (ctx) => {
    if (!networkAvailable) return;
    await platform.onStart();

    platform.ha.hassDevices.set("device-govee-strip", {
      id: "device-govee-strip",
      name: "Tira larga navidad 2",
      model: "H619C",
      manufacturer: "Govee",
    });

    platform.ha.hassEntities.set("light.tira_larga_navidad_2", {
      id: "entity-main",
      entity_id: "light.tira_larga_navidad_2",
      device_id: "device-govee-strip",
      original_name: "Tira larga navidad 2",
    });

    await (platform as any).registerHAEntity({
      entity_id: "light.tira_larga_navidad_2",
      state: "off",
      attributes: { friendly_name: "Tira larga navidad 2" },
    });

    for (let i = 1; i <= 16; i++) {
      const segId = `light.tira_larga_navidad_2_segment_${i}`;
      platform.ha.hassEntities.set(segId, {
        id: `entity-seg-${i}`,
        entity_id: segId,
        device_id: "device-govee-strip",
        original_name: `Segment ${i}`,
      });
      await (platform as any).registerHAEntity({
        entity_id: segId,
        state: "on",
        attributes: { friendly_name: `Segment ${i}` },
      });
    }

    // Segments must be classified as auxiliary
    expect((platform as any).isAuxiliaryEntity("light.tira_larga_navidad_2_segment_1")).toBe(true);
    expect((platform as any).isAuxiliaryEntity("light.tira_larga_navidad_2_segment_16")).toBe(true);
    expect((platform as any).isAuxiliaryEntity("light.tira_larga_navidad_2")).toBe(false);

    // Light strip must NOT be treated as a multi-switch device
    expect(platform.isMultiSwitchDevice("device-govee-strip")).toBe(false);
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

    const result = await platform.setDeviceProfile(
      "switch.living_room_fan_switch",
      "fan",
    );
    expect(result.success).toBe(true);
    expect(platform.deviceOverrides["switch.living_room_fan_switch"]).toBe(
      "fan",
    );
  });

  it("opens Matter commissioning window for multi-admin pairing", async () => {
    let enterCalled = false;
    const mockEndpoint = {
      serverNode: {
        act: vi
          .fn()
          .mockImplementation(
            async (callback: (agent: any) => Promise<void>) => {
              const agent = {
                commissioning: {
                  enterCommissionableMode: vi
                    .fn()
                    .mockImplementation(async () => {
                      enterCalled = true;
                    }),
                },
              };
              await callback(agent);
            },
          ),
        state: {
          commissioning: {
            pairingCodes: {
              qrPairingCode: "MT:Y.K9042C00KA0648G00",
              manualPairingCode: "34970112332",
            },
            fabrics: [{ label: "Apple Home", vendorId: 0x1349 }],
          },
        },
      },
    };
    (platform as any).matterbridgeDevices.set(
      "light.living_room",
      mockEndpoint,
    );

    const result =
      await platform.openMatterCommissioningWindow("light.living_room");
    expect(result.success).toBe(true);
    expect(result.pairingCode).toBe("MT:Y.K9042C00KA0648G00");
    expect(result.manualPairingCode).toBe("34970112332");
    expect(result.windowTimeout).toBe(900);
    expect(enterCalled).toBe(true);
  });

  it("handles POST /api/custom/open-commissioning/:entityId HTTP endpoint", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const mockEndpoint = {
      serverNode: {
        act: vi
          .fn()
          .mockImplementation(
            async (callback: (agent: any) => Promise<void>) => {
              await callback({
                commissioning: {
                  enterCommissionableMode: vi.fn().mockResolvedValue(undefined),
                },
              });
            },
          ),
        state: {
          commissioning: {
            pairingCodes: {
              qrPairingCode: "MT:Y.K9042C00KA0648G00",
              manualPairingCode: "34970112332",
            },
            fabrics: [{ label: "Apple Home" }],
          },
        },
      },
    };
    (platform as any).matterbridgeDevices.set(
      "light.living_room",
      mockEndpoint,
    );

    const res = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/open-commissioning/light.living_room`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.pairingCode).toBe("MT:Y.K9042C00KA0648G00");
  });

  it("handles POST /api/custom/reset-accessory/:entityId HTTP endpoint cleanly without calling serverNode.erase()", async (ctx) => {
    if (!networkAvailable) {
      ctx.skip();
      return;
    }
    await platform.onStart();
    await new Promise((resolve) => setTimeout(resolve, 100));

    const eraseFn = vi.fn().mockResolvedValue(undefined);
    const closeFn = vi.fn().mockResolvedValue(undefined);
    const startFn = vi.fn().mockResolvedValue(undefined);

    const mockEndpoint = {
      deviceName: "test_fan",
      serverNode: {
        erase: eraseFn,
        close: closeFn,
        lifecycle: { isOnline: true },
      },
    };
    (platform as any).matterbridgeDevices.set("fan.test_fan", mockEndpoint);

    // Mock unregisterDevice and activateEntity
    vi.spyOn(platform as any, "unregisterDevice").mockResolvedValue(undefined);
    vi.spyOn(platform as any, "activateEntity").mockImplementation(async () => {
      const regeneratedEndpoint = {
        deviceName: "test_fan",
        serverNode: {
          lifecycle: { isOnline: true },
          state: {
            commissioning: {
              pairingCodes: {
                qrPairingCode: "MT:Y.K90TEST001",
                manualPairingCode: "12345678901",
              },
              fabrics: [],
            },
          },
        },
      };
      (platform as any).matterbridgeDevices.set(
        "fan.test_fan",
        regeneratedEndpoint,
      );
    });

    const res = await fetch(
      `http://127.0.0.1:${platform.uiServerPort}/api/custom/reset-accessory/fan.test_fan`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.pairingCode).toBe("MT:Y.K90TEST001");
    expect(json.manualPairingCode).toBe("12345678901");
    // Verify serverNode.erase() was NOT called (to avoid double node creation race)
    expect(eraseFn).not.toHaveBeenCalled();
    expect(closeFn).toHaveBeenCalled();
  });

  it("recovers and resets an accessory even if serverNode was not initialized or offline", async () => {
    const entityId = "switch.apagador_oficina_canal_1";
    (platform as any).entities.set(entityId, {
      entityId,
      state: { attributes: { friendly_name: "VENTILADOR OFICINA" } },
    });

    // Stale endpoint without serverNode (e.g. after being unpaired in HomeKit)
    const deadEndpoint = {
      deviceName: "VENTILADOR OFICINA",
      uniqueId: "switch_apagador_oficina_canal_1",
      serverNode: undefined,
    };
    (platform as any).matterbridgeDevices.set(entityId, deadEndpoint);

    vi.spyOn(platform as any, "unregisterDevice").mockResolvedValue(undefined);
    vi.spyOn(platform as any, "activateEntity").mockImplementation(async () => {
      const regeneratedEndpoint = {
        deviceName: "VENTILADOR OFICINA",
        uniqueId: "switch_apagador_oficina_canal_1",
        serverNode: {
          lifecycle: { isOnline: true },
          state: {
            commissioning: {
              pairingCodes: {
                qrPairingCode: "MT:Y.REGEN001",
                manualPairingCode: "34567890123",
              },
              fabrics: [],
            },
          },
        },
      };
      (platform as any).matterbridgeDevices.set(entityId, regeneratedEndpoint);
    });

    const result = await platform.resetMatterAccessory(entityId);
    expect(result.success).toBe(true);
    expect(result.pairingCode).toBe("MT:Y.REGEN001");
    expect(result.manualPairingCode).toBe("34567890123");
  });

  it("prepareEndpointForRegistration unregisters stale matching endpoints and disambiguates names", async () => {
    const staleDevice = {
      deviceName: "PASILLO",
      uniqueId: "switch_apagador_pasillo_old",
      serverNode: {
        lifecycle: { isOnline: true },
        close: vi.fn().mockResolvedValue(undefined),
      },
    };
    const unregSpy = vi.spyOn(platform as any, "unregisterDevice").mockResolvedValue(undefined);
    (platform as any).getDevices = vi.fn().mockReturnValue([staleDevice]);
    (platform as any).hasDeviceName = vi.fn().mockImplementation((name: string) => name === "PASILLO");
    (platform as any).hasDeviceUniqueId = vi.fn().mockReturnValue(false);
    (platform as any).getDeviceByName = vi.fn().mockReturnValue(staleDevice);

    const newEndpoint = {
      deviceName: "PASILLO",
      uniqueId: "switch_apagador_pasillo_new",
      serialNumber: "SN12345",
    };

    await (platform as any).prepareEndpointForRegistration(newEndpoint, "switch.apagador_pasillo_new");

    expect(staleDevice.serverNode.close).toHaveBeenCalled();
    expect(unregSpy).toHaveBeenCalledWith(staleDevice);
    expect(newEndpoint.deviceName).not.toBe("PASILLO");
    expect(newEndpoint.deviceName).toContain("PASILLO");
  });

  it("resets multi-switch button cleanly evicting all matching instances and returning new QR code", async () => {
    const entityId = "switch.controlador_sala_controlador_sala";
    platform.entities.set(entityId, {
      entityId,
      state: {
        entity_id: entityId,
        state: "on",
        attributes: { friendly_name: "Controlador Sala L1" },
      },
    } as any);

    const staleDevice = {
      deviceName: "Controlador Sala L1",
      uniqueId: "switch_controlador_sala_controlador_sala",
      serverNode: {
        lifecycle: { isOnline: true },
        close: vi.fn().mockResolvedValue(undefined),
        resetStorage: vi.fn().mockResolvedValue(undefined),
      },
    };
    (platform as any).matterbridgeDevices.set(entityId, staleDevice);
    const unregSpy = vi.spyOn(platform as any, "unregisterDevice").mockResolvedValue(undefined);

    vi.spyOn(platform as any, "activateEntity").mockImplementation(async () => {
      const freshEndpoint = {
        deviceName: "Controlador Sala L1",
        uniqueId: "switch_controlador_sala_controlador_sala",
        serverNode: {
          lifecycle: { isOnline: true },
          state: {
            commissioning: {
              pairingCodes: {
                qrPairingCode: "MT:Y.FRESH002",
                manualPairingCode: "98765432101",
              },
              fabrics: [],
            },
          },
        },
      };
      (platform as any).matterbridgeDevices.set(entityId, freshEndpoint);
    });

    const result = await platform.resetMatterAccessory(entityId);
    expect(result.success).toBe(true);
    expect(result.pairingCode).toBe("MT:Y.FRESH002");
    expect(result.manualPairingCode).toBe("98765432101");
    expect(unregSpy).toHaveBeenCalledWith(staleDevice);
  });
});

describe("Late accessory restoration does not restart discovery", () => {
  afterEach(() => vi.useRealTimers());

  function restorationFixture() {
    return {
      entities: new Map([["switch.missing", {}], ["sensor.unrelated", {}]]),
      pendingRestore: new Set(["switch.missing"]),
      ha: { connected: true, hassEntities: new Map() },
      restoreExportedDevices: vi.fn().mockResolvedValue(undefined),
      discoverAndSync: vi.fn(),
      log: { warn: vi.fn() },
    } as any;
  }

  it("ignores unrelated state events while an accessory is missing", async () => {
    vi.useFakeTimers();
    const p = restorationFixture();
    (HomeAssistantPlatform.prototype as any).schedulePendingRestore.call(p, "sensor.unrelated");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(p.restoreExportedDevices).not.toHaveBeenCalled();
    expect(p.discoverAndSync).not.toHaveBeenCalled();
  });

  it("restores a late accessory from the received inventory without fetching a full snapshot", async () => {
    vi.useFakeTimers();
    const p = restorationFixture();
    (HomeAssistantPlatform.prototype as any).schedulePendingRestore.call(p, "switch.missing");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(p.restoreExportedDevices).toHaveBeenCalledOnce();
    expect(p.discoverAndSync).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { VacuumEntity } from "../src/entities/vacuum.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";

describe("VacuumEntity Apple Home topology and identity", () => {
  it("includes Omni's linked battery sensor on the single RVC accessory", async () => {
    const entityId = "vacuum.robotina";
    const batteryId = "sensor.robotina_battery";
    const platform = {
      matterbridge: { matterbridgeVersion: "3.11.0" },
      log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map([
          [entityId, { id: "vacuum-entry", device_id: "robotina-device" }],
          [batteryId, { id: "battery-entry", device_id: "robotina-device" }],
        ]),
        hassDevices: new Map(),
        hassStates: new Map([
          [batteryId, {
            entity_id: batteryId,
            state: "73",
            attributes: { device_class: "battery", unit_of_measurement: "%" },
          }],
        ]),
      },
    };
    const state = {
      entity_id: entityId,
      state: "docked",
      attributes: { friendly_name: "ROBOTINA" },
      last_changed: "",
      last_updated: "",
    };
    const vacuum = new VacuumEntity(
      platform as any,
      state as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const endpoint = (await vacuum.createEndpoint()) as any;
    await vacuum.updateState(state as any, true);

    expect(endpoint.deviceType).toBe(0x0074);
    expect(endpoint.attributes.get("powerSource:batPercentRemaining")).toBe(146);
    expect(endpoint.clusterServers.has(0x0090)).toBe(false);
  });

  it("publishes one standalone RVC with the requested model and physical HA serial", async () => {
    const entityId = "vacuum.sala_tv_robotina_rvc";
    const selectId = "select.robotina_modo_de_limpieza";
    const platform = {
      matterbridge: { matterbridgeVersion: "3.10.2" },
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
            entityId,
            { id: "vacuum-registry-entity", device_id: "robotina-device" },
          ],
          [
            selectId,
            { id: "select-registry-entity", device_id: "robotina-device" },
          ],
        ]),
        hassDevices: new Map([
          ["robotina-device", { serial_number: "bf4ae2b69ab212b227zupl" }],
        ]),
        hassStates: new Map([
          [
            selectId,
            {
              entity_id: selectId,
              state: "smart",
              attributes: {
                options: [
                  "smart",
                  "random",
                  "wall_follow",
                  "spiral",
                  "chargego",
                ],
              },
            },
          ],
        ]),
      },
    };
    const state = {
      entity_id: entityId,
      state: "docked",
      attributes: { friendly_name: "ROBOTINA", battery_level: 100 },
      last_changed: "",
      last_updated: "",
    };

    const vacuum = new VacuumEntity(
      platform as any,
      state as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const endpoint = (await vacuum.createEndpoint()) as any;

    expect(endpoint.options.mode).toBe("server");
    expect(endpoint.deviceType).toBe(0x0074);
    expect(endpoint.deviceName).toBe("ROBOTINA");
    expect(endpoint.productLabel).toBe("ROBOTINA");
    expect(endpoint.productName).toBe("Ropvocnic Tuya Vacuum");
    expect(endpoint.serialNumber).toBe("bf4ae2b69ab212b227zupl");

    const deviceTypeCodes = Array.isArray(endpoint.deviceTypes)
      ? endpoint.deviceTypes.map((dt: any) =>
          typeof dt === "number" ? dt : dt.code,
        )
      : Array.from(endpoint.deviceTypes.keys());
    expect(deviceTypeCodes).toContain(0x0074);
    expect(endpoint.supportedCleanModes).toEqual([
      {
        label: "Automático",
        mode: 1,
        modeTags: [{ value: 16385 }, { value: 0 }],
      },
      {
        label: "Aleatorio",
        mode: 2,
        modeTags: [{ value: 16385 }, { value: 1 }],
      },
      {
        label: "Seguimiento de pared",
        mode: 3,
        modeTags: [{ value: 16385 }, { value: 2 }],
      },
      {
        label: "Espiral",
        mode: 4,
        modeTags: [{ value: 16385 }, { value: 16384 }],
      },
    ]);
    expect(endpoint.children.size).toBe(0);

    for (const [mode, option] of [
      [1, "smart"],
      [2, "random"],
      [3, "wall_follow"],
      [4, "spiral"],
    ] as const) {
      await endpoint.invokeCommand("RvcCleanMode.changeToMode", {
        request: { newMode: mode },
      });
      expect(platform.ha.callService).toHaveBeenLastCalledWith(
        "select",
        "select_option",
        selectId,
        { option },
      );
      expect(endpoint.attributes.get("rvcCleanMode:currentMode")).toBe(mode);
    }

    // The reverse path is equally important: a mode selected in Smart Life
    // must update the RVC mode that Apple Home reads.
    (platform.ha.hassStates.get(selectId) as any).state = "spiral";
    await vacuum.updateState({ ...state, state: "cleaning" } as any, true);
    expect(endpoint.attributes.get("rvcCleanMode:currentMode")).toBe(4);
  });

  it("sets operationalState to 0 (Stopped) when unreachable without raising Error 3", async () => {
    const entityId = "vacuum.sala_tv_robotina_rvc";
    const platform = {
      matterbridge: { matterbridgeVersion: "3.10.2" },
      log: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        notice: vi.fn(),
        warn: vi.fn(),
      },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map(),
        hassDevices: new Map(),
        hassStates: new Map(),
      },
    };
    const state = {
      entity_id: entityId,
      state: "cleaning",
      attributes: { friendly_name: "ROBOTINA", battery_level: 80 },
      last_changed: "",
      last_updated: "",
    };

    const vacuum = new VacuumEntity(
      platform as any,
      state as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const endpoint = (await vacuum.createEndpoint()) as any;
    await vacuum.updateState(state as any, true);

    expect(endpoint.attributes.get("rvcOperationalState:operationalState")).toBe(1); // Running

    // When entity goes offline / unavailable, reachability is false
    await vacuum.setReachability(false);

    // CRITICAL: operationalState must be 0 (Stopped), NEVER 3 (Error)!
    expect(endpoint.attributes.get("rvcOperationalState:operationalState")).toBe(0);
    expect(endpoint.attributes.get("rvcRunMode:currentMode")).toBe(1); // Idle

    // Commands must return a failure when Home Assistant already reports unavailable
    vacuum.state = { ...state, state: "unavailable" } as any;
    await expect(
      endpoint.invokeCommand("RvcRunMode.changeToMode", {
        request: { newMode: 2 },
      }),
    ).rejects.toThrow("unavailable/offline");
    // HA service should NOT be called
    expect(platform.ha.callService).not.toHaveBeenCalled();

    // When connection is restored to docked
    vacuum.state = { ...state, state: "docked" } as any;
    await vacuum.setReachability(true);
    expect(endpoint.attributes.get("rvcOperationalState:operationalState")).toBe(0x42); // Docked
  });

  it("rejects Matterbridge's advertised SkipArea command when HA has no portable skip-area service", async () => {
    const entityId = "vacuum.sala_tv_robotina_rvc";
    const platform = {
      matterbridge: { matterbridgeVersion: "3.10.14" },
      log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map(),
        hassDevices: new Map(),
        hassStates: new Map(),
      },
    };
    const state = {
      entity_id: entityId,
      state: "cleaning",
      attributes: { friendly_name: "ROBOTINA", battery_level: 80 },
      last_changed: "",
      last_updated: "",
    };
    const vacuum = new VacuumEntity(
      platform as any,
      state as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const endpoint = (await vacuum.createEndpoint()) as any;

    await expect(
      endpoint.invokeCommand("ServiceArea.skipArea", {
        request: { skippedArea: 1 },
      }),
    ).rejects.toThrow("SkipArea is not supported");
    expect(platform.ha.callService).not.toHaveBeenCalled();
  });

  it("only reports operationalState 3 (Error) when Home Assistant explicitly reports state 'error'", async () => {
    const entityId = "vacuum.sala_tv_robotina_rvc";
    const platform = {
      matterbridge: { matterbridgeVersion: "3.10.2" },
      log: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        notice: vi.fn(),
        warn: vi.fn(),
      },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map(),
        hassDevices: new Map(),
        hassStates: new Map(),
      },
    };
    const state = {
      entity_id: entityId,
      state: "error",
      attributes: { friendly_name: "ROBOTINA", error: "Roller brush stuck" },
      last_changed: "",
      last_updated: "",
    };

    const vacuum = new VacuumEntity(
      platform as any,
      state as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const endpoint = (await vacuum.createEndpoint()) as any;
    await vacuum.updateState(state as any, true);

    // Legitimate operational error reports Error (3)
    expect(endpoint.attributes.get("rvcOperationalState:operationalState")).toBe(3);
  });

  it("prioritizes modo_de_limpieza over control_manual select, leaves supportedAreas undefined when no rooms exist, and reads linked battery sensor", async () => {
    const entityId = "vacuum.sala_tv_robotina";
    const manualSelectId = "select.sala_tv_robotina_control_manual";
    const cleanSelectId = "select.sala_tv_robotina_modo_de_limpieza";
    const dockButtonId = "button.sala_tv_robotina_volver_a_base";
    const batterySensorId = "sensor.sala_tv_robotina_dps_6";
    const statusSensorId = "sensor.sala_tv_robotina_dps_5";

    const platform = {
      matterbridge: { matterbridgeVersion: "3.10.14" },
      log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map([
          [entityId, { id: "reg-vac", device_id: "robotina-device" }],
          [manualSelectId, { id: "reg-man", device_id: "robotina-device" }],
          [cleanSelectId, { id: "reg-clean", device_id: "robotina-device" }],
          [dockButtonId, { id: "reg-dock", device_id: "robotina-device" }],
          [batterySensorId, { id: "reg-bat", device_id: "robotina-device" }],
          [statusSensorId, { id: "reg-status", device_id: "robotina-device" }],
        ]),
        hassDevices: new Map([
          ["robotina-device", { serial_number: "bf4ae2b69ab212b227zupl" }],
        ]),
        hassStates: new Map([
          [
            manualSelectId,
            {
              entity_id: manualSelectId,
              state: "stop",
              attributes: {
                friendly_name: "ROBOTINA Control manual",
                options: ["stop", "forward", "backward", "turn_left", "turn_right"],
              },
            },
          ],
          [
            cleanSelectId,
            {
              entity_id: cleanSelectId,
              state: "chargego",
              attributes: {
                friendly_name: "ROBOTINA Modo de limpieza",
                options: ["smart", "wall_follow", "spiral", "chargego", "random", "standby"],
              },
            },
          ],
          [
            dockButtonId,
            {
              entity_id: dockButtonId,
              state: "unavailable",
              attributes: { friendly_name: "ROBOTINA Volver a base" },
            },
          ],
          [
            batterySensorId,
            {
              entity_id: batterySensorId,
              state: "100",
              attributes: {
                friendly_name: "ROBOTINA Electricity Left",
                unit_of_measurement: "%",
              },
            },
          ],
          [statusSensorId, { entity_id: statusSensorId, state: "charge_done", attributes: { friendly_name: "ROBOTINA Status" } }],
        ]),
      },
    };

    const state = {
      entity_id: entityId,
      state: "cleaning", // Even if Tuya leaves state at cleaning while mode is chargego
      attributes: { friendly_name: "ROBOTINA" },
      last_changed: "",
      last_updated: "",
    };

    const vacuum = new VacuumEntity(
      platform as any,
      state as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const endpoint = (await vacuum.createEndpoint()) as any;

    // Must leave supportedAreas undefined so Matterbridge uses valid default areas instead of []
    expect(endpoint.supportedAreas).toBeUndefined();
    // Must pick cleanSelectId and NOT manualSelectId
    expect(vacuum.getLinkedCleanModeSelector()?.entityId).toBe(cleanSelectId);
    expect(endpoint.supportedCleanModes).toHaveLength(4);
    // Because cleanSelectId is in state 'chargego', initial operationalState is 66 (Docked)
    expect(endpoint.initialOperationalState).toBe(66);
    expect(endpoint.initialRunMode).toBe(1);

    // Sync state and verify battery sensor fallback (100% -> 200 in Matter) and Docked state (66)
    await vacuum.updateState(state as any, true);
    expect(endpoint.attributes.get("powerSource:batPercentRemaining")).toBe(200);
    expect(endpoint.attributes.get("powerSource:batChargeState")).toBe(2);
    expect(endpoint.attributes.get("rvcOperationalState:operationalState")).toBe(66);

    // An unavailable button must not hide the usable chargego selector.
    await endpoint.invokeCommand("RvcOperationalState.goHome", {});
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "select",
      "select_option",
      cleanSelectId,
      { option: "chargego" },
    );
    await endpoint.invokeCommand("RvcRunMode.changeToMode", { request: { newMode: 2 }, context: { sessionId: 123n } });
    expect(platform.ha.callService).toHaveBeenLastCalledWith("vacuum", "start", entityId, {});
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import {
  HapGenericAccessory,
  type HapAccessoryRecord,
} from "../src/hap/hap-generic-accessory.js";

const entityId = "alarm_control_panel.argus_home";

function createAlarm(initial: Record<string, any> = {}) {
  const state = {
    entity_id: entityId,
    state: "disarmed",
    attributes: { code_arm_required: false, code_disarm_required: false },
    ...initial,
  };
  const calls: Array<[string, string, string, unknown]> = [];
  const platform: any = {
    entities: new Map([[entityId, { state }]]),
    ha: {
      hassStates: new Map([[entityId, state]]),
      hassEntities: new Map(),
      callService: vi.fn(async (domain, service, id, data) => {
        calls.push([domain, service, id, data]);
      }),
    },
    log: { warn: vi.fn() },
  };
  const record: HapAccessoryRecord = {
    entityId,
    hapProfile: "security_system",
    name: "Argus",
    pincode: "123-45-678",
    port: 52123,
    username: "AA:BB:CC:DD:EE:FF",
    setupId: "ABCD",
    uuid: "8A48F358-3F0B-46DF-A06B-4621A8E760E1",
    published: false,
  };
  const accessory = new HapGenericAccessory(platform, entityId, record);
  const service = accessory.accessory.getService(Service.SecuritySystem)!;
  const current = service.getCharacteristic(Characteristic.SecuritySystemCurrentState);
  const target = service.getCharacteristic(Characteristic.SecuritySystemTargetState);
  const update = (next: Record<string, any>) => {
    Object.assign(state, next);
    platform.ha.hassStates.set(entityId, state);
    platform.entities.get(entityId).state = state;
    accessory.updateFromHassState(state);
  };
  return { accessory, platform, record, state, calls, service, current, target, update };
}

describe("HAP generic Argus alarm support", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a sensor-blocked arm as a pending target without reporting armed", () => {
    const alarm = createAlarm();
    alarm.update({
      state: "arming",
      attributes: {
        argus_arming_transition: true,
        arming_target: "armed_away",
        arming_waiting_for_sensors: true,
        arming_blocking_sensors: ["binary_sensor.front_door"],
      },
    });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    expect(alarm.target.value).toBe(Characteristic.SecuritySystemTargetState.AWAY_ARM);
  });

  it("keeps delayed arming pending until HA confirms the final mode", () => {
    const alarm = createAlarm();
    alarm.update({ state: "arming", attributes: { argus_arming_transition: true, arming_target: "armed_home" } });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    alarm.update({ state: "armed_home", attributes: { argus_arming_transition: false } });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.STAY_ARM);
    expect(alarm.target.value).toBe(Characteristic.SecuritySystemTargetState.STAY_ARM);
  });

  it("tracks a changed Argus target while the state remains arming", () => {
    const alarm = createAlarm();
    alarm.update({ state: "arming", attributes: { argus_arming_transition: true, arming_target: "armed_away" } });
    alarm.update({ state: "arming", attributes: { argus_arming_transition: true, arming_target: "armed_night" } });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    expect(alarm.target.value).toBe(Characteristic.SecuritySystemTargetState.NIGHT_ARM);
  });

  it("sends disarm during arming and retains HA-confirmed current state", async () => {
    const alarm = createAlarm({ state: "armed_away" });
    alarm.update({ state: "arming", attributes: { argus_arming_transition: true, arming_target: "armed_home" } });
    await alarm.target.handleSetRequest(Characteristic.SecuritySystemTargetState.DISARM);
    expect(alarm.calls).toEqual([["alarm_control_panel", "alarm_disarm", entityId, undefined]]);
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.AWAY_ARM);
    alarm.update({ state: "disarmed", attributes: {} });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    expect(alarm.target.value).toBe(Characteristic.SecuritySystemTargetState.DISARM);
  });

  it("sends the new requested mode and synchronizes Argus' reported pending target", async () => {
    const alarm = createAlarm({ state: "arming", attributes: { argus_arming_transition: true, arming_target: "armed_home" } });
    await alarm.target.handleSetRequest(Characteristic.SecuritySystemTargetState.AWAY_ARM);
    expect(alarm.calls[0]).toEqual(["alarm_control_panel", "alarm_arm_away", entityId, undefined]);
    alarm.update({ state: "arming", attributes: { argus_arming_transition: true, arming_target: "armed_away" } });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    expect(alarm.target.value).toBe(Characteristic.SecuritySystemTargetState.AWAY_ARM);
  });

  it("forwards a configured HA alarm PIN and preserves confirmed state if HA rejects it", async () => {
    const alarm = createAlarm({
      state: "disarmed",
      attributes: { code_arm_required: true, code_disarm_required: true },
    });
    alarm.record.alarmCode = "2468";
    alarm.platform.ha.callService.mockImplementationOnce(async (...args: any[]) => {
      alarm.calls.push(args as [string, string, string, unknown]);
      throw new Error("invalid code");
    });
    await expect(alarm.target.handleSetRequest(Characteristic.SecuritySystemTargetState.STAY_ARM)).rejects.toBe(-70402);
    expect(alarm.calls).toEqual([["alarm_control_panel", "alarm_arm_home", entityId, { code: "2468" }]]);
    expect(alarm.platform.ha.callService).toHaveBeenCalledWith(
      "alarm_control_panel", "alarm_arm_home", entityId, { code: "2468" },
    );
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
  });

  it("rejects a command that requires a PIN when none is configured", async () => {
    const alarm = createAlarm({ state: "disarmed", attributes: { code_arm_required: true } });
    await expect(alarm.target.handleSetRequest(Characteristic.SecuritySystemTargetState.AWAY_ARM)).rejects.toBe(-70411);
    expect(alarm.platform.ha.callService).not.toHaveBeenCalled();
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
  });

  it("does not map incomplete Argus attributes, unknown states, or non-Argus arming as armed", () => {
    const alarm = createAlarm();
    alarm.update({ state: "arming", attributes: { arming_target: "armed_away" } });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    expect(alarm.target.value).toBe(Characteristic.SecuritySystemTargetState.DISARM);
    alarm.update({ state: "unknown", attributes: {} });
    expect(alarm.current.value).toBe(Characteristic.SecuritySystemCurrentState.DISARMED);
    alarm.update({ state: "unavailable", attributes: {} });
    expect(alarm.service.getCharacteristic(Characteristic.StatusActive).value).toBe(false);
  });
});

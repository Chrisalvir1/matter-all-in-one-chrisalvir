import { afterEach, describe, expect, it, vi } from "vitest";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import { HapGenericAccessory, type HapAccessoryRecord } from "../src/hap/hap-generic-accessory.js";

function fixture(entityId = "valve.garden") {
  const state = { entity_id: entityId, state: "closed", attributes: {} };
  const callService = vi.fn().mockResolvedValue(undefined);
  const platform: any = {
    entities: new Map([[entityId, { state }]]),
    ha: { connected: true, hassStates: new Map([[entityId, state]]), hassEntities: new Map(), callService },
    log: { info: vi.fn(), warn: vi.fn() },
    recordEntityCommandFailure: vi.fn(),
  };
  const uuid = "00000000-0000-4000-8000-000000000001";
  const record = {
    entityId, uuid, hapProfile: "valve_irrigation", name: "Garden",
    pincode: "123-45-678", port: 52124, username: "AA:BB:CC:DD:EE:12",
    setupId: "ABCD", published: false,
  } as HapAccessoryRecord;
  const accessory = new HapGenericAccessory(platform, entityId, record);
  const service = accessory.accessory.getService(Service.Valve)!;
  return { accessory, callService, entityId, platform, record, service };
}

describe("HAP valve duration", () => {
  afterEach(() => vi.useRealTimers());

  it("opens with the entity domain and closes after SetDuration", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(2);
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    expect(f.callService).toHaveBeenLastCalledWith("valve", "open_valve", f.entityId, undefined);

    f.accessory.updateFromHassState({ entity_id: f.entityId, state: "open", attributes: {} });
    expect(f.service.getCharacteristic(Characteristic.Active).value).toBe(1);
    expect(f.service.getCharacteristic(Characteristic.InUse).value).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.service.getCharacteristic(Characteristic.RemainingDuration).value).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.callService).toHaveBeenLastCalledWith("valve", "close_valve", f.entityId, undefined);
  });

  it("uses turn services for non-valve Home Assistant domains and cancels on manual close", async () => {
    vi.useFakeTimers();
    const f = fixture("switch.garden_valve");
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(1);
    f.accessory.updateFromHassState({ entity_id: f.entityId, state: "on", attributes: {} });
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(0);
    expect(f.callService).toHaveBeenLastCalledWith("switch", "turn_off", f.entityId, undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.callService).toHaveBeenCalledTimes(1);
  });

  it("cancels duration when Home Assistant reports an external close", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(30);
    f.accessory.updateFromHassState({ entity_id: f.entityId, state: "open", attributes: {} });
    expect(f.service.getCharacteristic(Characteristic.RemainingDuration).value).toBe(30);
    f.accessory.updateFromHassState({ entity_id: f.entityId, state: "closed", attributes: {} });
    expect(f.service.getCharacteristic(Characteristic.RemainingDuration).value).toBe(0);
    await vi.advanceTimersByTimeAsync(31000);
    expect(f.callService).not.toHaveBeenCalled();
  });

  it("keeps accessory UUID stable and does not infer closed from unknown state", () => {
    const f = fixture();
    f.accessory.updateFromHassState({ entity_id: f.entityId, state: "unknown", attributes: {} });
    expect(f.record.uuid).toBe("00000000-0000-4000-8000-000000000001");
    expect(f.service.getCharacteristic(Characteristic.Active).value).toBe(0);
    expect(f.platform.ha.connected).toBe(true);
  });
});

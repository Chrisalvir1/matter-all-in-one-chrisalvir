import { afterEach, describe, expect, it, vi } from "vitest";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import { HapGenericAccessory, type HapAccessoryRecord } from "../src/hap/hap-generic-accessory.js";

function fixture(entityId = "valve.garden") {
  const state = { entity_id: entityId, state: "closed", attributes: {} };
  const callService = vi.fn().mockResolvedValue(undefined);
  const saveHapAccessoryRecords = vi.fn().mockResolvedValue(undefined);
  const platform: any = {
    entities: new Map([[entityId, { state }]]),
    ha: { connected: true, hassStates: new Map([[entityId, state]]), hassEntities: new Map(), callService },
    saveHapAccessoryRecords,
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
  const updateState = (value: string) => {
    const next = { entity_id: entityId, state: value, attributes: {} };
    platform.ha.hassStates.set(entityId, next);
    platform.entities.set(entityId, { state: next });
    accessory.updateFromHassState(next);
  };
  return { accessory, callService, entityId, platform, record, service, updateState };
}

describe("HAP valve duration", () => {
  afterEach(() => vi.useRealTimers());

  it("opens with the entity domain and closes after SetDuration", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(2);
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    expect(f.callService).toHaveBeenLastCalledWith("valve", "open_valve", f.entityId, undefined);

    f.updateState("open");
    expect(f.service.getCharacteristic(Characteristic.Active).value).toBe(1);
    expect(f.service.getCharacteristic(Characteristic.InUse).value).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.service.getCharacteristic(Characteristic.RemainingDuration).value).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.callService).toHaveBeenLastCalledWith("valve", "close_valve", f.entityId);
    expect(f.record.valveDeadlineAt).toBeUndefined();
  });

  it("uses turn services for non-valve Home Assistant domains and cancels on manual close", async () => {
    vi.useFakeTimers();
    const f = fixture("switch.garden_valve");
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(1);
    f.updateState("on");
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(0);
    expect(f.callService).toHaveBeenLastCalledWith("switch", "turn_off", f.entityId, undefined);
    await vi.advanceTimersByTimeAsync(2000);
    expect(f.callService).toHaveBeenCalledTimes(1);
  });

  it("cancels duration when Home Assistant reports an external close", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(30);
    f.updateState("open");
    expect(f.service.getCharacteristic(Characteristic.RemainingDuration).value).toBe(30);
    f.updateState("closed");
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

  it("persists the deadline and restores the pending close after a restart", async () => {
    vi.useFakeTimers();
    const first = fixture();
    await first.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(2);
    await first.service.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    first.updateState("open");
    const persisted = JSON.parse(JSON.stringify(first.record)) as HapAccessoryRecord;
    expect(persisted.valveSetDurationSeconds).toBe(2);
    expect(persisted.valveDeadlineAt).toBeGreaterThan(Date.now());

    const recovered = fixtureWithRecord(first.entityId, persisted, "open");
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);
    expect(recovered.callService).toHaveBeenCalledWith("valve", "close_valve", first.entityId);
    expect(recovered.record.uuid).toBe(persisted.uuid);
  });

  it("keeps an expired timer through an unavailable state and closes after recovery", async () => {
    vi.useFakeTimers();
    const f = fixture();
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(1);
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    f.updateState("open");
    f.updateState("unavailable");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.callService).toHaveBeenCalledTimes(1); // the opening command only
    expect(f.record.valveDeadlineAt).toBeDefined();

    f.platform.ha.connected = true;
    f.updateState("open");
    await vi.advanceTimersByTimeAsync(0);
    expect(f.callService).toHaveBeenLastCalledWith("valve", "close_valve", f.entityId);
  });

  it("retries a failed scheduled close at most three times and records a diagnostic", async () => {
    vi.useFakeTimers();
    const f = fixture();
    f.callService.mockResolvedValueOnce(undefined);
    f.callService.mockRejectedValue(new Error("offline"));
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(1);
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    f.updateState("open");
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1500);
    expect(f.callService).toHaveBeenCalledTimes(4);
    expect(f.record.valveCloseAttempts).toBe(3);
    expect(f.platform.recordEntityCommandFailure).toHaveBeenCalledWith(
      f.entityId,
      expect.stringContaining("failed after three attempts"),
    );
    f.updateState("open");
    await vi.advanceTimersByTimeAsync(5000);
    expect(f.callService).toHaveBeenCalledTimes(4);
  });

  it("does not duplicate a scheduled close when the user closes during the request", async () => {
    vi.useFakeTimers();
    const f = fixture();
    let completeScheduledClose!: () => void;
    f.callService.mockResolvedValueOnce(undefined);
    f.callService.mockImplementationOnce(() => new Promise<void>((resolve) => {
      completeScheduledClose = resolve;
    }));
    await f.service.getCharacteristic(Characteristic.SetDuration).handleSetRequest(1);
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(1);
    f.updateState("open");

    await vi.advanceTimersByTimeAsync(1000);
    expect(f.callService).toHaveBeenCalledTimes(2);
    await f.service.getCharacteristic(Characteristic.Active).handleSetRequest(0);
    expect(f.callService).toHaveBeenCalledTimes(2);

    completeScheduledClose();
    await vi.advanceTimersByTimeAsync(0);
    expect(f.callService).toHaveBeenCalledTimes(2);
  });
});

function fixtureWithRecord(entityId: string, record: HapAccessoryRecord, initialState: string) {
  const state = { entity_id: entityId, state: initialState, attributes: {} };
  const callService = vi.fn().mockResolvedValue(undefined);
  const platform: any = {
    entities: new Map([[entityId, { state }]]),
    ha: { connected: true, hassStates: new Map([[entityId, state]]), hassEntities: new Map(), callService },
    log: { info: vi.fn(), warn: vi.fn() },
    recordEntityCommandFailure: vi.fn(),
    saveHapAccessoryRecords: vi.fn().mockResolvedValue(undefined),
  };
  const accessory = new HapGenericAccessory(platform, entityId, record);
  return {
    accessory,
    callService,
    record,
    service: accessory.accessory.getService(Service.Valve)!,
  };
}

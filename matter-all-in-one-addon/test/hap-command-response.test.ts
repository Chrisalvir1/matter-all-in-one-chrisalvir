import { afterEach, describe, expect, it, vi } from "vitest";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import { HapGenericAccessory, type HapAccessoryRecord } from "../src/hap/hap-generic-accessory.js";

function fixture(callService: ReturnType<typeof vi.fn>, profile = "humidifier") {
  const entityId = profile === "humidifier" ? "humidifier.diffuser" : "switch.plug";
  const state = { entity_id: entityId, state: "on", attributes: {} };
  const platform: any = {
    entities: new Map([[entityId, { state }]]),
    ha: { connected: true, hassStates: new Map([[entityId, state]]), hassEntities: new Map(), callService },
    log: { info: vi.fn(), warn: vi.fn() },
    recordEntityCommandFailure: vi.fn(),
  };
  const accessory = new HapGenericAccessory(platform, entityId, {
    entityId, hapProfile: profile, name: "Diffuser", pincode: "123-45-678",
    port: 52124, username: "AA:BB:CC:DD:EE:12", setupId: "ABCD", published: false,
  } as HapAccessoryRecord);
  const service = accessory.accessory.getService(profile === "humidifier" ? Service.HumidifierDehumidifier : Service.Switch)!;
  const characteristic = service.getCharacteristic(profile === "humidifier" ? Characteristic.Active : Characteristic.On);
  return { platform, accessory, characteristic, entityId };
}

describe("HAP command response", () => {
  afterEach(() => vi.useRealTimers());

  it.each(["humidifier", "switch_hap"])("bounds a slow HA write for %s and records a late failure", async (profile) => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const callService = vi.fn(() => new Promise<void>((_, fail) => { reject = fail; }));
    const f = fixture(callService, profile);
    const response = f.characteristic.handleSetRequest(0);
    await vi.advanceTimersByTimeAsync(750);
    await expect(response).resolves.toBeUndefined();
    expect(callService).toHaveBeenCalledWith(f.entityId.split(".")[0], "turn_off", f.entityId, undefined);
    reject(new Error("HA unavailable"));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.platform.recordEntityCommandFailure).toHaveBeenCalled();
  });

  it("returns communication failure when HA immediately rejects the command", async () => {
    const f = fixture(vi.fn().mockRejectedValue(new Error("offline")));
    await expect(f.characteristic.handleSetRequest(0)).rejects.toBe(-70402);
    expect(f.platform.recordEntityCommandFailure).toHaveBeenCalled();
  });
});

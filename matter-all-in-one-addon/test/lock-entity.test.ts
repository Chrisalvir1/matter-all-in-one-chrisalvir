import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { LockEntity } from "../src/entities/lock.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import { DoorLock } from "matterbridge/matter/clusters";

const platform = {
  matterbridge: { matterbridgeVersion: "3.10.7" },
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
      ["lock.front_door", { id: "entity-lock", device_id: "device-lock" }],
    ]),
    hassDevices: new Map([["device-lock", { serial_number: "LOCK-SN-12345" }]]),
  },
};

function lockState(state: string, attributes: Record<string, unknown> = {}) {
  return {
    entity_id: "lock.front_door",
    state,
    attributes: {
      friendly_name: "Front Door Lock",
      ...attributes,
    },
    last_changed: "",
    last_updated: "",
  } as any;
}

describe("LockEntity", () => {
  it("creates DoorLock endpoint with correct initial state", async () => {
    const entity = new LockEntity(
      platform as any,
      lockState("locked"),
      MatterDeviceTypes.doorLock,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint).toBeDefined();

    await entity.syncInitialState();
    expect(endpoint.getAttribute(DoorLock.id, "lockState")).toBe(
      DoorLock.LockState.Locked,
    );
    expect(endpoint.getAttribute(DoorLock.id, "actuatorEnabled")).toBe(true);
    expect(endpoint.getAttribute(DoorLock.id, "operatingMode")).toBe(
      DoorLock.OperatingMode.Normal,
    );
  });

  it("updates DoorLock state when Home Assistant entity state changes", async () => {
    const entity = new LockEntity(
      platform as any,
      lockState("locked"),
      MatterDeviceTypes.doorLock,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();

    // Transition to unlocked
    await entity.updateState(lockState("unlocked"));
    expect(endpoint.getAttribute(DoorLock.id, "lockState")).toBe(
      DoorLock.LockState.Unlocked,
    );

    // Transition back to locked
    await entity.updateState(lockState("locked"));
    expect(endpoint.getAttribute(DoorLock.id, "lockState")).toBe(
      DoorLock.LockState.Locked,
    );
  });

  it("handles lockDoor and unlockDoor commands by forwarding to Home Assistant", async () => {
    const entity = new LockEntity(
      platform as any,
      lockState("unlocked"),
      MatterDeviceTypes.doorLock,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    // Trigger lock command
    await endpoint.invokeCommand("lockDoor");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "lock",
      "lock",
      "lock.front_door",
    );

    // Trigger unlock command
    await endpoint.invokeCommand("unlockDoor");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "lock",
      "unlock",
      "lock.front_door",
    );
  });
});

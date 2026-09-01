import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { ClosureEntity } from "../src/entities/closure.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";

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
      [
        "cover.living_room_blind",
        { id: "entity-blind", device_id: "device-blind" },
      ],
    ]),
    hassDevices: new Map([["device-blind", { serial_number: "BLIND-SN-999" }]]),
  },
};

function coverState(position: number | null, state = "open") {
  return {
    entity_id: "cover.living_room_blind",
    state,
    attributes: {
      friendly_name: "Living Room Blind",
      current_position: position,
    },
    last_changed: "",
    last_updated: "",
  } as any;
}

const WindowCoveringId = 0x0102;

describe("ClosureEntity", () => {
  it("creates WindowCovering endpoint and syncs lift percentage inversely", async () => {
    // HA position: 80% open -> Matter lift percentage: 20% closed
    const entity = new ClosureEntity(
      platform as any,
      coverState(80),
      MatterDeviceTypes.windowCovering,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    expect(endpoint).toBeDefined();

    await entity.syncInitialState();
    expect(
      endpoint.getAttribute(WindowCoveringId, "currentPositionLiftPercentage"),
    ).toBe(20);
  });

  it("updates lift percentage when Home Assistant cover position changes", async () => {
    const entity = new ClosureEntity(
      platform as any,
      coverState(100),
      MatterDeviceTypes.windowCovering,
    );
    const endpoint = (await entity.createEndpoint()) as any;
    await entity.syncInitialState();
    expect(
      endpoint.getAttribute(WindowCoveringId, "currentPositionLiftPercentage"),
    ).toBe(0);

    // Cover moves to fully closed (HA position 0) -> Matter lift percentage 100
    await entity.updateState(coverState(0, "closed"));
    expect(
      endpoint.getAttribute(WindowCoveringId, "currentPositionLiftPercentage"),
    ).toBe(100);

    // Cover moves to half open (HA position 50) -> Matter lift percentage 50
    await entity.updateState(coverState(50));
    expect(
      endpoint.getAttribute(WindowCoveringId, "currentPositionLiftPercentage"),
    ).toBe(50);
  });

  it("handles goToLiftPercentage command and converts back to Home Assistant position", async () => {
    const entity = new ClosureEntity(
      platform as any,
      coverState(50),
      MatterDeviceTypes.windowCovering,
    );
    const endpoint = (await entity.createEndpoint()) as any;

    // Matter commands 30% lift percentage (closed) -> HA position should be 70% open
    await endpoint.invokeCommand("goToLiftPercentage", {
      liftPercentageValue: 30,
    });
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "cover",
      "set_cover_position",
      "cover.living_room_blind",
      { position: 70 },
    );

    // Test Matter 1.5 hundredths payload: 4000 hundredths = 40% -> HA position 60%
    await endpoint.invokeCommand("goToLiftPercentage", {
      liftPercent100thsValue: 4000,
    });
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "cover",
      "set_cover_position",
      "cover.living_room_blind",
      { position: 60 },
    );
  });
});

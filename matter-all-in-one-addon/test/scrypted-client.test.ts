import { describe, it, expect, vi } from "vitest";
import { ScryptedClientManager } from "../src/scrypted/scrypted-client.js";

describe("ScryptedClientManager", () => {
  it("should initialize with default config", () => {
    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      notice: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    } as any;

    const manager = new ScryptedClientManager(mockLog);
    expect(manager.connected).toBe(false);
    expect(manager.cameras.size).toBe(0);
  });

  it("should register camera device and trigger callback", () => {
    const mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      notice: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
    } as any;

    const manager = new ScryptedClientManager(mockLog);
    const discoveredCallback = vi.fn();
    manager.onCameraDiscovered(discoveredCallback);

    manager.registerCameraDevice({
      id: "cam1",
      name: "Front Door Camera",
      hasMotion: true,
      hasDoorbell: true,
      hasLight: false,
      motionState: false,
      doorbellTriggered: false,
      lightState: false,
    });

    expect(manager.cameras.has("cam1")).toBe(true);
    expect(discoveredCallback).toHaveBeenCalledTimes(1);
    expect(discoveredCallback).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Front Door Camera" }),
    );
  });
});

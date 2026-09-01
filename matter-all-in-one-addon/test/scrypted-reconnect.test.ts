import { describe, expect, it, beforeEach, afterEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ScryptedStorage } from "../src/camera/scrypted/scrypted-storage.js";
import { ScryptedReconnectManager } from "../src/camera/scrypted/scrypted-reconnect-manager.js";

describe("ScryptedReconnectManager state machine suite", () => {
  const tempStorePath = path.join(
    os.tmpdir(),
    `test-reconnect-${Date.now()}-${Math.random().toString(36).substring(7)}.json`,
  );

  beforeEach(async () => {
    ScryptedStorage.setStorePath(tempStorePath);
    try {
      await fs.unlink(tempStorePath);
    } catch {}
  });

  afterEach(() => {
    ScryptedReconnectManager.getInstance().destroy();
  });

  it("transitions to not_configured when no server URL is provided", async () => {
    const manager = ScryptedReconnectManager.getInstance();
    await manager.initialize();

    const store = await ScryptedStorage.load();
    expect(store.scrypted.connectionStatus).toBe("not_configured");
  });

  it("transitions to disconnected_using_cache when server is unreachable and cached cameras exist", async () => {
    const store = await ScryptedStorage.load();
    store.scrypted.serverUrl = "http://127.0.0.1:65431";
    store.scrypted.autoReconnect = true;
    store.cameras.cameras = [
      {
        cameraId: "cached_cam_1",
        sourceId: "src_1",
        deviceId: "dev_1",
        name: "Cámara Salón",
        model: "Aqara G3",
        enabled: true,
        identity: {},
        source: {
          kind: "scrypted",
          serverId: "http://127.0.0.1:65431",
          deviceId: "dev_1",
        },
        capabilities: {},
        sensors: [],
        exportConfig: {
          matterEnabled: true,
          homeKitEnabled: true,
          hksvEnabledByDefault: true,
          googleHomeEnabled: false,
          alexaEnabled: false,
          smartThingsEnabled: false,
          nasEnabled: false,
        },
        status: { connection: "offline", cache: "stale" },
      },
    ];
    await ScryptedStorage.save(store);

    const manager = ScryptedReconnectManager.getInstance();
    const success = await manager.attemptConnection(false);

    expect(success).toBe(false);
    const updatedStore = ScryptedStorage.getStore();
    expect(updatedStore.scrypted.connectionStatus).toBe(
      "disconnected_using_cache",
    );
  });
});

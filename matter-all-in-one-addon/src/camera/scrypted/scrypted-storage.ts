import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ScryptedPersistentStore,
  CameraRecord,
  CameraExportConfig,
  CameraNasConfig,
  ScryptedConnectionStatus,
} from "./scrypted-types.js";

export class ScryptedStorage {
  private static storePath =
    process.env.SCRYPTED_STORE_PATH || "/data/scrypted-cameras-store.json";
  private static memoryStore: ScryptedPersistentStore | null = null;

  /**
   * Overrides store path (used in tests).
   */
  public static setStorePath(customPath: string): void {
    this.storePath = customPath;
    this.memoryStore = null;
  }

  public static getStorePath(): string {
    return this.storePath;
  }

  private static createDefaultStore(): ScryptedPersistentStore {
    return {
      installation: {
        installationId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        encryptionKeyRef: "primary",
      },
      scrypted: {
        serverId: "",
        serverUrl: "",
        connectionStatus: "not_configured",
        autoReconnect: true,
        pollIntervalMinutes: 15,
      },
      cameras: {
        cameras: [],
      },
      nas: {},
    };
  }

  /**
   * Loads the persistent store into memory, creating defaults if not yet initialized.
   */
  public static async load(): Promise<ScryptedPersistentStore> {
    if (this.memoryStore) return this.memoryStore;

    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.installation) {
        this.memoryStore = parsed;
        return parsed;
      }
    } catch {
      // File does not exist or has invalid JSON; fall through to initialize
    }

    const initial = this.createDefaultStore();
    this.memoryStore = initial;
    await this.save(initial);
    return initial;
  }

  /**
   * Returns current in-memory store or initializes it.
   */
  public static getStore(): ScryptedPersistentStore {
    if (!this.memoryStore) {
      this.memoryStore = this.createDefaultStore();
    }
    return this.memoryStore;
  }

  /**
   * Saves store atomically using temporary file + sync + rename.
   */
  public static async save(store: ScryptedPersistentStore): Promise<void> {
    this.memoryStore = store;
    const jsonContent = JSON.stringify(store, null, 2);

    let targetPath = this.storePath;
    let tmpPath = `${targetPath}.tmp`;

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const handle = await fs.open(tmpPath, "w", 0o600);
      try {
        await handle.writeFile(jsonContent, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(tmpPath, targetPath);
    } catch {
      // Fall back to local ./data path if /data is not accessible
      const fallbackTarget = path.resolve("./data/scrypted-cameras-store.json");
      const fallbackTmp = `${fallbackTarget}.tmp`;
      await fs.mkdir(path.dirname(fallbackTarget), { recursive: true });
      const handle = await fs.open(fallbackTmp, "w", 0o600);
      try {
        await handle.writeFile(jsonContent, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(fallbackTmp, fallbackTarget);
      this.storePath = fallbackTarget;
    }
  }

  public static async updateConnectionStatus(
    status: ScryptedConnectionStatus,
  ): Promise<void> {
    const store = await this.load();
    store.scrypted.connectionStatus = status;
    if (status === "connected") {
      store.scrypted.lastConnected = new Date().toISOString();
    }
    await this.save(store);
  }

  public static async updateCameras(cameras: CameraRecord[]): Promise<void> {
    const store = await this.load();
    store.cameras.cameras = cameras;
    store.cameras.lastFetched = new Date().toISOString();
    await this.save(store);
  }

  public static async updateCameraExportConfig(
    cameraId: string,
    config: CameraExportConfig,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam) return false;
    cam.exportConfig = { ...cam.exportConfig, ...config };
    await this.save(store);
    return true;
  }

  public static async updateCameraNasConfig(
    cameraId: string,
    nasConfig: CameraNasConfig,
  ): Promise<void> {
    const store = await this.load();
    if (!store.nas) store.nas = {};
    store.nas[cameraId] = nasConfig;
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (cam) {
      cam.exportConfig.nasEnabled = nasConfig.enabled;
    }
    await this.save(store);
  }

  public static async removeCamera(cameraId: string): Promise<boolean> {
    const store = await this.load();
    const before = store.cameras.cameras.length;
    store.cameras.cameras = store.cameras.cameras.filter(
      (c) => c.cameraId !== cameraId,
    );
    if (store.nas) {
      delete store.nas[cameraId];
    }
    const removed = store.cameras.cameras.length < before;
    if (removed) {
      await this.save(store);
    }
    return removed;
  }
}

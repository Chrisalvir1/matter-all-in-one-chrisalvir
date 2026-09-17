import fs from "node:fs/promises";
import path from "node:path";
import type { CameraUiCameraRecord, CameraUiConfig, CameraUiStore } from "./cameraui-types.js";

const CONFIG_PATH = "/data/cameraui-config.json";
const FALLBACK_CONFIG_PATH = "./cameraui-config.json";

export class CameraUiStorage {
  private static cachedStore: CameraUiStore | null = null;

  public static getCachedStore(): CameraUiStore | null {
    return this.cachedStore;
  }

  public static getDefaultStore(): CameraUiStore {
    return {
      config: {
        enabled: false,
        serverUrl: "http://localhost:8181",
        mqttEnabled: true,
        mqttTopicPrefix: "camera.ui",
        allowSelfSignedCertificate: true,
        pollIntervalSeconds: 300,
      },
      cameras: [],
    };
  }

  private static async getFilePath(): Promise<string> {
    try {
      await fs.access("/data");
      return CONFIG_PATH;
    } catch {
      return FALLBACK_CONFIG_PATH;
    }
  }

  public static async load(): Promise<CameraUiStore> {
    if (this.cachedStore) return this.cachedStore;

    const target = await this.getFilePath();
    try {
      const raw = await fs.readFile(target, "utf8");
      const parsed = JSON.parse(raw);
      const cameras = Array.isArray(parsed.cameras)
        ? parsed.cameras.map((cam: CameraUiCameraRecord) => {
            if (cam.rtspUrl && cam.rtspUrl.includes("#")) {
              cam.rtspUrl = cam.rtspUrl.substring(0, cam.rtspUrl.indexOf("#"));
            }
            if (cam.subRtspUrl && cam.subRtspUrl.includes("#")) {
              cam.subRtspUrl = cam.subRtspUrl.substring(0, cam.subRtspUrl.indexOf("#"));
            }
            if (cam.snapshotUrl && cam.snapshotUrl.includes("#")) {
              cam.snapshotUrl = cam.snapshotUrl.substring(0, cam.snapshotUrl.indexOf("#"));
            }
            return cam;
          })
        : [];
      this.cachedStore = {
        config: { ...this.getDefaultStore().config, ...(parsed.config || {}) },
        cameras,
      };
      return this.cachedStore;
    } catch {
      this.cachedStore = this.getDefaultStore();
      return this.cachedStore;
    }
  }

  public static async save(store: CameraUiStore): Promise<void> {
    this.cachedStore = store;
    const target = await this.getFilePath();
    try {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, JSON.stringify(store, null, 2), "utf8");
    } catch (err) {
      // Fallback
    }
  }

  public static async mergeDiscoveredCameras(
    discovered: CameraUiCameraRecord[],
  ): Promise<CameraUiStore> {
    const store = await this.load();
    const existingMap = new Map<string, CameraUiCameraRecord>(
      store.cameras.map((c) => [c.id, c]),
    );

    const merged: CameraUiCameraRecord[] = [];
    for (const item of discovered) {
      const existing = existingMap.get(item.id);
      if (existing) {
        merged.push({
          ...item,
          // Preserve persistent HAP pairing and network settings
          port: existing.port || item.port,
          username: existing.username || item.username,
          pincode: existing.pincode || item.pincode,
          setupId: existing.setupId || item.setupId,
          uuid: existing.uuid || item.uuid,
          isPaired: existing.isPaired ?? false,
          homeKitEnabled: existing.homeKitEnabled ?? true,
          motionActive: existing.motionActive ?? false,
          lastMotionAt: existing.lastMotionAt,
          doorbellActive: existing.doorbellActive ?? false,
          lastDoorbellAt: existing.lastDoorbellAt,
        });
      } else {
        merged.push(item);
      }
    }

    store.cameras = merged;
    store.config.lastSyncedAt = new Date().toISOString();
    store.config.lastError = undefined;
    await this.save(store);
    return store;
  }

  public static async updateCamera(
    cameraId: string,
    updater: (cam: CameraUiCameraRecord) => CameraUiCameraRecord,
  ): Promise<CameraUiStore> {
    const store = await this.load();
    const cleanId = cameraId
      .replace(/^camera\.cameraui_/, "")
      .replace(/^camera\./, "")
      .replace(/^cameraui_/, "");
    const idx = store.cameras.findIndex((c) => {
      const cClean = c.id
        .replace(/^camera\.cameraui_/, "")
        .replace(/^camera\./, "")
        .replace(/^cameraui_/, "");
      return (
        cClean === cleanId ||
        c.id === cameraId ||
        `camera.${c.id}` === cameraId ||
        `camera.cameraui_${cClean}` === cameraId ||
        `cameraui_${cleanId}` === c.id
      );
    });
    if (idx !== -1) {
      store.cameras[idx] = updater({ ...store.cameras[idx] });
      await this.save(store);
    }
    return store;
  }

  public static async updateConnectionStatus(
    status: "connected" | "disconnected" | "error",
    error?: string,
  ): Promise<CameraUiStore> {
    const store = await this.load();
    store.config.connectionStatus = status;
    if (error !== undefined) {
      store.config.lastError = error;
    } else if (status === "connected") {
      store.config.lastError = undefined;
    }
    const isOnline = status === "connected";
    store.cameras.forEach((cam) => {
      cam.status = isOnline ? "online" : "offline";
    });
    await this.save(store);
    return store;
  }
}

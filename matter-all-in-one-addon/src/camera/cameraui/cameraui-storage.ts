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
        enabled: true,
        serverUrl: "http://127.0.0.1:8181",
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
      let hadMigration = false;
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
            // Auto-repair dead host 192.168.110.46 to active local Home Assistant go2rtc host 192.168.110.147
            if (cam.rtspUrl && cam.rtspUrl.includes("192.168.110.46:8554")) {
              if (cam.rtspUrl.includes("vimtag_gym") || /gym/i.test(cam.name || "")) {
                cam.rtspUrl = "rtsp://192.168.110.147:8554/vimtag_113";
                hadMigration = true;
              } else if (
                cam.rtspUrl.includes("cochera") ||
                cam.rtspUrl.includes("jardin") ||
                cam.rtspUrl.includes("recamara") ||
                cam.rtspUrl.includes("area_de_cafe") ||
                cam.rtspUrl.includes("cocina_ring") ||
                cam.rtspUrl.includes("camara_de_playroom") ||
                cam.rtspUrl.includes("vimtag_113")
              ) {
                cam.rtspUrl = cam.rtspUrl.replace("192.168.110.46:8554", "192.168.110.147:8554");
                hadMigration = true;
              }
            }
            return cam;
          })
        : [];
      const storeConfig = { ...this.getDefaultStore().config, ...(parsed.config || {}) };
      // Auto-enable integration if cameras exist in storage
      if (cameras.length > 0) {
        storeConfig.enabled = true;
      }
      this.cachedStore = {
        config: storeConfig,
        cameras,
      };
      if (hadMigration) {
        void this.save(this.cachedStore);
      }
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
    // Safety guard: never wipe stored cameras on an empty sync result.
    // An empty list almost always means a transient error (bad credentials,
    // network timeout, etc.) — preserve what we already have.
    if (discovered.length === 0) return store;
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
    store.config.enabled = true;
    store.config.connectionStatus = "connected";
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
    // Only mark cameras online when server is confirmed connected.
    // Do not force cameras offline when server connection is momentarily interrupted,
    // as direct RTSP streams or HomeKit accessories may still be streaming.
    if (status === "connected") {
      store.cameras.forEach((cam) => {
        cam.status = "online";
      });
    }
    await this.save(store);
    return store;
  }
}

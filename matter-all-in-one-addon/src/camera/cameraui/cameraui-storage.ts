import fs from "node:fs/promises";
import path from "node:path";
import type { CameraUiCameraRecord, CameraUiConfig, CameraUiStore } from "./cameraui-types.js";

const CONFIG_PATH = "/data/cameraui-config.json";
const FALLBACK_CONFIG_PATH = "./cameraui-config.json";

export function repairCameraRecord(cam: CameraUiCameraRecord): { cam: CameraUiCameraRecord; modified: boolean } {
  let modified = false;
  const name = (cam.name || "").toLowerCase();

  // Strip trailing hash fragments
  if (cam.rtspUrl && cam.rtspUrl.includes("#")) {
    cam.rtspUrl = cam.rtspUrl.substring(0, cam.rtspUrl.indexOf("#"));
    modified = true;
  }
  if (cam.subRtspUrl && cam.subRtspUrl.includes("#")) {
    cam.subRtspUrl = cam.subRtspUrl.substring(0, cam.subRtspUrl.indexOf("#"));
    modified = true;
  }
  if (cam.snapshotUrl && cam.snapshotUrl.includes("#")) {
    cam.snapshotUrl = cam.snapshotUrl.substring(0, cam.snapshotUrl.indexOf("#"));
    modified = true;
  }

  const url = (cam.rtspUrl || "").toLowerCase();

  // Wyze Patio Trasero: strictly enforce 1080p stream0
  if (name.includes("wyze") || url.includes("wyze") || url.includes("192.168.110.118")) {
    if (cam.rtspUrl && cam.rtspUrl.includes("/stream1")) {
      cam.rtspUrl = cam.rtspUrl.replace("/stream1", "/stream0");
      modified = true;
    }
    if (!cam.rtspUrl || cam.rtspUrl.includes("192.168.110.46")) {
      cam.rtspUrl = "rtsp://Gecko:Mrlsc%401503@192.168.110.118:554/stream0";
      modified = true;
    }
    if (!cam.width || cam.width < 1920) {
      cam.width = 1920;
      cam.height = 1080;
      cam.fps = 30;
      modified = true;
    }
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Vimtag Gym: 2560x1440 2K HEVC
  else if (url.includes("vimtag_gym") || name.includes("gym")) {
    const targetUrl = "rtsp://192.168.110.147:8554/vimtag_113";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 2560;
    cam.height = 1440;
    cam.fps = 20;
    cam.videoCodec = "hevc";
    cam.strategy = "passthrough_hevc";
  }
  // Vimtag Cochera: 2560x1440 2K HEVC
  else if (url.includes("cochera") || name.includes("cochera")) {
    const targetUrl = "rtsp://192.168.110.147:8554/cochera";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 2560;
    cam.height = 1440;
    cam.fps = 20;
    cam.videoCodec = "hevc";
    cam.strategy = "passthrough_hevc";
  }
  // Vimtag Oficina / Jardin: 2560x1440 2K HEVC
  else if (
    url.includes("jardin") ||
    url.includes("vimtag_oficina") ||
    name.includes("jardin") ||
    (name.includes("oficina") && (name.includes("vimtag") || url.includes("vimtag")))
  ) {
    const targetUrl = "rtsp://192.168.110.147:8554/jardin";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 2560;
    cam.height = 1440;
    cam.fps = 20;
    cam.videoCodec = "hevc";
    cam.strategy = "passthrough_hevc";
  }
  // Vimtag Recamara Visita: 2560x1440 2K H264
  else if (url.includes("recamara") || name.includes("recamara")) {
    const targetUrl = "rtsp://192.168.110.147:8554/recamara";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 2560;
    cam.height = 1440;
    cam.fps = 20;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Sala Vimtag: 2560x1440 2K HEVC
  else if (url.includes("sala-vimtag") || url.includes("sala_vimtag") || name.includes("sala")) {
    const targetUrl = "rtsp://192.168.110.147:8554/sala-vimtag";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 2560;
    cam.height = 1440;
    cam.fps = 20;
    cam.videoCodec = "hevc";
    cam.strategy = "passthrough_hevc";
  }
  // Cocina Ring: 1080p H264
  else if (url.includes("cocina_ring") || name.includes("cocina")) {
    const targetUrl = "rtsp://192.168.110.147:8554/cocina_ring";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 1920;
    cam.height = 1080;
    cam.fps = 30;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Ring Bodega: 1080p H264
  else if (url.includes("ring_bodega") || name.includes("bodega")) {
    const targetUrl = "rtsp://192.168.110.147:8554/ring_bodega";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 1920;
    cam.height = 1080;
    cam.fps = 30;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Ring Lavanderia: 1080p H264
  else if (url.includes("ring_lavanderia") || name.includes("lavanderia")) {
    const targetUrl = "rtsp://192.168.110.147:8554/ring_lavanderia";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 1920;
    cam.height = 1080;
    cam.fps = 30;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Tapo C402: 2304x1296 2K 3MP H264
  else if (url.includes("tapo-c402") || name.includes("c402")) {
    const targetUrl = "rtsp://192.168.110.147:62291/tapo-c402";
    if (cam.rtspUrl !== targetUrl) {
      cam.rtspUrl = targetUrl;
      modified = true;
    }
    cam.width = 2304;
    cam.height = 1296;
    cam.fps = 15;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Tapo C120: 1080p H264
  else if (url.includes("tapo_c120") || name.includes("c120")) {
    if (cam.rtspUrl && cam.rtspUrl.includes("192.168.110.46:8554")) {
      cam.rtspUrl = cam.rtspUrl.replace("192.168.110.46:8554", "192.168.110.147:8554");
      modified = true;
    }
    cam.width = 1920;
    cam.height = 1080;
    cam.fps = 30;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }
  // Ezviz Patio Trasero: 1080p H264
  else if (url.includes("ezviz") || name.includes("ezviz")) {
    if (cam.rtspUrl && cam.rtspUrl.includes("192.168.110.46:8554")) {
      cam.rtspUrl = cam.rtspUrl.replace("192.168.110.46:8554", "192.168.110.147:8554");
      modified = true;
    }
    cam.width = 1920;
    cam.height = 1080;
    cam.fps = 30;
    cam.videoCodec = "h264";
    cam.strategy = "passthrough_h264";
  }

  // Global repair for any rtsp://192.168.110.46 references
  if (
    cam.rtspUrl &&
    (cam.rtspUrl.includes("192.168.110.46:8554") ||
      cam.rtspUrl.includes("192.168.110.46:554") ||
      cam.rtspUrl.startsWith("rtsp://192.168.110.46"))
  ) {
    cam.rtspUrl = cam.rtspUrl
      .replace("192.168.110.46:8554", "192.168.110.147:8554")
      .replace("192.168.110.46:554", "192.168.110.147:8554")
      .replace("rtsp://192.168.110.46/", "rtsp://192.168.110.147:8554/");
    modified = true;
  }
  if (
    cam.subRtspUrl &&
    (cam.subRtspUrl.includes("192.168.110.46:8554") ||
      cam.subRtspUrl.includes("192.168.110.46:554") ||
      cam.subRtspUrl.startsWith("rtsp://192.168.110.46"))
  ) {
    cam.subRtspUrl = cam.subRtspUrl
      .replace("192.168.110.46:8554", "192.168.110.147:8554")
      .replace("192.168.110.46:554", "192.168.110.147:8554")
      .replace("rtsp://192.168.110.46/", "rtsp://192.168.110.147:8554/");
    modified = true;
  }

  return { cam, modified };
}

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
      const parsed = JSON.parse(raw);
      let hadMigration = false;
      const cameras = Array.isArray(parsed.cameras)
        ? parsed.cameras.map((cam: CameraUiCameraRecord) => {
            const result = repairCameraRecord(cam);
            if (result.modified) hadMigration = true;
            return result.cam;
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
    if (discovered.length === 0) return store;
    const existingMap = new Map<string, CameraUiCameraRecord>(
      store.cameras.map((c) => [c.id, c]),
    );

    const merged: CameraUiCameraRecord[] = [];
    for (const rawItem of discovered) {
      const repaired = repairCameraRecord(rawItem).cam;
      const existing = existingMap.get(repaired.id);
      if (existing) {
        // If existing has a valid working URL and repaired has .46, keep existing or repair it
        const finalItem = repairCameraRecord({
          ...repaired,
          // Preserve persistent HAP pairing and network settings
          port: existing.port || repaired.port,
          username: existing.username || repaired.username,
          pincode: existing.pincode || repaired.pincode,
          setupId: existing.setupId || repaired.setupId,
          uuid: existing.uuid || repaired.uuid,
          isPaired: existing.isPaired ?? false,
          homeKitEnabled: existing.homeKitEnabled ?? true,
          motionActive: existing.motionActive ?? false,
          lastMotionAt: existing.lastMotionAt,
          doorbellActive: existing.doorbellActive ?? false,
          lastDoorbellAt: existing.lastDoorbellAt,
        }).cam;
        merged.push(finalItem);
      } else {
        merged.push(repaired);
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

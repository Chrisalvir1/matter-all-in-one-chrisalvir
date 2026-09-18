import crypto from "node:crypto";
import { uuid } from "hap-nodejs";
import { MatterbridgeEndpoint, occupancySensor } from "matterbridge";
import { OccupancySensing } from "matterbridge/matter/clusters";
import { safeSetAttribute } from "../../utils/matter-attributes.js";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import { HomeKitCameraAccessory } from "../homekit/homekit-camera.accessory.js";
import type { CameraUiCameraRecord } from "./cameraui-types.js";
import { CameraUiStorage } from "./cameraui-storage.js";

export class CameraUiHomeKitBridge {
  private static activeAccessories = new Map<string, HomeKitCameraAccessory>();
  private static activeMatterEndpoints = new Map<string, MatterbridgeEndpoint>();

  public static getAccessory(cameraId: string): HomeKitCameraAccessory | undefined {
    return this.activeAccessories.get(cameraId);
  }

  public static getAllAccessories(): Map<string, HomeKitCameraAccessory> {
    return this.activeAccessories;
  }

  public static getMatterEndpoint(cameraId: string): MatterbridgeEndpoint | undefined {
    return this.activeMatterEndpoints.get(cameraId);
  }

  public static getAllMatterEndpoints(): Map<string, MatterbridgeEndpoint> {
    return this.activeMatterEndpoints;
  }

  public static async mountCamera(
    platform: any,
    camera: CameraUiCameraRecord,
  ): Promise<HomeKitCameraAccessory | undefined> {
    if (!camera.homeKitEnabled || !camera.rtspUrl) {
      return undefined;
    }

    // Strip URL fragments (#gop=1, etc.)
    if (camera.rtspUrl && camera.rtspUrl.includes("#")) {
      camera.rtspUrl = camera.rtspUrl.substring(0, camera.rtspUrl.indexOf("#"));
    }
    if (camera.subRtspUrl && camera.subRtspUrl.includes("#")) {
      camera.subRtspUrl = camera.subRtspUrl.substring(0, camera.subRtspUrl.indexOf("#"));
    }
    if (camera.snapshotUrl && camera.snapshotUrl.includes("#")) {
      camera.snapshotUrl = camera.snapshotUrl.substring(0, camera.snapshotUrl.indexOf("#"));
    }

    const existing = this.activeAccessories.get(camera.id);
    if (existing && existing.isStreaming) {
      // Don't unmount or interrupt active Live View sessions
      return existing;
    }
    if (existing) {
      await existing.unpublish();
      this.activeAccessories.delete(camera.id);
    }

    const hasSource = Boolean(camera.rtspUrl);
    const rawCodec = (
      camera.videoCodec ||
      (camera as any).vcodec ||
      (camera as any).codec ||
      ""
    ).toLowerCase();

    const isHevc =
      rawCodec.includes("hevc") ||
      rawCodec.includes("265") ||
      /vimtag/i.test(
        camera.name + " " + (camera.model || "") + " " + (camera.manufacturer || "") + " " + (camera.id || ""),
      ) ||
      /c402|c420|c425|c520|c320|c325|tc72/i.test(camera.model || "") ||
      /c402|c420|c425|c520|c320|c325|tc72/i.test(camera.name || "") ||
      Boolean(
        camera.width &&
          camera.width >= 2304 &&
          /tapo/i.test(
            camera.name + " " + (camera.model || "") + " " + (camera.manufacturer || ""),
          ),
      );

    const isHaProxy = Boolean(
      camera.rtspUrl &&
        (camera.rtspUrl.includes("/api/camera_proxy") ||
          camera.rtspUrl.includes("/api/camera_proxy_stream")),
    );

    const chosenCodec = isHevc ? "hevc" : "h264";
    const chosenStrategy = isHaProxy
      ? "transcode_required"
      : isHevc
        ? "passthrough_hevc"
        : "passthrough_h264";

    let detectedWidth = camera.width || 1920;
    let detectedHeight = camera.height || 1080;
    const nameAndModel = `${camera.name} ${camera.model || ""} ${camera.manufacturer || ""}`.toLowerCase();
    if (detectedWidth <= 1920) {
      if (/4k|uhd|8mp/i.test(nameAndModel)) {
        detectedWidth = 3840;
        detectedHeight = 2160;
      } else if (/2k|qhd|c402|c420|c425|c520|c325|tc72|3mp|4mp|5mp/i.test(nameAndModel)) {
        detectedWidth = 2560;
        detectedHeight = 1440;
      }
    }

    const linkedEntities = platform?.findLinkedCameraEntities?.(camera.name, camera.id) || [];
    const hasLight = Boolean(camera.hasLight || linkedEntities.some((e: any) => e.type === "light"));
    const hasSiren = Boolean(camera.hasSiren || linkedEntities.some((e: any) => e.type === "siren"));
    const hasDoorbell = Boolean(camera.doorbellTopic || linkedEntities.some((e: any) => e.type === "doorbell"));

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: hasSource,
      streamSourceType: isHaProxy ? "ha_proxy" : "rtsp",
      videoCodec: chosenCodec,
      hasAudio: camera.hasAudio,
      audioCodec: "aac_lc",
      resolution: {
        width: detectedWidth,
        height: detectedHeight,
      },
      maxFps: camera.fps || 30,
      strategy: chosenStrategy,
      requiresTranscoding: isHaProxy,
      snapshotSupported: Boolean(camera.snapshotUrl),
      snapshotUrl: camera.snapshotUrl,
      hksvCapable: Boolean(camera.rtspUrl),
    };

    const source: ResolvedStreamSource = {
      sourceType: isHaProxy ? "ha_proxy" : "rtsp",
      url: camera.rtspUrl,
      snapshotUrl: camera.snapshotUrl,
      supportsPassthrough: !isHaProxy,
      requiresBridge: true,
      metadata: {
        isCameraUi: true,
        camerauiCameraId: camera.id,
        hasDoorbell,
        hasLight,
        hasSiren,
        model: camera.model || "Camera.UI Stream",
      },
    };

    // Allocate persistent HomeKit configuration if not assigned
    if (!camera.port) {
      camera.port = this.allocateNextPort(platform);
    }
    if (!camera.pincode) {
      camera.pincode = "031-45-154";
    }
    if (!camera.username) {
      const hex = crypto.randomBytes(5).toString("hex").toUpperCase();
      camera.username = `0E:${hex.match(/.{2}/g)!.join(":")}`;
    }
    if (!camera.setupId) {
      camera.setupId = crypto.randomBytes(2).toString("hex").toUpperCase().slice(0, 4);
    }
    if (!camera.uuid) {
      camera.uuid = uuid.generate(`cameraui:camera:${camera.id}`);
    }

    const record: HomeKitCameraStorageRecord = {
      entityId: `camera.${camera.id}`,
      uuid: camera.uuid || uuid.generate(`cameraui:camera:${camera.id}`),
      username: camera.username,
      pincode: camera.pincode,
      setupId: camera.setupId,
      port: camera.port,
      published: false,
      isPaired: camera.isPaired ?? false,
      name: camera.name,
      manufacturer: camera.manufacturer || "Camera.UI",
      model: camera.model || "Network Camera",
      serialNumber: camera.serialNumber || `CUI-${camera.id.toUpperCase()}`,
      strategy: chosenStrategy,
      state: "idle",
      hksvEnabled: Boolean(camera.rtspUrl),
      hksvCapable: Boolean(camera.rtspUrl),
      hksvVerified: false,
      hksvState: camera.rtspUrl ? "waiting_hub" : "not_capable",
    };

    const accessory = new HomeKitCameraAccessory(
      platform,
      record.entityId,
      record,
      capabilities,
      source,
    );

    // Register pairing synchronization listeners
    accessory.accessory.on("paired", () => {
      camera.isPaired = true;
      void CameraUiStorage.updateCamera(camera.id, (c) => {
        c.isPaired = true;
        return c;
      });
      platform.broadcastSseMessage?.("cameraui_updated", {
        cameraId: camera.id,
        isPaired: true,
      });
      platform.broadcastSseMessage?.("camera_pairing_updated", {
        entityId: record.entityId,
        isPaired: true,
      });
      platform.broadcastSseMessage?.("state_change", {
        entityId: record.entityId,
        isPaired: true,
      });
    });

    accessory.accessory.on("unpaired", () => {
      camera.isPaired = false;
      void CameraUiStorage.updateCamera(camera.id, (c) => {
        c.isPaired = false;
        return c;
      });
      platform.broadcastSseMessage?.("cameraui_updated", {
        cameraId: camera.id,
        isPaired: false,
      });
      platform.broadcastSseMessage?.("camera_pairing_updated", {
        entityId: record.entityId,
        isPaired: false,
      });
      platform.broadcastSseMessage?.("state_change", {
        entityId: record.entityId,
        isPaired: false,
      });
    });

    await accessory.publish();
    camera.setupUri = accessory.setupUri;
    camera.isPaired = accessory.isPaired();
    this.activeAccessories.set(camera.id, accessory);

    platform.log?.notice?.(
      `[Camera.UI][${camera.name}] Published to HomeKit HAP on port ${camera.port} (code: ${camera.pincode}, codec: ${chosenCodec}, strategy: ${chosenStrategy})`,
    );

    // Register Matter Occupancy Sensing endpoint only if explicitly exported
    const shouldExportMatter = camera.realEntities?.some(
      (e) => (e.type === "motion" || e.domain === "binary_sensor") && e.matterExported,
    );
    if (shouldExportMatter && platform?.registerDevice && !this.activeMatterEndpoints.has(camera.id)) {
      try {
        const safeName = (camera.name || `Cámara ${camera.id}`).substring(0, 32).trim();
        const uniqueId = `cameraui_${camera.id}_occupancy`;
        const matterEndpoint = new MatterbridgeEndpoint([occupancySensor], {
          id: uniqueId,
          mode: "server",
        });
        matterEndpoint.deviceName = `${safeName} Movimiento`;
        matterEndpoint.uniqueId = uniqueId;
        matterEndpoint.serialNumber = `CUI-${camera.id.toUpperCase()}`.substring(0, 32);
        matterEndpoint.vendorId = 0xfff1;
        matterEndpoint.vendorName = (camera.manufacturer || "Camera.UI").substring(0, 32);
        matterEndpoint.productId = 0x8000;
        matterEndpoint.softwareVersion = 1;
        matterEndpoint.softwareVersionString = "Matterbridge 1.3.7";

        matterEndpoint.createDefaultBasicInformationClusterServer(
          `${safeName} Movimiento`,
          matterEndpoint.serialNumber,
          0xfff1,
          matterEndpoint.vendorName,
          0x8000,
          "Sensor Detección Camera.UI",
        );
        matterEndpoint.createDefaultOccupancySensingClusterServer(false);
        matterEndpoint.addRequiredClusterServers();

        await platform.registerDevice(matterEndpoint);
        const serverNode = (matterEndpoint as any).serverNode;
        if (serverNode && !serverNode.lifecycle?.isOnline) {
          await serverNode.start();
        }
        this.activeMatterEndpoints.set(camera.id, matterEndpoint);
        platform.log?.notice?.(
          `[Camera.UI][${camera.name}] ✅ Exportado a Matter como Occupancy Sensor (uniqueId: ${uniqueId}) para automatizaciones en Home Assistant.`,
        );
      } catch (err) {
        platform.log?.warn?.(
          `[Camera.UI][${camera.name}] No se pudo registrar endpoint Matter para ocupación: ${err}`,
        );
      }
    }

    // Persist changes
    const store = await CameraUiStorage.load();
    const idx = store.cameras.findIndex((c) => c.id === camera.id);
    if (idx !== -1) {
      store.cameras[idx] = camera;
      await CameraUiStorage.save(store);
    }

    return accessory;
  }

  public static async unmountCamera(cameraId: string, platform?: any): Promise<void> {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory) {
      await accessory.unpublish();
      this.activeAccessories.delete(cameraId);
    }
    const matterEndpoint = this.activeMatterEndpoints.get(cameraId);
    if (matterEndpoint) {
      try {
        if (platform?.unregisterDevice) {
          await platform.unregisterDevice(matterEndpoint);
        }
      } catch {}
      this.activeMatterEndpoints.delete(cameraId);
    }
  }

  public static updateMotion(
    cameraId: string,
    active: boolean,
    platform?: any,
  ): boolean {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory) {
      accessory.updateMotionState(active);
    }
    const matterEndpoint = this.activeMatterEndpoints.get(cameraId);
    if (matterEndpoint) {
      try {
        void safeSetAttribute(
          matterEndpoint,
          OccupancySensing.id,
          "occupancy",
          { occupied: Boolean(active) },
          platform?.log,
        );
      } catch {}
    }
    return Boolean(accessory || matterEndpoint);
  }

  public static triggerDoorbell(cameraId: string): boolean {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory?.accessory) {
      try {
        const doorbell = accessory.accessory.getService("Doorbell");
        if (doorbell) {
          doorbell.setCharacteristic("ProgrammableSwitchEvent", 0); // 0 = SINGLE_PRESS
          return true;
        }
      } catch {}
    }
    return false;
  }

  public static async resetPairing(
    platform: any,
    cameraId: string,
  ): Promise<boolean> {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory) {
      await accessory.resetPairing();
      const store = await CameraUiStorage.load();
      const camera = store.cameras.find((c) => c.id === cameraId);
      if (camera) {
        camera.username = accessory.record.username;
        camera.setupId = accessory.record.setupId;
        camera.port = accessory.record.port;
        camera.uuid = accessory.record.uuid;
        camera.isPaired = false;
        camera.setupUri = accessory.setupUri;
        await CameraUiStorage.save(store);
      }
      return true;
    }
    return false;
  }

  private static allocateNextPort(platform: any): number {
    const usedPorts = new Set<number>();
    if (platform?.homekitCameraRecords) {
      for (const rec of platform.homekitCameraRecords.values()) {
        if (rec.port) usedPorts.add(rec.port);
      }
    }
    for (const acc of this.activeAccessories.values()) {
      if (acc.record?.port) usedPorts.add(acc.record.port);
    }
    let port = 51860;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }
}

(globalThis as any).__camerauiBridge = CameraUiHomeKitBridge;

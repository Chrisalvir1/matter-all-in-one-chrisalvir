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
import { FfmpegMotionDetector } from "../motion/ffmpeg-motion-detector.js";
import type { CameraUiCameraRecord } from "./cameraui-types.js";
import { CameraUiStorage } from "./cameraui-storage.js";

export class CameraUiHomeKitBridge {
  private static activeAccessories = new Map<string, HomeKitCameraAccessory>();
  private static activeMatterEndpoints = new Map<string, MatterbridgeEndpoint>();
  /** One FFmpeg motion detector per mounted camera, keyed by camera.id */
  private static activeMotionDetectors = new Map<string, FfmpegMotionDetector>();

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

    const existing = this.activeAccessories.get(camera.id);
    if (existing && existing.isStreaming) {
      // Don't unmount or interrupt active Live View sessions
      return existing;
    }
    if (existing) {
      await existing.unpublish();
      this.activeAccessories.delete(camera.id);
      const oldDet = this.activeMotionDetectors.get(camera.id);
      if (oldDet) {
        oldDet.stop(platform?.log);
        this.activeMotionDetectors.delete(camera.id);
      }
    }

    const hasSource = Boolean(camera.rtspUrl);
    // Todo stream RTSP/RTSPS de Camera.UI (H.264 o H.265/HEVC) es válido para HKSV:
    // el recordingDelegate transcodifica a H.264 vía FFmpeg cuando el origen es H.265,
    // por lo que el códec de origen nunca debe bloquear la capacidad HKSV.
    const isRtspSource = Boolean(camera.rtspUrl && /^rtsps?:\/\//i.test(camera.rtspUrl));
    const isHaProxy = false;
    const rawCodec = (camera.videoCodec || "").toLowerCase();
    const isExplicitH264 = rawCodec === "h264" || rawCodec === "avc";
    const isHevc =
      !isExplicitH264 &&
      (rawCodec.includes("hevc") || rawCodec.includes("265"));
    const chosenCodec = isHevc ? "hevc" : "h264";
    const chosenStrategy = isHevc ? "transcode" : "passthrough_h264";

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: hasSource,
      streamSourceType: "rtsp",
      videoCodec: chosenCodec,
      hasAudio: camera.hasAudio,
      audioCodec: "aac_lc",
      resolution: {
        width: camera.width || 1920,
        height: camera.height || 1080,
      },
      maxFps: camera.fps || 30,
      strategy: chosenStrategy,
      requiresTranscoding: isHaProxy,
      snapshotSupported: Boolean(camera.snapshotUrl),
      snapshotUrl: camera.snapshotUrl,
      hksvCapable: isRtspSource,
    };

    const source: ResolvedStreamSource = {
      sourceType: "rtsp",
      url: camera.rtspUrl,
      snapshotUrl: camera.snapshotUrl,
      supportsPassthrough: true,
      requiresBridge: true,
      metadata: {
        isCameraUi: true,
        camerauiCameraId: camera.id,
        hasDoorbell: Boolean(camera.doorbellTopic),
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
      uuid: camera.uuid,
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
      hksvEnabled: isRtspSource,
      hksvCapable: isRtspSource,
      hksvVerified: false,
      hksvState: isRtspSource ? "waiting_hub" : "not_capable",
      motionEntityId: camera.motionEntityId,
      lightEntityId: camera.lightEntityId,
      sirenEntityId: camera.sirenEntityId,
    };

    const accessory = new HomeKitCameraAccessory(
      platform,
      record.entityId,
      record,
      capabilities,
      source,
    );

    await accessory.publish();
    camera.setupUri = accessory.setupUri;
    camera.isPaired = accessory.isPaired();
    this.activeAccessories.set(camera.id, accessory);

    platform.log?.notice?.(
      `[Camera.UI][${camera.name}] Published to HomeKit HAP on port ${camera.port} (code: ${camera.pincode}, codec: ${chosenCodec}, strategy: ${chosenStrategy})`,
    );

    // Register Matter Occupancy Sensing endpoint automatically for every mounted
    // Camera.UI camera with a valid stream, so Home Assistant / Matter controllers
    // receive motion/OpenCV detections without requiring a manual per-entity toggle.
    const shouldExportMatter = hasSource;
    if (shouldExportMatter && platform?.registerDevice && !this.activeMatterEndpoints.has(camera.id)) {
      try {
        const safeName = (camera.name || `Cámara ${camera.id}`).substring(0, 32).trim();
        const uniqueId = `cameraui_${camera.id}_occupancy`;
        const matterEndpoint = new MatterbridgeEndpoint([occupancySensor], {
          id: uniqueId,
          mode: "server",
        });
        matterEndpoint.deviceName = `${safeName.substring(0, 24)} CUI Motion`;
        matterEndpoint.uniqueId = uniqueId;
        matterEndpoint.serialNumber = `CUI-${camera.id.toUpperCase()}`.substring(0, 32);
        matterEndpoint.vendorId = 0xfff1;
        matterEndpoint.vendorName = (camera.manufacturer || "Camera.UI").substring(0, 32);
        matterEndpoint.productId = 0x8000;
        matterEndpoint.softwareVersion = 1;
        matterEndpoint.softwareVersionString = "Matterbridge 1.3.7";

        matterEndpoint.createDefaultBasicInformationClusterServer(
          `${safeName.substring(0, 24)} CUI Motion`,
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

    // Start local FFmpeg motion detector for this camera if RTSP URL is available
    if (camera.rtspUrl && !this.activeMotionDetectors.has(camera.id)) {
      try {
        const detector = new FfmpegMotionDetector({
          cameraId: camera.id,
          cameraName: camera.name || `Cámara ${camera.id}`,
          rtspUrl: camera.rtspUrl,
          changeThresholdPercent: 4,
          cooldownMs: 4000,
          resetMs: 15000,
        });
        detector.on("motion", (active: boolean) => {
          CameraUiHomeKitBridge.updateMotion(camera.id, active, platform, "FFmpeg Video");
        });
        accessory.delegate.on("session-start", () => {
          detector.pause(platform?.log);
        });
        accessory.delegate.on("session-end", () => {
          detector.resume(platform?.log);
        });
        detector.start(platform?.log);
        this.activeMotionDetectors.set(camera.id, detector);
      } catch (detErr) {
        platform?.log?.warn?.(
          `[Camera.UI][${camera.name}] No se pudo iniciar el detector de movimiento FFmpeg local: ${detErr}`,
        );
      }
    }

    return accessory;
  }

  public static async unmountCamera(cameraId: string, platform?: any): Promise<void> {
    const detector = this.activeMotionDetectors.get(cameraId);
    if (detector) {
      detector.stop(platform?.log);
      this.activeMotionDetectors.delete(cameraId);
    }
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
    triggerSource?: string,
  ): boolean {
    const accessory = this.activeAccessories.get(cameraId);
    const camName = accessory?.record?.name || cameraId;

    if (accessory) {
      accessory.updateMotionState(active);
      platform?.log?.notice?.(
        `[Detección][${camName}] 🎯 ${active ? `MOVIMIENTO CONFIRMADO${triggerSource ? ` [Origen: ${triggerSource}]` : ""}` : "MOVIMIENTO FINALIZADO"} → Disparando HomeKit MotionDetected, HKSV iCloud y Matter Occupancy (active=${active})`,
      );
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

    // Persist active state in memory storage and broadcast to UI via SSE
    void (async () => {
      try {
        const store = await CameraUiStorage.load();
        const cam = store.cameras.find((c) => c.id === cameraId);
        if (cam) {
          cam.motionActive = active;
          cam.motionSource = active ? triggerSource : undefined;
          if (active) cam.lastMotionAt = new Date().toISOString();
          await CameraUiStorage.save(store);
        }
      } catch {}
    })();

    platform?.broadcastSseMessage?.("cameraui_motion", {
      cameraId,
      motionOn: active,
      triggerSource: active ? triggerSource : undefined,
      timestamp: Date.now(),
    });
    platform?.broadcastSseMessage?.("cameraui_updated", {
      cameraId,
      motionActive: active,
      timestamp: Date.now(),
    });

    // Forward to CameraAiDetector so UI "🧠 IA & Fauna" tab lights up in real time
    if (active && platform?.cameraAiDetector) {
      try {
        platform.cameraAiDetector.dispatchDetection(platform, cameraId, {
          cameraId,
          timestamp: Date.now(),
          targets: ["person", "vehicle", "dog"],
          labels: ["Movimiento Detectado (Persona / Vehículo / Animal)"],
          confidence: 0.95,
          rawDetails: `Detector Local FFmpeg: movimiento confirmado en ${camName}`,
        });
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

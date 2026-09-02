import { Characteristic } from "hap-nodejs";
import { HomeKitCameraAccessory } from "../homekit/homekit-camera.accessory.js";
import type { CameraRecord, CameraSensorRecord } from "./scrypted-types.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera-types.js";

export class ScryptedHomeKitBridge {
  private static activeAccessories = new Map<string, HomeKitCameraAccessory>();

  /**
   * Mounts or updates an independent HomeKit HAP camera accessory for a Scrypted camera.
   */
  public static async mountCamera(
    platform: any,
    camera: CameraRecord,
  ): Promise<HomeKitCameraAccessory | null> {
    if (!camera.exportConfig.homeKitEnabled) {
      this.unmountCamera(camera.cameraId);
      return null;
    }

    const existing = this.activeAccessories.get(camera.cameraId);
    if (existing && existing.isPublished) {
      return existing;
    }
    if (existing) {
      this.unmountCamera(camera.cameraId);
    }

    let scryptedHost = "127.0.0.1";
    try {
      if (camera.source.serverId) {
        scryptedHost = new URL(camera.source.serverId).hostname;
      }
    } catch {}

    const streamUrl =
      camera.source.streamReference?.directUrl ||
      `rtsp://${camera.source.streamReference?.host || scryptedHost}:8554/${camera.cameraId}`;

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: true,
      streamSourceType: "rtsp",
      videoCodec: "h264",
      hasAudio: camera.capabilities?.observed?.hasAudio ?? true,
      audioCodec: "aac_lc",
      resolution: camera.capabilities?.observed?.resolution || {
        width: 1920,
        height: 1080,
      },
      maxFps: camera.capabilities?.observed?.fps || 30,
      strategy: "passthrough_h264",
      requiresTranscoding: false,
      snapshotSupported: true,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      hksvCapable: camera.exportConfig.hksvEnabledByDefault !== false,
    };

    const hasDoorbell = camera.sensors.some(
      (s: CameraSensorRecord) => s.type === "doorbell",
    );

    const resolvedSource: ResolvedStreamSource = {
      sourceType: "rtsp",
      url: streamUrl,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      supportsPassthrough: true,
      requiresBridge: false,
      metadata: {
        isScrypted: true,
        scryptedCameraId: camera.cameraId,
        model:
          camera.sourceModel ||
          camera.displayModel ||
          camera.model ||
          "Cámara IP",
        manufacturer: "Matter all in one Chrisalvir",
        serialNumber:
          camera.serialNumber ||
          (camera.identity as any)?.serialNumber ||
          `SCRYPTED-${camera.cameraId.toUpperCase().substring(0, 12)}`,
        hasDoorbell,
      },
    };

    const entityId = `scrypted.${camera.cameraId}`;
    let storageRecord: HomeKitCameraStorageRecord;

    if (typeof platform?.getOrCreateHomeKitCameraRecord === "function") {
      storageRecord = platform.getOrCreateHomeKitCameraRecord(entityId);
    } else {
      const usedPorts = new Set(
        Array.from(this.activeAccessories.values()).map(
          (a) => a.record?.port || 0,
        ),
      );
      let nextPort = 51830;
      while (usedPorts.has(nextPort)) nextPort++;

      storageRecord = {
        entityId,
        uuid: "",
        name: camera.name,
        manufacturer: "Matter all in one Chrisalvir",
        model:
          camera.sourceModel ||
          camera.displayModel ||
          camera.model ||
          "Cámara IP",
        serialNumber:
          camera.serialNumber ||
          (camera.identity as any)?.serialNumber ||
          `SCRYPTED-${camera.cameraId.toUpperCase().substring(0, 12)}`,
        port: nextPort,
        pincode: "031-45-154",
        username: this.generateMacAddress(camera.cameraId),
        setupId: this.generateSetupId(camera.cameraId),
        published: false,
        strategy: "passthrough_h264",
        state: "idle",
      };
    }

    if (!storageRecord.port || storageRecord.port === 0) {
      let nextPort = 51830;
      const usedPorts = new Set(
        Array.from(this.activeAccessories.values()).map(
          (a) => a.record?.port || 0,
        ),
      );
      while (usedPorts.has(nextPort)) nextPort++;
      storageRecord.port = nextPort;
    }

    storageRecord.name = camera.name;
    storageRecord.manufacturer = "Matter all in one Chrisalvir";
    storageRecord.model =
      camera.sourceModel || camera.displayModel || camera.model || "Cámara IP";
    storageRecord.serialNumber =
      camera.serialNumber ||
      (camera.identity as any)?.serialNumber ||
      `SCRYPTED-${camera.cameraId.toUpperCase().substring(0, 12)}`;
    storageRecord.pincode = "031-45-154";
    storageRecord.setupId =
      storageRecord.setupId || this.generateSetupId(camera.cameraId);
    storageRecord.username =
      storageRecord.username || this.generateMacAddress(camera.cameraId);

    const accessory = new HomeKitCameraAccessory(
      platform,
      entityId,
      storageRecord,
      capabilities,
      resolvedSource,
    );

    // If an integrated motion sensor exists, bind it
    const motionSensor = camera.sensors.find(
      (s: CameraSensorRecord) => s.type === "motion",
    );
    if (motionSensor && accessory.motionService) {
      accessory.linkedMotionEntityId = motionSensor.sensorId;
    }

    try {
      await accessory.publish();
      storageRecord.published = true;
      platform?.log?.notice?.(
        `[ScryptedHomeKitBridge] 📷 Publicada cámara HomeKit "${camera.name}" en puerto ${storageRecord.port} (PIN: ${storageRecord.pincode}, URI: ${accessory.setupUri})`,
      );
    } catch (err: any) {
      platform?.log?.error?.(
        `[ScryptedHomeKitBridge] Error al publicar cámara HomeKit "${camera.name}": ${err?.message || err}`,
      );
    }

    this.activeAccessories.set(camera.cameraId, accessory);

    // Populate camera identity with real HomeKit credentials and setup URI
    let setupUri: string | undefined;
    try {
      if (accessory.isPublished) {
        setupUri = accessory.setupUri;
      }
    } catch {}

    camera.identity = {
      ...camera.identity,
      homeKitAccessoryId: entityId,
      homeKitSetupUri: setupUri,
      homeKitPincode: storageRecord.pincode,
      homeKitSetupId: storageRecord.setupId,
      homeKitPort: storageRecord.port,
      homeKitPairingState: accessory.isPaired() ? "paired" : "not_paired",
    };

    return accessory;
  }

  public static unmountCamera(cameraId: string): void {
    const existing = this.activeAccessories.get(cameraId);
    if (existing) {
      try {
        existing.accessory.unpublish();
      } catch {}
      this.activeAccessories.delete(cameraId);
    }
  }

  public static getAccessory(
    cameraId: string,
  ): HomeKitCameraAccessory | undefined {
    return this.activeAccessories.get(cameraId);
  }

  public static notifySensorState(
    cameraId: string,
    sensorType: string,
    state: boolean,
  ): void {
    const acc = this.activeAccessories.get(cameraId);
    if (!acc) return;

    if (sensorType === "motion" && acc.motionService) {
      acc.motionService.setCharacteristic(Characteristic.MotionDetected, state);
    }
  }

  private static generateMacAddress(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    const b1 = "0E";
    const b2 = ((hash >> 24) & 0xff)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const b3 = ((hash >> 16) & 0xff)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const b4 = ((hash >> 8) & 0xff).toString(16).padStart(2, "0").toUpperCase();
    const b5 = (hash & 0xff).toString(16).padStart(2, "0").toUpperCase();
    const b6 = ((hash * 13) & 0xff).toString(16).padStart(2, "0").toUpperCase();
    return `${b1}:${b2}:${b3}:${b4}:${b5}:${b6}`;
  }

  private static generateSetupId(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 37 + id.charCodeAt(i)) >>> 0;
    }
    return (hash & 0xffff)
      .toString(36)
      .toUpperCase()
      .padStart(4, "S")
      .substring(0, 4);
  }
}

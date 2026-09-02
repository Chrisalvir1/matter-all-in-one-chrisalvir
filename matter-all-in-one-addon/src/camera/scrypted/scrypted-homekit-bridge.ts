import { Characteristic } from "hap-nodejs";
import { HomeKitCameraAccessory } from "../homekit/homekit-camera.accessory.js";
import type { CameraRecord, CameraSensorRecord } from "./scrypted-types.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera-types.js";
import {
  resolveDisplayManufacturer,
  resolveDisplayModel,
  resolveDisplaySerialNumber,
} from "./scrypted-storage.js";

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

    // RULE: Never invent an RTSP URL from cameraId.
    // If no real directUrl is present, leave url undefined — FFmpeg must NOT start.
    const directUrl = camera.source.streamReference?.directUrl;
    const validationStatus =
      camera.source.streamValidationStatus ||
      camera.source.streamReference?.validationStatus ||
      "not_checked";
    const streamVerified =
      validationStatus === "verified" && Boolean(directUrl);

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: streamVerified,
      streamSourceType: directUrl ? "rtsp" : "unknown",
      videoCodec: camera.capabilities?.observed?.videoCodec || "h264",
      hasAudio: streamVerified
        ? (camera.capabilities?.observed?.hasAudio ?? false)
        : false,
      audioCodec: streamVerified
        ? camera.capabilities?.observed?.audioCodec === "opus"
          ? "opus"
          : "aac_lc"
        : "none",
      resolution: camera.capabilities?.observed?.resolution || {
        width: 1920,
        height: 1080,
      },
      maxFps: camera.capabilities?.observed?.fps || 30,
      strategy: streamVerified ? "passthrough_h264" : "unsupported",
      requiresTranscoding: false,
      snapshotSupported: true,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      hksvCapable:
        streamVerified && camera.exportConfig.hksvEnabledByDefault !== false,
    };

    const hasDoorbell = camera.sensors.some(
      (s: CameraSensorRecord) => s.type === "doorbell",
    );

    const modelName =
      camera.identityOverride?.model ||
      camera.sourceModel ||
      camera.displayModel ||
      "Modelo no identificado";
    const manufacturerName =
      camera.identityOverride?.manufacturer ||
      camera.sourceManufacturer ||
      camera.displayManufacturer ||
      "Marca no identificada";
    const serial =
      camera.identityOverride?.serialNumber ||
      camera.serialNumber ||
      "Serial no disponible";

    const resolvedSource: ResolvedStreamSource = {
      sourceType: directUrl ? "rtsp" : "unknown",
      url: directUrl, // undefined when no real stream available
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      supportsPassthrough: streamVerified,
      requiresBridge: false,
      metadata: {
        isScrypted: true,
        scryptedCameraId: camera.cameraId,
        streamVerified,
        validationStatus,
        profiles: camera.source.profiles,
        model: modelName,
        manufacturer: manufacturerName,
        serialNumber: serial,
        hasDoorbell,
        needsDumpExtra: camera.capabilities?.observed?.needsDumpExtra,
        transport:
          camera.exportConfig?.rtspTransportPreference ||
          camera.exportConfig?.homeKitExportConfig?.rtspTransportPreference ||
          "auto",
        enableLocalAudioAdaptation:
          camera.exportConfig?.homeKitExportConfig?.enableLocalAudioAdaptation,
      },
    };

    const entityId = `scrypted.${camera.cameraId}`;
    let storageRecord: HomeKitCameraStorageRecord;

    if (typeof platform?.getOrCreateHomeKitCameraRecord === "function") {
      storageRecord = platform.getOrCreateHomeKitCameraRecord(entityId);
      // Update identity in existing record if needed
      if (modelName !== "Modelo no identificado") {
        storageRecord.model = modelName;
      }
      if (serial !== "Serial no disponible") {
        storageRecord.serialNumber = serial;
      }
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
        model: modelName,
        serialNumber: serial,
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
    storageRecord.manufacturer =
      camera.displayManufacturer ||
      resolveDisplayManufacturer(camera) ||
      "Marca no identificada";
    storageRecord.model =
      camera.displayModel ||
      resolveDisplayModel(camera) ||
      "Modelo no identificado";
    storageRecord.serialNumber =
      camera.displaySerialNumber ||
      resolveDisplaySerialNumber(camera) ||
      "Serial no disponible";
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

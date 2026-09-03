import { Characteristic } from "hap-nodejs";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import { HomeKitCameraAccessory } from "../homekit/homekit-camera.accessory.js";
import type { CameraRecord, CameraSensorRecord } from "./scrypted-types.js";
import {
  resolveDisplayModel,
  resolveDisplaySerialNumber,
} from "./scrypted-storage.js";

export class ScryptedHomeKitBridge {
  private static readonly activeAccessories = new Map<
    string,
    HomeKitCameraAccessory
  >();
  private static readonly sourceFingerprints = new Map<string, string>();

  public static async mountCamera(
    platform: any,
    camera: CameraRecord,
  ): Promise<HomeKitCameraAccessory | null> {
    if (!camera.exportConfig.homeKitEnabled) {
      this.unmountCamera(camera.cameraId);
      return null;
    }
    const directUrl = camera.source.streamReference?.directUrl;
    const validationStatus =
      camera.source.streamValidationStatus ||
      camera.source.streamReference?.validationStatus ||
      "not_checked";
    const fingerprint = JSON.stringify({
      directUrl: directUrl || null,
      validationStatus,
      observed: camera.capabilities?.observed || null,
      transport: camera.exportConfig?.rtspTransportPreference || "tcp",
    });
    const existing = this.activeAccessories.get(camera.cameraId);
    if (
      existing?.isPublished &&
      this.sourceFingerprints.get(camera.cameraId) === fingerprint
    ) {
      return existing;
    }
    if (existing) {
      await existing.unpublish();
      this.activeAccessories.delete(camera.cameraId);
    }

    const fatalStatus = [
      "not_found",
      "unauthorized",
      "unsupported",
      "invalid",
      "source_offline",
    ].includes(validationStatus);
    const hasSource = Boolean(directUrl) && !fatalStatus;
    const observed = camera.capabilities?.observed;
    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: hasSource,
      streamSourceType: directUrl ? "rtsp" : "unknown",
      videoCodec: observed?.videoCodec || "h264",
      hasAudio: hasSource && Boolean(observed?.hasAudio),
      audioCodec: observed?.hasAudio ? "aac_lc" : "none",
      resolution: observed?.resolution || { width: 1920, height: 1080 },
      maxFps: observed?.fps || 30,
      strategy: hasSource ? "transcode_required" : "unsupported",
      requiresTranscoding: hasSource,
      snapshotSupported: true,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      hksvCapable: false,
    };

    const model =
      camera.identityOverride?.model ||
      camera.sourceModel ||
      camera.displayModel ||
      // camera.name is always populated from Scrypted device name
      camera.name ||
      "Scrypted Camera";
    const rawSerial =
      camera.identityOverride?.serialNumber ||
      camera.serialNumber;
    // Use the real manufacturer serial when available; otherwise fall back to
    // a stable deterministic identifier derived from the Scrypted device ID.
    // 'Serial no disponible' is stripped so HomeKit shows something meaningful.
    const serial =
      (rawSerial && !rawSerial.startsWith("SCRYPTED-") && rawSerial !== "Serial no disponible"
        ? rawSerial
        : undefined) ||
      resolveDisplaySerialNumber(camera).replace("Serial no disponible", "") ||
      `CAM-${camera.cameraId}`;
    const manufacturer = "Scrypted (Chrisalvir)";
    const hasDoorbell = camera.sensors.some(
      (sensor: CameraSensorRecord) => sensor.type === "doorbell",
    );
    const source: ResolvedStreamSource = {
      sourceType: directUrl ? "rtsp" : "unknown",
      url: directUrl,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      supportsPassthrough: false,
      requiresBridge: true,
      metadata: {
        isScrypted: true,
        scryptedCameraId: camera.cameraId,
        streamVerified: validationStatus === "verified",
        validationStatus,
        profiles: camera.source.profiles,
        model,
        manufacturer,
        serialNumber: serial,
        hasDoorbell,
        transport: camera.exportConfig?.rtspTransportPreference || "tcp",
      },
    };
    const entityId = `scrypted.${camera.cameraId}`;
    let record: HomeKitCameraStorageRecord;
    if (typeof platform?.getOrCreateHomeKitCameraRecord === "function") {
      record = platform.getOrCreateHomeKitCameraRecord(entityId);
    } else {
      let port = 51830;
      const used = new Set(
        [...this.activeAccessories.values()].map((item) => item.record.port),
      );
      while (used.has(port)) port += 1;
      record = {
        entityId,
        uuid: "",
        name: camera.name,
        manufacturer,
        model,
        serialNumber: serial,
        port,
        pincode: "031-45-154",
        username: this.generateMacAddress(camera.cameraId),
        setupId: this.generateSetupId(camera.cameraId),
        published: false,
        strategy: "transcode_required",
        state: "idle",
      };
    }
    if (!record.port) {
      let port = 51830;
      const used = new Set(
        [...this.activeAccessories.values()].map((item) => item.record.port),
      );
      while (used.has(port)) port += 1;
      record.port = port;
    }
    record.name = camera.name;
    record.manufacturer = manufacturer;
    record.model =
      camera.identityOverride?.model ||
      camera.displayModel ||
      resolveDisplayModel(camera) ||
      model;
    record.serialNumber = serial;
    record.strategy = "transcode_required";
    record.hksvCapable = false;
    record.hksvEnabled = false;
    record.pincode = record.pincode || "031-45-154";
    record.setupId = record.setupId || this.generateSetupId(camera.cameraId);
    record.username = record.username || this.generateMacAddress(camera.cameraId);

    const accessory = new HomeKitCameraAccessory(
      platform,
      entityId,
      record,
      capabilities,
      source,
    );
    const motion = camera.sensors.find(
      (sensor: CameraSensorRecord) => sensor.type === "motion",
    );
    if (motion) accessory.linkedMotionEntityId = motion.sensorId;
    await accessory.publish();
    record.published = true;
    this.activeAccessories.set(camera.cameraId, accessory);
    this.sourceFingerprints.set(camera.cameraId, fingerprint);

    camera.identity = {
      ...camera.identity,
      homeKitAccessoryId: entityId,
      homeKitSetupUri: accessory.setupUri,
      homeKitPincode: record.pincode,
      homeKitSetupId: record.setupId,
      homeKitPort: record.port,
      homeKitPairingState: accessory.isPaired() ? "paired" : "not_paired",
    };
    platform?.log?.notice?.(
      `[ScryptedHomeKitBridge] Production HAP camera=${camera.cameraId} source=${directUrl ? "configured" : "missing"} validation=${validationStatus} HKSV=disabled strategy=${record.strategy}`,
    );
    return accessory;
  }

  public static unmountCamera(cameraId: string): void {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory) void accessory.unpublish();
    this.activeAccessories.delete(cameraId);
    this.sourceFingerprints.delete(cameraId);
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
    if (sensorType !== "motion") return;
    this.activeAccessories
      .get(cameraId)
      ?.motionService?.setCharacteristic(Characteristic.MotionDetected, state);
  }

  private static generateMacAddress(id: string): string {
    let hash = 0;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const bytes = [
      0x0e,
      (hash >>> 24) & 0xff,
      (hash >>> 16) & 0xff,
      (hash >>> 8) & 0xff,
      hash & 0xff,
      (hash * 13) & 0xff,
    ];
    return bytes
      .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
      .join(":");
  }

  private static generateSetupId(id: string): string {
    let hash = 0;
    for (const char of id) hash = (hash * 37 + char.charCodeAt(0)) >>> 0;
    return (hash & 0xffff)
      .toString(36)
      .toUpperCase()
      .padStart(4, "S")
      .slice(0, 4);
  }
}

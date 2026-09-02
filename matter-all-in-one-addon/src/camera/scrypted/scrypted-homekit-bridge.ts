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

    const streamUrl =
      camera.source.streamReference?.directUrl ||
      `rtsp://${camera.source.streamReference?.host || "127.0.0.1"}:8554/${camera.cameraId}`;

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: true,
      streamSourceType: "rtsp",
      videoCodec: "h264",
      hasAudio: camera.capabilities.observed?.hasAudio ?? true,
      audioCodec: "aac_lc",
      resolution: camera.capabilities.observed?.resolution || {
        width: 1920,
        height: 1080,
      },
      maxFps: camera.capabilities.observed?.fps || 30,
      strategy: "passthrough_h264",
      requiresTranscoding: false,
      snapshotSupported: true,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      hksvCapable: camera.exportConfig.hksvEnabledByDefault !== false,
    };

    const resolvedSource: ResolvedStreamSource = {
      sourceType: "rtsp",
      url: streamUrl,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      supportsPassthrough: true,
      requiresBridge: false,
      metadata: {
        isScrypted: true,
        scryptedCameraId: camera.cameraId,
        model: camera.displayModel || camera.model,
        manufacturer: camera.displayManufacturer,
      },
    };

    const storageRecord: HomeKitCameraStorageRecord = {
      entityId: `scrypted.${camera.cameraId}`,
      uuid: "",
      username: this.generateMacAddress(camera.cameraId),
      pincode: "031-45-154",
      setupId: this.generateSetupId(camera.cameraId),
      port: 0,
      published: false,
      strategy: "passthrough_h264",
      state: "idle",
      name: camera.name,
      manufacturer: camera.displayManufacturer || "Scrypted",
      model: camera.displayModel || camera.model || "Cámara IP",
      serialNumber: `SCRYPTED-${camera.cameraId.toUpperCase().substring(0, 12)}`,
      hksvCapable: capabilities.hksvCapable,
      hksvEnabled: capabilities.hksvCapable,
      hksvState: capabilities.hksvCapable ? "ready" : "not_capable",
    };

    const accessory = new HomeKitCameraAccessory(
      platform,
      `scrypted.${camera.cameraId}`,
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

    this.activeAccessories.set(camera.cameraId, accessory);
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

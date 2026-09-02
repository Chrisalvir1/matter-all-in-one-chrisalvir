import {
  Accessory,
  AccessoryInfo,
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  CameraController,
  type CameraControllerOptions,
  Categories,
  Characteristic,
  H264Level,
  H264Profile,
  Service,
  SRTPCryptoSuites,
  uuid,
} from "hap-nodejs";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import { HomeKitCameraStreamingDelegate } from "./homekit-camera-stream.delegate.js";

export class HomeKitCameraAccessory {
  public accessory: Accessory;
  public controller!: CameraController;
  public delegate!: HomeKitCameraStreamingDelegate;
  public motionService?: Service;
  public linkedMotionEntityId?: string;
  public isPublished = false;

  constructor(
    public readonly platform: any,
    public readonly entityId: string,
    public record: HomeKitCameraStorageRecord,
    public capabilities: CameraCapabilitiesInfo,
    public streamSource: ResolvedStreamSource,
  ) {
    const accessoryUuid = record.uuid || uuid.generate(`homekit:camera:${entityId}`);
    this.record.uuid = accessoryUuid;
    this.accessory = new Accessory(record.name || entityId, accessoryUuid);
    this.linkedMotionEntityId = this.findLinkedMotionEntity();
    this.rebuildServiceGraph();
  }

  private rebuildServiceGraph(): void {
    this.configureAccessoryInformation();
    this.delegate = new HomeKitCameraStreamingDelegate(
      this.platform,
      this.entityId,
      this.capabilities,
      this.streamSource,
    );
    this.motionService = undefined;
    const isScrypted =
      this.entityId.startsWith("scrypted.") ||
      Boolean(this.streamSource.metadata?.isScrypted);
    if (this.linkedMotionEntityId || isScrypted) {
      this.motionService = this.accessory.addService(
        Service.MotionSensor,
        `${this.record.name || this.entityId} Movimiento`,
      );
      const motionOn = this.linkedMotionEntityId
        ? this.platform?.ha?.hassStates?.get(this.linkedMotionEntityId)?.state === "on"
        : false;
      this.motionService.setCharacteristic(Characteristic.MotionDetected, motionOn);
      this.motionService.setCharacteristic(Characteristic.StatusActive, true);
    }
    if (Boolean(this.streamSource.metadata?.hasDoorbell)) {
      try {
        const doorbell = this.accessory.addService(
          Service.Doorbell,
          `${this.record.name || this.entityId} Timbre`,
        );
        doorbell.setCharacteristic(Characteristic.ProgrammableSwitchEvent, 0);
      } catch {}
    }
    this.record.hksvEnabled = false;
    this.record.hksvCapable = false;
    this.record.hksvState = "not_capable";
    this.controller = new CameraController(this.buildControllerOptions());
    this.accessory.configureController(this.controller);
  }

  private configureAccessoryInformation(): void {
    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(
        Characteristic.Manufacturer,
        this.record.manufacturer || "Matter all in one Chrisalvir",
      )
      ?.setCharacteristic(
        Characteristic.Model,
        this.record.model || "Modelo no identificado",
      )
      ?.setCharacteristic(
        Characteristic.SerialNumber,
        this.record.serialNumber || this.entityId.toUpperCase(),
      )
      ?.setCharacteristic(
        Characteristic.FirmwareRevision,
        this.platform?.matterbridge?.matterbridgeVersion || "unknown",
      );
  }

  private buildControllerOptions(): CameraControllerOptions {
    return {
      cameraStreamCount: 1,
      delegate: this.delegate,
      streamingOptions: {
        supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          codec: {
            profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
            levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
          },
          resolutions: this.buildDeclaredResolutions(),
        },
        audio: this.capabilities.hasAudio
          ? {
              comfort_noise: false,
              codecs: [
                {
                  type: AudioStreamingCodecType.AAC_ELD,
                  audioChannels: 1,
                  samplerate: AudioStreamingSamplerate.KHZ_16,
                },
              ],
            }
          : undefined,
      },
      sensors: this.motionService ? { motion: this.motionService } : undefined,
    };
  }

  private buildDeclaredResolutions(): [number, number, number][] {
    const source = this.capabilities.resolution || { width: 1920, height: 1080 };
    const sourceFps = Math.max(15, Math.min(this.capabilities.maxFps || 30, 30));
    const ladder: [number, number, number][] = [
      [1920, 1080, sourceFps],
      [1280, 960, sourceFps],
      [1280, 720, sourceFps],
      [1024, 768, sourceFps],
      [640, 480, 30],
      [640, 360, 30],
      [480, 360, 30],
      [480, 270, 30],
      [320, 240, 30],
      [320, 240, 15],
      [320, 180, 30],
    ];
    const supported = ladder.filter(
      ([width, height]) => width <= source.width && height <= source.height,
    );
    return supported.length ? supported : [[320, 180, 15]];
  }

  public findLinkedMotionEntity(): string | undefined {
    if (
      this.record.motionEntityId &&
      this.platform?.ha?.hassStates?.has(this.record.motionEntityId)
    ) {
      return this.record.motionEntityId;
    }
    const registry = this.platform?.ha?.hassEntities;
    const states = this.platform?.ha?.hassStates;
    const deviceId = registry?.get(this.entityId)?.device_id;
    const cameraBase = this.entityId.split(".")[1] || this.entityId;
    if (deviceId && registry) {
      for (const [entityId, entry] of registry.entries()) {
        if (entry.device_id !== deviceId || !entityId.startsWith("binary_sensor.")) continue;
        const state = states?.get(entityId);
        const deviceClass = state?.attributes?.device_class;
        if (
          ["motion", "occupancy", "presence"].includes(deviceClass) ||
          entityId.includes("motion") ||
          entityId.includes("movimiento")
        ) {
          return entityId;
        }
      }
    }
    if (states) {
      for (const [entityId, state] of states.entries()) {
        if (!entityId.startsWith("binary_sensor.")) continue;
        const deviceClass = state?.attributes?.device_class;
        if (
          (["motion", "occupancy", "presence"].includes(deviceClass) ||
            entityId.includes("motion") ||
            entityId.includes("movimiento")) &&
          entityId.includes(cameraBase)
        ) {
          return entityId;
        }
      }
    }
    return undefined;
  }

  public updateMotionState(motionDetected: boolean): void {
    this.motionService?.updateCharacteristic(
      Characteristic.MotionDetected,
      motionDetected,
    );
  }

  public async publish(): Promise<void> {
    if (this.isPublished) return;
    this.accessory.on("paired", () => {
      this.record.isPaired = true;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Camera paired to Apple Home`,
      );
      void this.platform?.saveHomeKitCameraRecords?.();
    });
    this.accessory.on("unpaired", () => {
      this.record.isPaired = false;
      void this.platform?.saveHomeKitCameraRecords?.();
    });
    await this.accessory.publish({
      username: this.record.username,
      pincode: this.record.pincode,
      port: this.record.port,
      category: Categories.IP_CAMERA,
      setupID: this.record.setupId,
    });
    this.isPublished = true;
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] Published production HAP camera port=${this.record.port} HKSV=disabled`,
    );
  }

  public getPairingState(): "paired" | "not_paired" | "unverifiable" {
    try {
      if (!this.record.username) return "unverifiable";
      const info = AccessoryInfo.load(this.record.username as any);
      if (info && typeof info.paired === "function") {
        return info.paired() ? "paired" : "not_paired";
      }
    } catch {}
    if (typeof this.record.isPaired === "boolean") {
      return this.record.isPaired ? "paired" : "not_paired";
    }
    return "unverifiable";
  }

  public isPaired(): boolean {
    return this.getPairingState() === "paired";
  }

  public async unpublish(): Promise<void> {
    this.delegate?.cleanupAllSessions();
    if (!this.isPublished) return;
    try {
      await this.accessory.unpublish();
    } finally {
      this.isPublished = false;
    }
  }

  public async resetPairing(): Promise<HomeKitCameraStorageRecord> {
    await this.unpublish();
    try {
      if (this.record.username) AccessoryInfo.remove(this.record.username as any);
    } catch (error) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Unable to remove old pairing: ${String(error)}`,
      );
    }
    this.record.published = false;
    this.record.isPaired = false;
    this.record.hksvEnabled = false;
    this.record.hksvCapable = false;
    this.accessory = new Accessory(
      this.record.name || this.entityId,
      this.record.uuid,
    );
    this.rebuildServiceGraph();
    await this.publish();
    this.record.published = true;
    return this.record;
  }

  public get setupUri(): string {
    return this.accessory.setupURI();
  }
}

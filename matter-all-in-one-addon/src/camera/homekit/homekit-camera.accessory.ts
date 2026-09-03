import {
  Accessory,
  AccessoryInfo,
  AudioRecordingCodecType,
  AudioRecordingSamplerate,
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  CameraController,
  type CameraControllerOptions,
  Categories,
  Characteristic,
  EventTriggerOption,
  H264Level,
  H264Profile,
  MediaContainerType,
  Service,
  SRTPCryptoSuites,
  uuid,
  VideoCodecType,
} from "hap-nodejs";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import { HomeKitCameraStreamingDelegate } from "./homekit-camera-stream.delegate.js";
import { HomeKitCameraRecordingDelegate } from "./homekit-camera-recording.delegate.js";
import { ScryptedStorage } from "../scrypted/scrypted-storage.js";
import type { CameraRecord } from "../scrypted/scrypted-types.js";

export class HomeKitCameraAccessory {
  public accessory: Accessory;
  public controller!: CameraController;
  public delegate!: HomeKitCameraStreamingDelegate;
  public recordingDelegate?: HomeKitCameraRecordingDelegate;
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
    this.recordingDelegate = new HomeKitCameraRecordingDelegate(
      this.platform,
      this.entityId,
      this.record,
      this.capabilities,
      this.streamSource,
    );

    // Coordinate Live Stream and HKSV Recording to prevent camera RTSP socket contention
    this.delegate.on("session-start", () => {
      this.recordingDelegate?.pausePrebuffer();
    });
    this.delegate.on("session-end", () => {
      this.recordingDelegate?.resumePrebuffer();
    });
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
    const isStreamingUsable = Boolean(this.streamSource.url);
    this.record.hksvEnabled = isStreamingUsable;
    this.record.hksvCapable = isStreamingUsable;
    this.record.hksvState = isStreamingUsable ? "waiting_hub" : "not_capable";
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
    const isStreamingUsable = Boolean(this.streamSource.url);
    const options: CameraControllerOptions = {
      cameraStreamCount: 2,
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
        audio: {
          codecs: [
            {
              type: AudioStreamingCodecType.AAC_ELD,
              samplerate: AudioStreamingSamplerate.KHZ_16,
            },
            {
              type: AudioStreamingCodecType.OPUS,
              samplerate: AudioStreamingSamplerate.KHZ_16,
            },
          ],
        },
      },
      sensors: this.motionService ? { motion: this.motionService } : undefined,
    };

    if (isStreamingUsable && this.recordingDelegate) {
      options.recording = {
        options: {
          prebufferLength: 4000,
          overrideEventTriggerOptions: [EventTriggerOption.MOTION],
          mediaContainerConfiguration: {
            type: MediaContainerType.FRAGMENTED_MP4,
            fragmentLength: 4000,
          },
          video: {
            type: VideoCodecType.H264,
            parameters: {
              profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
              levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
            },
            resolutions: [
              [1920, 1080, 30],
              [1280, 720, 30],
            ],
          },
          audio: {
            codecs: {
              type: AudioRecordingCodecType.AAC_LC,
              audioChannels: 1,
              samplerate: [
                AudioRecordingSamplerate.KHZ_16,
                AudioRecordingSamplerate.KHZ_32,
              ],
            },
          },
        },
        delegate: this.recordingDelegate,
      };
    }

    return options;
  }

  private buildDeclaredResolutions(): [number, number, number][] {
    const source = this.capabilities.resolution || { width: 1920, height: 1080 };
    const sourceFps = Math.max(15, Math.min(this.capabilities.maxFps || 30, 60));
    const maxDeclaredWidth = Math.max(source.width, 3840);
    const maxDeclaredHeight = Math.max(source.height, 2160);
    const ladder: [number, number, number][] = [
      // Native source resolution first so HomeKit can negotiate max quality
      [source.width, source.height, sourceFps],
      // 4K UHD (3840x2160)
      [3840, 2160, sourceFps],
      // 2K QHD (2560x1440 for Tapo, etc.)
      [2560, 1440, sourceFps],
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
    // Deduplicate and keep only resolutions at or below max bounds, highest first
    const seen = new Set<string>();
    const supported: [number, number, number][] = [];
    for (const [w, h, fps] of ladder) {
      const key = `${w}x${h}`;
      if (!seen.has(key) && w <= maxDeclaredWidth && h <= maxDeclaredHeight) {
        seen.add(key);
        supported.push([w, h, fps]);
      }
    }
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
          ["motion", "occupancy", "presence"].includes(deviceClass) &&
          entityId.includes(cameraBase)
        ) {
          return entityId;
        }
      }
    }
    return undefined;
  }

  public updateMotionState(motionDetected: boolean): void {
    if (!this.motionService) return;
    this.motionService.updateCharacteristic(
      Characteristic.MotionDetected,
      motionDetected,
    );
    this.recordingDelegate?.handleMotionDetected(motionDetected);
  }

  public async publish(): Promise<void> {
    if (this.isPublished) return;
    this.accessory.on("paired", () => {
      this.record.isPaired = true;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Camera paired to Apple Home`,
      );
      void this.platform?.saveHomeKitCameraRecords?.();
      this.notifyPairingStateChanged(true);
    });
    this.accessory.on("unpaired", () => {
      this.record.isPaired = false;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Camera un-paired from Apple Home`,
      );
      void this.platform?.saveHomeKitCameraRecords?.();
      this.notifyPairingStateChanged(false);
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
      `[HomeKitCamera][${this.entityId}] Published production HAP camera port=${this.record.port} HKSV=${this.record.hksvEnabled ? "enabled" : "disabled"}`,
    );
    setTimeout(() => {
      void this.delegate.handleSnapshotRequest(
        { width: 1280, height: 720 },
        () => {},
      );
    }, 1500);
  }

  private notifyPairingStateChanged(paired: boolean): void {
    try {
      const homeName = this.getPairedHomeName();
      if (this.entityId.startsWith("scrypted.")) {
        const scryptedId = this.entityId.replace(/^scrypted\./, "");
        void ScryptedStorage.updateCamera(scryptedId, (cam: CameraRecord) => {
          cam.identity = {
            ...cam.identity,
            homeKitPairingState: paired ? "paired" : "not_paired",
            homeKitPairedHome: homeName,
          };
          return cam;
        });
      }
      this.platform?.broadcastSseMessage?.("camera_pairing_updated", {
        entityId: this.entityId,
        isPaired: paired,
        homeName,
      });
      this.platform?.pushEntityUpdate?.(this.entityId);
    } catch {}
  }

  public getPairedHomeName(): string {
    const haLocation = this.platform?.ha?.hassConfig?.location_name;
    return haLocation || "Casa (Apple Home)";
  }

  public getPairingState(): "paired" | "not_paired" | "unverifiable" {
    try {
      if (!this.record.username) return "unverifiable";
      const info = AccessoryInfo.load(this.record.username as any);
      if (info && typeof info.paired === "function") {
        const isHapPaired = info.paired();
        if (this.record.isPaired !== isHapPaired) {
          this.record.isPaired = isHapPaired;
          void this.platform?.saveHomeKitCameraRecords?.();
          this.notifyPairingStateChanged(isHapPaired);
        }
        return isHapPaired ? "paired" : "not_paired";
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
    this.recordingDelegate?.updateRecordingActive(false);
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

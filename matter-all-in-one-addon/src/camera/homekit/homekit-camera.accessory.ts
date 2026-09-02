import {
  Accessory,
  AccessoryInfo,
  Service,
  Characteristic,
  Categories,
  CameraController,
  CameraControllerOptions,
  SRTPCryptoSuites,
  H264Profile,
  H264Level,
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  MediaContainerType,
  VideoCodecType,
  AudioRecordingCodecType,
  AudioBitrate,
  AudioRecordingSamplerate,
  uuid,
} from "hap-nodejs";
import { HomeKitCameraStreamingDelegate } from "./homekit-camera-stream.delegate.js";
import { HomeKitCameraRecordingDelegate } from "./homekit-camera-recording.delegate.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera-types.js";

export class HomeKitCameraAccessory {
  public accessory: Accessory;
  public controller: CameraController;
  public delegate: HomeKitCameraStreamingDelegate;
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
    const accessoryUuid =
      record.uuid || uuid.generate(`homekit:camera:${entityId}`);
    this.accessory = new Accessory(record.name || entityId, accessoryUuid);

    // Configure Accessory Information Service using real technical identity
    const manufacturer = record.manufacturer || "Matter all in one Chrisalvir";
    const model = record.model || "Modelo no identificado";
    const serialNumber = record.serialNumber || "Serial no disponible";
    const firmware = platform?.matterbridge?.matterbridgeVersion || "1.4.72";

    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      ?.setCharacteristic(Characteristic.Model, model)
      ?.setCharacteristic(Characteristic.SerialNumber, serialNumber)
      ?.setCharacteristic(Characteristic.FirmwareRevision, firmware);

    this.delegate = new HomeKitCameraStreamingDelegate(
      platform,
      entityId,
      capabilities,
      streamSource,
    );

    // Discover real associated Motion Sensor from Home Assistant
    this.linkedMotionEntityId = this.findLinkedMotionEntity();

    const isScrypted =
      entityId.startsWith("scrypted.") ||
      Boolean((streamSource?.metadata as any)?.isScrypted);

    if (this.linkedMotionEntityId || isScrypted) {
      this.motionService = this.accessory.addService(
        Service.MotionSensor,
        `${record.name || entityId} Movimiento`,
      );
      const isMotionOn = this.linkedMotionEntityId
        ? this.platform?.ha?.hassStates?.get(this.linkedMotionEntityId)
            ?.state === "on"
        : false;
      this.motionService.setCharacteristic(
        Characteristic.MotionDetected,
        isMotionOn,
      );
      this.motionService.setCharacteristic(Characteristic.StatusActive, true);
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Attached MotionSensor service (linked entity: ${this.linkedMotionEntityId || "Scrypted"})`,
      );
    } else {
      this.motionService = undefined;
      this.platform?.log?.debug?.(
        `[HomeKitCamera][${this.entityId}] No real MotionSensor entity found in Home Assistant`,
      );
    }

    // If doorbell sensor is present, attach Doorbell service
    const hasDoorbell = Boolean((streamSource?.metadata as any)?.hasDoorbell);
    if (hasDoorbell) {
      try {
        const doorbellService = this.accessory.addService(
          Service.Doorbell,
          `${record.name || entityId} Timbre`,
        );
        doorbellService.setCharacteristic(
          Characteristic.ProgrammableSwitchEvent,
          0,
        );
        this.platform?.log?.notice?.(
          `[HomeKitCamera][${this.entityId}] Attached integrated Doorbell service`,
        );
      } catch {}
    }

    const isHksvActive =
      record.hksvEnabled !== false &&
      capabilities.hksvCapable === true &&
      capabilities.hasLiveStream === true &&
      Boolean(streamSource?.url);

    const controllerOptions = this.buildCameraControllerOptions(isHksvActive);
    this.controller = new CameraController(controllerOptions);
    this.accessory.configureController(this.controller);
  }

  private buildDeclaredResolutions(): [number, number, number][] {
    const declaredResolutions: [number, number, number][] = [];
    const profiles = (this.streamSource?.metadata as any)?.profiles;
    if (Array.isArray(profiles) && profiles.length > 0) {
      for (const p of profiles) {
        if (p.resolution && p.resolution.width && p.resolution.height) {
          const fps = p.fps || this.capabilities.maxFps || 30;
          declaredResolutions.push([
            p.resolution.width,
            p.resolution.height,
            fps,
          ]);
        }
      }
    }

    if (
      this.capabilities.resolution &&
      this.capabilities.resolution.width &&
      this.capabilities.resolution.height
    ) {
      const w = this.capabilities.resolution.width;
      const h = this.capabilities.resolution.height;
      const fps = this.capabilities.maxFps || 30;
      if (!declaredResolutions.some(([rw, rh]) => rw === w && rh === h)) {
        declaredResolutions.push([w, h, fps]);
      }
    }

    if (declaredResolutions.length === 0) {
      declaredResolutions.push(
        [1920, 1080, 30],
        [1280, 720, 30],
        [640, 360, 30],
      );
    }
    return declaredResolutions;
  }

  private buildCameraControllerOptions(
    isHksvActive: boolean,
  ): CameraControllerOptions {
    const declaredResolutions = this.buildDeclaredResolutions();

    const controllerOptions: CameraControllerOptions = {
      cameraStreamCount: 2,
      delegate: this.delegate,
      streamingOptions: {
        supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          codec: {
            profiles: [
              H264Profile.BASELINE,
              H264Profile.MAIN,
              H264Profile.HIGH,
            ],
            levels: [
              H264Level.LEVEL3_1,
              H264Level.LEVEL3_2,
              H264Level.LEVEL4_0,
            ],
          },
          resolutions: declaredResolutions,
        },
        audio: this.capabilities.hasAudio
          ? {
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
            }
          : undefined,
      },
    };

    if (this.motionService) {
      controllerOptions.sensors = {
        motion: this.motionService,
      };
    }

    if (isHksvActive) {
      this.recordingDelegate = new HomeKitCameraRecordingDelegate(
        this.platform,
        this.entityId,
        this.record,
        this.capabilities,
        this.streamSource,
      );

      this.record.hksvCapable = true;
      this.record.hksvEnabled = true;
      if (!this.record.hksvState) {
        this.record.hksvState = "waiting_hub";
      }

      controllerOptions.recording = {
        options: {
          prebufferLength: 4000,
          mediaContainerConfiguration: [
            {
              type: MediaContainerType.FRAGMENTED_MP4,
              fragmentLength: 4000,
            },
          ],
          video: {
            type: VideoCodecType.H264,
            parameters: {
              profiles: [
                H264Profile.BASELINE,
                H264Profile.MAIN,
                H264Profile.HIGH,
              ],
              levels: [
                H264Level.LEVEL3_1,
                H264Level.LEVEL3_2,
                H264Level.LEVEL4_0,
              ],
            },
            resolutions: declaredResolutions,
          },
          audio: {
            codecs: [
              {
                type: AudioRecordingCodecType.AAC_LC,
                audioChannels: 1,
                bitrateMode: AudioBitrate.VARIABLE,
                samplerate: [
                  AudioRecordingSamplerate.KHZ_8,
                  AudioRecordingSamplerate.KHZ_16,
                  AudioRecordingSamplerate.KHZ_24,
                  AudioRecordingSamplerate.KHZ_32,
                  AudioRecordingSamplerate.KHZ_44_1,
                  AudioRecordingSamplerate.KHZ_48,
                ],
              },
            ],
          },
        },
        delegate: this.recordingDelegate,
      };
    } else {
      this.record.hksvCapable = Boolean(this.capabilities.hksvCapable);
      this.record.hksvEnabled = false;
      this.record.hksvState = this.capabilities.hksvCapable
        ? "configurable"
        : "not_capable";
    }

    return controllerOptions;
  }

  /**
   * Discovers the real motion or occupancy sensor entity associated with this camera in Home Assistant.
   */
  public findLinkedMotionEntity(): string | undefined {
    if (
      this.record.motionEntityId &&
      this.platform?.ha?.hassStates?.has(this.record.motionEntityId)
    ) {
      return this.record.motionEntityId;
    }

    const deviceId = this.platform?.ha?.hassEntities?.get(
      this.entityId,
    )?.device_id;
    const cameraBase = this.entityId.split(".")[1];

    // 1. Match by Home Assistant device_id in entity registry
    if (deviceId && this.platform?.ha?.hassEntities) {
      for (const [eId, reg] of this.platform.ha.hassEntities.entries()) {
        if (reg.device_id === deviceId && eId.startsWith("binary_sensor.")) {
          const st = this.platform.ha.hassStates?.get(eId);
          const devClass = st?.attributes?.device_class;
          if (
            devClass === "motion" ||
            devClass === "occupancy" ||
            devClass === "presence" ||
            eId.includes("motion") ||
            eId.includes("movimiento")
          ) {
            return eId;
          }
        }
      }
    }

    // 2. Match by entity name prefix
    if (this.platform?.ha?.hassStates) {
      for (const [eId, st] of this.platform.ha.hassStates.entries()) {
        if (eId.startsWith("binary_sensor.")) {
          const devClass = st?.attributes?.device_class;
          if (
            (devClass === "motion" ||
              devClass === "occupancy" ||
              devClass === "presence" ||
              eId.includes("motion") ||
              eId.includes("movimiento")) &&
            (eId.includes(cameraBase) ||
              cameraBase.includes(eId.replace("binary_sensor.", "")))
          ) {
            return eId;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Updates the camera's linked motion sensor state in Apple Home and notifies HKSV.
   */
  public updateMotionState(motionDetected: boolean): void {
    if (this.motionService) {
      this.motionService.updateCharacteristic(
        Characteristic.MotionDetected,
        motionDetected,
      );
      this.platform?.log?.debug?.(
        `[HomeKitCamera][${this.entityId}] Motion sensor state updated: ${motionDetected}`,
      );
    }
    this.recordingDelegate?.handleMotionDetected(motionDetected);
  }

  /**
   * Publishes the HomeKit camera as a standalone IP Camera accessory on its dedicated TCP port.
   */
  public async publish(): Promise<void> {
    if (this.isPublished) return;

    this.accessory.on("paired", () => {
      this.record.isPaired = true;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] ✅ Camera successfully paired to Apple Home!`,
      );
      if (this.platform?.saveHomeKitCameraRecords) {
        this.platform.saveHomeKitCameraRecords();
      }
    });

    this.accessory.on("unpaired", () => {
      this.record.isPaired = false;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Camera unpaired from Apple Home. Ready for new pairing.`,
      );
      if (this.platform?.saveHomeKitCameraRecords) {
        this.platform.saveHomeKitCameraRecords();
      }
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
      `[HomeKitCamera][${this.entityId}] Published standalone HomeKit Camera on port ${this.record.port} with PIN: ${this.record.pincode}`,
    );
  }

  /**
   * Returns true if this camera accessory is actively paired to an Apple Home controller.
   * Uses HAP-NodeJS AccessoryInfo.load(hapUsername) as official public API.
   */
  public isPaired(): boolean {
    return this.getPairingState() === "paired";
  }

  /**
   * Evaluates the authentic HAP pairing state:
   * - "paired": AccessoryInfo.load(hapUsername).paired() is true
   * - "not_paired": AccessoryInfo.load(hapUsername) loaded and paired() is false
   * - "unverifiable": hapUsername is missing or storage cannot be inspected
   */
  public getPairingState(): "paired" | "not_paired" | "unverifiable" {
    try {
      const hapUsername = this.record?.username;
      if (!hapUsername) return "unverifiable";
      const info = AccessoryInfo.load(hapUsername as any);
      if (info && typeof info.paired === "function") {
        return info.paired() ? "paired" : "not_paired";
      }
      if (this.record?.isPaired !== undefined) {
        return this.record.isPaired ? "paired" : "not_paired";
      }
      return "unverifiable";
    } catch {
      if (this.record?.isPaired !== undefined) {
        return this.record.isPaired ? "paired" : "not_paired";
      }
      return "unverifiable";
    }
  }

  /**
   * Unpublishes and stops the HomeKit accessory server.
   */
  public async unpublish(): Promise<void> {
    this.delegate.cleanupAllSessions();
    this.recordingDelegate?.destroy();
    if (!this.isPublished) return;
    try {
      await this.accessory.unpublish();
      this.isPublished = false;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Unpublished HomeKit Camera accessory`,
      );
    } catch (err) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Error unpublishing: ${err}`,
      );
    }
  }

  /**
   * Cleans up paired controllers by removing HAP pairing data on disk via official AccessoryInfo.remove(hapUsername),
   * while preserving strictly the stable username (MAC), UUID, setupId, and pincode.
   */
  public async resetPairing(): Promise<HomeKitCameraStorageRecord> {
    await this.unpublish();

    try {
      if (this.record.username) {
        AccessoryInfo.remove(this.record.username as any);
      }
    } catch (err) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Error removing HAP pairing record: ${err}`,
      );
    }

    this.record.published = false;
    this.record.isPaired = false;

    // Invariant: Rebuild accessory using the exact same UUID, username, setupId, and pincode
    this.accessory = new Accessory(
      this.record.name || this.entityId,
      this.record.uuid,
    );
    const manufacturer =
      this.record.manufacturer || "Matter all in one Chrisalvir";
    const model = this.record.model || "Modelo no identificado";
    const serialNumber = this.record.serialNumber || "Serial no disponible";
    const firmware =
      this.platform?.matterbridge?.matterbridgeVersion || "1.4.72";

    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      ?.setCharacteristic(Characteristic.Model, model)
      ?.setCharacteristic(Characteristic.SerialNumber, serialNumber)
      ?.setCharacteristic(Characteristic.FirmwareRevision, firmware);

    const isHksvActive =
      this.record.hksvEnabled !== false &&
      this.capabilities.hksvCapable === true &&
      this.capabilities.hasLiveStream === true &&
      Boolean(this.streamSource?.url);

    const controllerOptions = this.buildCameraControllerOptions(isHksvActive);
    this.controller = new CameraController(controllerOptions);
    this.accessory.configureController(this.controller);

    const isScrypted =
      this.entityId.startsWith("scrypted.") ||
      Boolean((this.streamSource?.metadata as any)?.isScrypted);

    if (this.linkedMotionEntityId || isScrypted) {
      this.motionService = this.accessory.addService(
        Service.MotionSensor,
        `${this.record.name || this.entityId} Movimiento`,
      );
      this.motionService.setCharacteristic(
        Characteristic.MotionDetected,
        false,
      );
    } else {
      this.motionService = undefined;
    }

    await this.publish();
    this.record.published = true;

    return this.record;
  }

  public get setupUri(): string {
    return this.accessory.setupURI();
  }
}

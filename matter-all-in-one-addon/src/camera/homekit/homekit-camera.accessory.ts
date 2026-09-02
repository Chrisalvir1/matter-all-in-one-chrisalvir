import {
  Accessory,
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

    // Configure Accessory Information Service
    const manufacturer = "Matter all in one Chrisalvir";
    const model = record.model || "Cámara IP";
    const serialNumber = record.serialNumber || entityId.replaceAll(".", "_");
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
          resolutions: [
            [1920, 1080, 30],
            [1280, 720, 30],
            [1024, 768, 30],
            [640, 480, 30],
            [640, 360, 30],
            [480, 360, 30],
            [480, 270, 30],
            [320, 240, 30],
            [320, 180, 30],
          ],
        },
        audio: capabilities.hasAudio
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
        platform,
        entityId,
        record,
        capabilities,
        streamSource,
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
            resolutions: [
              [1920, 1080, 30],
              [1280, 720, 30],
              [1920, 1080, 15],
              [1280, 720, 15],
            ],
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
      this.record.hksvCapable = Boolean(capabilities.hksvCapable);
      this.record.hksvEnabled = false;
      this.record.hksvState = capabilities.hksvCapable
        ? "configurable"
        : "not_capable";
    }

    this.controller = new CameraController(controllerOptions);
    this.accessory.configureController(this.controller);
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
   */
  public isPaired(): boolean {
    return Boolean(
      this.record.isPaired || (this.accessory as any)._server?.paired,
    );
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
   * Cleans up all paired controllers, regenerates identity (username/MAC, setupId, pincode),
   * and republishes the camera accessory as fresh so it can be added to a new Apple Home.
   */
  public async resetPairing(): Promise<HomeKitCameraStorageRecord> {
    await this.unpublish();

    // Generate fresh credentials
    const hex = () =>
      Math.floor(Math.random() * 256)
        .toString(16)
        .padStart(2, "0")
        .toUpperCase();
    const newUsername = `0E:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
    const newSetupId = Math.random().toString(36).substring(2, 6).toUpperCase();
    const p1 = Math.floor(100 + Math.random() * 900);
    const p2 = Math.floor(10 + Math.random() * 90);
    const p3 = Math.floor(100 + Math.random() * 900);
    const newPincode = `${p1}-${p2}-${p3}`;

    this.record.username = newUsername;
    this.record.setupId = newSetupId;
    this.record.pincode = newPincode;
    this.record.published = false;
    this.record.isPaired = false;

    // Create fresh instance with new UUID / identity
    const newUuid = uuid.generate(
      `homekit:camera:${this.entityId}:${Date.now()}`,
    );
    this.record.uuid = newUuid;

    this.accessory = new Accessory(this.record.name || this.entityId, newUuid);
    const manufacturer = "Matter all in one Chrisalvir";
    const model = this.record.model || "Cámara IP";
    const serialNumber =
      this.record.serialNumber || this.entityId.replaceAll(".", "_");
    const firmware =
      this.platform?.matterbridge?.matterbridgeVersion || "1.4.72";

    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      ?.setCharacteristic(Characteristic.Model, model)
      ?.setCharacteristic(Characteristic.SerialNumber, serialNumber)
      ?.setCharacteristic(Characteristic.FirmwareRevision, firmware);

    this.controller = new CameraController({
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
          resolutions: [
            [1920, 1080, 30],
            [1280, 720, 30],
            [1024, 768, 30],
            [640, 480, 30],
            [640, 360, 30],
            [480, 360, 30],
            [480, 270, 30],
            [320, 240, 30],
            [320, 180, 30],
          ],
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
    });
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

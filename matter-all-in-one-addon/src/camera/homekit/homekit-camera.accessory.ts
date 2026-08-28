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
  uuid,
} from "hap-nodejs";
import { HomeKitCameraStreamingDelegate } from "./homekit-camera-stream.delegate.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera-types.js";

export class HomeKitCameraAccessory {
  public accessory: Accessory;
  public controller: CameraController;
  public delegate: HomeKitCameraStreamingDelegate;
  public motionService?: Service;
  private isPublished = false;

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
    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(
        Characteristic.Manufacturer,
        record.manufacturer || "Home Assistant",
      )
      ?.setCharacteristic(Characteristic.Model, record.model || "Camera")
      ?.setCharacteristic(
        Characteristic.SerialNumber,
        record.serialNumber || entityId.replaceAll(".", "_"),
      )
      ?.setCharacteristic(Characteristic.FirmwareRevision, "1.4.50");

    this.delegate = new HomeKitCameraStreamingDelegate(
      platform,
      entityId,
      capabilities,
      streamSource,
    );

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

    this.controller = new CameraController(controllerOptions);
    this.accessory.configureController(this.controller);

    // Integrated Motion Sensor service for camera motion activity notifications in Apple Home
    this.motionService = this.accessory.addService(
      Service.MotionSensor,
      `${record.name || entityId} Motion`,
    );
    this.motionService.setCharacteristic(Characteristic.MotionDetected, false);
  }

  /**
   * Updates the camera's linked motion sensor state in Apple Home.
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
  }

  /**
   * Publishes the HomeKit camera as a standalone IP Camera accessory on its dedicated TCP port.
   */
  public async publish(): Promise<void> {
    if (this.isPublished) return;

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
   * Unpublishes and stops the HomeKit accessory server.
   */
  public async unpublish(): Promise<void> {
    this.delegate.cleanupAllSessions();
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

    // Create fresh instance with new UUID / identity
    const newUuid = uuid.generate(
      `homekit:camera:${this.entityId}:${Date.now()}`,
    );
    this.record.uuid = newUuid;

    this.accessory = new Accessory(this.record.name || this.entityId, newUuid);
    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(
        Characteristic.Manufacturer,
        this.record.manufacturer || "Home Assistant",
      )
      ?.setCharacteristic(Characteristic.Model, this.record.model || "Camera")
      ?.setCharacteristic(
        Characteristic.SerialNumber,
        this.record.serialNumber || this.entityId.replaceAll(".", "_"),
      )
      ?.setCharacteristic(Characteristic.FirmwareRevision, "1.4.49");

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

    this.motionService = this.accessory.addService(
      Service.MotionSensor,
      `${this.record.name || this.entityId} Motion`,
    );
    this.motionService.setCharacteristic(Characteristic.MotionDetected, false);

    await this.publish();
    this.record.published = true;

    return this.record;
  }

  public get setupUri(): string {
    return this.accessory.setupURI();
  }
}

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
  public readonly accessory: Accessory;
  public readonly controller: CameraController;
  public readonly delegate: HomeKitCameraStreamingDelegate;
  private isPublished = false;

  constructor(
    public readonly platform: any,
    public readonly entityId: string,
    public readonly record: HomeKitCameraStorageRecord,
    public readonly capabilities: CameraCapabilitiesInfo,
    public readonly streamSource: ResolvedStreamSource,
  ) {
    const accessoryUuid = record.uuid || uuid.generate("homekit:camera:" + entityId);
    this.accessory = new Accessory(record.name || entityId, accessoryUuid);

    // Configure Accessory Information Service
    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, record.manufacturer || "Home Assistant")
      ?.setCharacteristic(Characteristic.Model, record.model || "Camera")
      ?.setCharacteristic(Characteristic.SerialNumber, record.serialNumber || entityId.replaceAll(".", "_"))
      ?.setCharacteristic(Characteristic.FirmwareRevision, "1.4.49");

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
            profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
            levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
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
  }

  /**
   * Publishes the HomeKit camera as a standalone IP Camera accessory on a dedicated TCP port.
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
      "[HomeKitCamera][" + this.entityId + "] Published standalone HomeKit Camera on port " +
        this.record.port + " with PIN: " + this.record.pincode,
    );
  }

  /**
   * Unpublishes and stops the HomeKit accessory server.
   */
  public async unpublish(): Promise<void> {
    if (!this.isPublished) return;
    try {
      await this.accessory.unpublish();
      this.isPublished = false;
      this.platform?.log?.notice?.("[HomeKitCamera][" + this.entityId + "] Unpublished HomeKit Camera accessory");
    } catch (err) {
      this.platform?.log?.warn?.("[HomeKitCamera][" + this.entityId + "] Error unpublishing: " + err);
    }
  }

  public get setupUri(): string {
    return this.accessory.setupURI();
  }
}

import {
  Accessory,
  AccessoryInfo,
  AudioBitrate,
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
  MDNSAdvertiser,
} from "@homebridge/hap-nodejs";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import { HomeKitCameraStreamingDelegate } from "./homekit-camera-stream.delegate.js";
import {
  HomeKitCameraRecordingDelegate,
  resolveCameraSourceFps,
} from "./homekit-camera-recording.delegate.js";
import { HevcRecordingDelegate } from "./hevc/hevc-recording.js";
import crypto from "node:crypto";
import os from "node:os";
import { ScryptedStorage } from "../scrypted/scrypted-storage.js";
import {
  HAP_FIRMWARE_REVISION,
  HAP_SOFTWARE_REVISION,
} from "../../utils/hap-firmware.js";
import type { CameraRecord } from "../scrypted/scrypted-types.js";
import { CameraUiStorage } from "../cameraui/cameraui-storage.js";
import {
  detectPrimaryNetworkInterface,
  probeCameraSource,
  supportsFdkAac,
} from "./ffmpeg-helper.js";
import { NestCameraAdapter } from "../nest/nest-camera-adapter.js";
import { resolveHaCameraEntityId } from "../cameraui/ha-camera-entity.js";

/** Generate a fresh, HAP-valid setup PIN for an explicit pairing reset. */
export function generateFreshHomeKitPin(previous?: string): string {
  for (;;) {
    const digits = crypto
      .randomBytes(4)
      .readUInt32BE(0)
      .toString()
      .padStart(10, "0")
      .slice(-8);
    if (
      digits === "00000000" ||
      digits === "11111111" ||
      digits === "12345678" ||
      digits === "87654321"
    )
      continue;
    const pin = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    if (pin !== previous) return pin;
  }
}

export class HomeKitCameraAccessory {
  public accessory: Accessory;
  public controller?: CameraController;
  public delegate?: HomeKitCameraStreamingDelegate;
  public recordingDelegate?:
    | HomeKitCameraRecordingDelegate
    | HevcRecordingDelegate;
  public motionService?: Service;
  public lightService?: Service;
  public sirenService?: Service;
  public linkedMotionEntityId?: string;
  public linkedLightEntityId?: string;
  public linkedSirenEntityId?: string;
  public linkedDoorbellEntityId?: string;
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
    this.record.uuid = accessoryUuid;
    this.accessory = new Accessory(record.name || entityId, accessoryUuid);
    const linked = this.findLinkedEntities();
    this.linkedMotionEntityId =
      this.record.motionEntityId && this.record.motionEntityId !== "auto"
        ? this.record.motionEntityId === "none"
          ? undefined
          : this.record.motionEntityId
        : linked.motion || this.findLinkedMotionEntity();
    this.linkedLightEntityId =
      this.record.lightEntityId && this.record.lightEntityId !== "auto"
        ? this.record.lightEntityId === "none"
          ? undefined
          : this.record.lightEntityId
        : linked.light;
    this.linkedSirenEntityId =
      this.record.sirenEntityId && this.record.sirenEntityId !== "auto"
        ? this.record.sirenEntityId === "none"
          ? undefined
          : this.record.sirenEntityId
        : linked.siren;
    this.linkedDoorbellEntityId = linked.doorbell;
    this.rebuildServiceGraph();
  }

  private rebuildServiceGraph(): void {
    this.configureAccessoryInformation();
    this.motionService = undefined;
    const isScrypted =
      this.entityId.startsWith("scrypted.") ||
      Boolean(this.streamSource.metadata?.isScrypted);
    const isCameraUi =
      this.entityId.startsWith("camera.cameraui_") ||
      this.entityId.startsWith("cameraui.") ||
      this.entityId.startsWith("cameraui_") ||
      Boolean(this.streamSource.metadata?.isCameraUi) ||
      Boolean(this.streamSource.metadata?.camerauiCameraId) ||
      Boolean(this.record.serialNumber?.startsWith("CUI-"));
    const hasIntegratedCameraMotion = Boolean(
      this.streamSource.metadata?.hasCameraMotion,
    );
    const isC120 = this.isTapoC120();
    if (isC120 && (!this.capabilities.maxFps || this.capabilities.maxFps <= 0)) {
      this.capabilities.maxFps = 15;
    }
    const isC402 = this.isTapoC402();
    if (
      this.linkedMotionEntityId ||
      isScrypted ||
      isCameraUi ||
      hasIntegratedCameraMotion ||
      isC120 ||
      isC402
    ) {
      try {
        this.motionService =
          this.accessory.getService(Service.MotionSensor) ||
          this.accessory.addService(
            Service.MotionSensor,
            `${this.record.name || this.entityId} Movimiento`,
          );
        this.motionService.setCharacteristic(
          Characteristic.Name,
          `${this.record.name || this.entityId} Movimiento`,
        );
        const motionOn = this.linkedMotionEntityId
          ? this.platform?.ha?.hassStates?.get(this.linkedMotionEntityId)
              ?.state === "on"
          : false;
        this.motionService.setCharacteristic(
          Characteristic.MotionDetected,
          motionOn,
        );
        this.motionService
          .getCharacteristic(Characteristic.MotionDetected)
          .onGet(() => {
            if (this.linkedMotionEntityId) {
              const state = this.platform?.ha?.hassStates?.get(
                this.linkedMotionEntityId,
              )?.state;
              return state === "on";
            }
            return false;
          });
        this.motionService.setCharacteristic(Characteristic.StatusActive, true);
      } catch (err) {
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] Error configurando MotionSensor: ${err}`,
        );
      }
    }
    if (
      this.linkedDoorbellEntityId ||
      Boolean(this.streamSource.metadata?.hasDoorbell)
    ) {
      try {
        const doorbell = this.accessory.addService(
          Service.Doorbell,
          `${this.record.name || this.entityId} Timbre`,
        );
        doorbell.setCharacteristic(Characteristic.ProgrammableSwitchEvent, 0);
      } catch {}
    }
    this.lightService = undefined;
    if (
      this.linkedLightEntityId ||
      Boolean(this.streamSource.metadata?.hasLight)
    ) {
      try {
        this.lightService = this.accessory.addService(
          Service.Lightbulb,
          `${this.record.name || this.entityId} Luz`,
        );
        this.lightService
          .getCharacteristic(Characteristic.On)
          .onGet(() => {
            if (this.linkedLightEntityId) {
              const state = this.platform?.ha?.hassStates?.get(
                this.linkedLightEntityId,
              )?.state;
              return state === "on";
            }
            return false;
          })
          .onSet(async (value) => {
            if (this.linkedLightEntityId) {
              const service = value ? "turn_on" : "turn_off";
              try {
                await this.platform?.ha?.callService(
                  "light",
                  service,
                  this.linkedLightEntityId,
                );
              } catch {}
            }
          });
      } catch {}
    }
    this.sirenService = undefined;
    if (
      this.linkedSirenEntityId ||
      Boolean(this.streamSource.metadata?.hasSiren)
    ) {
      try {
        this.sirenService = this.accessory.addService(
          Service.Switch,
          `${this.record.name || this.entityId} Sirena`,
        );
        this.sirenService
          .getCharacteristic(Characteristic.On)
          .onGet(() => {
            if (this.linkedSirenEntityId) {
              const state = this.platform?.ha?.hassStates?.get(
                this.linkedSirenEntityId,
              )?.state;
              return state === "on";
            }
            return false;
          })
          .onSet(async (value) => {
            if (this.linkedSirenEntityId) {
              const domain = this.linkedSirenEntityId.split(".")[0] || "siren";
              const service = value ? "turn_on" : "turn_off";
              try {
                await this.platform?.ha?.callService(
                  domain,
                  service,
                  this.linkedSirenEntityId,
                );
              } catch {}
            }
          });
      } catch {}
    }
    const isStreamingUsable =
      Boolean(this.streamSource.url) ||
      this.isTapoC402() ||
      this.isTapoC120() ||
      Boolean(this.streamSource.metadata?.isCameraUi) ||
      Boolean(this.streamSource.metadata?.isHaProxyStream);
    this.record.hksvEnabled = isStreamingUsable;
    this.record.hksvCapable = isStreamingUsable;
    this.record.hksvState = isStreamingUsable ? "waiting_hub" : "not_capable";

    const isTapoC402 = this.isTapoC402();

    const configuredMode = this.record.exportMode || "auto";
    let effectiveMode: "passthrough_h264" | "passthrough_hevc" | "disabled" =
      "passthrough_h264";

    if (configuredMode === "disabled") {
      effectiveMode = "disabled";
    } else if (isTapoC402) {
      effectiveMode = "passthrough_h264";
      if (configuredMode === "passthrough_hevc") {
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] Tapo C402 cannot be configured for HEVC/HKSV3. Forcing passthrough_h264 on classic CameraController.`,
        );
      }
    } else if (configuredMode === "passthrough_hevc") {
      effectiveMode = "passthrough_hevc";
    } else if (configuredMode === "passthrough_h264") {
      effectiveMode = "passthrough_h264";
    } else {
      const rawCodec = (
        this.capabilities.videoCodec ||
        this.streamSource.metadata?.videoCodec ||
        ""
      ).toLowerCase();
      const isHevc =
        rawCodec.includes("hevc") ||
        rawCodec.includes("265") ||
        rawCodec.includes("hvc1");
      effectiveMode = isHevc ? "passthrough_hevc" : "passthrough_h264";
    }

    if (effectiveMode === "disabled") {
      this.record.activeController = undefined;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Apple Home export disabled by configuration`,
      );
      return;
    }

    if (effectiveMode === "passthrough_hevc") {
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] HEVC native source detected — configuring pure HEVC passthrough with AAC audio for Apple Home`,
      );
      this.capabilities.videoCodec = "hevc";
      this.capabilities.requiresTranscoding = false;
      this.capabilities.strategy = "passthrough_hevc";
    }

    this.configureClassicCameraController();
  }


  private configureClassicCameraController(): void {
    this.record.activeController = "CameraController";
    this.delegate = new HomeKitCameraStreamingDelegate(
      this.platform,
      this.entityId,
      this.capabilities,
      this.streamSource,
    );

    const isHevc =
      this.capabilities.videoCodec === "hevc" ||
      this.capabilities.videoCodec === "h265" ||
      this.capabilities.strategy === "passthrough_hevc";

    if (isHevc) {
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Configurando HevcRecordingDelegate nativo para HKSV3 / HEVC (-c:v copy)`,
      );
      this.recordingDelegate = new HevcRecordingDelegate(
        this.platform,
        this.entityId,
        this.record,
        this.capabilities,
        this.streamSource,
      );
    } else {
      this.recordingDelegate = new HomeKitCameraRecordingDelegate(
        this.platform,
        this.entityId,
        this.record,
        this.capabilities,
        this.streamSource,
      );
    }

    this.delegate.on("session-start", () => {
      this.recordingDelegate?.pausePrebuffer();
    });
    this.delegate.on("session-end", () => {
      if (this.delegate?.hasActiveSessions()) {
        this.platform?.log?.debug?.(
          `[HomeKitCamera][${this.entityId}] session-end recibido pero aún quedan ${this.delegate.activeSessionCount()} sesión(es) activa(s) — manteniendo prebuffer pausado`,
        );
        return;
      }
      this.recordingDelegate?.resumePrebuffer();
    });

    this.controller = new CameraController(this.buildControllerOptions());
    this.accessory.configureController(this.controller);
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] Configured classic CameraController (${isHevc ? "HEVC/HKSV3 passthrough" : "H.264 passthrough"})`,
    );
  }

  private configureAccessoryInformation(): void {
    const mfr = "Matter All-In-One Chrisalvir";
    const model = (this.record.model || "Network Camera")
      .replace(/\s*\(HAP-NodeJS[^)]*\)/gi, "")
      .trim();

    this.accessory
      .getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, mfr)
      ?.setCharacteristic(Characteristic.Model, model)
      ?.setCharacteristic(
        Characteristic.SerialNumber,
        this.record.serialNumber || this.entityId.toUpperCase(),
      )
      ?.setCharacteristic(
        Characteristic.FirmwareRevision,
        HAP_FIRMWARE_REVISION,
      )
      ?.setCharacteristic(
        Characteristic.SoftwareRevision,
        HAP_SOFTWARE_REVISION,
      );
  }

  private buildControllerOptions(): CameraControllerOptions {
    const isStreamingUsable =
      Boolean(this.streamSource.url) ||
      this.isTapoC402() ||
      this.isTapoC120() ||
      Boolean(this.streamSource.metadata?.isCameraUi) ||
      Boolean(this.streamSource.metadata?.isHaProxyStream);
    // Do not negotiate AAC-ELD unless this exact FFmpeg binary can encode it.
    // The native FFmpeg `aac` encoder only emits AAC-LC; advertising AAC-ELD
    // and then sending AAC-LC makes HomeKit reject the audio RTP stream.
    const audioCodecs = [
      ...(supportsFdkAac()
        ? [
            {
              type: AudioStreamingCodecType.AAC_ELD,
              samplerate: AudioStreamingSamplerate.KHZ_16,
            },
            {
              type: AudioStreamingCodecType.AAC_ELD,
              samplerate: AudioStreamingSamplerate.KHZ_24,
            },
          ]
        : []),
      {
        type: AudioStreamingCodecType.OPUS,
        samplerate: AudioStreamingSamplerate.KHZ_16,
      },
      {
        type: AudioStreamingCodecType.OPUS,
        samplerate: AudioStreamingSamplerate.KHZ_24,
      },
    ];

    const options: CameraControllerOptions = {
      cameraStreamCount: 2,
      delegate: this.delegate!,
      streamingOptions: {
        supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          codec: {
            profiles: [
              H264Profile.BASELINE,
              H264Profile.MAIN,
              H264Profile.HIGH,
            ],
            levels: this.buildDeclaredLevels(),
          },
          resolutions: this.buildDeclaredResolutions(),
        },
        audio: {
          codecs: audioCodecs,
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
            resolutions: this.buildRecordingResolutions(),
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

  public buildRecordingResolutions(): [number, number, number][] {
    const isC120 = this.isTapoC120();
    const source = this.capabilities.resolution || {
      width: 1920,
      height: 1080,
    };
    const width = isC120 ? 1920 : source.width || 1920;
    const height = isC120 ? 1080 : source.height || 1080;
    const measured = this.capabilities.measuredVideo?.fps;
    const detectedFps =
      (measured && measured > 0 ? Math.round(measured) : undefined) ??
      this.capabilities.maxFps ??
      (this.record as any)?.fps ??
      (isC120 ? 15 : 30);
    const cameraMax = Math.max(10, Math.min(detectedFps, 60));
    const dynamicFps = cameraMax;
    const candidates: [number, number, number][] = [
      [width, height, dynamicFps],
      ...(width >= 3840 ? ([[2560, 1440, dynamicFps]] as [number, number, number][]) : []),
      ...(width > 1920 && width < 3840 ? ([[2560, 1440, dynamicFps]] as [number, number, number][]) : []),
      [1920, 1080, dynamicFps],
      [1280, 720, dynamicFps],
    ];
    const seen = new Set<string>();
    const res: [number, number, number][] = [];
    for (const [w, h, f] of candidates) {
      const key = `${w}x${h}`;
      if (!seen.has(key)) {
        seen.add(key);
        res.push([w, h, f]);
      }
    }
    return res;
  }

  private nativeH264Profile(): H264Profile {
    const profile = (this.capabilities.videoProfile || "").toLowerCase();
    if (
      profile.includes("baseline") ||
      profile.includes("constrained baseline")
    ) {
      return H264Profile.BASELINE;
    }
    if (profile.includes("main")) return H264Profile.MAIN;
    return H264Profile.HIGH;
  }

  private buildDeclaredResolutions(): [number, number, number][] {
    const isC120 = this.isTapoC120();
    const source = this.capabilities.resolution || {
      width: 1920,
      height: 1080,
    };
    const width = source.width || 1920;
    const height = source.height || 1080;
    const cameraMax = isC120 ? 20 : this.capabilities.maxFps || 30;
    const sourceFps = Math.max(
      15,
      Math.min(this.capabilities.maxFps || cameraMax, isC120 ? 20 : 60),
    );
    const dynamicFps = Math.min(sourceFps, cameraMax);

    // Tapo C120: Advertises native ladder matching stream capabilities.
    // Uses real measured/configured FPS dynamically (typically 15-20fps).
    if (isC120) {
      const measured = this.capabilities.measuredVideo?.fps;
      const detectedFps =
        (measured && measured > 0 ? Math.round(measured) : undefined) ??
        this.capabilities.maxFps ??
        (this.record as any)?.fps ??
        15;
      const dynamicC120Fps = Math.max(10, Math.min(detectedFps, 30));
      const resList: [number, number, number][] = [];
      if (width > 1920) {
        resList.push([2560, 1440, dynamicC120Fps]);
      }
      resList.push(
        [1920, 1080, dynamicC120Fps],
        [1280, 720, dynamicC120Fps],
        [640, 360, dynamicC120Fps],
        [480, 270, dynamicC120Fps],
        [320, 180, dynamicC120Fps],
      );
      return resList;
    }

    const ladder: [number, number, number][] = [
      [width, height, dynamicFps],
      ...(width > 1920 ? ([[2560, 1440, dynamicFps]] as [number, number, number][]) : []),
      [1920, 1080, dynamicFps],
      [1280, 720, dynamicFps],
      [640, 360, Math.min(dynamicFps, 30)],
      [480, 270, Math.min(dynamicFps, 30)],
      [320, 180, Math.min(dynamicFps, 30)],
    ];

    const seen = new Set<string>();
    const unique: [number, number, number][] = [];
    for (const res of ladder) {
      const key = `${res[0]}x${res[1]}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(res);
      }
    }
    return unique;
  }

  /**
   * Construye los niveles H.264 declarados en SupportedVideoStreamConfiguration.
   * Se declaran estrictamente los niveles estándar HAP R2 (3.1, 3.2, 4.0).
   */
  public buildDeclaredLevels(): H264Level[] {
    return [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0];
  }

  /** Read-only description of Live View capabilities advertised by this accessory. */
  public getLiveViewCapabilitiesDiagnostic(): {
    codec: "h264";
    profiles: string[];
    levels: string[];
    resolutions: [number, number, number][];
  } {
    return {
      codec: "h264",
      profiles: ["baseline", "main", "high"],
      levels: ["3.1", "3.2", "4.0"],
      resolutions: this.buildDeclaredResolutions(),
    };
  }

  public isTapoC402(): boolean {
    const identity = [
      this.record.name,
      this.record.model,
      this.entityId,
      this.streamSource.url,
    ]
      .filter(Boolean)
      .join(" ");
    return /(?:\bc402\b|tapo[-_ ]?c402|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente)/i.test(
      identity,
    );
  }

  public isTapoC120(): boolean {
    const model = (this.record?.model || "").toLowerCase();
    const name = (this.record?.name || "").toLowerCase();
    const entityId = this.entityId.toLowerCase();
    const sourceUrl = (this.streamSource?.url || "").toLowerCase();
    const isC120Token = (s: string) =>
      /(?:\bc120\b|tapo[-_ ]?c120\b|tapo[-_ ]?spot\b|\bspot\b)/i.test(s);
    return (
      isC120Token(model) ||
      isC120Token(entityId) ||
      isC120Token(name) ||
      isC120Token(sourceUrl)
    );
  }

  public findLinkedEntities(): {
    motion?: string;
    light?: string;
    siren?: string;
    doorbell?: string;
  } {
    const result: {
      motion?: string;
      light?: string;
      siren?: string;
      doorbell?: string;
    } = {};

    // 1. Leverage platform multi-strategy matcher if available
    if (typeof this.platform?.findLinkedCameraEntities === "function") {
      try {
        const realEntities = this.platform.findLinkedCameraEntities(
          this.record.name || "",
          this.entityId,
        );
        for (const ent of realEntities) {
          if (ent.type === "motion" && !result.motion) result.motion = ent.id;
          if (ent.type === "light" && !result.light) result.light = ent.id;
          if (ent.type === "siren" && !result.siren) result.siren = ent.id;
          if (ent.type === "doorbell" && !result.doorbell)
            result.doorbell = ent.id;
        }
      } catch {}
    }

    const registry = this.platform?.ha?.hassEntities;
    const states = this.platform?.ha?.hassStates;
    if (!states) return result;

    const cameraBase = (this.record.name || this.entityId)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    const words = cameraBase.split("_").filter((w: string) => w.length >= 3);

    const matchesName = (entityId: string, friendlyName?: string) => {
      const idLower = entityId.toLowerCase();
      const fnLower = (friendlyName || "").toLowerCase();
      if (idLower.includes(cameraBase) || fnLower.includes(cameraBase))
        return true;
      const modelKeywords = words.filter((w: string) =>
        /^[a-z]+\d+|\d+[a-z]+|vimtag|tapo|wyze|reolink|nest/i.test(w),
      );
      if (
        modelKeywords.length > 0 &&
        modelKeywords.some(
          (k: string) => idLower.includes(k) || fnLower.includes(k),
        )
      ) {
        return true;
      }
      const matchingWords = words.filter(
        (w: string) => idLower.includes(w) || fnLower.includes(w),
      );
      return matchingWords.length >= Math.min(2, words.length);
    };

    const haCameraEntityId =
      (this.record as any).sourceCameraEntityId ||
      resolveHaCameraEntityId(
        {
          id: this.entityId,
          name: this.record.name,
          realEntities: (this.record as any).realEntities,
        },
        states,
      );
    const targetEntityId =
      haCameraEntityId && registry?.has(haCameraEntityId)
        ? haCameraEntityId
        : this.entityId;
    const deviceId =
      registry?.get(targetEntityId)?.device_id ||
      registry?.get(this.entityId)?.device_id;

    for (const [entityId, state] of states.entries()) {
      const entry = registry?.get(entityId);
      const isSameDevice = Boolean(deviceId && entry?.device_id === deviceId);
      const fn = state?.attributes?.friendly_name;

      const isExplicitModelMatch =
        (/(?:\bc120\b|tapo[-_ ]?c120\b|tapo[-_ ]?spot\b|\bspot\b)/i.test(
          `${entityId} ${fn || ""}`,
        ) &&
          /(?:\bc120\b|tapo[-_ ]?c120\b|tapo[-_ ]?spot\b|\bspot\b)/i.test(
            `${this.entityId} ${this.record.name || ""}`,
          )) ||
        (/(?:\bc402\b|tapo[-_ ]?c402\b|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente)/i.test(
          `${entityId} ${fn || ""}`,
        ) &&
          /(?:\bc402\b|tapo[-_ ]?c402\b|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente)/i.test(
            `${this.entityId} ${this.record.name || ""}`,
          ));

      // CRITICAL: If the camera is a registered HA device (has deviceId), ONLY accept
      // entities physically belonging to that exact same hardware (entry.device_id === deviceId),
      // EXCEPT when explicit camera model tokens match.
      // Never link room fixtures or ambient household bulbs to the camera!
      if (deviceId && !isExplicitModelMatch) {
        if (!isSameDevice) continue;
      } else if (!deviceId) {
        // Cameras without a HA device: strictly exclude room fixtures
        const isRoomFixture =
          /ventilador|fan|techo|ceiling|plafon|plafón|arbotante|aplique|lampara|lámpara|tira|strip|hexágono|hexagon|neon|neón|tv|pantalla|mesa|escritorio|buró|buro|noche|velador|veladora|piso|floor|doble_spot|chandelier|segment/i.test(
            `${entityId} ${fn || ""}`,
          );
        if (isRoomFixture) continue;
        if (!matchesName(entityId, fn)) continue;
      }

      const domain = entityId.split(".")[0];
      const deviceClass = state?.attributes?.device_class;

      if (
        !result.motion &&
        (domain === "binary_sensor" || domain === "event") &&
        (["motion", "occupancy", "presence"].includes(deviceClass) ||
          entityId.includes("motion") ||
          entityId.includes("movimiento") ||
          entityId.includes("celda") ||
          entityId.includes("persona") ||
          entityId.includes("person") ||
          entityId.includes("vehiculo") ||
          entityId.includes("vehicle") ||
          entityId.includes("animal") ||
          entityId.includes("pet") ||
          entityId.includes("mascota"))
      ) {
        result.motion = entityId;
      }
      if (
        !result.light &&
        (domain === "light" || domain === "switch") &&
        (isSameDevice ||
          /spotlight|floodlight|reflector|flash|status_light|indicador|luz_estado|foco_camara|luz_camara/i.test(
            `${entityId} ${fn || ""}`,
          ))
      ) {
        result.light = entityId;
      }
      if (
        !result.siren &&
        (domain === "siren" ||
          (domain === "switch" &&
            (entityId.includes("siren") ||
              entityId.includes("alarm") ||
              entityId.includes("alarma") ||
              (fn || "").toLowerCase().includes("sirena") ||
              (fn || "").toLowerCase().includes("alarma"))))
      ) {
        result.siren = entityId;
      }
      if (
        !result.doorbell &&
        (domain === "binary_sensor" || domain === "event") &&
        (deviceClass === "doorbell" ||
          entityId.includes("doorbell") ||
          entityId.includes("timbre"))
      ) {
        result.doorbell = entityId;
      }
    }

    // Correlate Google Nest companion sensors (Person, Doorbell, Sound)
    if (
      NestCameraAdapter.isNestCamera(this.entityId, states.get(this.entityId))
    ) {
      const nestEntities = NestCameraAdapter.findLinkedNestEntities(
        this.platform,
        this.entityId,
      );
      if (nestEntities.motion && !result.motion)
        result.motion = nestEntities.motion;
      if (nestEntities.person && !result.motion)
        result.motion = nestEntities.person;
      if (nestEntities.doorbell && !result.doorbell)
        result.doorbell = nestEntities.doorbell;
    }

    return result;
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

    // Direct check for Tapo C120 known sensor candidates and full dynamic scan
    if (this.isTapoC120() && states) {
      const c120Candidates = [
        "binary_sensor.tapo_c120_motion",
        "binary_sensor.tapo_c120_person",
        "binary_sensor.tapo_c120_person_detection",
        "binary_sensor.tapo_c120_celda_de_movimiento",
        "binary_sensor.tapo_c120_movimiento",
        "binary_sensor.tapo_c120_deteccion_de_personas",
        "binary_sensor.tapo_c120_deteccion_de_movimiento",
        "binary_sensor.tapo_spot_motion",
        "binary_sensor.c120_motion",
        "binary_sensor.c120_person",
        "binary_sensor.c120_movimiento",
        "binary_sensor.c120_celda_de_movimiento",
        "binary_sensor.camara_c120_motion",
        "binary_sensor.camara_c120_movimiento",
        "event.tapo_c120_motion",
        "event.tapo_c120_person",
        "event.c120_motion",
        "event.c120_person",
      ];
      for (const cand of c120Candidates) {
        if (states.has(cand)) return cand;
      }
      for (const [candId, candState] of states.entries()) {
        if (!candId.startsWith("binary_sensor.") && !candId.startsWith("event.")) continue;
        const fn = (candState?.attributes?.friendly_name || "").toLowerCase();
        const candIdLower = candId.toLowerCase();
        const hasC120Token =
          candIdLower.includes("c120") ||
          candIdLower.includes("spot") ||
          fn.includes("c120") ||
          fn.includes("spot");
        const hasMotionToken =
          candIdLower.includes("motion") ||
          candIdLower.includes("movimiento") ||
          candIdLower.includes("person") ||
          candIdLower.includes("persona") ||
          candIdLower.includes("celda") ||
          candIdLower.includes("detect") ||
          fn.includes("motion") ||
          fn.includes("movimiento") ||
          fn.includes("person") ||
          fn.includes("persona") ||
          fn.includes("celda") ||
          fn.includes("detect");
        if (hasC120Token && hasMotionToken) {
          return candId;
        }
      }
    }

    // Direct check for Tapo C402 known sensor candidates and full dynamic scan
    if (this.isTapoC402() && states) {
      const c402Candidates = [
        "binary_sensor.tapo_frente_de_calle_motion",
        "binary_sensor.tapo_frente_de_calle_movimiento",
        "binary_sensor.tapo_frente_de_calle_celda_de_movimiento",
        "binary_sensor.tapo_frente_de_calle_person",
        "binary_sensor.tapo_frente_de_calle_persona",
        "binary_sensor.tapo_c402_motion",
        "binary_sensor.tapo_c402_movimiento",
        "binary_sensor.tapo_c402_celda_de_movimiento",
        "binary_sensor.tapo_c402_person",
        "binary_sensor.tapo_c402_persona",
        "binary_sensor.tapo_c402_deteccion_de_personas",
        "binary_sensor.tapo_c402_deteccion_de_movimiento",
        "binary_sensor.c402_motion",
        "binary_sensor.c402_movimiento",
        "binary_sensor.c402_person",
        "binary_sensor.c402_celda_de_movimiento",
        "binary_sensor.frente_de_calle_motion",
        "binary_sensor.frente_de_calle_movimiento",
        "binary_sensor.frente_de_calle_celda_de_movimiento",
        "binary_sensor.frente_de_calle_person",
        "event.tapo_frente_de_calle_motion",
        "event.tapo_frente_de_calle_movimiento",
        "event.tapo_frente_de_calle_person",
        "event.tapo_c402_motion",
        "event.tapo_c402_movimiento",
        "event.tapo_c402_person",
        "event.c402_motion",
        "event.c402_movimiento",
        "event.c402_person",
        "event.frente_de_calle_motion",
        "event.frente_de_calle_movimiento",
      ];
      for (const cand of c402Candidates) {
        if (states.has(cand)) return cand;
      }
      for (const [candId, candState] of states.entries()) {
        if (!candId.startsWith("binary_sensor.") && !candId.startsWith("event.")) continue;
        const fn = (candState?.attributes?.friendly_name || "").toLowerCase();
        const candIdLower = candId.toLowerCase();
        const hasC402Token =
          candIdLower.includes("c402") ||
          candIdLower.includes("frente") ||
          fn.includes("c402") ||
          fn.includes("frente");
        const hasMotionToken =
          candIdLower.includes("motion") ||
          candIdLower.includes("movimiento") ||
          candIdLower.includes("person") ||
          candIdLower.includes("persona") ||
          candIdLower.includes("celda") ||
          candIdLower.includes("detect") ||
          fn.includes("motion") ||
          fn.includes("movimiento") ||
          fn.includes("person") ||
          fn.includes("persona") ||
          fn.includes("celda") ||
          fn.includes("detect");
        if (hasC402Token && hasMotionToken) {
          return candId;
        }
      }
    }

    const haCameraEntityId =
      (this.record as any).sourceCameraEntityId ||
      resolveHaCameraEntityId(
        {
          id: this.entityId,
          name: this.record.name,
          realEntities: (this.record as any).realEntities,
        },
        states,
      );
    const targetEntityId =
      haCameraEntityId && registry?.has(haCameraEntityId)
        ? haCameraEntityId
        : this.entityId;
    const deviceId =
      registry?.get(targetEntityId)?.device_id ||
      registry?.get(this.entityId)?.device_id;
    const cameraBase = this.entityId.split(".")[1] || this.entityId;
    if (deviceId && registry) {
      for (const [entityId, entry] of registry.entries()) {
        if (
          entry.device_id !== deviceId ||
          (!entityId.startsWith("binary_sensor.") && !entityId.startsWith("event."))
        )
          continue;
        const state = states?.get(entityId);
        const deviceClass = state?.attributes?.device_class;
        if (
          ["motion", "occupancy", "presence"].includes(deviceClass) ||
          entityId.includes("motion") ||
          entityId.includes("movimiento") ||
          entityId.includes("person") ||
          entityId.includes("persona") ||
          entityId.includes("celda")
        ) {
          return entityId;
        }
      }
    }
    if (states) {
      const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanCam = clean(this.record?.name || "");
      const cleanBase = clean(cameraBase.replace(/^cameraui_/, ""));
      for (const [entityId, state] of states.entries()) {
        if (!entityId.startsWith("binary_sensor.")) continue;
        const deviceClass = state?.attributes?.device_class;
        const isMotionClass =
          ["motion", "occupancy", "presence"].includes(deviceClass || "") ||
          entityId.includes("motion") ||
          entityId.includes("movimiento") ||
          entityId.includes("celda") ||
          entityId.includes("person") ||
          entityId.includes("persona") ||
          entityId.includes("detection") ||
          entityId.includes("deteccion") ||
          entityId.includes("animal") ||
          entityId.includes("pet") ||
          entityId.includes("mascota") ||
          entityId.includes("vehicle") ||
          entityId.includes("vehiculo") ||
          entityId.includes("car") ||
          entityId.includes("auto");
        if (!isMotionClass) continue;
        const cleanEntity = clean(entityId);
        const fn = (state?.attributes?.friendly_name || "").toLowerCase();
        const cleanFn = clean(fn);
        const camWords = (this.record?.name || "")
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length >= 3);
        const wordsMatch =
          camWords.length > 0 &&
          camWords.every((w) => cleanEntity.includes(w) || cleanFn.includes(w));
        const aliasMatch =
          typeof this.platform?.matchCameraIdentifier === "function" &&
          (this.platform.matchCameraIdentifier(
            { id: this.entityId, name: this.record?.name },
            entityId,
          ) ||
            this.platform.matchCameraIdentifier(
              { id: this.entityId, name: this.record?.name },
              fn,
            ));
        const isC120Entity = /tapo[-_ ]?c120|tapo[-_ ]?spot|\bc120\b/i.test(
          `${entityId} ${fn}`,
        );
        const isC120Cam = /tapo[-_ ]?c120|tapo[-_ ]?spot|\bc120\b/i.test(
          `${this.entityId} ${this.record?.name || ""} ${this.record?.model || ""}`,
        );
        if (isC120Entity && isC120Cam) {
          return entityId;
        }

        const isC402Entity =
          /tapo[-_ ]?c402|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente|\bc402\b/i.test(
            `${entityId} ${fn}`,
          );
        const isC402Cam =
          this.isTapoC402() ||
          /tapo[-_ ]?c402|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente|\bc402\b/i.test(
            `${this.entityId} ${this.record?.name || ""} ${this.record?.model || ""} ${this.streamSource?.url || ""}`,
          );
        if (isC402Entity && isC402Cam) {
          return entityId;
        }

        const isVimtagEntity = /vimtag/i.test(`${entityId} ${fn}`);
        const isVimtagCam = /vimtag/i.test(
          `${this.entityId} ${this.record?.name || ""} ${this.record?.model || ""}`,
        );
        if (isVimtagEntity && isVimtagCam) {
          return entityId;
        }

        if (
          (cleanCam.length >= 3 && cleanEntity.includes(cleanCam)) ||
          (cleanBase.length >= 4 && cleanEntity.includes(cleanBase)) ||
          wordsMatch ||
          aliasMatch
        ) {
          return entityId;
        }
      }
    }
    return undefined;
  }

  public static detectPrimaryNetworkInterface():
    { name: string; ip: string } | undefined {
    return detectPrimaryNetworkInterface();
  }

  public ensureMotionService(): void {
    if (!this.motionService) {
      try {
        this.motionService =
          this.accessory.getService(Service.MotionSensor) ||
          this.accessory.addService(
            Service.MotionSensor,
            `${this.record.name || this.entityId} Movimiento`,
          );
        this.motionService.setCharacteristic(
          Characteristic.Name,
          `${this.record.name || this.entityId} Movimiento`,
        );
        this.motionService.setCharacteristic(Characteristic.StatusActive, true);
      } catch (err) {
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] Error asegurando MotionSensor diferido: ${err}`,
        );
      }
    }
  }

  public updateMotionState(motionDetected: boolean): void {
    this.ensureMotionService();
    if (this.motionService) {
      this.motionService.updateCharacteristic(
        Characteristic.MotionDetected,
        motionDetected,
      );
    }
    this.recordingDelegate?.handleMotionDetected(motionDetected);
  }

  public updateLightState(isOn: boolean): void {
    if (!this.lightService) return;
    try {
      this.lightService.updateCharacteristic(Characteristic.On, isOn);
    } catch {}
  }

  public updateSirenState(isOn: boolean): void {
    if (!this.sirenService) return;
    try {
      this.sirenService.updateCharacteristic(Characteristic.On, isOn);
    } catch {}
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
      this.recordingDelegate?.updateRecordingActive(false);
      this.delegate?.cleanupAllSessions();
      void this.platform?.saveHomeKitCameraRecords?.();
      this.notifyPairingStateChanged(false);
    });

    await this.accessory.publish({
      username: this.record.username,
      pincode: this.record.pincode,
      port: this.record.port,
      category: Categories.IP_CAMERA,
      setupID: this.record.setupId,
      advertiser: MDNSAdvertiser.CIAO,
      bind: undefined,
    });
    this.isPublished = true;
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] Published production HAP camera port=${this.record.port} (advertiser=ciao, iface=all) HKSV=${this.record.hksvEnabled ? "enabled" : "disabled"}`,
    );

    // Camera.UI already supplies its RTSP codec/audio metadata.  Probing and
    // warming every Camera.UI source after a restart opened dozens of extra
    // RTSP readers at once, which is precisely what makes cameras become
    // unavailable.  Capabilities are refreshed by the explicit verification
    // action; snapshots are fetched only when Apple Home requests one.
    if (
      !this.streamSource.metadata?.isCameraUi &&
      !this.streamSource.metadata?.capabilitiesProbedBeforePublish
    ) {
      void this.probeAndAdaptCapabilities();
      setTimeout(() => {
        void this.delegate?.handleSnapshotRequest(
          { width: 1280, height: 720 },
          () => {},
        );
      }, 1500);
    }
  }

  public async probeAndAdaptCapabilities(): Promise<void> {
    if (!this.streamSource.url) return;
    try {
      const probe = await probeCameraSource(this.streamSource.url, {
        timeoutMs: 4000,
      });
      if (probe.valid && probe.videoCodec) {
        const codec = probe.videoCodec.toLowerCase();
        const isHevc = codec.includes("hevc") || codec.includes("265");
        this.capabilities.videoCodec = isHevc ? "hevc" : "h264";
        this.capabilities.requiresTranscoding = false;
        this.capabilities.strategy = isHevc
          ? "passthrough_hevc"
          : "passthrough_h264";
        if (probe.hasAudio !== undefined) {
          this.capabilities.hasAudio = probe.hasAudio;
        }
        if (probe.width && probe.height) {
          this.capabilities.resolution = {
            width: probe.width,
            height: probe.height,
          };
        }
        if (probe.fps) {
          this.capabilities.maxFps = probe.fps;
        }
        this.capabilities.measuredVideo = {
          codec: probe.videoCodec,
          profile: probe.videoProfile,
          level: probe.videoLevel,
          width: probe.width,
          height: probe.height,
          rFrameRate: probe.rFrameRate,
          avgFrameRate: probe.avgFrameRate,
          fps: probe.fps,
          bitrateKbps: probe.bitrateKbps,
          pixFmt: probe.pixFmt,
        };
        this.platform?.log?.notice?.(
          `[HomeKitCamera][${this.entityId}] Probed capabilities: codec=${probe.videoCodec} ${probe.width}x${probe.height}@${probe.fps}fps hasAudio=${probe.hasAudio} -> strategy=${this.capabilities.strategy}`,
        );

        if (this.entityId.includes("cameraui")) {
          const cuiId = this.record.cameraUiCameraId || this.entityId
            .replace(/^camera\.cameraui_/, "")
            .replace(/^camera\./, "");
          void CameraUiStorage.updateCamera(cuiId, (cam) => {
            cam.videoCodec = this.capabilities.videoCodec;
            cam.strategy = this.capabilities.strategy as any;
            if (probe.hasAudio !== undefined) cam.hasAudio = probe.hasAudio;
            if (probe.width && probe.height) {
              cam.width = probe.width;
              cam.height = probe.height;
            }
            if (probe.fps) cam.fps = probe.fps;
            return cam;
          });
        }
      }
    } catch {}
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

      // Update Camera.UI storage if applicable
      const cuiId = this.record.cameraUiCameraId || this.entityId
        .replace(/^camera\.cameraui_/, "")
        .replace(/^camera\./, "");
      void CameraUiStorage.updateCamera(cuiId, (cam) => {
        cam.isPaired = paired;
        return cam;
      });

      this.platform?.broadcastSseMessage?.("camera_pairing_updated", {
        entityId: this.entityId,
        isPaired: paired,
        homeName,
      });
      this.platform?.broadcastSseMessage?.("cameraui_updated", {
        entityId: this.entityId,
        isPaired: paired,
      });
      this.platform?.broadcastSseMessage?.("state_change", {
        entityId: this.entityId,
        isPaired: paired,
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
      const serverInfo = (this.accessory as any)?._server?.accessoryInfo;
      if (serverInfo && typeof serverInfo.paired === "function") {
        const isHapPaired = serverInfo.paired();
        if (this.record.isPaired !== isHapPaired) {
          this.record.isPaired = isHapPaired;
          void this.platform?.saveHomeKitCameraRecords?.();
          this.notifyPairingStateChanged(isHapPaired);
        }
        return isHapPaired ? "paired" : "not_paired";
      }

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

  public get isStreaming(): boolean {
    return this.delegate?.isStreaming ?? false;
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
      if (this.record.username)
        AccessoryInfo.remove(this.record.username as any);
    } catch (error) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Unable to remove old pairing: ${String(error)}`,
      );
    }

    // Generate fresh MAC address (username) and setupId so iOS sees a brand-new device
    const randomHex = crypto.randomBytes(5).toString("hex").toUpperCase();
    this.record.username = `0E:${randomHex.match(/.{2}/g)!.join(":")}`;
    this.record.setupId = crypto
      .randomBytes(2)
      .toString("hex")
      .toUpperCase()
      .slice(0, 4);
    this.record.pincode = generateFreshHomeKitPin(this.record.pincode);

    // Pick next free port across both HomeKit records and Camera.UI store
    const usedPorts = new Set<number>();
    if (this.platform?.homekitCameraRecords) {
      for (const r of this.platform.homekitCameraRecords.values() as Iterable<HomeKitCameraStorageRecord>) {
        if (r.port && r.port !== this.record.port) usedPorts.add(r.port);
      }
    }
    try {
      const cuiStore = CameraUiStorage.getCachedStore();
      if (cuiStore) {
        for (const c of cuiStore.cameras) {
          if (c.port && c.port !== this.record.port) usedPorts.add(c.port);
        }
      }
    } catch {}
    let nextPort = 51830;
    while (usedPorts.has(nextPort)) nextPort++;
    this.record.port = nextPort;

    this.record.published = false;
    this.record.isPaired = false;
    // Pairing identity is independent from camera capabilities.  Clearing
    // HKSV here made a reset look like a camera that could no longer record
    // until a later remount rebuilt the service graph.
    this.record.uuid = uuid.generate(
      `homekit:camera:${this.entityId}:${Date.now()}`,
    );
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

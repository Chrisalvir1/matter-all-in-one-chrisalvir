import { verifiedH264Encoder } from "./media-policy.js";
import { SecureVideoController } from "@homebridge/hap-nodejs";
import { MultiTierRtpDelegate } from "./hevc/multi-tier-rtp.js";
import { WebRtcSessionManager } from "./hevc/webrtc-session.js";
import { CameraSourceAdapter } from "../source-adapter.js";
import { h264AudioPlan } from "./media-policy.js";
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
import { getHaEntitySearchText } from "../../utils/ha-entity-names.js";
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
import { FfmpegMotionDetector } from "../motion/ffmpeg-motion-detector.js";

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
  public controller?: CameraController | SecureVideoController;
  public secureRtp?: MultiTierRtpDelegate;
  public secureWebRtc?: WebRtcSessionManager;
  public delegate?: HomeKitCameraStreamingDelegate;
  public recordingDelegate?:
    HomeKitCameraRecordingDelegate | HevcRecordingDelegate;
  public motionService?: Service;
  public lightService?: Service;
  public sirenService?: Service;
  public linkedMotionEntityId?: string;
  public linkedLightEntityId?: string;
  public linkedSirenEntityId?: string;
  public linkedDoorbellEntityId?: string;
  private localMotionDetector?: FfmpegMotionDetector;
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
      Boolean(this.streamSource.metadata?.isCameraUi) ||
      Boolean(this.streamSource.metadata?.isHaProxyStream);
    this.record.hksvEnabled ??= isStreamingUsable;
    this.record.hksvCapable = isStreamingUsable;
    this.record.hksvState = isStreamingUsable ? "waiting_hub" : "not_capable";

    const configuredMode = this.record.exportMode || "auto";
    const codec = this.capabilities.videoCodec;
    const effectiveMode =
      configuredMode === "disabled"
        ? "disabled"
        : codec === "hevc" || codec === "h265"
          ? "passthrough_hevc"
          : "passthrough_h264";
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

    if (effectiveMode === "passthrough_hevc")
      this.configureSecureCameraController();
    else this.configureClassicCameraController();
  }

  private configureSecureCameraController(): void {
    const c = this.capabilities;
    const width = c.measuredVideo?.width || c.resolution.width,
      height = c.measuredVideo?.height || c.resolution.height,
      fps = c.measuredVideo?.fps || c.maxFps;
    if (!(width > 0 && height > 0 && fps > 0))
      throw new Error("Secure Video needs known source dimensions and FPS");
    const videoTiers = [
      {
        identifier: 1,
        quality: 2,
        width,
        height,
        frameRate: fps,
        targetAverageBitrate: c.measuredVideo?.bitrateKbps || 1800,
        peakBitrate: c.measuredVideo?.bitrateKbps || 2000,
      },
    ];
    const audioTier = {
      identifier: 1,
      targetAverageBitrate: 24000,
      sampleRate: 4,
      bitDepth: 2,
      packetTime: 20,
      channels: 1,
    };
    this.recordingDelegate = new HevcRecordingDelegate(
      this.platform,
      this.entityId,
      this.record,
      c,
      this.streamSource,
    );
    this.secureRtp = new MultiTierRtpDelegate(
      this.platform,
      this.entityId,
      c,
      this.streamSource,
      { videoTiers, audioTier, videoPayloadType: 99, audioPayloadType: 110 },
    );
    this.secureWebRtc = new WebRtcSessionManager(
      this.platform,
      this.entityId,
      c,
      this.streamSource,
      videoTiers,
    );
    const snapshotDelegate = new HomeKitCameraStreamingDelegate(
      this.platform,
      this.entityId,
      c,
      this.streamSource,
      this.record,
    );
    this.delegate = snapshotDelegate;
    this.controller = new SecureVideoController({
      sensor: { uuid: this.record.uuid, width, height, type: 1, intent: 1 },
      video: { codec: 2, payloadType: 99, tiers: videoTiers },
      ...(c.hasAudio
        ? { audio: { payloadType: 110, tier: audioTier, twoWayAudio: false } }
        : {}),
      rtp: { delegate: this.secureRtp },
      webrtc: { delegate: this.secureWebRtc, maxSessions: 6 },
      recording: {
        delegate: this.recordingDelegate,
        options: {
          prebufferLength: 8000,
          mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
          video: {
            type: 0,
            parameters: { profiles: [1], levels: [0, 1, 2] },
            resolutions: [[width, height, fps]],
          },
          audio: { codecs: { type: 0, audioChannels: 1, samplerate: [5] } },
        },
      },
      ...(this.motionService ? { motionService: this.motionService } : {}),
      snapshot: (request) =>
        new Promise((resolve, reject) =>
          snapshotDelegate.handleSnapshotRequest(
            {
              width: request?.width || width,
              height: request?.height || height,
            },
            (error, data) => (error ? reject(error) : resolve(data!)),
          ),
        ),
    });
    for (const delegate of [this.secureRtp, this.secureWebRtc]) {
      delegate.on("session-start", () =>
        this.recordingDelegate?.pausePrebuffer(),
      );
      delegate.on("recording-data", (chunk: Buffer) => {
        const recording = this.recordingDelegate;
        if (recording && "ingestLiveViewRecordingChunk" in recording)
          recording.ingestLiveViewRecordingChunk(chunk);
      });
      delegate.on("session-end", () => {
        if (
          !this.secureRtp?.hasActiveReader &&
          !this.secureWebRtc?.hasActiveReader
        )
          this.recordingDelegate?.resumePrebuffer();
      });
    }
    this.accessory.configureController(this.controller);
    this.record.activeController = "SecureVideoController";
  }

  private configureClassicCameraController(): void {
    this.record.activeController = "CameraController";
    this.delegate = new HomeKitCameraStreamingDelegate(
      this.platform,
      this.entityId,
      this.capabilities,
      this.streamSource,
      this.record,
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
      this.localMotionDetector?.pause(
        this.platform?.log,
        "Apple Home Live View",
      );
    });
    this.delegate.on("motion-analysis-line", (line: string) => {
      this.localMotionDetector?.observeLiveStreamLine(line, this.platform?.log);
    });
    this.delegate.on("recording-analysis-data", (chunk: Buffer) => {
      const recordingDelegate = this.recordingDelegate;
      if (
        recordingDelegate &&
        "ingestLiveViewRecordingChunk" in recordingDelegate
      ) {
        recordingDelegate.ingestLiveViewRecordingChunk(chunk);
      }
    });
    this.delegate.on("session-end", () => {
      if (this.delegate?.hasActiveSessions()) {
        this.platform?.log?.debug?.(
          `[HomeKitCamera][${this.entityId}] session-end recibido pero aún quedan ${this.delegate.activeSessionCount()} sesión(es) activa(s) — manteniendo prebuffer pausado`,
        );
        return;
      }
      this.recordingDelegate?.resumePrebuffer();
      this.localMotionDetector?.resume(
        this.platform?.log,
        "Apple Home Live View ended",
      );
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
      Boolean(this.streamSource.metadata?.isCameraUi) ||
      Boolean(this.streamSource.metadata?.isHaProxyStream);
    // Do not negotiate AAC-ELD unless this exact FFmpeg binary can encode it.
    // The native FFmpeg `aac` encoder only emits AAC-LC; advertising AAC-ELD
    // and then sending AAC-LC makes HomeKit reject the audio RTP stream.
    const audioPlan = h264AudioPlan(this.capabilities);
    const audioCodecs =
      audioPlan.codec === "unavailable"
        ? []
        : [
            {
              type:
                audioPlan.codec === "opus"
                  ? AudioStreamingCodecType.OPUS
                  : AudioStreamingCodecType.AAC_ELD,
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
        // Omni renews its signed RTSP URL on every HomeKit session, so the
        // startup URL may have expired before its audio SDP can be measured.
        // Offer the standard audio codecs for Omni and validate the fresh URL
        // immediately before spawning FFmpeg in the streaming delegate.
        audio:
          audioCodecs.length > 0
            ? {
                codecs: audioCodecs,
              }
            : undefined,
      },
      sensors: this.motionService ? { motion: this.motionService } : undefined,
    };

    if (isStreamingUsable && this.recordingDelegate) {
      options.recording = {
        options: {
          prebufferLength: 8000,
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
              samplerate: [AudioRecordingSamplerate.KHZ_48],
            },
          },
        },
        delegate: this.recordingDelegate,
      };
    }

    return options;
  }

  public buildRecordingResolutions(): [number, number, number][] {
    return this.buildDeclaredResolutions();
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
    const c = this.capabilities;
    const width = c.measuredVideo?.width || c.resolution.width;
    const height = c.measuredVideo?.height || c.resolution.height;
    const fps = c.measuredVideo?.fps || c.maxFps;
    if (!(width > 0 && height > 0 && fps > 0))
      throw new Error("Camera geometry is unknown");
    if (
      (width > 1920 ||
        height > 1080 ||
        this.streamSource.sourceType === "ha_proxy" ||
        this.streamSource.sourceType === "mjpeg") &&
      !verifiedH264Encoder()
    )
      throw new Error("Classic HAP normalization encoder unavailable");
    const ratio = Math.min(1, 1920 / width, 1080 / height);
    const w = Math.floor((width * ratio) / 2) * 2,
      h = Math.floor((height * ratio) / 2) * 2;
    // Passthrough supplies the measured geometry, independent of UI model aliases.
    return [[w, h, Math.floor(fps)]];
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
    codec: "h264" | "hevc";
    profiles: string[];
    levels: string[];
    resolutions: [number, number, number][];
  } {
    if (this.record.activeController === "SecureVideoController")
      return {
        codec: "hevc",
        profiles: this.capabilities.videoProfile
          ? [this.capabilities.videoProfile]
          : [],
        levels: this.capabilities.measuredVideo?.level
          ? [this.capabilities.measuredVideo.level]
          : [],
        resolutions: [
          [
            this.capabilities.resolution.width,
            this.capabilities.resolution.height,
            this.capabilities.maxFps,
          ],
        ],
      };
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
      for (const [candId] of states.entries()) {
        if (
          !candId.startsWith("binary_sensor.") &&
          !candId.startsWith("event.")
        )
          continue;
        const fn = getHaEntitySearchText(
          this.platform?.ha,
          candId,
        ).toLowerCase();
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

    // Direct check for Tapo C402 known sensor candidates
    if (this.isTapoC402() && states) {
      const c402Candidates = [
        "binary_sensor.tapo_frente_de_calle_motion",
        "binary_sensor.tapo_c402_motion",
        "binary_sensor.c402_motion",
        "binary_sensor.frente_de_calle_motion",
      ];
      for (const cand of c402Candidates) {
        if (states.has(cand)) return cand;
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
          (!entityId.startsWith("binary_sensor.") &&
            !entityId.startsWith("event."))
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
        const fn = getHaEntitySearchText(
          this.platform?.ha,
          entityId,
        ).toLowerCase();
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
          /tapo[-_ ]?c402|frente[-_ ]?de[-_ ]?calle|tapo[-_ ]?frente|\bc402\b/i.test(
            `${this.entityId} ${this.record?.name || ""}`,
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
      void this.secureRtp?.stopAll();
      void this.secureWebRtc?.closeAll();
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
    this.startRenewableOmniMotionDetection();

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
    }
  }

  /**
   * Omni's camera entity has no motion binary_sensor. For its renewable,
   * signed RTSP feed we run an inexpensive 1 FPS frame-difference detector.
   * It uses a fresh URL whenever FFmpeg reconnects and pauses during a live
   * HomeKit session so the camera never has competing readers.
   */
  private startRenewableOmniMotionDetection(): void {
    if (
      this.localMotionDetector ||
      this.linkedMotionEntityId ||
      !this.streamSource.metadata?.isOmniTuyaDirect ||
      !this.platform?.ha?.requestOmniTuyaCameraStream
    )
      return;

    const sourceCameraEntityId =
      this.streamSource.metadata?.sourceCameraEntityId || this.entityId;
    this.localMotionDetector = new FfmpegMotionDetector({
      cameraId: this.entityId,
      cameraName: this.record.name || this.entityId,
      rtspUrl: this.streamSource.url || "",
      fps: 1,
      reportAllFrameChanges: true,
      resolveRtspUrl: async () =>
        await this.platform.ha.requestOmniTuyaCameraStream(
          sourceCameraEntityId,
        ),
    });
    this.localMotionDetector.on("motion", (detected: boolean) => {
      this.updateMotionState(detected);
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Local FFmpeg motion=${detected ? "detected" : "cleared"} → HomeKit/HKSV`,
      );
    });
    this.localMotionDetector.start(this.platform?.log);
  }

  public async probeAndAdaptCapabilities(): Promise<void> {
    if (
      !this.streamSource.url ||
      this.isStreaming ||
      this.streamSource.metadata?.isOmniTuyaDirect
    )
      return;
    try {
      // Omni Tuya URLs are single-session signed RTSP credentials. Probe a
      // freshly allocated URL instead of the resolver's expired startup URL.
      const sourceCameraEntityId =
        this.streamSource.metadata?.sourceCameraEntityId || this.entityId;
      const probeUrl = this.streamSource.metadata?.isOmniTuyaDirect
        ? await this.platform?.ha?.requestOmniTuyaCameraStream?.(
            sourceCameraEntityId,
          )
        : this.streamSource.url;
      if (!probeUrl) return;
      const adapter = new CameraSourceAdapter(
        this.platform,
        this.entityId,
        this.streamSource,
        this.capabilities,
        this.record,
      );
      const { probe } = await adapter.discover(probeUrl);
      if (probe.valid && probe.videoCodec) {
        this.capabilities.audioProvenance = "PROBED";
        const codec = probe.videoCodec.toLowerCase();
        if (!["hevc", "h265", "h264"].includes(codec)) {
          this.capabilities.hasLiveStream = false;
          return;
        }
        const isHevc = codec.includes("hevc") || codec.includes("265");
        this.capabilities.videoCodec = isHevc ? "hevc" : "h264";
        this.capabilities.requiresTranscoding = false;
        this.capabilities.strategy = isHevc
          ? "passthrough_hevc"
          : "passthrough_h264";
        if (probe.hasAudio !== undefined) {
          this.capabilities.hasAudio = probe.hasAudio;
        }
        if (probe.hasAudio && probe.audioCodec) {
          const audioCodec = probe.audioCodec.toLowerCase();
          this.capabilities.audioCodec =
            audioCodec as CameraCapabilitiesInfo["audioCodec"];
          this.capabilities.audioSampleRate = probe.audioSampleRate;
          this.capabilities.audioChannels = probe.audioChannels;
        } else if (probe.hasAudio === false) {
          this.capabilities.audioCodec = "none";
          this.capabilities.audioSampleRate = undefined;
          this.capabilities.audioChannels = undefined;
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
          metadataSource: "ffprobe",
        };
        this.platform?.log?.notice?.(
          `[HomeKitCamera][${this.entityId}] Probed capabilities: codec=${probe.videoCodec} ${probe.width}x${probe.height}@${probe.fps}fps hasAudio=${probe.hasAudio} -> strategy=${this.capabilities.strategy}`,
        );

        if (this.entityId.includes("cameraui")) {
          const cuiId =
            this.record.cameraUiCameraId ||
            this.entityId
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
      const cuiId =
        this.record.cameraUiCameraId ||
        this.entityId
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

  public getLiveViewTelemetry() {
    return {
      ...(this.delegate?.getLiveViewTelemetry() || { active: [], recent: [] }),
      secure: {
        rtp: this.secureRtp?.getStartupDiagnostics(),
        webRTC: this.secureWebRtc?.getStartupDiagnostics(),
      },
    };
  }

  public get isStreaming(): boolean {
    return Boolean(
      this.delegate?.isStreaming ||
      this.secureRtp?.isStreaming ||
      this.secureWebRtc?.isStreaming,
    );
  }

  public async unpublish(): Promise<void> {
    await this.secureRtp?.stopAll();
    await this.secureWebRtc?.closeAll();
    this.delegate?.cleanupAllSessions();
    this.recordingDelegate?.updateRecordingActive(false);
    this.localMotionDetector?.stop(this.platform?.log);
    this.localMotionDetector = undefined;
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

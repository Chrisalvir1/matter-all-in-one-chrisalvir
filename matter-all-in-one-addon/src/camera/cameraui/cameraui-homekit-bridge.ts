import crypto from "node:crypto";
import { uuid } from "@homebridge/hap-nodejs";
import { MatterbridgeEndpoint, occupancySensor } from "matterbridge";
import { OccupancySensing } from "matterbridge/matter/clusters";
import { safeSetAttribute } from "../../utils/matter-attributes.js";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import {
  generateFreshHomeKitPin,
  HomeKitCameraAccessory,
} from "../homekit/homekit-camera.accessory.js";
import { FfmpegMotionDetector } from "../motion/ffmpeg-motion-detector.js";
import type { CameraUiCameraRecord } from "./cameraui-types.js";
import { CameraUiStorage } from "./cameraui-storage.js";
import {
  probeCameraSource,
  sanitizeUrlCredentials,
  type ProbeResult,
} from "../homekit/ffmpeg-helper.js";

/** Apply only measured stream properties; never infer a codec from the model name. */
export function applyCameraSourceProbe(
  camera: CameraUiCameraRecord,
  probe: ProbeResult,
  sourceUrl: string,
): boolean {
  if (
    !probe.valid ||
    !probe.videoCodec ||
    !probe.width ||
    !probe.height ||
    !probe.fps
  ) {
    return false;
  }

  const codec = probe.videoCodec.toLowerCase();
  if (
    codec.includes("265") ||
    codec.includes("hevc") ||
    codec.includes("hvc1")
  ) {
    camera.videoCodec = "hevc";
  } else if (codec.includes("264") || codec.includes("avc")) {
    camera.videoCodec = "h264";
  } else {
    return false;
  }
  camera.videoCodecSource = "ffprobe";
  camera.codecProbeUrl = sourceUrl;
  camera.codecProbedAt = new Date().toISOString();
  camera.width = probe.width;
  camera.height = probe.height;
  camera.fps = probe.fps;
  camera.hasAudio = probe.hasAudio;
  camera.audioCodec = probe.audioCodec?.toLowerCase();
  camera.audioSampleRate = probe.audioSampleRate;
  camera.audioChannels = probe.audioChannels;
  camera.strategy =
    camera.videoCodec === "hevc" ? "passthrough_hevc" : "passthrough_h264";
  return true;
}

export class CameraUiHomeKitBridge {
  private static activeAccessories = new Map<string, HomeKitCameraAccessory>();
  private static activeMatterEndpoints = new Map<
    string,
    MatterbridgeEndpoint
  >();
  /** One FFmpeg motion detector per mounted camera, keyed by camera.id */
  private static activeMotionDetectors = new Map<
    string,
    FfmpegMotionDetector
  >();

  public static getAccessory(
    cameraId: string,
  ): HomeKitCameraAccessory | undefined {
    return this.activeAccessories.get(cameraId);
  }

  public static getAllAccessories(): Map<string, HomeKitCameraAccessory> {
    return this.activeAccessories;
  }

  public static getMatterEndpoint(
    cameraId: string,
  ): MatterbridgeEndpoint | undefined {
    return this.activeMatterEndpoints.get(cameraId);
  }

  public static getAllMatterEndpoints(): Map<string, MatterbridgeEndpoint> {
    return this.activeMatterEndpoints;
  }

  public static async mountCamera(
    platform: any,
    camera: CameraUiCameraRecord,
    options: { forceRemount?: boolean } = {},
  ): Promise<HomeKitCameraAccessory | undefined> {
    if (!camera.homeKitEnabled || !camera.rtspUrl) {
      return undefined;
    }

    // `AccessoryInfo` is not always available during the first few moments
    // after the add-on starts. Keep this only as a short-lived recovery hint:
    // it lets an already-paired camera restore motion detection while HAP is
    // bringing its persistent pairing database online. It is never written
    // back as the authoritative pairing state.
    const wasMarkedPairedBeforePublish = camera.isPaired === true;

    const existing = this.activeAccessories.get(camera.id);
    if (existing && (existing.isStreaming || !options.forceRemount)) {
      // A Camera.UI refresh is not a configuration change. Re-publishing an
      // already paired HAP accessory tears down its mDNS/HAP listener and
      // interrupts the next Live View. Keep the live accessory, its pairing,
      // recording delegate and motion detector until an explicit edit asks for
      // a remount.
      return existing;
    }
    if (existing) {
      await existing.unpublish();
      this.activeAccessories.delete(camera.id);
      const oldDet = this.activeMotionDetectors.get(camera.id);
      if (oldDet) {
        oldDet.stop(platform?.log);
        this.activeMotionDetectors.delete(camera.id);
      }
    }

    const hasSource = Boolean(camera.rtspUrl);
    // The C402 stream is served by the Home Assistant Tapo satellite, not
    // Camera.UI. Measure that exact RTSP endpoint before constructing HAP so
    // CameraController advertises the real codec, dimensions and frame rate.
    // The previous seeded 2304x1296/15 metadata did not match its live
    // 2560x1440/30 stream and HAP was permanently configured with stale values.
    const isHomeAssistantSource = camera.sourceProvider === "home_assistant";

    // C120 explicit dimension enforcement: the camera MUST be declared as 2560×1440.
    // -c:v copy sends the raw H.264 SPS which contains 2560×1440. If HAP declares a
    // different resolution (e.g. stale 1920×1080 saved during v1.8.82-84), iOS's
    // VideoToolbox rejects the SPS dimension mismatch → "Sin Respuesta".
    // This override runs every startup regardless of what cameraui-config.json has stored.
    const isTapoC120Mount = /(?:\bc120\b|tapo[-_ ]?c120)/i.test(`${camera.id} ${camera.name || ""}`);
    if (isTapoC120Mount) {
      camera.width = 2560;
      camera.height = 1440;
      camera.fps = 30;
      camera.videoCodec = "h264";
      camera.strategy = "passthrough_h264";
      camera.hasAudio = camera.hasAudio !== false; // preserve explicit false
      camera.audioCodec = "pcm_alaw";
      camera.audioSampleRate = 8000;
      camera.audioChannels = 1;
    }

    if (isHomeAssistantSource && camera.rtspUrl) {
      try {
        const probe = await probeCameraSource(camera.rtspUrl, {
          timeoutMs: 4000,
        });
        if (applyCameraSourceProbe(camera, probe, camera.rtspUrl)) {
          platform.log?.notice?.(
            `[Camera.UI][${camera.name}] Pre-publish RTSP probe verified: ${camera.videoCodec} ${camera.width}x${camera.height}@${camera.fps}fps audio=${camera.audioCodec || "none"}`,
          );
        } else {
          const safeError = probe.error
            ? sanitizeUrlCredentials(probe.error)
            : "no se detectaron códec, resolución y FPS";
          platform.log?.error?.(
            `[Camera.UI][${camera.name}] No se publica HAP con capacidades antiguas: el stream HA no se pudo medir (${safeError})`,
          );
          return undefined;
        }
      } catch (error) {
        platform.log?.error?.(
          `[Camera.UI][${camera.name}] No se publica HAP: falló la medición previa del stream HA (${String(error)})`,
        );
        return undefined;
      }
    }
    // Todo stream RTSP/RTSPS de Camera.UI (H.264 o H.265/HEVC) es válido para HKSV:
    // el recordingDelegate transcodifica a H.264 vía FFmpeg cuando el origen es H.265,
    // por lo que el códec de origen nunca debe bloquear la capacidad HKSV.
    const isRtspSource = Boolean(
      camera.rtspUrl && /^rtsps?:\/\//i.test(camera.rtspUrl),
    );
    const isHaProxy = false;
    const rawCodec = (camera.videoCodec || "").toLowerCase();
    const isExplicitH264 = rawCodec === "h264" || rawCodec === "avc";
    const isHevc =
      !isExplicitH264 &&
      (rawCodec.includes("hevc") || rawCodec.includes("265"));
    const chosenCodec = isHevc ? "hevc" : "h264";
    const chosenStrategy = isHevc ? "passthrough_hevc" : "passthrough_h264";

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: hasSource,
      streamSourceType: "rtsp",
      videoCodec: chosenCodec,
      hasAudio: camera.hasAudio,
      // Keep the measured source codec. The HAP delegates copy AAC when
      // compatible and transcode only non-AAC audio (e.g. PCM A-law) to AAC.
      audioCodec: (camera.audioCodec ||
        (camera.hasAudio !== false ? "aac" : "none")) as CameraCapabilitiesInfo["audioCodec"],
      audioSampleRate: camera.audioSampleRate,
      audioChannels: camera.audioChannels,
      resolution: {
        width: camera.width || 1920,
        height: camera.height || 1080,
      },
      maxFps: camera.fps || 30,
      strategy: chosenStrategy,
      requiresTranscoding: isHaProxy,
      snapshotSupported: Boolean(camera.snapshotUrl),
      snapshotUrl: camera.snapshotUrl,
      hksvCapable: isRtspSource,
    };

    const source: ResolvedStreamSource = {
      sourceType: "rtsp",
      url: camera.rtspUrl,
      snapshotUrl: camera.snapshotUrl,
      supportsPassthrough: true,
      requiresBridge: true,
      metadata: {
        isCameraUi: true,
        hasCameraMotion: true,
        capabilitiesProbedBeforePublish: isHomeAssistantSource,
        streamProvider: camera.sourceProvider || "camera_ui",
        camerauiCameraId: camera.id,
        hasDoorbell: Boolean(camera.doorbellTopic),
        model: camera.model || "Camera.UI Stream",
      },
    };

    // Allocate persistent HomeKit configuration if not assigned
    if (!camera.port) {
      camera.port = this.allocateNextPort(platform);
    }
    // The old seeded records all used the same manual HAP code.  Migrate an
    // unpaired default safely before publishing; paired accessories retain
    // their established identity until the user explicitly resets them.
    if (
      !camera.pincode ||
      (!camera.isPaired && camera.pincode === "031-45-154")
    ) {
      camera.pincode = generateFreshHomeKitPin(camera.pincode);
    }
    if (!camera.username) {
      const hex = crypto.randomBytes(5).toString("hex").toUpperCase();
      camera.username = `0E:${hex.match(/.{2}/g)!.join(":")}`;
    }
    if (!camera.setupId) {
      camera.setupId = crypto
        .randomBytes(2)
        .toString("hex")
        .toUpperCase()
        .slice(0, 4);
    }
    if (!camera.uuid) {
      camera.uuid = uuid.generate(`cameraui:camera:${camera.id}`);
    }

    const record: HomeKitCameraStorageRecord = {
      entityId: `camera.${camera.id}`,
      uuid: camera.uuid,
      username: camera.username,
      pincode: camera.pincode,
      setupId: camera.setupId,
      port: camera.port,
      published: false,
      isPaired: camera.isPaired ?? false,
      name: camera.name,
      manufacturer: camera.manufacturer || "Camera.UI",
      model: camera.model || "Network Camera",
      serialNumber: camera.serialNumber || `CUI-${camera.id.toUpperCase()}`,
      strategy: chosenStrategy,
      state: "idle",
      hksvEnabled: isRtspSource,
      hksvCapable: isRtspSource,
      hksvVerified: false,
      hksvState: isRtspSource ? "waiting_hub" : "not_capable",
      // Explicit selections win. Otherwise, Camera.UI linked entities become
      // services of this same HAP camera accessory.
      motionEntityId:
        camera.motionEntityId ||
        camera.realEntities?.find((entity) => entity.type === "motion")?.id,
      lightEntityId:
        camera.lightEntityId ||
        camera.realEntities?.find((entity) => entity.type === "light")?.id,
      sirenEntityId:
        camera.sirenEntityId ||
        camera.realEntities?.find((entity) => entity.type === "siren")?.id,
      realEntities: camera.realEntities,
    };

    const accessory = new HomeKitCameraAccessory(
      platform,
      record.entityId,
      record,
      capabilities,
      source,
    );

    await accessory.publish();
    camera.setupUri = accessory.setupUri;
    camera.isPaired = accessory.isPaired();
    this.activeAccessories.set(camera.id, accessory);

    platform.log?.notice?.(
      `[Camera.UI][${camera.name}] Published to HomeKit HAP on port ${camera.port} (code: ${camera.pincode}, codec: ${chosenCodec}, strategy: ${chosenStrategy})`,
    );

    // Register Matter Occupancy Sensing endpoint automatically for every mounted
    // Camera.UI camera with a valid stream, so Home Assistant / Matter controllers
    // receive motion/OpenCV detections without requiring a manual per-entity toggle.
    const shouldExportMatter = hasSource;
    if (
      shouldExportMatter &&
      platform?.registerDevice &&
      !this.activeMatterEndpoints.has(camera.id)
    ) {
      try {
        const safeName = (camera.name || `Cámara ${camera.id}`)
          .substring(0, 32)
          .trim();
        const uniqueId = `cameraui_${camera.id}_occupancy`;
        const matterEndpoint = new MatterbridgeEndpoint([occupancySensor], {
          id: uniqueId,
          mode: "server",
        });
        matterEndpoint.deviceName = `${safeName.substring(0, 24)} CUI Motion`;
        matterEndpoint.uniqueId = uniqueId;
        matterEndpoint.serialNumber =
          `CUI-${camera.id.toUpperCase()}`.substring(0, 32);
        matterEndpoint.vendorId = 0xfff1;
        matterEndpoint.vendorName = (
          camera.manufacturer || "Camera.UI"
        ).substring(0, 32);
        matterEndpoint.productId = 0x8000;
        matterEndpoint.softwareVersion = 1;
        matterEndpoint.softwareVersionString = "Matterbridge 1.3.7";

        matterEndpoint.createDefaultBasicInformationClusterServer(
          `${safeName.substring(0, 24)} CUI Motion`,
          matterEndpoint.serialNumber,
          0xfff1,
          matterEndpoint.vendorName,
          0x8000,
          "Sensor Detección Camera.UI",
        );
        matterEndpoint.createDefaultOccupancySensingClusterServer(false);
        matterEndpoint.addRequiredClusterServers();

        await platform.registerDevice(matterEndpoint);
        const serverNode = (matterEndpoint as any).serverNode;
        if (serverNode && !serverNode.lifecycle?.isOnline) {
          await serverNode.start();
        }
        this.activeMatterEndpoints.set(camera.id, matterEndpoint);
        platform.log?.notice?.(
          `[Camera.UI][${camera.name}] ✅ Exportado a Matter como Occupancy Sensor (uniqueId: ${uniqueId}) para automatizaciones en Home Assistant.`,
        );
      } catch (err) {
        platform.log?.warn?.(
          `[Camera.UI][${camera.name}] No se pudo registrar endpoint Matter para ocupación: ${err}`,
        );
      }
    }

    // Persist changes
    const store = await CameraUiStorage.load();
    const idx = store.cameras.findIndex((c) => c.id === camera.id);
    if (idx !== -1) {
      store.cameras[idx] = camera;
      await CameraUiStorage.save(store);
    }

    const startLocalMotionFallback = (confirmedByHomeHub = false) => {
      // HKSV fallback is meaningful only for an accessory that Apple Home has
      // actually paired. Do not consume an RTSP reader for a QR waiting to be
      // scanned or for a camera intentionally not exported.
      // A recording-active/configured callback can only come from a Home Hub.
      // Trust it even when the persisted paired flag is stale after an add-on
      // restart; otherwise C402/EZVIZ/Wyze never regain their detector.
      if (!confirmedByHomeHub && !accessory.isPaired() && !camera.isPaired) return;
      if (!camera.rtspUrl || this.activeMotionDetectors.has(camera.id)) return;
      try {
        const cameraIdentity =
          `${camera.name || ""} ${camera.model || ""}`.toLowerCase();
        // The C120, C402 and EZVIZ feeds routinely report only 1–3% changed
        // pixels at the generic 160x90 analysis size.  That made their motion
        // service remain idle while Wyze (whose feed changes more pixels per
        // frame) worked.  Analyse only those feeds at 320x180 and trigger from
        // a sustained 2% luma change.  This is deliberately not a global
        // change: it preserves Wyze's proven detector and avoids clock-overlay
        // false positives on the remaining Camera.UI cameras.
        const isTapoC120 = /(?:\bc120\b|tapo[-_ ]?c120)/i.test(cameraIdentity);
        const isTapoC402 = /(?:\bc402\b|tapo[-_ ]?c402)/i.test(cameraIdentity);
        const isEzviz = /\bezviz\b|\bh6c\b/i.test(cameraIdentity);
        const needsDetailedMotionAnalysis = isTapoC120 || isTapoC402 || isEzviz;
        const detector = new FfmpegMotionDetector({
          cameraId: camera.id,
          cameraName: camera.name || `Cámara ${camera.id}`,
          // Use the same verified primary source advertised to HAP. Camera.UI
          // sub-stream aliases can survive a server restart while their RTSP
          // route no longer exists; that made the detector silently retry and
          // left HomeKit without MotionDetected even though Live View worked.
          rtspUrl: camera.rtspUrl,
          changeThresholdPercent: needsDetailedMotionAnalysis ? 1 : 4,
          cooldownMs: 2500,
          resetMs: 15000,
          ...(needsDetailedMotionAnalysis
            ? {
                analysisWidth: 320,
                analysisHeight: 180,
                pixelDifferenceThreshold: 8,
                fps: 2,
                reportAllFrameChanges: true,
              }
            : {}),
        });
        detector.on("motion", (active: boolean) => {
          CameraUiHomeKitBridge.updateMotion(
            camera.id,
            active,
            platform,
            "FFmpeg Video",
          );
        });
        accessory.delegate?.on("session-start", () => {
          detector.pause(platform?.log);
        });
        accessory.delegate?.on("session-end", () => {
          detector.resume(platform?.log);
        });
        detector.start(platform?.log);
        this.activeMotionDetectors.set(camera.id, detector);
      } catch (detErr) {
        platform?.log?.warn?.(
          `[Camera.UI][${camera.name}] No se pudo iniciar el detector de movimiento FFmpeg local: ${detErr}`,
        );
      }
    };

    // Prefer Camera.UI MQTT events when they arrive, but do not leave HKSV
    // blind when that optional event path is unavailable.  The RTSP fallback
    // starts only after Apple Home has enabled/configured HKSV, never for all
    // cameras during add-on startup.  This restores MotionDetected and clip
    // recording without reintroducing the cold-start RTSP saturation.
    accessory.recordingDelegate?.on("recording-active", (active: boolean) => {
      if (active) startLocalMotionFallback(true);
    });
    accessory.recordingDelegate?.on("recording-configured", () => {
      startLocalMotionFallback(true);
    });

    try {
      accessory.accessory?.on?.("paired", () => {
        platform?.log?.notice?.(
          `[Camera.UI][${camera.name}] Cámara emparejada en Apple Home; iniciando detector de movimiento FFmpeg local`,
        );
        camera.isPaired = true;
        startLocalMotionFallback(true);
      });
    } catch {}

    // Apple Home may not re-send recording-active after an add-on restart. In
    // that case HAP's pairing lookup can also be briefly unavailable even for
    // an already paired accessory. Restore only a *previously marked* paired
    // camera (or one HAP confirms as paired now). The delay prevents a
    // cold-start surge of RTSP readers. C120 is included here: its assumed
    // native event path is absent in this installation, while the detector
    // pauses whenever Live View starts so its working stream is not changed.
    if (
      (wasMarkedPairedBeforePublish || accessory.isPaired() || camera.isPaired) &&
      camera.rtspUrl &&
      isRtspSource
    ) {
      const pairedFallbackTimer = setTimeout(() => {
        if (!this.activeMotionDetectors.has(camera.id)) {
          platform?.log?.notice?.(
            `[Camera.UI][${camera.name}] Recuperando detector de movimiento FFmpeg para cámara ya pareada`,
          );
          startLocalMotionFallback(true);
        }
      }, 8_000);
      // Clean up the timer if the accessory is unpublished before it fires
      try {
        accessory.accessory?.once?.("unpublish", () =>
          clearTimeout(pairedFallbackTimer),
        );
      } catch {
        /* HAP accessory may not support once on 'unpublish' */
      }
    }

    return accessory;
  }

  public static async unmountCamera(
    cameraId: string,
    platform?: any,
  ): Promise<void> {
    const detector = this.activeMotionDetectors.get(cameraId);
    if (detector) {
      detector.stop(platform?.log);
      this.activeMotionDetectors.delete(cameraId);
    }
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory) {
      await accessory.unpublish();
      this.activeAccessories.delete(cameraId);
    }
    const matterEndpoint = this.activeMatterEndpoints.get(cameraId);
    if (matterEndpoint) {
      try {
        if (platform?.unregisterDevice) {
          await platform.unregisterDevice(matterEndpoint);
        }
      } catch {}
      this.activeMatterEndpoints.delete(cameraId);
    }
  }

  public static pauseMotionDetector(cameraId: string, log?: any): void {
    const detector =
      this.activeMotionDetectors.get(cameraId) ||
      this.activeMotionDetectors.get(`cameraui_${cameraId}`) ||
      this.activeMotionDetectors.get(cameraId.replace(/^cameraui_/, ""));
    if (detector) {
      detector.pause(log);
    }
  }

  public static resumeMotionDetector(cameraId: string, log?: any): void {
    const detector =
      this.activeMotionDetectors.get(cameraId) ||
      this.activeMotionDetectors.get(`cameraui_${cameraId}`) ||
      this.activeMotionDetectors.get(cameraId.replace(/^cameraui_/, ""));
    if (detector) {
      detector.resume(log);
    }
  }

  public static updateMotion(
    cameraId: string,
    active: boolean,
    platform?: any,
    triggerSource?: string,
  ): boolean {
    const accessory =
      this.activeAccessories.get(cameraId) ||
      this.activeAccessories.get(`cameraui_${cameraId}`) ||
      this.activeAccessories.get(cameraId.replace(/^cameraui_/, "")) ||
      [...this.activeAccessories.values()].find(
        (a) =>
          a.record?.name?.toLowerCase() === cameraId.toLowerCase() ||
          a.entityId === cameraId ||
          a.entityId === `camera.${cameraId}`,
      );
    const camName = accessory?.record?.name || cameraId;

    if (accessory) {
      accessory.updateMotionState(active);
      platform?.log?.notice?.(
        `[Detección][${camName}] 🎯 ${active ? `MOVIMIENTO CONFIRMADO${triggerSource ? ` [Origen: ${triggerSource}]` : ""}` : "MOVIMIENTO FINALIZADO"} → Disparando HomeKit MotionDetected, HKSV iCloud y Matter Occupancy (active=${active})`,
      );
    }

    const matterEndpoint =
      this.activeMatterEndpoints.get(cameraId) ||
      this.activeMatterEndpoints.get(`cameraui_${cameraId}`) ||
      this.activeMatterEndpoints.get(cameraId.replace(/^cameraui_/, ""));
    if (matterEndpoint) {
      try {
        void safeSetAttribute(
          matterEndpoint,
          OccupancySensing.id,
          "occupancy",
          { occupied: Boolean(active) },
          platform?.log,
        );
      } catch {}
    }

    // Persist active state in memory storage and broadcast to UI via SSE
    void (async () => {
      try {
        const store = await CameraUiStorage.load();
        const cam = store.cameras.find((c) => c.id === cameraId);
        if (cam) {
          cam.motionActive = active;
          cam.motionSource = active ? triggerSource : undefined;
          if (active) cam.lastMotionAt = new Date().toISOString();
          await CameraUiStorage.save(store);
        }
      } catch {}
    })();

    platform?.broadcastSseMessage?.("cameraui_motion", {
      cameraId,
      motionOn: active,
      triggerSource: active ? triggerSource : undefined,
      timestamp: Date.now(),
    });
    platform?.broadcastSseMessage?.("cameraui_updated", {
      cameraId,
      motionActive: active,
      timestamp: Date.now(),
    });

    // Forward to CameraAiDetector so UI "🧠 IA & Fauna" tab lights up in real time
    if (active && platform?.cameraAiDetector) {
      try {
        const detectorOwnsMotion = /\bc402\b|\bc120\b|\bezviz\b|\bh6c\b/i.test(
          `${camName} ${accessory?.record?.model || ""}`,
        );
        platform.cameraAiDetector.dispatchDetection(
          platform,
          cameraId,
          {
            cameraId,
            timestamp: Date.now(),
            targets: detectorOwnsMotion ? [] : ["person", "vehicle", "dog"],
            labels: [
              detectorOwnsMotion
                ? "Movimiento detectado"
                : "Movimiento Detectado (Persona / Vehículo / Animal)",
            ],
            confidence: 0.95,
            rawDetails: `Detector Local FFmpeg: movimiento confirmado en ${camName}`,
          },
          { updateHomeKitMotion: !detectorOwnsMotion },
        );
      } catch {}
    }

    return Boolean(accessory || matterEndpoint);
  }

  public static triggerDoorbell(cameraId: string): boolean {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory?.accessory) {
      try {
        const doorbell = accessory.accessory.getService("Doorbell");
        if (doorbell) {
          doorbell.setCharacteristic("ProgrammableSwitchEvent", 0); // 0 = SINGLE_PRESS
          return true;
        }
      } catch {}
    }
    return false;
  }

  public static async resetPairing(
    platform: any,
    cameraId: string,
  ): Promise<boolean> {
    let accessory = this.activeAccessories.get(cameraId);
    // "Eliminar de exportación" deliberately unmounts the HAP accessory.
    // A subsequent explicit reset is also an explicit request to make that
    // camera available again, so restore its export before creating the QR.
    if (!accessory) {
      const store = await CameraUiStorage.load();
      const camera = store.cameras.find((c) => c.id === cameraId);
      if (!camera || !camera.rtspUrl) return false;
      camera.homeKitEnabled = true;
      await CameraUiStorage.save(store);
      accessory = await this.mountCamera(platform, camera);
    }
    if (accessory) {
      await accessory.resetPairing();
      const store = await CameraUiStorage.load();
      const camera = store.cameras.find((c) => c.id === cameraId);
      if (camera) {
        camera.username = accessory.record.username;
        camera.pincode = accessory.record.pincode;
        camera.setupId = accessory.record.setupId;
        camera.port = accessory.record.port;
        camera.uuid = accessory.record.uuid;
        camera.isPaired = false;
        camera.setupUri = accessory.setupUri;
        await CameraUiStorage.save(store);
      }
      return true;
    }
    return false;
  }

  private static allocateNextPort(platform: any): number {
    const usedPorts = new Set<number>();
    if (platform?.homekitCameraRecords) {
      for (const rec of platform.homekitCameraRecords.values()) {
        if (rec.port) usedPorts.add(rec.port);
      }
    }
    for (const acc of this.activeAccessories.values()) {
      if (acc.record?.port) usedPorts.add(acc.record.port);
    }
    let port = 51860;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }
}

(globalThis as any).__camerauiBridge = CameraUiHomeKitBridge;

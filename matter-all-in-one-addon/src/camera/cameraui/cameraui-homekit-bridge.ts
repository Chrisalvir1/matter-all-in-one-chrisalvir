import crypto from "node:crypto";
import { uuid } from "@homebridge/hap-nodejs";
import { MatterbridgeEndpoint, occupancySensor } from "matterbridge";
import { OccupancySensing } from "matterbridge/matter/clusters";
import { safeSetAttribute } from "../../utils/matter-attributes.js";
import { applyMatterFirmware } from "../../utils/matter-firmware.js";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "../camera-types.js";
import {
  generateFreshHomeKitPin,
  HomeKitCameraAccessory,
} from "../homekit/homekit-camera.accessory.js";
import type { CameraUiCameraRecord } from "./cameraui-types.js";
import { CameraUiStorage } from "./cameraui-storage.js";
import { resolveHaCameraEntityId } from "./ha-camera-entity.js";
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
  camera.videoProfile = probe.videoProfile;
  camera.videoLevel = probe.videoLevel;
  camera.rFrameRate = probe.rFrameRate;
  camera.avgFrameRate = probe.avgFrameRate;
  camera.videoBitrateKbps = probe.bitrateKbps;
  camera.videoPixFmt = probe.pixFmt;
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
  /** Last state prevents duplicate HA/MQTT paths from retriggering HKSV. */
  private static motionStates = new Map<string, boolean>();

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

  /** Resolve the deterministic Camera.UI binary_sensor for this camera ID. */
  private static findNativeMotionEntityId(
    camera: CameraUiCameraRecord,
    platform: any,
  ): string | undefined {
    const normalized = camera.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const bare = normalized.replace(/^cameraui_/, "");
    const candidates = [
      camera.motionEntityId,
      ...(camera.realEntities
        ?.filter((entity) => entity.type === "motion")
        .map((entity) => entity.id) ?? []),
      `binary_sensor.${normalized}_motion`,
      `binary_sensor.cameraui_${bare}_motion`,
    ].filter(
      (id): id is string => Boolean(id) && id !== "none" && id !== "auto",
    );
    return candidates.find((entityId) =>
      this.hasUsableMotionEntity(platform, entityId),
    );
  }

  /** A stale HA entity must not suppress the local RTSP motion fallback. */
  private static hasUsableMotionEntity(platform: any, entityId?: string): boolean {
    if (!entityId || entityId === "none" || entityId === "auto") return false;
    const state = platform?.ha?.hassStates?.get(entityId);
    if (typeof state?.state !== "string") return false;
    return !["unavailable", "unknown", "none"].includes(
      state.state.trim().toLowerCase(),
    );
  }

  public static async mountCamera(
    platform: any,
    camera: CameraUiCameraRecord,
    options: { forceRemount?: boolean } = {},
  ): Promise<HomeKitCameraAccessory | undefined> {
    // Cameras with sourceProvider "home_assistant" obtain their RTSP URL at
    // stream-request time from camera-source-resolver. These cameras do NOT
    // have a static rtspUrl in storage — skip the rtspUrl check for them.
    const isHaSourceCamera = camera.sourceProvider === "home_assistant";
    if (!camera.homeKitEnabled || (!camera.rtspUrl && !isHaSourceCamera)) {
      return undefined;
    }

    const existing = this.activeAccessories.get(camera.id);
    if (existing && (existing.isStreaming || !options.forceRemount)) {
      // A Camera.UI refresh is not a configuration change. Re-publishing an
      // already paired HAP accessory tears down its mDNS/HAP listener and
      // interrupts the next Live View. Keep the live accessory, its pairing,
      // and recording delegate until an explicit edit asks for a remount.
      return existing;
    }
    if (existing) {
      await existing.unpublish();
      this.activeAccessories.delete(camera.id);
    }

    // HA-source cameras (e.g. C402) resolve the stream URL dynamically from
    // Home Assistant at stream-request time, so they never have a static
    // rtspUrl. Treat them as having a valid source so capabilities, HKSV and
    const isC402 = /(?:c402|frente[-_ ]?de[-_ ]?calle)/i.test(
      `${camera.id} ${camera.name || ""}`,
    );
    const isHomeAssistantSource =
      camera.sourceProvider === "home_assistant" || isC402;
    const hasSource = Boolean(camera.rtspUrl) || isHomeAssistantSource;


    // C120 source metadata is measured from RTSP. The existing classic-HAP Live
    // View path can normalize its 2K source to a negotiated 1080p output; do not
    // present source dimensions as the output delivered to Apple Home.
    // This camera currently delivers 15 fps even though its physical maximum is
    // 20 fps. Advertising a hard-coded 30 fps made Apple Home negotiate a rate
    // that the copied stream cannot satisfy, which appeared as choppy Live View.
    const isTapoC120Mount = /(?:\bc120\b|tapo[-_ ]?c120|tapo[-_ ]?spot|\bspot\b)/i.test(
      `${camera.id} ${camera.name || ""}`,
    );
    if (isTapoC120Mount) {
      camera.width = 1920;
      camera.height = 1080;
      camera.fps = 15;
      camera.videoCodec = "h264";
      camera.strategy = "passthrough_h264";
      camera.hasAudio = camera.hasAudio !== false; // preserve explicit false
      camera.audioCodec = "pcm_alaw";
      camera.audioSampleRate = 8000;
      camera.audioChannels = 1;

      if (camera.rtspUrl) {
        try {
          const probe = await probeCameraSource(camera.rtspUrl, {
            timeoutMs: 6000,
            transport: "tcp",
          });
          if (applyCameraSourceProbe(camera, probe, camera.rtspUrl)) {
            platform.log?.notice?.(
              `[Camera.UI][${camera.name}] C120 RTSP medido antes de publicar: ${camera.width}x${camera.height}@${camera.fps}fps`,
            );
          } else {
            platform.log?.notice?.(
              `[Camera.UI][${camera.name}] C120 RTSP no reportó FPS; usando 1920x1080@15fps como valor seguro`,
            );
          }
        } catch {
          platform.log?.notice?.(
            `[Camera.UI][${camera.name}] C120 RTSP no se pudo medir; usando 1920x1080@15fps como valor seguro`,
          );
        }
      }
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
          platform.log?.warn?.(
            `[Camera.UI][${camera.name}] Stream HA directo: sonda previa no concluyente (${safeError}), publicando con parámetros seguros para mantener disponibilidad.`,
          );
        }
      } catch (error) {
        platform.log?.warn?.(
          `[Camera.UI][${camera.name}] Advertencia en sonda previa del stream HA (${String(error)}), publicando con parámetros seguros para mantener disponibilidad.`,
        );
      }
    }
    // Todo stream RTSP/RTSPS de Camera.UI (H.264 o H.265/HEVC) es válido para HKSV:
    // el recordingDelegate transcodifica a H.264 vía FFmpeg cuando el origen es H.265,
    // por lo que el códec de origen nunca debe bloquear la capacidad HKSV.
    // HA-source cameras provide an RTSP stream via camera-source-resolver at
    // stream-request time, so they are RTSP-capable even without a static URL.
    const isRtspSource =
      isHomeAssistantSource ||
      Boolean(camera.rtspUrl && /^rtsps?:\/\//i.test(camera.rtspUrl));

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
        (camera.hasAudio !== false
          ? "aac"
          : "none")) as CameraCapabilitiesInfo["audioCodec"],
      audioSampleRate: camera.audioSampleRate,
      audioChannels: camera.audioChannels,
      resolution: {
        width: camera.width || 1920,
        height: camera.height || 1080,
      },
      maxFps: camera.fps || 30,
      measuredVideo:
        camera.videoCodecSource === "ffprobe"
          ? {
              codec: camera.videoCodec,
              profile: camera.videoProfile,
              level: camera.videoLevel,
              width: camera.width,
              height: camera.height,
              rFrameRate: camera.rFrameRate,
              avgFrameRate: camera.avgFrameRate,
              fps: camera.fps,
              bitrateKbps: camera.videoBitrateKbps,
              pixFmt: camera.videoPixFmt,
            }
          : undefined,
      strategy: chosenStrategy,
      requiresTranscoding: isHaProxy,
      snapshotSupported: Boolean(camera.snapshotUrl),
      snapshotUrl: camera.snapshotUrl,
      hksvCapable: isRtspSource || isHomeAssistantSource || isC402,
    };

    let resolvedSourceUrl = camera.rtspUrl;
    let resolvedSourceType: ResolvedStreamSource["sourceType"] = "rtsp";
    const haEntityId = isHomeAssistantSource
      ? resolveHaCameraEntityId(camera, platform.ha?.hassStates)
      : undefined;

    if (isHomeAssistantSource && !resolvedSourceUrl) {
      // Only a HA camera entity can provide a camera stream. Motion
      // binary_sensors are linked entities and must never be sent to the
      // camera proxy (that endpoint returns 404 for them).
      try {
        if (haEntityId && !resolvedSourceUrl && platform.ha?.requestCameraStream) {
          resolvedSourceUrl = await platform.ha.requestCameraStream(haEntityId);
          if (resolvedSourceUrl) {
            resolvedSourceType = "hls";
          }
        }
      } catch (err) {
        platform.log?.debug?.(
          `[CameraUiHomeKitBridge] requestCameraStream note for ${haEntityId}: ${err}`,
        );
      }
      if (haEntityId && !resolvedSourceUrl && platform.ha?.getCameraProxyStreamUrl) {
        resolvedSourceUrl = platform.ha.getCameraProxyStreamUrl(haEntityId);
        if (resolvedSourceUrl) {
          resolvedSourceType = "ha_proxy";
        }
      }
      platform.log?.notice?.(
        `[CameraUiHomeKitBridge] Resolved HA stream source for ${camera.id} (${haEntityId || "no valid HA camera entity"}): ${resolvedSourceType} -> ${resolvedSourceUrl ? "OK" : "NONE"}`,
      );
    }

    const source: ResolvedStreamSource = {
      sourceType: resolvedSourceType,
      url: resolvedSourceUrl,
      snapshotUrl: camera.snapshotUrl,
      supportsPassthrough: true,
      requiresBridge: true,
      metadata: {
        isCameraUi: true,
        hasCameraMotion: true,
        capabilitiesProbedBeforePublish: isHomeAssistantSource,
        streamProvider: camera.sourceProvider || "camera_ui",
        camerauiCameraId: camera.id,
        sourceCameraEntityId: haEntityId,
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

    // Link the native Camera.UI sensor before HAP services are created. This
    // leaves C120 HKSV event-driven and avoids a competing RTSP reader.
    const nativeMotionEntityId = this.findNativeMotionEntityId(camera, platform);

    const record: HomeKitCameraStorageRecord = {
      // Camera.UI IDs are UUIDs, and their hyphens make an invalid HA entity_id.
      // Keep the original ID separately for Camera.UI storage and HAP lookups.
      entityId: `camera.${camera.id.replace(/[^a-z0-9_]/gi, "_").toLowerCase()}`,
      cameraUiCameraId: camera.id,
      sourceCameraEntityId: haEntityId,
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
      hksvEnabled: isRtspSource || isHomeAssistantSource || isC402,
      hksvCapable: isRtspSource || isHomeAssistantSource || isC402,
      hksvVerified: false,
      hksvState:
        isRtspSource || isHomeAssistantSource || isC402
          ? "waiting_hub"
          : "not_capable",
      // Explicit selections win. Otherwise, Camera.UI linked entities become
      // services of this same HAP camera accessory.
      motionEntityId:
        camera.motionEntityId ||
        camera.realEntities?.find((entity) => entity.type === "motion")?.id ||
        nativeMotionEntityId,
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
    this.motionStates.set(camera.id, false);

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
        const existingEndpoint = this.activeMatterEndpoints.get(camera.id);
        if (existingEndpoint) {
          const oldServer = (existingEndpoint as any).serverNode;
          if (oldServer?.lifecycle?.isOnline) {
            await Promise.race([
              oldServer.close(),
              new Promise((r) => setTimeout(r, 2000)),
            ]).catch(() => {});
          }
          await platform.unregisterDevice(existingEndpoint).catch(() => {});
          this.activeMatterEndpoints.delete(camera.id);
        }

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
        applyMatterFirmware(matterEndpoint, platform);

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
          await Promise.race([
            serverNode.start(),
            new Promise((r) => setTimeout(r, 5000)),
          ]);
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

    platform?.log?.debug?.(
      `[Camera.UI][${camera.name}] HAP uses Camera.UI/HA motion events; no local FFmpeg motion analysis or recording is started for this relay.`,
    );

    return accessory;
  }

  public static async unmountCamera(
    cameraId: string,
    platform?: any,
  ): Promise<void> {
    const accessory = this.activeAccessories.get(cameraId);
    if (accessory) {
      await accessory.unpublish();
      this.activeAccessories.delete(cameraId);
    }
    this.motionStates.delete(cameraId);
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
      const stateKey = accessory.record.cameraUiCameraId || cameraId;
      if (this.motionStates.get(stateKey) === active) return true;
      this.motionStates.set(stateKey, active);
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

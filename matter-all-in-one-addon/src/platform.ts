/**
 * Core platform class for matter-all-in-one-chrisalvir.
 */
import "./utils/log-buffer.js";
import { getLogs, clearLogs } from "./utils/log-buffer.js";
import {
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  PlatformConfig,
  PlatformMatterbridge,
} from "matterbridge";
import { AnsiLogger, CYAN, idn, nf, rs } from "matterbridge/logger";
import http from "http";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { spawn } from "child_process";

const FALLBACK_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYwLjMuMTAwAP/bAEMACAYGBwYHCAgICAgICQkJCgoKCQkJCQoKCgoKCgwMDAoKCgoKCgoMDAwMDQ4NDQ0MDQ4ODw8PEhIRERUVFRkZH//EAEwAAQEAAAAAAAAAAAAAAAAAAAAHAQEBAAAAAAAAAAAAAAAAAAAAARABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAIAwEAAhEDEQA/AI2AoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=",
  "base64",
);
import { HomeAssistant } from "./homeAssistant.js";
import { HassState, isUnavailable } from "./utils/ha-state.js";
import { discoverHassUrl, probeHassUrl, toWsUrl } from "./utils/ha-discovery.js";
import {
  getDeviceTypeForEntity,
  MatterDeviceTypes,
} from "./device-registry.js";
import { BaseEntity } from "./entities/base.entity.js";
import { ClosureEntity } from "./entities/closure.entity.js";
import { LockEntity } from "./entities/lock.entity.js";
import crypto from "crypto";
import { uuid, HAPStorage } from "@homebridge/hap-nodejs";
import type { HomeKitCameraStorageRecord } from "./camera/camera-types.js";
import {
  resolveFfmpegPath,
  getFfmpegVersion,
} from "./camera/homekit/ffmpeg-helper.js";
import { CameraEntity } from "./entities/camera.entity.js";
import { SoilSensorEntity } from "./entities/soil_sensor.entity.js";
import { EnergyTariffEntity } from "./entities/energy_tariff.entity.js";
import { VacuumEntity } from "./entities/vacuum.entity.js";
import { PetFeederEntity } from "./entities/pet_feeder.entity.js";
import { HumidifierEntity } from "./entities/humidifier.entity.js";
import { OvenEntity } from "./entities/oven.entity.js";
import { CooktopEntity } from "./entities/cooktop.entity.js";
import { MediaPlayerEntity } from "./entities/media-player.entity.js";
import {
  CompositeDeviceEntity,
  CompositeMember,
} from "./entities/composite-device.entity.js";
import {
  getDefaultExportProfileId,
  getExportProfile,
  getExportProfiles,
} from "./device-profiles.js";
import { MqttClientManager } from "./mqtt/mqtt-client.js";
import { MqttEntity } from "./mqtt/mqtt.entity.js";
import { ScryptedStorage } from "./camera/scrypted/scrypted-storage.js";
import { ScryptedCrypto } from "./camera/scrypted/scrypted-crypto.js";
import { ScryptedClient } from "./camera/scrypted/scrypted-client.js";
import { ScryptedReconnectManager } from "./camera/scrypted/scrypted-reconnect-manager.js";
import { ScryptedHomeKitBridge } from "./camera/scrypted/scrypted-homekit-bridge.js";
import { ScryptedMatterBridge } from "./camera/scrypted/scrypted-matter-bridge.js";
import { ScryptedStreamValidator } from "./camera/scrypted/scrypted-stream-validator.js";
import { CameraUiStorage } from "./camera/cameraui/cameraui-storage.js";
import { CameraUiClient } from "./camera/cameraui/cameraui-client.js";
import { CameraUiHomeKitBridge } from "./camera/cameraui/cameraui-homekit-bridge.js";
import type { CameraRealEntity } from "./camera/cameraui/cameraui-types.js";
import { sanitizeUrlCredentials } from "./camera/homekit/ffmpeg-helper.js";
import { CameraAiDetector } from "./camera/ai/camera-ai-detector.js";

export interface HomeAssistantPlatformConfig extends PlatformConfig {
  host?: string; // Optional: auto-detected from network/supervisor if not set
  token?: string; // Optional: not required when running as HA add-on (SUPERVISOR_TOKEN) or with trust-local mode
  includeEntities?: string[];
  excludeEntities?: string[];
  /** Group related HA entities into a physical Matter device. Set false for legacy entity mode. */
  groupByDeviceId?: boolean;
  /** Home Assistant add-on options use snake_case. */
  group_by_device_id?: boolean;
  devices?: CompositeDeviceConfig[];
}

export interface CompositeDeviceConfig {
  device_id: string;
  name?: string;
  group_by_device_id?: boolean;
  primary_entity?: string;
  include_entities?: string[];
  exclude_entities?: string[];
  endpoint_order?: string[];
  friendly_name?: string;
  room?: string;
}

interface EntityDiagnostic {
  timestamp: string;
  level: "error" | "warning" | "info";
  message: string;
}

interface MatterFabricInfo {
  label: string | null;
  controller: string;
  vendorId: number | null;
  fabricId: string | null;
  fabricIndex: string | null;
}

interface MatterConnectionInfo {
  commissioned: boolean;
  controllerNames: string[];
  homeName: string | null;
  fabricCount: number;
  fabrics: MatterFabricInfo[];
  pairingCode: string | null;
  manualPairingCode: string | null;
}

// Matter FabricDescriptor carries the controller's Vendor ID.  These values
// cover the major ecosystems and are intentionally shown as “reported by the
// fabric”, not as a claim inferred from a user-editable home label.
const MATTER_CONTROLLER_VENDORS: Record<number, string> = {
  // Apple Home
  0x1349: "Apple Home",
  0x1384: "Apple Home",
  0x134b: "Apple Home",
  // Google Home
  0x6006: "Google Home",
  0x138b: "Google Home",
  // Amazon Alexa
  0x1217: "Amazon Alexa",
  0x1211: "Amazon Alexa",
  0x140a: "Amazon Alexa",
  // Samsung SmartThings
  0x10e1: "Samsung SmartThings",
  0x110a: "Samsung SmartThings",
  0x127b: "Samsung SmartThings",
  0x1175: "Samsung SmartThings",
  0x1360: "Samsung SmartThings",
  // Home Assistant
  0x130d: "Home Assistant",
  // LG ThinQ
  0x1156: "LG ThinQ",
  // Homey
  0x1325: "Homey",
  // Tuya Smart
  0x1002: "Tuya Smart",
  0x1244: "Tuya Smart",
  // Aqara
  0x115f: "Aqara",
};

export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  public ha!: HomeAssistant;
  public entities = new Map<string, BaseEntity>();
  public matterbridgeDevices = new Map<string, MatterbridgeEndpoint>();
  /** One composite endpoint tree per HA device_id. */
  public compositeDevices = new Map<string, CompositeDeviceEntity>();
  private readonly compositeMembership = new Map<string, string>();
  public deviceOverrides: Record<string, string> = {};
  public deviceGroupingConfigs: CompositeDeviceConfig[] = [];
  public mqttManager?: MqttClientManager;
  public mqttEntities = new Map<string, MqttEntity>();
  private uiServer?: http.Server;
  /** Port the UI HTTP server will bind to. Override in tests with 0 to get an OS-assigned port. */
  protected _uiPort = 8285;

  /** Returns the actual TCP port the UI server is listening on (0 until the server starts). */
  public get uiServerPort(): number {
    const addr = this.uiServer?.address();
    return addr && typeof addr === "object" ? addr.port : 0;
  }
  private packageVersion?: string;
  /** Raw host from config (may be undefined — triggers network auto-discovery) */
  private _configHost?: string;
  /** Resolved token (may be empty string for trust-local / supervisor mode) */
  private _configToken: string = "";

  /** Set of entity IDs that the user has explicitly requested to export as accessories */
  public exportedDevices: Set<string> = new Set();
  /**
   * HA can emit several state_changed events for the same entity in a single
   * tick.  Coalescing those events keeps Matter attribute transactions from
   * piling up behind slow controller subscriptions.
   */
  private readonly pendingStateUpdates = new Map<string, HassState>();
  /** Recent, entity-scoped failures shown in the UI for troubleshooting. */
  private readonly entityDiagnostics = new Map<string, EntityDiagnostic[]>();
  private readonly entityProblems = new Set<string>();
  /** Last HA availability state, so logs describe transitions rather than spam events. */
  private readonly haAvailabilityStates = new Map<string, string>();
  /** Last observed live Matter fabric state, used to log real pairing changes. */
  private readonly matterConnectionStates = new Map<
    string,
    MatterConnectionInfo
  >();
  private diagnosticSaveTimer?: NodeJS.Timeout;
  private matterConnectionMonitor?: NodeJS.Timeout;
  /** Serialize destructive/transport operations for the same Matter node. */
  private readonly matterAccessoryOperations = new Map<
    string,
    Promise<unknown>
  >();
  private stateUpdateFlushScheduled = false;
  private stateUpdateFlushInFlight?: Promise<void>;
  private syncInFlight?: Promise<void>;
  /** A connection event received during discovery requires a fresh snapshot. */
  private syncRequested = false;
  private syncRetryTimeout?: NodeJS.Timeout;
  private syncRetryAttempt = 0;
  /** SSE subscribers for real-time UI push events. */
  private readonly sseSubscribers = new Set<http.ServerResponse>();

  /** Persistent HomeKit Camera records for standalone Apple Home accessories. */
  public readonly homekitCameraRecords = new Map<
    string,
    HomeKitCameraStorageRecord
  >();

  public async saveHomeKitCameraRecords(): Promise<void> {
    try {
      const list = Array.from(this.homekitCameraRecords.values());
      await fs.writeFile(
        "/data/homekit-cameras.json",
        JSON.stringify(list, null, 2),
        "utf8",
      );
    } catch (err) {
      this.log.debug(`Failed to save homekit-cameras.json: ${err}`);
    }
  }

  public async loadHomeKitCameraRecords(): Promise<void> {
    try {
      const raw = await fs.readFile("/data/homekit-cameras.json", "utf8");
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const rec of list) {
          if (rec && rec.entityId) {
            this.homekitCameraRecords.set(rec.entityId, rec);
          }
        }
      }
      this.log.info(
        `Loaded ${this.homekitCameraRecords.size} HomeKit camera configurations.`,
      );
    } catch {
      this.log.debug("No homekit-cameras.json found, starting fresh.");
    }
  }

  public cameraAiDetector!: CameraAiDetector;

  private scryptedInitialized = false;

  public async initScrypted(): Promise<void> {
    if (this.scryptedInitialized) return;
    this.scryptedInitialized = true;

    try {
      const store = await ScryptedStorage.load();
      this.log.info(
        `[Scrypted] Fast Boot: ${store.cameras.cameras.length} cached cameras found. Initializing endpoints...`,
      );

      for (const camera of store.cameras.cameras) {
        if (camera.exportConfig.homeKitEnabled) {
          try {
            await ScryptedHomeKitBridge.mountCamera(this, camera);
          } catch (err) {
            this.log.warn(
              `[Scrypted] Failed to mount HomeKit for ${camera.cameraId}: ${err}`,
            );
          }
        }
        if (camera.exportConfig.matterEnabled) {
          try {
            await ScryptedMatterBridge.mountCamera(this, camera);
          } catch (err) {
            this.log.warn(
              `[Scrypted] Failed to mount Matter for ${camera.cameraId}: ${err}`,
            );
          }
        }
      }

      const manager = ScryptedReconnectManager.getInstance();
      manager.removeAllListeners("status_change");
      manager.removeAllListeners("cameras_updated");
      manager.removeAllListeners("camera_motion");
      manager.removeAllListeners("camera_doorbell");

      manager.on(
        "camera_motion",
        ({ deviceId, motionOn }: { deviceId: string; motionOn: boolean }) => {
          const accessory = ScryptedHomeKitBridge.getAccessory(deviceId);
          if (accessory) {
            accessory.updateMotionState(motionOn);
          }
          // Motion is not mapped to occupancy (0x0406). Update Matter sensor safely only if tracked.
          ScryptedMatterBridge.updateSensorState(
            deviceId,
            "motion",
            motionOn,
            this.log,
          );
          this.broadcastSseMessage("camera_motion", { deviceId, motionOn });
        },
      );

      manager.on("camera_doorbell", ({ deviceId }: { deviceId: string }) => {
        const accessory = ScryptedHomeKitBridge.getAccessory(deviceId);
        if (accessory) {
          accessory.updateMotionState(true);
        }
        ScryptedMatterBridge.updateSensorState(
          deviceId,
          "doorbell",
          true,
          this.log,
        );
        this.broadcastSseMessage("camera_doorbell", { deviceId });
      });

      manager.on("status_change", (payload) => {
        this.broadcastSseMessage("scrypted_status", payload);
      });
      manager.on("cameras_updated", async (cameras) => {
        for (const cam of cameras) {
          if (cam.exportConfig.homeKitEnabled) {
            await ScryptedHomeKitBridge.mountCamera(this, cam);
          }
          if (cam.exportConfig.matterEnabled) {
            // Skip re-mounting Matter endpoints that are already successfully registered.
            // Re-registering causes "already registered" errors and leaves endpoints inactive.
            const existingEndpoint = ScryptedMatterBridge.getEndpoint(
              cam.cameraId,
            );
            const existingId = existingEndpoint
              ? (existingEndpoint as any).id
              : undefined;
            if (
              !existingEndpoint ||
              existingId === undefined ||
              existingId === null
            ) {
              await ScryptedMatterBridge.mountCamera(this, cam);
            }
          }
        }
        this.broadcastSseMessage("cameras_updated", cameras);
      });

      await manager.initialize();
    } catch (err) {
      this.log.warn(`[Scrypted] Failed to initialize Scrypted engine: ${err}`);
    }
  }

  private cameraUiInitialized = false;

  public async ensureGo2rtcStreamsRegistered(): Promise<void> {
    // This bridge must not seed go2rtc with guessed or historical camera URLs.
    // Camera.UI is the sole source of truth for camera streams; its live camera
    // records are loaded below and passed through unchanged (including H.264/H.265).
    this.log.info("[Camera.UI] Skipping legacy go2rtc stream registration; using live Camera.UI sources.");
  }

  public async initCameraUi(): Promise<void> {
    if (this.cameraUiInitialized) return;
    this.cameraUiInitialized = true;

    try {
      void this.ensureGo2rtcStreamsRegistered();
      let store = await CameraUiStorage.load();
      if (!store.config.enabled && store.cameras.length === 0) {
        this.log.debug("[Camera.UI] Integration is disabled in storage.");
        return;
      }
      if (!store.config.enabled && store.cameras.length > 0) {
        store.config.enabled = true;
        await CameraUiStorage.save(store);
      }
      // Pairing identity is local, but the stream source must be read from
      // Camera.UI before HAP is mounted. This prevents a cached old route
      // from winning at boot.
      try {
        const client = new CameraUiClient(store.config);
        const discovered = await client.fetchCameras();
        if (discovered.length > 0) {
          store = await CameraUiStorage.mergeDiscoveredCameras(discovered);
          this.log.info(`[Camera.UI] Live source refresh: ${discovered.length} camera(s) received from Camera.UI.`);
        } else {
          this.log.warn("[Camera.UI] Live source refresh returned no cameras; paired identities were kept and no legacy RTSP route will be mounted.");
        }
      } catch (err) {
        this.log.warn(`[Camera.UI] Live source refresh failed: ${err}`);
      }
      this.log.info(
        `[Camera.UI] Fast Boot: ${store.cameras.length} camera records found. Initializing endpoints...`,
      );

      for (const camera of store.cameras) {
        if (camera.homeKitEnabled) {
          try {
            await CameraUiHomeKitBridge.mountCamera(this, camera);
          } catch (err) {
            this.log.warn(
              `[Camera.UI] Failed to mount HomeKit for ${camera.id}: ${err}`,
            );
          }
        }
      }
    } catch (err) {
      this.log.warn(`[Camera.UI] Failed to initialize Camera.UI engine: ${err}`);
    }
  }

  public getCameraAliases(cameraName: string, cameraId: string): string[] {
    const raw = `${cameraName || ""} ${cameraId || ""}`.toLowerCase();
    const aliases: string[] = [];

    // TAPO C402 / Frente de calle
    if (raw.includes("c402") || (raw.includes("tapo") && !raw.includes("c120") && !raw.includes("spot"))) {
      aliases.push("tapo_frente_de_calle", "frente_de_calle", "frente calle", "frentedecalle");
    }

    // Tapo C120 / Tapo Spot
    if (raw.includes("c120") || raw.includes("spot")) {
      aliases.push("tapo_spot", "spot");
    }

    // EZVIZ Patio Trasero / CS-H6c
    if (raw.includes("ezviz") || raw.includes("cs_h6c") || raw.includes("h6c")) {
      aliases.push("cs_h6c_r105_1l2wf", "cs_h6c", "ezviz");
    }

    // RING Bodega / Petcam
    if (raw.includes("bodega") || raw.includes("petcam")) {
      aliases.push("petcam_ring", "petcam");
    }

    // VIMTAG Recamara
    if (raw.includes("recamara")) {
      aliases.push("vimtag_recamara", "recamara");
    }

    // VIMTAG Area de cafe
    if (raw.includes("cafe")) {
      aliases.push("vimtag_area_de_cafe", "area_de_cafe");
    }

    // VIMTAG Gym / Ring Gym
    if (raw.includes("gym")) {
      aliases.push("ring_gym", "gym");
    }

    return aliases;
  }

  public matchCameraIdentifier(
    cam: { id?: string; name?: string },
    identifier: string,
  ): boolean {
    if (!identifier) return false;
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanId = clean(identifier);
    const cleanCamId = clean((cam.id || "").replace(/^cameraui_/, ""));
    const cleanCamName = clean(cam.name || "");
    if (cleanId === cleanCamId || cleanId === cleanCamName) return true;
    if (cleanId.length >= 4 && (cleanCamName.includes(cleanId) || cleanId.includes(cleanCamName))) return true;
    if (cleanCamId.length >= 4 && (cleanId.includes(cleanCamId) || cleanCamId.includes(cleanId))) return true;

    const aliases = this.getCameraAliases(cam.name || "", cam.id || "");
    for (const alias of aliases) {
      const cleanAlias = clean(alias);
      if (
        cleanId === cleanAlias ||
        (cleanAlias.length >= 3 && cleanId.includes(cleanAlias)) ||
        (cleanId.length >= 3 && cleanAlias.includes(cleanId))
      ) {
        return true;
      }
    }
    return false;
  }

  public findLinkedCameraEntities(
    cameraName: string,
    cameraId: string,
  ): CameraRealEntity[] {
    const entities: CameraRealEntity[] = [];
    const states = this.ha?.hassStates;
    const registry = this.ha?.hassEntities;
    if (!states) return entities;

    const cleanId = (cameraId || "")
      .replace(/^camera\.cameraui_/, "")
      .replace(/^camera\./, "")
      .replace(/^cameraui_/, "");

    // Check for explicit entity overrides from CameraUiStorage
    const cuiStore = CameraUiStorage.getCachedStore();
    const cuiCam = cuiStore?.cameras?.find(
      (c) => c.id === cameraId || c.id === cleanId || `cameraui_${cleanId}` === c.id,
    );
    const explicitLightId = cuiCam?.lightEntityId;
    const explicitSirenId = cuiCam?.sirenEntityId;
    const explicitMotionId = cuiCam?.motionEntityId;

    const buildEntityObj = (
      entId: string,
      type: "motion" | "light" | "siren" | "doorbell",
    ): CameraRealEntity | null => {
      const s = states.get(entId);
      if (!s) return null;
      const d = entId.split(".")[0] as any;
      const reg = this.entities?.get(entId);
      return {
        id: entId,
        domain: d,
        type,
        name: s.attributes?.friendly_name || entId,
        state: s.state === "on",
        matterExported: this.exportedDevices?.has(entId) ?? false,
        matterPairingCode: (reg as any)?.pairingCode,
        matterManualCode: (reg as any)?.manualPairingCode,
        topic: (reg as any)?.topic,
      };
    };

    if (explicitLightId && explicitLightId !== "auto") {
      if (explicitLightId !== "none") {
        const ent = buildEntityObj(explicitLightId, "light");
        if (ent) entities.push(ent);
      }
    }
    if (explicitSirenId && explicitSirenId !== "auto") {
      if (explicitSirenId !== "none") {
        const ent = buildEntityObj(explicitSirenId, "siren");
        if (ent) entities.push(ent);
      }
    }
    if (explicitMotionId && explicitMotionId !== "auto") {
      if (explicitMotionId !== "none") {
        const ent = buildEntityObj(explicitMotionId, "motion");
        if (ent) entities.push(ent);
      }
    }

    const haCamEntry = registry?.get(cameraId) || registry?.get(`camera.${cleanId}`);
    const camDeviceId = haCamEntry?.device_id;

    const baseRaw = (cameraName || cameraId)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    const words = baseRaw.split("_").filter((w) => w.length >= 3);
    const aliases = this.getCameraAliases(cameraName, cameraId);
    const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanAliases = aliases.map(clean);

    for (const [entityId, state] of states.entries()) {
      const fn = (state?.attributes?.friendly_name || "").toLowerCase();
      const idLower = entityId.toLowerCase();
      const cleanIdStr = clean(entityId);
      const cleanFn = clean(fn);
      const entry = registry?.get(entityId);

      // Strict exclusion of ambient room fixtures (ceiling fan, hanging lamps, wall strips, room ceiling lights)
      const isRoomFixture =
        /ventilador|fan|techo|ceiling|plafon|plafón|arbotante|aplique|lampara|lámpara|tira|strip|hexágono|hexagon|neon|neón|tv|pantalla|mesa|escritorio|buró|buro|noche|velador|veladora|piso|floor|doble_spot|chandelier|segment/i.test(
          `${entityId} ${fn}`,
        );
      if (isRoomFixture && (!camDeviceId || entry?.device_id !== camDeviceId)) {
        continue;
      }

      const isSameDevice = Boolean(camDeviceId && entry?.device_id === camDeviceId);

      // CRITICAL: If the camera is a registered HA device (has camDeviceId), ONLY accept
      // entities physically belonging to that exact same hardware (entry.device_id === camDeviceId).
      // Never link room fixtures or ambient household bulbs to the camera!
      if (camDeviceId) {
        if (!isSameDevice) continue;
      } else {
        const aliasMatch = cleanAliases.some(
          (ca) => ca.length >= 3 && (cleanIdStr.includes(ca) || cleanFn.includes(ca)),
        );

        const matches =
          idLower.includes(baseRaw) ||
          fn.includes(baseRaw) ||
          aliasMatch ||
          (words.length > 0 &&
            words.every((w) => idLower.includes(w) || fn.includes(w)));

        if (!matches) continue;
      }

      const domain = entityId.split(".")[0];
      const deviceClass = state?.attributes?.device_class;
      const isStateOn = state?.state === "on";

      const registeredEntity = this.entities?.get(entityId);
      const isExported = this.exportedDevices?.has(entityId) ?? false;
      const matterCode = (registeredEntity as any)?.pairingCode || undefined;
      const manualCode =
        (registeredEntity as any)?.manualPairingCode || undefined;
      const isMqtt =
        entityId.startsWith("mqtt.") ||
        (registeredEntity as any)?.origin === "mqtt" ||
        (state?.attributes as any)?.origin === "mqtt";
      const topic =
        (registeredEntity as any)?.topic ||
        (state?.attributes as any)?.command_topic ||
        (state?.attributes as any)?.state_topic ||
        (isMqtt ? `homeassistant/${domain}/${entityId.split(".")[1]}` : undefined);

      if (
        !explicitMotionId &&
        domain === "binary_sensor" &&
        (["motion", "occupancy", "presence"].includes(deviceClass || "") ||
          idLower.includes("motion") ||
          idLower.includes("movimiento") ||
          idLower.includes("vehicle") ||
          idLower.includes("vehiculo") ||
          idLower.includes("car") ||
          idLower.includes("auto") ||
          idLower.includes("person") ||
          idLower.includes("persona") ||
          idLower.includes("animal") ||
          idLower.includes("pet") ||
          idLower.includes("detection") ||
          idLower.includes("deteccion"))
      ) {
        if (!entities.some((e) => e.type === "motion")) {
          entities.push({
            id: entityId,
            domain: "binary_sensor",
            type: "motion",
            name: state?.attributes?.friendly_name || "Sensor de Movimiento",
            state: isStateOn,
            matterExported: isExported,
            matterPairingCode: matterCode,
            matterManualCode: manualCode,
            topic,
          });
        }
      } else if (
        !explicitLightId &&
        (domain === "light" || domain === "switch") &&
        (isSameDevice ||
          /spotlight|floodlight|reflector|flash|status_light|indicador|luz_estado|foco_camara|luz_camara/i.test(
            `${entityId} ${fn}`,
          ))
      ) {
        if (!entities.some((e) => e.type === "light")) {
          entities.push({
            id: entityId,
            domain: domain as any,
            type: "light",
            name: state?.attributes?.friendly_name || "Foco / Reflector",
            state: isStateOn,
            matterExported: isExported,
            matterPairingCode: matterCode,
            matterManualCode: manualCode,
            topic,
          });
        }
      } else if (
        !explicitSirenId &&
        (domain === "siren" ||
          (domain === "switch" &&
            (idLower.includes("siren") ||
              idLower.includes("alarm") ||
              idLower.includes("alarma") ||
              fn.includes("sirena") ||
              fn.includes("alarma"))))
      ) {
        if (!entities.some((e) => e.type === "siren")) {
          entities.push({
            id: entityId,
            domain: domain as any,
            type: "siren",
            name: state?.attributes?.friendly_name || "Sirena de Alarma",
            state: isStateOn,
            matterExported: isExported,
            matterPairingCode: matterCode,
            matterManualCode: manualCode,
            topic,
          });
        }
      } else if (
        (domain === "binary_sensor" || domain === "event") &&
        (deviceClass === "doorbell" ||
          idLower.includes("doorbell") ||
          idLower.includes("timbre"))
      ) {
        if (!entities.some((e) => e.type === "doorbell")) {
          entities.push({
            id: entityId,
            domain: domain as any,
            type: "doorbell",
            name: state?.attributes?.friendly_name || "Timbre",
            state: isStateOn,
            matterExported: isExported,
            matterPairingCode: matterCode,
            matterManualCode: manualCode,
            topic,
          });
        }
      }
    }
    return entities;
  }

  public getOrCreateHomeKitCameraRecord(
    entityId: string,
  ): HomeKitCameraStorageRecord {
    let record = this.homekitCameraRecords.get(entityId);
    if (!record) {
      const rawName =
        this.entities.get(entityId)?.state?.attributes?.friendly_name ||
        entityId;
      const info = this.getHaRegistryInfo(entityId);

      const usedPorts = new Set(
        Array.from(this.homekitCameraRecords.values()).map((r) => r.port),
      );
      let nextPort = 51830;
      while (usedPorts.has(nextPort)) nextPort++;

      const hash = crypto.createHash("sha256").update(entityId).digest("hex");
      const username =
        `0E:${hash.substring(0, 2)}:${hash.substring(2, 4)}:${hash.substring(4, 6)}:${hash.substring(6, 8)}:${hash.substring(8, 10)}`.toUpperCase();

      const pinPart1 = (
        (Math.abs(parseInt(hash.substring(10, 13), 16)) % 900) +
        100
      ).toString();
      const pinPart2 = (
        (Math.abs(parseInt(hash.substring(13, 15), 16)) % 90) +
        10
      ).toString();
      const pinPart3 = (
        (Math.abs(parseInt(hash.substring(15, 18), 16)) % 900) +
        100
      ).toString();
      const pincode = `${pinPart1}-${pinPart2}-${pinPart3}`;
      const setupId = hash.substring(18, 22).toUpperCase();

      record = {
        entityId,
        uuid: uuid.generate(`homekit:camera:${entityId}`),
        username,
        pincode,
        setupId,
        port: nextPort,
        published: false,
        strategy: "passthrough_h264",
        state: "idle",
        name: rawName,
        manufacturer: info.manufacturer || "Home Assistant",
        model: info.model || "Camera",
        serialNumber: entityId.replaceAll(".", "_"),
        lastUpdated: new Date().toISOString(),
      };
      this.homekitCameraRecords.set(entityId, record);
      void this.saveHomeKitCameraRecords();
    }
    return record;
  }

  private get groupingEnabled(): boolean {
    return (
      (this.config as HomeAssistantPlatformConfig).groupByDeviceId ??
      (this.config as HomeAssistantPlatformConfig).group_by_device_id ??
      // A device registry entry represents the physical product.  Group it by
      // default so a fan/light cannot accidentally be commissioned as two
      // unrelated accessories. Users that need the former behavior can opt
      // out with group_by_device_id: false.
      true
    );
  }

  private compositeStorageKey(deviceId: string): string {
    return `device:${deviceId}`;
  }

  private recordEntityDiagnostic(
    entityId: string,
    message: string,
    level: EntityDiagnostic["level"] = "error",
  ) {
    const diagnostics = this.entityDiagnostics.get(entityId) ?? [];
    const latest = diagnostics[0];
    // State events can be duplicated by HA. Keep the history useful rather
    // than recording the same issue hundreds of times.
    if (
      !latest ||
      latest.message !== message ||
      Date.now() - Date.parse(latest.timestamp) > 30_000
    ) {
      diagnostics.unshift({
        timestamp: new Date().toISOString(),
        level,
        message,
      });
      diagnostics.splice(30);
      this.entityDiagnostics.set(entityId, diagnostics);
      this.scheduleDiagnosticsSave();
    }
    if (level === "error" || level === "warning") {
      this.entityProblems.add(entityId);
    } else if (level === "info") {
      this.entityProblems.delete(entityId);
    }
  }

  private clearEntityProblem(entityId: string) {
    this.entityProblems.delete(entityId);
  }

  private recordConnectionProblem(message: string) {
    for (const entityId of this.entities.keys())
      this.recordEntityDiagnostic(entityId, message, "warning");
  }

  /**
   * Home Assistant WebSocket loss is a real availability loss. Keep the
   * paired HAP accessories and Matter endpoints published, but mark them
   * unreachable so Apple Home does not present stale devices as available.
   */
  private markExportedDevicesUnreachable(reason: string): void {
    this.recordConnectionProblem(reason);
    for (const [entityId, entity] of this.entities) {
      if (!this.isEntityExported(entityId)) continue;
      if (typeof (entity as any).setReachability === "function") {
        void (entity as any).setReachability(false);
      }
    }
    for (const composite of this.compositeDevices.values()) {
      if (typeof (composite as any).setReachability === "function") {
        void (composite as any).setReachability(false);
      }
    }
  }

  private observeHomeAssistantAvailability(
    entityId: string,
    state: HassState,
  ): boolean {
    const previous = this.haAvailabilityStates.get(entityId);
    this.haAvailabilityStates.set(entityId, state.state);
    // Only emit visible warnings for entities that are fully exported AND actively converted
    // into Matter endpoints. Unsupported entities (like Samsung TVs) must not flood the log.
    const entity = this.entities.get(entityId);
    const hasEndpoint =
      entity &&
      (("endpoint" in entity && entity.endpoint !== undefined) ||
        ("endpoints" in entity &&
          (entity as any).endpoints !== undefined &&
          (entity as any).endpoints.size > 0));
    const isActivelyExported = this.isEntityExported(entityId) && hasEndpoint;

    if (isUnavailable(state)) {
      if (isActivelyExported) {
        if (entity && typeof (entity as any).setReachability === "function") {
          void (entity as any).setReachability(false);
        }
        const compositeDeviceId =
          this.compositeMembership.get(entityId) ??
          this.getCompositeCandidate(entityId)?.deviceId;
        const compDevice = compositeDeviceId
          ? this.compositeDevices.get(compositeDeviceId)
          : undefined;
        if (compDevice && typeof (compDevice as any).setReachability === "function") {
          const allUnavailable = compDevice.members?.every((m: any) => {
            const st = this.entities.get(m.entityId)?.state;
            return !st || isUnavailable(st);
          });
          if (allUnavailable || compDevice.primaryEntityId === entityId) {
            void (compDevice as any).setReachability(false);
          }
        }
      }

      if (previous === state.state) return true;
      const message = `Home Assistant informa el estado "${state.state}".`;
      if (isActivelyExported) {
        this.log.warn(`[Home Assistant] ${entityId}: ${message}`);
        this.recordEntityDiagnostic(entityId, message, "warning");
      } else {
        this.log.debug(
          `[Home Assistant] ${entityId}: ${message} (no exportado o no soportado — sin impacto Matter)`,
        );
      }
      return true;
    }
    if (this.entityProblems.has(entityId)) {
      this.clearEntityProblem(entityId);
    }
    if (previous && ["unavailable", "unknown"].includes(previous)) {
      if (isActivelyExported) {
        this.log.info(
          `\u001b[32m[Home Assistant] ${entityId}: la entidad se recuperó y volvió a "${state.state}".\u001b[0m`,
        );
        this.recordEntityDiagnostic(
          entityId,
          `Conexión restaurada con Home Assistant (estado: ${state.state})`,
          "info",
        );
        if (entity && typeof (entity as any).setReachability === "function") {
          void (entity as any).setReachability(true);
        }
        const compositeDeviceId =
          this.compositeMembership.get(entityId) ??
          this.getCompositeCandidate(entityId)?.deviceId;
        const compDevice = compositeDeviceId
          ? this.compositeDevices.get(compositeDeviceId)
          : undefined;
        if (compDevice && typeof (compDevice as any).setReachability === "function") {
          void (compDevice as any).setReachability(true);
        }
      } else {
        this.log.debug(
          `[Home Assistant] ${entityId}: la entidad se recuperó y volvió a "${state.state}". (no exportado o no soportado)`,
        );
      }
    }
    return false;
  }

  /**
   * Matter.js has changed the public shape of ServerNode state a few times.
   * Keep the UI boundary tolerant of both the Matterbridge compatibility
   * shape and the current Matter.js behaviors, rather than showing an
   * unpaired accessory merely because a state property was renamed.
   */
  private getMatterConnectionInfo(endpoint: any): MatterConnectionInfo {
    try {
      const nodeState = endpoint?.serverNode?.state ?? {};
      const commissioning =
        nodeState.commissioning ?? nodeState.commissioningServer ?? {};
      // OperationalCredentials is the live Matter source of truth.
      const liveFabricSource =
        nodeState.operationalCredentials?.fabrics ??
        nodeState.operationalCredentialsServer?.fabrics ??
        endpoint?.serverNode?.behaviors?.operationalCredentials?.state?.fabrics;

      let rawFabrics: any[] = [];
      if (liveFabricSource !== undefined && liveFabricSource !== null) {
        rawFabrics = Array.isArray(liveFabricSource)
          ? liveFabricSource
          : Object.values(liveFabricSource);
      } else if (
        commissioning.fabrics !== undefined &&
        commissioning.fabrics !== null
      ) {
        rawFabrics = Array.isArray(commissioning.fabrics)
          ? commissioning.fabrics
          : Object.values(commissioning.fabrics);
      }

      const homeLocation = (this.ha as any)?.hassConfig?.location_name || null;
      const fabrics: MatterFabricInfo[] = rawFabrics.map((fabric: any) => {
        const rawVendorId = fabric?.rootVendorId ?? fabric?.vendorId;
        const parsedVendorId =
          typeof rawVendorId === "number"
            ? rawVendorId
            : Number(rawVendorId);
        const vendorId = Number.isFinite(parsedVendorId)
          ? parsedVendorId
          : null;
        const rawLabel =
          typeof (fabric?.label ?? fabric?.fabricLabel ?? fabric?.name) ===
          "string"
            ? (fabric.label ?? fabric.fabricLabel ?? fabric.name).trim()
            : null;
        return {
          label: rawLabel || homeLocation,
          controller:
            vendorId !== null
              ? (MATTER_CONTROLLER_VENDORS[vendorId] ??
                `Controlador Matter desconocido (VID 0x${vendorId.toString(16).toUpperCase()})`)
              : "Controlador Matter sin VID reportado",
          vendorId,
          fabricId:
            fabric?.fabricId !== undefined && fabric?.fabricId !== null
              ? String(fabric.fabricId)
              : null,
          fabricIndex:
            fabric?.fabricIndex !== undefined && fabric?.fabricIndex !== null
              ? String(fabric.fabricIndex)
              : null,
        };
      });
      const controllerNames = [
        ...new Set(
          fabrics
            .map((fabric) => fabric.label)
            .filter((label): label is string => label !== null),
        ),
      ];
      // Matter.js 0.17 keeps onboarding data on the CommissioningServer
      // behavior. The compatibility state is still used by older
      // Matterbridge runtimes, but a commissioned node may no longer mirror
      // its codes into serverNode.state.commissioning.
      const behaviorCommissioning =
        endpoint?.serverNode?.behaviors?.commissioning?.state ??
        endpoint?.serverNode?.behaviors?.commissioning ??
        endpoint?.serverNode?.commissioning?.state ??
        endpoint?.serverNode?.commissioning ??
        {};
      const pairingCodes =
        commissioning.pairingCodes ??
        nodeState.pairingCodes ??
        behaviorCommissioning.pairingCodes ??
        endpoint?.serverNode?.pairingCodes ??
        endpoint?.pairingCodes ??
        {};
      const qrPairingCode =
        pairingCodes.qrPairingCode ??
        pairingCodes.qrCode ??
        behaviorCommissioning.qrPairingCode ??
        behaviorCommissioning.qrCode ??
        endpoint?.serverNode?.state?.commissioning?.pairingCodes
          ?.qrPairingCode ??
        endpoint?.qrPairingCode ??
        null;
      const manualPairingCode =
        pairingCodes.manualPairingCode ??
        pairingCodes.manualCode ??
        behaviorCommissioning.manualPairingCode ??
        behaviorCommissioning.manualCode ??
        endpoint?.serverNode?.state?.commissioning?.pairingCodes
          ?.manualPairingCode ??
        endpoint?.manualPairingCode ??
        null;

      // An accessory is commissioned if and only if it has at least one active fabric
      const isCommissioned = fabrics.length > 0;

      return {
        commissioned: isCommissioned,
        controllerNames,
        // Matter exposes the fabric/controller label.
        homeName: controllerNames.join(", ") || homeLocation,
        fabricCount: fabrics.length,
        fabrics,
        pairingCode: qrPairingCode,
        manualPairingCode,
      };
    } catch (error) {
      // A node that Matter.js is still tearing down can throw while reading
      // its behavior-backed state. One bad accessory must not make the custom
      // UI return 500 or stay on its loading screen.
      this.log.warn(`Unable to read Matter connection state: ${String(error)}`);
      return {
        commissioned: false,
        controllerNames: [],
        homeName: null,
        fabricCount: 0,
        fabrics: [],
        pairingCode: null,
        manualPairingCode: null,
      };
    }
  }

  /** Describe only the failure evidence supplied by the HA WebSocket client. */
  private describeHomeAssistantConnectionFailure(error: unknown): string {
    const detail = String(error ?? "").trim();
    if (/\b502\b/.test(detail))
      return `Home Assistant o su proxy respondió HTTP 502 (${detail}).`;
    if (
      /ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ENOTFOUND|ETIMEDOUT|network|socket hang up/i.test(
        detail,
      )
    ) {
      return `No se pudo alcanzar Home Assistant por red/IP (${detail || "sin detalle adicional"}).`;
    }
    if (!detail || /WebSocket connection closed/i.test(detail)) {
      return "La conexión WebSocket con Home Assistant se cerró sin una causa adicional reportada.";
    }
    return `Error de conexión WebSocket con Home Assistant: ${detail}`;
  }

  /**
   * Matter does not expose whether RemoveFabric came from a button press or a
   * controller automation. It does expose the resulting live fabric list, so
   * log that state transition exactly and never invent a cause.
   */
  private observeMatterConnection(
    entityId: string,
    current: MatterConnectionInfo,
  ) {
    const previous = this.matterConnectionStates.get(entityId);
    this.matterConnectionStates.set(entityId, current);
    if (!previous) return;

    if (previous.fabricCount > 0 && current.fabricCount === 0) {
      const controllers = previous.controllerNames.length
        ? ` (${previous.controllerNames.join(", ")})`
        : "";
      const message = `Matter confirmó que se eliminó el último fabric${controllers}; el accesorio quedó desemparejado. Matter no informa si la retirada fue manual o automática desde el controlador.`;
      this.log.warn(`[Matter] ${entityId}: ${message}`);
      this.recordEntityDiagnostic(entityId, message, "warning");
      return;
    }

    if (previous.fabricCount !== current.fabricCount) {
      const message = `Matter confirmó un cambio de fabrics: ${previous.fabricCount} → ${current.fabricCount}. El accesorio ${current.commissioned ? "sigue emparejado con otro controlador." : "quedó desemparejado."}`;
      this.log.notice(`[Matter] ${entityId}: ${message}`);
      if (!current.commissioned)
        this.recordEntityDiagnostic(entityId, message, "warning");
      return;
    }

    if (!previous.commissioned && current.commissioned) {
      this.clearEntityProblem(entityId);
      this.recordEntityDiagnostic(
        entityId,
        `Matter confirmó el emparejamiento con ${current.fabricCount} casa(s) / controlador(es).`,
        "info",
      );
      this.log.notice(
        `[Matter] ${entityId}: Matter confirmó un nuevo emparejamiento con ${current.fabricCount} fabric(s).`,
      );
      return;
    }

    if (current.commissioned && this.entityProblems.has(entityId)) {
      const entity = this.entities.get(entityId);
      if (entity && !isUnavailable(entity.state)) {
        this.clearEntityProblem(entityId);
      }
    }
  }

  /** Poll live server state even when the custom UI is closed. */
  private monitorMatterConnections() {
    for (const [entityId] of this.entities) {
      if (!this.isEntityExported(entityId)) continue;
      try {
        const compositeDeviceId =
          this.compositeMembership.get(entityId) ??
          this.getCompositeCandidate(entityId)?.deviceId;
        const endpoint = this.getMatterEndpointForEntity(
          entityId,
          compositeDeviceId,
        );
        const current = this.getMatterConnectionInfo(endpoint);
        const previous = this.matterConnectionStates.get(entityId);
        this.observeMatterConnection(entityId, current);
        if (
          !previous ||
          previous.fabricCount !== current.fabricCount ||
          previous.pairingCode !== current.pairingCode ||
          previous.manualPairingCode !== current.manualPairingCode
        ) {
          this.pushEntityUpdate(entityId);
        }
      } catch (error) {
        this.log.debug(
          `[Matter] Unable to inspect pairing state for ${entityId}: ${String(error)}`,
        );
      }
    }
  }

  private async runMatterAccessoryOperation<T>(
    entityId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = this.compositeMembership.get(entityId) ?? entityId;
    const previous =
      this.matterAccessoryOperations.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.matterAccessoryOperations.set(key, current);
    try {
      return await current;
    } finally {
      if (this.matterAccessoryOperations.get(key) === current) {
        this.matterAccessoryOperations.delete(key);
      }
    }
  }

  private lastHaReconnectAttempt = 0;

  private ensureHaConnected(): void {
    if (!this.ha || this.ha.connected) return;
    const now = Date.now();
    if (now - this.lastHaReconnectAttempt < 5000) return;
    this.lastHaReconnectAttempt = now;
    this.log.notice(
      `[Watchdog] Home Assistant WebSocket desconectado. Forzando reconexión inmediata...`,
    );
    try {
      this.ha.startReconnect();
    } catch (err) {
      this.log.warn(`[Watchdog] Error al invocar startReconnect(): ${err}`);
    }
  }

  private startMatterConnectionMonitor() {
    if (this.matterConnectionMonitor) return;
    this.matterConnectionMonitor = setInterval(
      () => {
        this.ensureHaConnected();
        this.monitorMatterConnections();
      },
      4_000,
    );
  }

  private cameraUiHealthMonitor: NodeJS.Timeout | null = null;

  private startCameraUiHealthMonitor(): void {
    if (this.cameraUiHealthMonitor) return;
    const checkLiveness = async () => {
      try {
        const store = await CameraUiStorage.load();
        if (!store.config.serverUrl && store.cameras.length === 0) return;
        if (!store.config.enabled && store.cameras.length > 0) {
          store.config.enabled = true;
          await CameraUiStorage.save(store);
        }
        const client = new CameraUiClient(store.config);
        const test = await client.testConnection();
        const prevStatus = store.config.connectionStatus;
        const nextStatus = test.ok ? "connected" : "disconnected";
        if (prevStatus !== nextStatus || (test.ok && store.config.connectionStatus !== "connected")) {
          await CameraUiStorage.updateConnectionStatus(
            nextStatus,
            test.ok ? undefined : test.message,
          );
          this.broadcastSseMessage("cameraui_updated", {
            connectionStatus: nextStatus,
          });
        }
      } catch {}
    };

    setTimeout(() => void checkLiveness(), 4000);
    this.cameraUiHealthMonitor = setInterval(() => void checkLiveness(), 30_000);
  }

  private cameraUiMotionPoller: NodeJS.Timeout | null = null;
  /**
   * Tracks the last seen notification timestamp in SECONDS (Camera.UI uses Unix seconds, not ms).
   * Initialized to 30 seconds ago (in seconds) so we pick up very recent events on startup.
   */
  private lastCameraUiNotificationTime = Math.floor(Date.now() / 1000) - 30;
  private seenCameraUiNotificationIds = new Set<string>();
  private cameraUiActiveMotionTimers = new Map<string, NodeJS.Timeout>();
  private cameraUiPollerClient: import("./camera/cameraui/cameraui-client.js").CameraUiClient | null = null;

  private startCameraUiMotionPoller(): void {
    if (this.cameraUiMotionPoller) return;

    const pollNotifications = async () => {
      try {
        const store = await CameraUiStorage.load();
        // Return only if Camera.UI is not configured at all (no serverUrl)
        if (!store.config.serverUrl) return;

        // Reuse or create the authenticated client (avoid re-logging every 1.5s)
        if (!this.cameraUiPollerClient) {
          const client = new CameraUiClient(store.config);
          await client.login();
          this.cameraUiPollerClient = client;
        }

        const notifications = await this.cameraUiPollerClient.getRecentNotifications();
        if (!notifications || !Array.isArray(notifications) || notifications.length === 0) return;

        const activeAccessories = CameraUiHomeKitBridge.getAllAccessories();
        const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        let maxTimeInBatch = this.lastCameraUiNotificationTime;

        for (const notif of notifications) {
          const notifId = String(notif.id || notif._id || notif.uuid || "");
          if (notifId && this.seenCameraUiNotificationIds.has(notifId)) {
            continue;
          }

          // Camera.UI stores timestamps as Unix SECONDS. Normalize to seconds.
          let notifTimeSec = 0;
          const rawTime = notif.time ?? notif.timestamp;
          if (rawTime) {
            const n = Number(rawTime);
            // If value > 1e10 it's already in ms, convert to seconds
            notifTimeSec = n > 1e10 ? Math.floor(n / 1000) : n;
          } else if (notif.date) {
            notifTimeSec = Math.floor(new Date(notif.date).getTime() / 1000);
          } else if (notif.createdAt) {
            notifTimeSec = Math.floor(new Date(notif.createdAt).getTime() / 1000);
          }

          if (notifTimeSec && notifTimeSec <= this.lastCameraUiNotificationTime && !notifId) {
            continue; // Already processed
          }

          if (notifId) {
            this.seenCameraUiNotificationIds.add(notifId);
            if (this.seenCameraUiNotificationIds.size > 1000) {
              const first = this.seenCameraUiNotificationIds.values().next().value;
              if (first) this.seenCameraUiNotificationIds.delete(first);
            }
          }

          if (notifTimeSec && notifTimeSec > maxTimeInBatch) {
            maxTimeInBatch = notifTimeSec;
          }

          const camField = typeof notif.camera === "object" ? (notif.camera?.name || notif.camera?.id) : notif.camera;
          const candidateTexts = [
            camField,
            notif.cameraName,
            notif.cameraId,
            notif.name,
            notif.title,
            notif.subtitle,
            notif.tag,
            notif.target,
            notif.source,
            notif.deepLink,
          ].filter(Boolean).map((s) => String(s).trim());

          // Find matching mounted camera accessory
          let matchedCuiId: string | undefined;
          let matchedAccessory: any = undefined;

          for (const [cuiId, acc] of activeAccessories) {
            const accCleanCuiId = clean(cuiId.replace(/^cameraui_/, ""));
            const accCleanName = clean(acc.record?.name || "");
            const accWords = (acc.record?.name || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);

            for (const text of candidateTexts) {
              const cleanText = clean(text);
              if (
                cleanText === accCleanCuiId ||
                cleanText === accCleanName ||
                (cleanText.length >= 4 && (cleanText.includes(accCleanCuiId) || accCleanCuiId.includes(cleanText))) ||
                (cleanText.length >= 3 && (cleanText.includes(accCleanName) || accCleanName.includes(cleanText))) ||
                (accWords.length > 0 && accWords.every((w) => cleanText.includes(w)))
              ) {
                matchedCuiId = cuiId;
                matchedAccessory = acc;
                break;
              }
            }
            if (matchedAccessory) break;
          }

          // Fallback: If only 1 camera is mounted in Camera.UI, any motion alert belongs to it
          if (!matchedAccessory && activeAccessories.size === 1) {
            const [firstId, firstAcc] = activeAccessories.entries().next().value!;
            matchedCuiId = firstId;
            matchedAccessory = firstAcc;
          }

          if (matchedAccessory && matchedCuiId) {
            const triggerInfo =
              notif.label ||
              notif.trigger ||
              notif.type ||
              notif.target ||
              notif.subtitle ||
              notif.body ||
              "opencv";

            this.log.notice(
              `[Camera.UI][OpenCV] Detección confirmada en "${matchedAccessory.record?.name || matchedCuiId}" (trigger=${triggerInfo}, t=${notifTimeSec}). Activando sensor HomeKit y Matter.`,
            );

            CameraUiHomeKitBridge.updateMotion(matchedCuiId, true, this);
            this.broadcastSseMessage("cameraui_motion", { cameraId: matchedCuiId, motionOn: true });

            // Forward to CameraAiDetector so UI "Detección Activa" & MQTT publish in real time
            if (this.cameraAiDetector) {
              const allText = [
                notif.label,
                notif.trigger,
                notif.type,
                notif.target,
                notif.tag,
                notif.title,
                notif.subtitle,
                notif.body,
                notif.message,
                typeof notif.record === "string" ? notif.record : JSON.stringify(notif.record || {}),
                typeof notif.details === "string" ? notif.details : JSON.stringify(notif.details || {}),
              ].filter(Boolean).join(" ").toLowerCase();

              const isVehicle = /vehicle|vehiculo|vehículo|car|auto|camion|camión|truck|bus|motorcycle|moto/i.test(allText);
              const isPerson = /person|persona|humano|human|face|cara/i.test(allText);
              const isPet = /dog|perro|cat|gato|pet|animal|mascota|bird|ave/i.test(allText);
              const targets: import("./camera/camera-types.js").CameraAiTarget[] = [];
              if (isVehicle) targets.push("vehicle");
              if (isPerson) targets.push("person");
              if (isPet) targets.push("dog");
              if (targets.length === 0) targets.push("person");

              this.cameraAiDetector.dispatchDetection(this, matchedCuiId, {
                cameraId: matchedCuiId,
                timestamp: Date.now(),
                targets,
                labels: [String(triggerInfo)],
                confidence: 0.95,
                rawDetails: `Camera.UI OpenCV: ${triggerInfo}`,
              });
            }

            const existingTimer = this.cameraUiActiveMotionTimers.get(matchedCuiId);
            if (existingTimer) clearTimeout(existingTimer);

            const resetTimer = setTimeout(() => {
              CameraUiHomeKitBridge.updateMotion(matchedCuiId, false, this);
              this.broadcastSseMessage("cameraui_motion", { cameraId: matchedCuiId, motionOn: false });
              this.cameraUiActiveMotionTimers.delete(matchedCuiId);
            }, 10_000);

            this.cameraUiActiveMotionTimers.set(matchedCuiId, resetTimer);
          } else if (candidateTexts.length > 0) {
            this.log.debug(
              `[Camera.UI][OpenCV] Notificación recibida para "${candidateTexts.join(" / ")}" pero no coincidió con accesorios activos: [${[...activeAccessories.keys()].join(", ")}]`,
            );
          }
        }

        this.lastCameraUiNotificationTime = maxTimeInBatch;
      } catch (err) {
        // Reset client on error so next poll re-authenticates
        this.cameraUiPollerClient = null;
      }
    };

    this.cameraUiMotionPoller = setInterval(() => void pollNotifications(), 1500);
  }

  /**
   * Resolve the live Matter node for an entity. During the migration from
   * per-entity exports to one physical-device export, an existing legacy node
   * can remain paired while a new composite node has not been created yet.
   * Never let that incomplete composite hide the commissioned legacy node.
   */
  private getMatterEndpointForEntity(
    entityId: string,
    compositeDeviceId?: string,
    primaryEntityId?: string | null,
  ): any {
    const compositeEndpoint = compositeDeviceId
      ? (this.matterbridgeDevices.get(
          this.compositeStorageKey(compositeDeviceId),
        ) as any)
      : undefined;
    if (compositeEndpoint?.serverNode) return compositeEndpoint;

    const directEndpoint = this.matterbridgeDevices.get(entityId) as any;
    if (directEndpoint?.serverNode) return directEndpoint;

    if (primaryEntityId && primaryEntityId !== entityId) {
      const primaryEndpoint = this.matterbridgeDevices.get(
        primaryEntityId,
      ) as any;
      if (primaryEndpoint?.serverNode) return primaryEndpoint;
    }

    return compositeEndpoint ?? directEndpoint;
  }

  private getEntityErrorLogs(
    entityId: string,
    endpoint: any,
    allErrorLogs: string[],
  ): string[] {
    const compositeDeviceId =
      this.compositeMembership.get(entityId) ??
      this.getCompositeCandidate(entityId)?.deviceId;
    const identifiers = [
      entityId,
      compositeDeviceId && `device:${compositeDeviceId}`,
      endpoint?.uniqueId,
      endpoint?.serialNumber,
      endpoint?.deviceName,
    ].filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
    return allErrorLogs
      .filter((line) =>
        identifiers.some((identifier) => line.includes(identifier)),
      )
      .slice(-20)
      .reverse();
  }

  private scheduleDiagnosticsSave() {
    if (this.diagnosticSaveTimer) clearTimeout(this.diagnosticSaveTimer);
    this.diagnosticSaveTimer = setTimeout(() => {
      const saved = Object.fromEntries(this.entityDiagnostics.entries());
      void fs
        .writeFile(
          "/data/entity-diagnostics.json",
          JSON.stringify(saved, null, 2),
          "utf8",
        )
        .catch((error) =>
          this.log.warn(`Unable to save entity diagnostics: ${error}`),
        );
    }, 250);
  }

  private async loadEntityDiagnostics() {
    try {
      const raw = await fs.readFile("/data/entity-diagnostics.json", "utf8");
      const saved = JSON.parse(raw) as Record<string, EntityDiagnostic[]>;
      for (const [entityId, diagnostics] of Object.entries(saved)) {
        if (!Array.isArray(diagnostics)) continue;
        // Purge transient WebSocket connection warnings from individual entity histories
        const cleaned = diagnostics
          .filter(
            (entry) =>
              entry &&
              typeof entry.message === "string" &&
              typeof entry.timestamp === "string" &&
              !entry.message.includes("WebSocket") &&
              !entry.message.includes("Code: 1006"),
          )
          .slice(0, 30);
        this.entityDiagnostics.set(entityId, cleaned);
      }
      this.scheduleDiagnosticsSave();
    } catch {
      // The diagnostics file is optional and is created on the first issue.
    }
  }

  private getCompositeConfig(
    deviceId: string,
  ): CompositeDeviceConfig | undefined {
    return (
      this.deviceGroupingConfigs.find(
        (config) => config.device_id === deviceId,
      ) ?? this.config.devices?.find((config) => config.device_id === deviceId)
    );
  }

  private getCompositeConfigForEntity(
    entityId: string,
    deviceId?: string,
  ): CompositeDeviceConfig | undefined {
    const configs = [
      ...this.deviceGroupingConfigs,
      ...(this.config.devices ?? []),
    ];
    return (
      configs.find((config) => config.device_id === deviceId) ??
      configs.find(
        (config) =>
          config.primary_entity === entityId ||
          config.include_entities?.includes(entityId),
      )
    );
  }

  /**
   * Returns true when the entity's friendly_name starts with "DPS" (case-insensitive)
   * or its original_name in the HA entity registry contains "DPS". These are generic
   * Tuya datapoint sensors that have not been given a meaningful name and should be
   * excluded from the Matter panel and from the multi-switch switch-count.
   */
  public isDpsGenericEntity(entityId: string): boolean {
    const entry = (this.ha as any).hassEntities?.get(entityId);
    if (!entry) return false;
    const friendly: string = entry.name ?? entry.original_name ?? "";
    const original: string = entry.original_name ?? "";
    return /^DPS\b/i.test(friendly) || /\bDPS\b/i.test(original);
  }

  /**
   * Omni Broadlink exposes learned IR appliances as standalone `switch.*`
   * entities. A learned robot control has no native HA vacuum domain, but it
   * is still a real RVC candidate when its name identifies it as a robot.
   */
  private getAutomaticProfile(
    entityId: string,
    state: HassState,
  ): string | undefined {
    if (!entityId.startsWith("switch.omni_broadlink_")) return undefined;
    const identity = `${entityId} ${state.attributes?.friendly_name ?? ""}`;
    return /(?:^|[_\s-])(everybot|ircedge|robot|aspiradora|vacuum|cleaner)(?:$|[_\s-])/i.test(
      identity,
    )
      ? "roboticVacuumCleaner"
      : undefined;
  }

  /** Refresh the panel catalogue from the latest HA state cache on demand. */
  private async refreshDiscoveryCatalog(): Promise<void> {
    if (this.entities.size === this.ha.hassStates.size) return;
    for (const state of this.ha.hassStates.values()) {
      if (!this.entities.has(state.entity_id)) {
        await this.registerHAEntity(state);
      }
    }
  }

  /**
   * A "multi-switch device" is a physical HA device_id that has TWO OR MORE
   * exported-eligible switch.* or light.* entities that are NOT DPS generics.
   * These devices are published as independent Matter accessories (one QR each)
   * rather than as a grouped composite node.
   */
  public isMultiSwitchDevice(deviceId: string): boolean {
    if (!deviceId) return false;
    const allMembers = Array.from(this.entities.values()).filter((entity) => {
      const hassEntry = (this.ha as any).hassEntities?.get(entity.entityId);
      return hassEntry?.device_id === deviceId;
    });

    const isNonGeneric = (e: BaseEntity) =>
      !this.isDpsGenericEntity(e.entityId) &&
      !this.isAuxiliaryEntity(e.entityId);

    const switches = allMembers.filter(
      (e) => e.entityId.startsWith("switch.") && isNonGeneric(e),
    );
    const lights = allMembers.filter(
      (e) => e.entityId.startsWith("light.") && isNonGeneric(e),
    );
    const fans = allMembers.filter(
      (e) => e.entityId.startsWith("fan.") && isNonGeneric(e),
    );

    // Ceiling fans with integrated light: ALWAYS keep together as a composite Matter accessory (1 QR code)
    if (fans.length >= 1 && lights.length >= 1) {
      return false;
    }

    // 1. Any device with 2 or more switch entities is a multi-gang switch/controller
    if (switches.length >= 2) return true;

    // 2. Any device with 2 or more fan entities (e.g. 2-gang fan controller)
    if (fans.length >= 2) return true;

    // 3. Any device with a mix of switches and fans (e.g. 1 fan switch + 1 or more switches, like Tuya double switch)
    if (fans.length >= 1 && switches.length >= 1) {
      // Exclude secondary buzzer/beeper switches
      const realSwitches = switches.filter((m) => {
        const name = (
          this.ha.hassEntities.get(m.entityId)?.name || m.entityId
        ).toLowerCase();
        return !/beep|buzz|sound|audio|timb|indicat|display/i.test(name);
      });
      if (realSwitches.length >= 1) return true;
    }

    // 4. Any device with 2 or more switch/light entities without appliance domains (camera, humidifier, lock, climate, vacuum)
    if (
      switches.length + lights.length >= 2 &&
      !allMembers.some((e) =>
        ["camera", "humidifier", "lock", "climate", "vacuum"].includes(
          e.entityId.split(".")[0],
        ),
      )
    ) {
      return true;
    }

    return false;
  }

  private getCompositeCandidate(entityId: string):
    | {
        deviceId: string;
        members: CompositeMember[];
        config?: CompositeDeviceConfig;
      }
    | undefined {
    const hassEntry = this.ha?.hassEntities?.get(entityId);
    const deviceId = hassEntry?.device_id;
    if (!deviceId) {
      this.log.debug(
        `[Composite] ${entityId}: no device_id in entity registry — composite grouping skipped`,
      );
      return undefined;
    }
    const config = this.getCompositeConfigForEntity(entityId, deviceId);
    if (config?.group_by_device_id === false) {
      this.log.debug(
        `[Composite] ${entityId}: grouping explicitly disabled for device ${deviceId}`,
      );
      return undefined;
    }
    // Multi-switch devices (≥2 switch/light entities under one HA device) publish
    // each canal as an independent Matter accessory with its own QR code.
    if (this.isMultiSwitchDevice(deviceId)) {
      this.log.debug(
        `[Composite] ${entityId}: multi-switch device ${deviceId} — composite grouping bypassed, each entity gets its own QR`,
      );
      return undefined;
    }
    const compositeDeviceId = config?.device_id ?? deviceId;
    const excluded = new Set(config?.exclude_entities ?? []);
    const explicitlyIncluded = config?.include_entities;
    const supported = new Set([
      "camera",
      "fan",
      "light",
      "switch",
      "lock",
      "sensor",
      "binary_sensor",
      "humidifier",
    ]);
    let members = Array.from(this.entities.values()).filter((entity) => {
      const [domain] = entity.entityId.split(".");
      if (!supported.has(domain)) return false;
      if (excluded.has(entity.entityId)) return false;
      if (explicitlyIncluded?.length)
        return explicitlyIncluded.includes(entity.entityId);

      const hassEntry = this.ha.hassEntities.get(entity.entityId);
      if (hassEntry?.device_id !== compositeDeviceId) return false;

      // Exclude HA configuration/diagnostic entities unless explicitly included
      if (
        hassEntry?.entity_category === "config" ||
        hassEntry?.entity_category === "diagnostic"
      ) {
        return false;
      }

      // Exclude unnamed generic Tuya DPS entities
      if (this.isDpsGenericEntity(entity.entityId)) return false;

      return true;
    });

    if (
      config?.primary_entity &&
      !members.some((member) => member.entityId === config.primary_entity)
    ) {
      const primary = this.entities.get(config.primary_entity);
      if (
        primary &&
        supported.has(primary.entityId.split(".")[0]) &&
        !excluded.has(primary.entityId)
      ) {
        members.push(primary);
      }
    }

    // If the composite group is a diffuser (humidifier), exclude auxiliary switches (beeper, buzzer, power duplicates)
    if (
      members.some((m) => m.entityId.startsWith("humidifier.")) &&
      !explicitlyIncluded?.length
    ) {
      members = members.filter((m) => !m.entityId.startsWith("switch."));
    }

    // If the composite group is a fan, exclude auxiliary beeper/sound switches or all switches if there is a light
    if (
      members.some((m) => m.entityId.startsWith("fan.")) &&
      !explicitlyIncluded?.length
    ) {
      if (members.some((m) => m.entityId.startsWith("light."))) {
        // Ceiling fan with integrated light: keep fan, light, and sensors; exclude auxiliary switches
        members = members.filter((m) => !m.entityId.startsWith("switch."));
      } else {
        members = members.filter((m) => {
          if (!m.entityId.startsWith("switch.")) return true;
          const name = (
            this.ha.hassEntities.get(m.entityId)?.name || m.entityId
          ).toLowerCase();
          return !/beep|buzz|sound|audio|timb|indicat|display/i.test(name);
        });
      }
    }

    this.log.debug(
      `[Composite] ${entityId}: device_id=${compositeDeviceId}, candidate members=[${members.map((m) => m.entityId).join(", ")}]`,
    );

    // A composite node is useful when one physical HA device exposes a primary
    // controllable entity plus extra capabilities. This keeps products like
    // fan+light and SwitchBot lock+contact sensor under one QR code.
    // Also, BTHome sensors often group multiple sensors (temp, humidity, battery)
    // under a single device_id.
    // Cameras are published as dedicated standalone accessories (HomeKit/HAP & Matter)
    if (members.some((member) => member.entityId.startsWith("camera."))) {
      this.log.debug(
        `[Composite] ${entityId}: contains a camera entity — excluded from generic composite to publish as standalone camera accessory`,
      );
      return undefined;
    }

    const hasPrimaryControllable = members.some(
      (member) =>
        member.entityId.startsWith("fan.") ||
        member.entityId.startsWith("lock.") ||
        member.entityId.startsWith("humidifier."),
    );
    const isAllSensors = members.every(
      (member) =>
        member.entityId.startsWith("sensor.") ||
        member.entityId.startsWith("binary_sensor."),
    );

    if (!hasPrimaryControllable && !isAllSensors) {
      this.log.debug(
        `[Composite] ${entityId}: neither a primary controllable (fan/lock) nor a pure sensor group — not a composite candidate`,
      );
      return undefined;
    }
    if (members.length < 2) {
      this.log.debug(
        `[Composite] ${entityId}: only ${members.length} member(s) — need at least 2 for composite`,
      );
      return undefined;
    }

    const order = config?.endpoint_order ?? [];
    members.sort((a, b) => {
      if (a.entityId === config?.primary_entity) return -1;
      if (b.entityId === config?.primary_entity) return 1;
      const isAPrimary =
        a.entityId.startsWith("fan.") ||
        a.entityId.startsWith("lock.") ||
        a.entityId.startsWith("humidifier.");
      const isBPrimary =
        b.entityId.startsWith("fan.") ||
        b.entityId.startsWith("lock.") ||
        b.entityId.startsWith("humidifier.");
      if (isAPrimary && !isBPrimary) return -1;
      if (!isAPrimary && isBPrimary) return 1;
      const left = order.indexOf(a.entityId);
      const right = order.indexOf(b.entityId);
      if (left !== -1 || right !== -1)
        return (
          (left === -1 ? Number.MAX_SAFE_INTEGER : left) -
          (right === -1 ? Number.MAX_SAFE_INTEGER : right)
        );
      return a.entityId.localeCompare(b.entityId);
    });

    this.log.debug(
      `[Composite] ${entityId}: composite candidate confirmed → ${members.map((m) => m.entityId).join(" + ")}`,
    );
    return {
      deviceId: compositeDeviceId,
      config,
      members: members.map((entity) => ({
        entityId: entity.entityId,
        state: entity.state,
        deviceType: entity.deviceType,
      })),
    };
  }

  private isEntityExported(entityId: string): boolean {
    if (this.exportedDevices.has(entityId)) return true;
    const deviceId =
      this.compositeMembership.get(entityId) ??
      this.getCompositeCandidate(entityId)?.deviceId;
    return (
      deviceId !== undefined &&
      this.exportedDevices.has(this.compositeStorageKey(deviceId))
    );
  }

  private getHaRegistryInfo(entityId: string) {
    const entityRegistry = (this.ha as any).hassEntities?.get(entityId);
    const deviceId = entityRegistry?.device_id ?? null;
    const deviceRegistry = deviceId
      ? (this.ha as any).hassDevices?.get(deviceId)
      : undefined;
    const areaId = entityRegistry?.area_id ?? deviceRegistry?.area_id ?? null;
    const areaRegistry = areaId
      ? (this.ha as any).hassAreas?.get(areaId)
      : undefined;
    const deviceName =
      deviceRegistry?.name_by_user ||
      deviceRegistry?.name ||
      entityRegistry?.name ||
      entityRegistry?.original_name ||
      null;

    const rawManufacturer = deviceRegistry?.manufacturer;
    const rawModel = deviceRegistry?.model ?? deviceRegistry?.model_id;
    const platformName = entityRegistry?.platform;
    const entityState = this.entities.get(entityId)?.state;
    const attrManufacturer =
      entityState?.attributes?.manufacturer || entityState?.attributes?.brand;
    const attrModel =
      entityState?.attributes?.model || entityState?.attributes?.model_name;

    // Detect brand/manufacturer from platform or attributes or entityId
    let manufacturer = rawManufacturer || attrManufacturer || null;
    let model = rawModel || attrModel || null;

    if (!manufacturer && platformName) {
      const p = platformName.toLowerCase();
      if (p.includes("nest") || p.includes("google"))
        manufacturer = "Google Nest";
      else if (p.includes("ring")) manufacturer = "Ring";
      else if (p.includes("tapo") || p.includes("tplink"))
        manufacturer = "TP-Link Tapo";
      else if (p.includes("ezviz")) manufacturer = "EZVIZ";
      else if (p.includes("wyze")) manufacturer = "Wyze";
      else if (p.includes("reolink")) manufacturer = "Reolink";
      else if (p.includes("unifi") || p.includes("protect"))
        manufacturer = "Ubiquiti UniFi";
      else if (p.includes("eufy")) manufacturer = "Eufy";
      else if (p.includes("blink")) manufacturer = "Blink";
      else if (p.includes("tuya") || p.includes("smartlife"))
        manufacturer = "Tuya";
      else if (p.includes("sonoff") || p.includes("ewelink"))
        manufacturer = "Sonoff";
      else if (p.includes("shelly")) manufacturer = "Shelly";
      else if (p.includes("aqara") || p.includes("xiaomi"))
        manufacturer = "Aqara";
      else if (p.includes("hue")) manufacturer = "Philips Hue";
      else if (p.includes("broadlink")) manufacturer = "Broadlink";
    }

    if (!manufacturer) {
      const fullText =
        `${entityId} ${deviceName || ""} ${entityState?.attributes?.friendly_name || ""}`.toLowerCase();
      if (fullText.includes("google") || fullText.includes("nest"))
        manufacturer = "Google Nest";
      else if (fullText.includes("ring")) manufacturer = "Ring";
      else if (fullText.includes("tapo")) manufacturer = "TP-Link Tapo";
      else if (fullText.includes("ezviz")) manufacturer = "EZVIZ";
      else if (fullText.includes("wyze")) manufacturer = "Wyze";
      else if (fullText.includes("reolink")) manufacturer = "Reolink";
      else if (fullText.includes("unifi") || fullText.includes("protect"))
        manufacturer = "Ubiquiti UniFi";
      else if (fullText.includes("eufy")) manufacturer = "Eufy";
      else if (fullText.includes("blink")) manufacturer = "Blink";
      else if (fullText.includes("tuya")) manufacturer = "Tuya";
      else if (fullText.includes("sonoff")) manufacturer = "Sonoff";
      else if (fullText.includes("shelly")) manufacturer = "Shelly";
      else if (fullText.includes("aqara")) manufacturer = "Aqara";
    }

    return {
      device_id: deviceId,
      device_name: deviceName,
      area_id: areaId,
      area_name: areaRegistry?.name ?? null,
      manufacturer: manufacturer ?? null,
      model: model ?? (manufacturer ? `${manufacturer} Device` : null),
      entity_registry_id: entityRegistry?.id ?? null,
      platform: platformName ?? null,
    };
  }

  private getPrimaryEntityId(entityId: string): string | undefined {
    const deviceId = this.ha.hassEntities.get(entityId)?.device_id;
    if (!deviceId) return undefined;
    const priority = [
      "camera",
      "humidifier",
      "vacuum",
      "media_player",
      "climate",
      "lock",
      "cover",
      "light",
      "switch",
      "fan",
    ];
    const candidates = Array.from(this.entities.values())
      .filter(
        (entity) =>
          this.ha.hassEntities.get(entity.entityId)?.device_id === deviceId,
      )
      .sort(
        (left, right) =>
          priority.indexOf(left.entityId.split(".")[0]) -
          priority.indexOf(right.entityId.split(".")[0]),
      );
    return candidates.find((entity) =>
      priority.includes(entity.entityId.split(".")[0]),
    )?.entityId;
  }

  private isAuxiliaryEntity(entityId: string): boolean {
    const [domain] = entityId.split(".");
    if (domain !== "button") return false;
    const primary = this.getPrimaryEntityId(entityId);
    return primary !== undefined && primary !== entityId;
  }

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: HomeAssistantPlatformConfig,
  ) {
    super(matterbridge, log, config);
    this.log.info(`Initializing ${CYAN}${this.config.name}${nf} platform...`);

    // ── Token / Auth resolution ─────────────────────────────────────────────
    // Priority: config.token → SUPERVISOR_TOKEN env (HA OS add-on) → empty
    // An empty token works when:
    //   a) Running as HA add-on (supervisor grants access automatically), OR
    //   b) HA has trusted_networks configured for this host's subnet.
    const token = config.token || process.env.SUPERVISOR_TOKEN || "";

    // ── Host resolution: deferred to onStart() for async network scan ───────
    // We need to await discoverHassUrl() which probes the network, so we store
    // the raw config values here and complete the HA instance init in onStart().
    this._configHost = config.host;
    if (!this._configHost && !config.token && process.env.SUPERVISOR_TOKEN) {
      this._configHost = "http://supervisor/core";
    }
    this._configToken = token;

    this.log.info(`Platform initialised — host will be resolved on start.`);
  }

  /** Register event listeners on the HA client instance — call once. */
  private setupHaListeners() {
    this.ha.on("connected", (version) => {
      this.log.notice(`Connected to Home Assistant ${version}`);
      this.syncRetryAttempt = 0;
      if (this.syncRetryTimeout) {
        clearTimeout(this.syncRetryTimeout);
        this.syncRetryTimeout = undefined;
      }
      for (const entityId of this.entities.keys()) {
        this.clearEntityProblem(entityId);
      }
      void this.discoverAndSync();
    });

    this.ha.on("disconnected", (reason) => {
      if (this.syncRetryTimeout) {
        clearTimeout(this.syncRetryTimeout);
        this.syncRetryTimeout = undefined;
      }
      const message = this.describeHomeAssistantConnectionFailure(reason);
      this.log.warn(`Disconnected from Home Assistant: ${message}`);
      this.markExportedDevicesUnreachable(`Home Assistant desconectado: ${message}`);
    });

    this.ha.on("error", (err) => {
      const message = this.describeHomeAssistantConnectionFailure(err);
      this.log.error(`Home Assistant connection error: ${message}`);
    });

    this.ha.on("event", (_deviceId, entityId, _oldState, newState) => {
      if (newState) {
        this.handleEntityStateChange(entityId, newState);
        this.cameraAiDetector?.handleHaStateChange(this, entityId, newState);
      }
    });

    this.ha.on("registry_changed", () => {
      void this.discoverAndSync();
    });
  }

  /**
   * Called when the platform starts.
   */
  override async onStart(reason?: string) {
    this.log.info(`Starting HomeAssistant platform: ${reason ?? ""}`);
    const mbVersion = String(
      (this as any).matterbridge?.matterbridgeVersion ?? "unknown",
    );
    this.log.notice(`[Runtime] Matterbridge runtime: ${mbVersion}`);
    this.log.notice(`[Runtime] Node.js runtime: ${process.version}`);
    this.log.notice(`[Runtime] Plugin version: 1.8.37`);
    await this.loadEntityDiagnostics();
    await this.startUiServer();
    this.startMatterConnectionMonitor();
    this.startCameraUiHealthMonitor();
    this.startCameraUiMotionPoller();

    // Ensure HAP persistent storage path is /data/hap-persist before mounting any cameras
    try {
      const hapPersistDir = fsSync.existsSync("/data")
        ? "/data/hap-persist"
        : "./persist";
      if (!fsSync.existsSync(hapPersistDir)) {
        fsSync.mkdirSync(hapPersistDir, { recursive: true });
      }
      HAPStorage.setCustomStoragePath(hapPersistDir);
    } catch {}

    // Load persisted camera configurations BEFORE Scrypted fast boot so existing PINs, MACs, and ports are preserved
    await this.loadHomeKitCameraRecords();
    void this.initScrypted();
    void this.initCameraUi();
    this.cameraAiDetector = CameraAiDetector.getInstance(
      fsSync.existsSync("/data") ? "/data" : "./persist",
    );

    // Load MQTT Config if exists
    try {
      const mqttConfigRaw = await fs.readFile("/data/mqtt-config.json", "utf8");
      const mqttData = JSON.parse(mqttConfigRaw);
      (this.config as any).mqttHost = mqttData.host;
      (this.config as any).mqttPort = mqttData.port;
      (this.config as any).mqttUser = mqttData.user;
      (this.config as any).mqttPassword = mqttData.password;
    } catch {
      // File missing, that's fine
    }

    if ((this.config as any).mqttHost) {
      this.mqttManager = new MqttClientManager(this.log, {
        host: (this.config as any).mqttHost,
        port: Number((this.config as any).mqttPort) || 1883,
        user: (this.config as any).mqttUser,
        password: (this.config as any).mqttPassword,
      });

      this.mqttManager.onDeviceDiscovered(async (entry) => {
        if (entry.component === "camera") {
          this.log.info(
            `[MQTT] Discovered camera component "${entry.config?.name || entry.objectId}". Apple Home requires cameras via HomeKit HAP; skipped Matter bridge.`,
          );
          return;
        }

        const entity = new MqttEntity(this, this.mqttManager!, entry);
        this.mqttEntities.set(entity.entityId, entity);
        this.log.info(
          `[MQTT] Discovered ${entity.domain}: "${entity.friendlyName}" (${entity.entityId})`,
        );

        if (this.isEntityExported(entity.entityId)) {
          try {
            await this.activateMqttEntity(entity.entityId);
          } catch (err) {
            this.log.error(
              `[MQTT] Failed to activate exported MQTT device ${entity.entityId}: ${err}`,
            );
          }
        }
      });

      this.mqttManager.onDeviceRemoved((topic) => {
        for (const [entityId, entity] of this.mqttEntities.entries()) {
          if (
            entity.stateTopic === topic ||
            entity.entityId.includes(topic.split("/").pop() || "")
          ) {
            this.mqttEntities.delete(entityId);
            this.log.info(`[MQTT] Removed entity ${entityId}`);
            break;
          }
        }
      });

      this.mqttManager.onStateChanged((topic, payload) => {
        for (const entity of this.mqttEntities.values()) {
          if (entity.stateTopic === topic) {
            entity.handleStateUpdate(payload);
          }
        }
      });

      this.mqttManager.onCameraUiMessage(async (topic, payload) => {
        try {
          const store = await CameraUiStorage.load();
          let targetCameraId: string | undefined;
          let isMotion = false;
          let isDoorbell = false;
          let active = false;

          const parts = topic.split("/");
          const isMotionAction = (act: string) =>
            [
              "motion",
              "movimiento",
              "detection",
              "deteccion",
              "opencv",
              "person",
              "persona",
              "animal",
              "mascota",
              "pet",
              "vehicle",
              "vehiculo",
              "car",
              "carro",
              "auto",
              "package",
              "paquete",
              "face",
              "cara",
              "movement",
            ].includes(act.toLowerCase());

          const parseActiveState = (pl: string): boolean => {
            const trimmed = (pl || "").toString().trim();
            let act =
              trimmed === "true" ||
              trimmed.toUpperCase() === "ON" ||
              trimmed === "1" ||
              trimmed === "active" ||
              trimmed === "start";
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed === "boolean") return parsed;
              if (parsed.state !== undefined) {
                return (
                  parsed.state === "ON" ||
                  parsed.state === "on" ||
                  parsed.state === true ||
                  parsed.state === "active" ||
                  parsed.state === "start" ||
                  parsed.state === 1
                );
              }
              if (parsed.active !== undefined) return Boolean(parsed.active);
              if (parsed.motion !== undefined) return Boolean(parsed.motion);
              if (Array.isArray(parsed.detected) && parsed.detected.length > 0) return true;
              if (parsed.trigger === "opencv" || parsed.trigger === "motion") return true;
            } catch {}
            return act;
          };

          if (parts.length === 2 && (isMotionAction(parts[1]) || parts[1] === "doorbell")) {
            try {
              const data = JSON.parse(payload);
              const camIdentifier = (data.camera || data.name || data.id || "").toString().toLowerCase();
              const found = store.cameras.find(
                (c) => this.matchCameraIdentifier(c, camIdentifier),
              );
              if (found) targetCameraId = found.id;
              active = parseActiveState(payload);
              if (isMotionAction(parts[1])) isMotion = true;
              if (parts[1] === "doorbell") isDoorbell = true;
            } catch {
              active = parseActiveState(payload);
              if (isMotionAction(parts[1])) isMotion = true;
            }
          } else if (parts.length >= 3) {
            const camIdentifier = parts[1].toLowerCase();
            const action = parts[2].toLowerCase();
            const found = store.cameras.find(
              (c) => this.matchCameraIdentifier(c, camIdentifier),
            );
            if (found) {
              targetCameraId = found.id;
            } else {
              const allCuiAccessories = CameraUiHomeKitBridge.getAllAccessories();
              for (const [cuiId, acc] of allCuiAccessories) {
                if (this.matchCameraIdentifier({ id: cuiId, name: acc.record?.name }, camIdentifier)) {
                  targetCameraId = cuiId;
                  break;
                }
              }
              if (!targetCameraId) targetCameraId = camIdentifier;
            }
            if (isMotionAction(action)) {
              isMotion = true;
              active = parseActiveState(payload);
            } else if (action === "doorbell") {
              isDoorbell = true;
            }
          }

          if (targetCameraId) {
            if (isMotion) {
              CameraUiHomeKitBridge.updateMotion(targetCameraId, active, this, `MQTT (${topic})`);
            }
            if (isDoorbell) {
              CameraUiHomeKitBridge.triggerDoorbell(targetCameraId);
              this.broadcastSseMessage("cameraui_doorbell", { cameraId: targetCameraId });
            }
          }
        } catch (e) {
          this.log.debug(`[Camera.UI] Error processing MQTT event on ${topic}: ${e}`);
        }
      });

      this.mqttManager.connect();
    }

    // ── Resolve Home Assistant URL ─────────────────────────────────────────
    // If the user didn’t set config.host we run the network discovery:
    //   1. Probe well-known hostnames (homeassistant.local, supervisor...)
    //   2. Scan local LAN subnets for port 8123
    let rawHost = this._configHost;
    if (!rawHost) {
      const localCore = await probeHassUrl("http://127.0.0.1:8123");
      if (localCore && this._configToken) {
        rawHost = localCore;
        this.log.notice(
          `Connected directly to local Home Assistant core at ${CYAN}${rawHost}${nf}`,
        );
      } else if (process.env.SUPERVISOR_TOKEN) {
        rawHost = "http://supervisor/core";
        this.log.notice(
          `Running as Home Assistant add-on — using Supervisor core API at ${CYAN}${rawHost}${nf}`,
        );
      } else {
        this.log.info(
          "No host configured — auto-discovering Home Assistant on the network...",
        );
        const discovered = await discoverHassUrl((msg) => this.log.debug(msg));
        if (discovered) {
          rawHost = discovered;
          this.log.notice(
            `Auto-discovered Home Assistant at ${CYAN}${rawHost}${nf}`,
          );
        } else {
          this.log.error(
            "Could not find Home Assistant on the network. " +
              'Set the "host" field in the plugin config (e.g. http://192.168.1.100:8123) and restart.',
          );
          return;
        }
      }
    }

    // Normalise to ws:// / wss:// for the WebSocket client
    const wsHost = toWsUrl(rawHost);
    this.log.info(
      `Connecting to Home Assistant at ${CYAN}${wsHost}${nf} (token: ${this._configToken ? "provided" : "none / trust-local"})`,
    );

    // Create the HA client with the resolved URL
    this.ha = new HomeAssistant(
      wsHost,
      this._configToken,
      3,
      0, // Retry forever. HA restarts and DHCP renewals must not require a plugin restart.
      undefined,
      false,
    );

    this.setupHaListeners();
    // ──────────────────────────────────────────────────────────────

    try {
      await this.ha.connect();
    } catch (err) {
      this.log.error(`Failed to connect to Home Assistant: ${err}`);
    }
  }

  /**
   * Called when the platform shuts down.
   */
  override async onShutdown(reason?: string) {
    this.log.warn(`Shutting down platform: ${reason ?? ""}`);

    // 1. Log memory usage diagnostics at shutdown
    try {
      const mem = process.memoryUsage();
      this.log.info(
        `[Shutdown] Process memory: RSS ${(mem.rss / 1024 / 1024).toFixed(1)} MB | Heap ${(mem.heapUsed / 1024 / 1024).toFixed(1)} / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB | External ${(mem.external / 1024 / 1024).toFixed(1)} MB`,
      );
    } catch {}

    // 2. Immediately close and destroy all active SSE client streams
    for (const sub of this.sseSubscribers) {
      try {
        if (!sub.destroyed && !sub.writableEnded) {
          sub.end("event: shutdown\ndata: {}\n\n");
          sub.destroy();
        }
      } catch {}
    }
    this.sseSubscribers.clear();

    // 3. Stop UI HTTP Server
    if (this.uiServer) {
      const server = this.uiServer;
      this.uiServer = undefined;
      try {
        (server as any).closeAllConnections?.();
      } catch {}
      await new Promise<void>((resolve) => {
        if (!server.listening) return resolve();
        const t = setTimeout(() => resolve(), 1000);
        server.close(() => {
          clearTimeout(t);
          resolve();
        });
      });
      this.log.info("Custom UI Server stopped.");
    }

    // 4. Teardown all HomeKit cameras (terminate FFmpeg processes, clear pre-buffer RAM, unpublish HAP)
    for (const entity of this.entities.values()) {
      if (entity instanceof CameraEntity && entity.homekitAccessory) {
        try {
          await entity.homekitAccessory.unpublish();
        } catch (err) {
          this.log.debug(
            `[Shutdown] Error unpublishing camera ${entity.entityId}: ${err}`,
          );
        }
      }
    }

    // 5. Persist records and overrides to disk
    try {
      this.saveHomeKitCameraRecords();
      await this.saveDeviceOverrides();
    } catch {}

    // 6. Stop intervals and close connections
    if (this.syncRetryTimeout) clearTimeout(this.syncRetryTimeout);
    if (this.matterConnectionMonitor)
      clearInterval(this.matterConnectionMonitor);
    this.matterConnectionMonitor = undefined;
    this.matterConnectionStates.clear();
    this.haAvailabilityStates.clear();
    if (this.mqttManager) this.mqttManager.disconnect();
    try {
      ScryptedReconnectManager.getInstance().stop();
    } catch {}
    this.scryptedInitialized = false;
    await this.ha?.close();
    this.log.info("Shutdown completed cleanly.");
  }

  /**
   * Discover entities from Home Assistant and sync them to Matter.
   */
  private async discoverAndSync() {
    this.syncRequested = true;
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = (async () => {
      while (this.syncRequested && this.ha.connected) {
        this.syncRequested = false;
        const recovered = await this.performDiscoverAndSync();
        if (!recovered && this.ha.connected) {
          this.scheduleSyncRetry();
          break;
        }
      }
    })().finally(() => {
      this.syncInFlight = undefined;
    });
    return this.syncInFlight;
  }

  private scheduleSyncRetry() {
    if (this.syncRetryTimeout) return;
    const delay = Math.min(3_000 * 2 ** this.syncRetryAttempt, 60_000);
    this.syncRetryAttempt++;
    this.log.warn(
      `Home Assistant snapshot sync will retry in ${delay / 1000} seconds.`,
    );
    this.syncRetryTimeout = setTimeout(() => {
      this.syncRetryTimeout = undefined;
      void this.discoverAndSync();
    }, delay).unref();
  }

  private async performDiscoverAndSync(): Promise<boolean> {
    this.log.info("Fetching data for entity discovery...");
    try {
      await this.ha.fetchData();
      // Subscribing to every HA event is extremely noisy (automations,
      // recorder, service calls, etc.) and can starve Matter subscriptions.
      // State changes are the only realtime stream this bridge needs.
      await Promise.all([
        this.ha.subscribe("state_changed"),
        this.ha.subscribe("device_registry_updated"),
        this.ha.subscribe("entity_registry_updated"),
        this.ha.subscribe("area_registry_updated"),
        this.ha.subscribe("label_registry_updated"),
      ]);

      // Load device overrides
      try {
        const raw = await fs.readFile("/data/device-overrides.json", "utf8");
        this.deviceOverrides = JSON.parse(raw);
        this.log.info(
          `Loaded ${Object.keys(this.deviceOverrides).length} device overrides.`,
        );
      } catch {
        this.log.info("No device-overrides.json found, starting fresh.");
      }

      // Load exported devices for Accessory Mode
      try {
        const rawExported = await fs.readFile(
          "/data/exported-devices.json",
          "utf8",
        );
        const exportedList = JSON.parse(rawExported);
        if (Array.isArray(exportedList)) {
          this.exportedDevices = new Set(exportedList);
        }
        this.log.info(
          `Loaded ${this.exportedDevices.size} manually exported devices.`,
        );
      } catch {
        this.log.info(
          "No exported-devices.json found. No accessories will be started automatically.",
        );
      }

      await this.loadHomeKitCameraRecords();

      // Optional device-level composite definitions. This file intentionally
      // lives beside entity overrides so advanced users can tune grouping
      // without changing the add-on image.
      try {
        const rawGroups = await fs.readFile("/data/device-groups.json", "utf8");
        const parsed = JSON.parse(rawGroups);
        this.deviceGroupingConfigs = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.devices)
            ? parsed.devices
            : [];
        this.log.info(
          `Loaded ${this.deviceGroupingConfigs.length} device grouping definitions.`,
        );
      } catch {
        this.deviceGroupingConfigs = [];
      }

      const states = Array.from(this.ha.hassStates.values());
      this.log.info(
        `Fetched ${states.length} entity states. Registering matching devices...`,
      );

      for (const hassState of states) await this.registerHAEntity(hassState);
      const currentEntityIds = new Set(states.map((state) => state.entity_id));
      for (const entityId of [...this.entities.keys()]) {
        if (currentEntityIds.has(entityId)) continue;
        if (this.isEntityExported(entityId)) {
          const message =
            "Home Assistant ya no incluye esta entidad en su snapshot; se conserva el último estado Matter.";
          this.log.warn(`[Home Assistant] ${entityId}: ${message}`);
          this.recordEntityDiagnostic(entityId, message, "warning");
        } else {
          this.entities.delete(entityId);
        }
      }
      await this.restoreExportedDevices();
      // Do not announce recovery while the HA snapshot is still merely queued
      // for Matter. Await it so every available accessory is current.
      if (this.pendingStateUpdates.size) await this.flushStateUpdates();
      for (const entity of this.entities.values()) {
        if (!isUnavailable(entity.state))
          this.clearEntityProblem(entity.entityId);
      }
      this.log.notice(
        "Home Assistant recovery sync completed; Matter accessories are current.",
      );
      this.syncRetryAttempt = 0;
      return true;
    } catch (err) {
      this.log.error(`Discovery error: ${err}`);
      return false;
    }
  }

  /**
   * Handle entity discovery and mapping to Matter endpoints.
   */
  private async registerHAEntity(state: HassState) {
    const entityId = state.entity_id;

    // Idempotency guard: discovery objects are retained for the UI, but an
    // endpoint is only allocated when the user explicitly exports it.
    if (this.entities.has(entityId)) {
      const entity = this.entities.get(entityId)!;
      entity.state = state;
      if (this.observeHomeAssistantAvailability(entityId, state)) return;
      if (this.isEntityExported(entityId))
        this.queueStateUpdate(entityId, state);
      return;
    }

    const [domain] = entityId.split(".");
    const override = this.deviceOverrides[entityId];

    // Export only domains that have a complete device type and command/state
    // mapping. Unimplemented or safety-critical domains must fail closed.
    const allowedDomains = [
      "camera",
      "light",
      "switch",
      "cover",
      "lock",
      "climate",
      "fan",
      "sensor",
      "binary_sensor",
      "vacuum",
      "media_player",
      "humidifier",
      "siren",
    ];
    if (
      !allowedDomains.includes(domain) &&
      !(domain === "button" && override === "PetFeeder")
    )
      return;

    // Strict device_class whitelist for sensors to avoid exporting system/unsupported sensors
    // (power and energy are mapped to Matter 1.3 electrical measurement; monetary fails closed)
    const deviceClass = state.attributes.device_class;
    if (
      domain === "sensor" &&
      ![
        "temperature",
        "humidity",
        "illuminance",
        "moisture",
        "power",
        "energy",
      ].includes(deviceClass ?? "")
    )
      return;
    if (
      domain === "binary_sensor" &&
      ![
        "door",
        "window",
        "opening",
        "motion",
        "occupancy",
        "contact",
        "smoke",
        "gas",
        "moisture",
        "safety",
        "tamper",
        "carbon_monoxide",
      ].includes(deviceClass ?? "")
    )
      return;

    if (this.config.excludeEntities?.includes(entityId)) return;
    if (
      this.config.includeEntities &&
      !this.config.includeEntities.includes(entityId)
    )
      return;

    // Check device override
    const explicitOverride =
      override ?? this.getAutomaticProfile(entityId, state);
    const effectiveProfile = explicitOverride;
    if (override === "_DISABLED_") {
      this.log.debug(
        `Skipping ${entityId} because it is disabled by override.`,
      );
      return;
    }

    // Retrieve corresponding Matter Device Type based on actual capabilities
    let deviceType = getDeviceTypeForEntity(
      domain,
      deviceClass,
      state.attributes,
    );
    if (explicitOverride && (MatterDeviceTypes as any)[explicitOverride]) {
      deviceType = (MatterDeviceTypes as any)[explicitOverride];
      this.log.info(
        `Applying ${override ? "override" : "automatic profile"} for ${entityId}: ${deviceType.name}`,
      );
    }

    this.log.debug(
      `Mapping ${entityId} to Matter device type ${deviceType.name} (0x${deviceType.code.toString(16)})`,
    );

    let entityInstance: BaseEntity;

    // Instantiation based on mapped device type
    if (
      domain === "cover" &&
      ["garage_door", "gate", "blind", "shade", "curtain", "awning"].includes(
        deviceClass ?? "",
      )
    ) {
      entityInstance = new ClosureEntity(this, state, deviceType);
    } else if (domain === "lock") {
      entityInstance = new LockEntity(this, state, deviceType);
    } else if (domain === "camera") {
      entityInstance = new CameraEntity(this, state, deviceType);
    } else if (domain === "sensor" && deviceClass === "moisture") {
      entityInstance = new SoilSensorEntity(this, state, deviceType);
    } else if (domain === "sensor" && deviceClass === "monetary") {
      entityInstance = new EnergyTariffEntity(this, state, deviceType);
    } else if (
      (domain === "vacuum" ||
        effectiveProfile === "roboticVacuumCleaner" ||
        override === "roboticVacuumCleaner") &&
      (effectiveProfile === "roboticVacuumCleaner" ||
        deviceType.name === "RoboticVacuumCleaner")
    ) {
      entityInstance = new VacuumEntity(this, state, deviceType);
    } else if (domain === "humidifier") {
      entityInstance = new HumidifierEntity(this, state, deviceType);
    } else if (
      domain === "media_player" &&
      effectiveProfile === "basicVideoPlayer"
    ) {
      entityInstance = new MediaPlayerEntity(this, state, deviceType);
    } else if (override === "PetFeeder") {
      entityInstance = new PetFeederEntity(this, state, deviceType);
    } else if (override === "Oven" || deviceType.name === "Oven") {
      entityInstance = new OvenEntity(this, state, deviceType);
    } else if (override === "Cooktop" || deviceType.name === "Cooktop") {
      entityInstance = new CooktopEntity(this, state, deviceType);
    } else {
      // General base fallback or standard converters will wrap this
      entityInstance = new BaseEntity(this, state, deviceType);
    }

    this.entities.set(entityId, entityInstance);
    // Keep supported entities in discovery even when their initial HA state is
    // unknown/unavailable. Stateless IR/RF controls and entities created by
    // custom add-ons commonly start that way and may not report a concrete
    // state until their first command. Dropping them here made them impossible
    // to find or export from the UI. Matter uses a safe inactive initial value
    // and later state_changed events replace it when HA reports a real state.
    this.observeHomeAssistantAvailability(entityId, state);
  }

  /** Restore persisted legacy entities and grouped physical devices after discovery in parallel batches. */
  private async restoreExportedDevices(): Promise<void> {
    let migratedLegacyEntries = false;
    const entries = Array.from(this.exportedDevices);

    // Process all exported devices fully in parallel for instant reconnection at startup
    const batchSize = entries.length || 1;
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (exportedId) => {
          try {
            if (exportedId.startsWith("device:")) {
              const deviceId = exportedId.substring("device:".length);
              const entityId = Array.from(this.entities.keys()).find(
                (id) => this.ha.hassEntities.get(id)?.device_id === deviceId,
              );
              if (entityId) {
                try {
                  await this.activateComposite(entityId);
                } catch (error) {
                  if (!this.isCompositeNodeCreationFailure(error)) throw error;
                  await this.restoreCompositeAsPrimary(entityId, deviceId);
                  migratedLegacyEntries = true;
                }
              }
              return;
            }
            if (exportedId.startsWith("mqtt.")) {
              if (this.mqttEntities.has(exportedId)) {
                await this.activateMqttEntity(exportedId);
              }
              return;
            }
            if (!this.entities.has(exportedId)) return;
            const composite = this.getCompositeCandidate(exportedId);
            if (composite) {
              try {
                await this.activateComposite(exportedId);
                this.exportedDevices.add(
                  this.compositeStorageKey(composite.deviceId),
                );
                composite.members.forEach((member) =>
                  this.exportedDevices.delete(member.entityId),
                );
                migratedLegacyEntries = true;
              } catch (error) {
                if (!this.isCompositeNodeCreationFailure(error)) throw error;
                await this.restoreCompositeAsPrimary(
                  exportedId,
                  composite.deviceId,
                );
                migratedLegacyEntries = true;
              }
            } else {
              await this.activateEntity(exportedId);
            }
          } catch (err) {
            this.log.error(
              `Failed to restore exported device ${exportedId}: ${err}`,
            );
          }
        }),
      );
    }
    if (migratedLegacyEntries) await this.saveExportedDevices();
  }

  private isCompositeNodeCreationFailure(error: unknown): boolean {
    return String(error).includes(
      "Matter server node was not created for device",
    );
  }

  /** Keep a working paired accessory when this Matterbridge runtime cannot host a composite node. */
  private async restoreCompositeAsPrimary(
    entityId: string,
    deviceId: string,
  ): Promise<void> {
    const candidate = this.getCompositeCandidate(entityId);
    const primaryEntityId =
      candidate?.config?.primary_entity ??
      candidate?.members.find((member) => member.entityId.startsWith("camera."))
        ?.entityId ??
      candidate?.members.find((member) =>
        member.entityId.startsWith("humidifier."),
      )?.entityId ??
      candidate?.members.find((member) => member.entityId.startsWith("lock."))
        ?.entityId ??
      candidate?.members.find((member) => member.entityId.startsWith("fan."))
        ?.entityId ??
      candidate?.members[0]?.entityId ??
      entityId;

    this.exportedDevices.delete(this.compositeStorageKey(deviceId));
    if (candidate)
      candidate.members.forEach((member) =>
        this.exportedDevices.delete(member.entityId),
      );
    this.exportedDevices.add(primaryEntityId);
    await this.activateEntity(primaryEntityId);
    this.log.warn(
      `Composite Matter node for device ${deviceId} is unavailable; preserved the existing paired endpoint ${primaryEntityId}.`,
    );
  }

  private async activateComposite(
    entityId: string,
    forceRecreate = false,
  ): Promise<void> {
    const candidate = this.getCompositeCandidate(entityId);
    if (!candidate) return this.activateEntity(entityId, forceRecreate);
    if (this.compositeDevices.has(candidate.deviceId) && !forceRecreate) return;

    const info = this.getHaRegistryInfo(entityId);
    const nodeName =
      candidate.config?.friendly_name ||
      candidate.config?.name ||
      info.device_name ||
      this.entities.get(entityId)?.state.attributes.friendly_name ||
      entityId;
    // Discovery can run again after a Home Assistant reconnect. Matterbridge
    // retains the already commissioned ServerNode, so registering another
    // endpoint with the same name is rejected. Reuse that live node instead,
    // UNLESS this is an explicit factory reset (forceRecreate = true).
    if (!forceRecreate) {
      const existingEndpoint = this.getDeviceByName(nodeName);
      if (existingEndpoint?.serverNode) {
        const composite = new CompositeDeviceEntity(
          this,
          candidate.deviceId,
          nodeName,
          candidate.members,
          candidate.config?.primary_entity,
        );
        composite.adoptEndpoint(existingEndpoint);
        this.compositeDevices.set(candidate.deviceId, composite);
        this.matterbridgeDevices.set(
          this.compositeStorageKey(candidate.deviceId),
          existingEndpoint,
        );
        candidate.members.forEach((member) =>
          this.compositeMembership.set(member.entityId, candidate.deviceId),
        );
        await composite.syncInitialState();
        this.log.notice(
          `Reused existing Matter node ${idn}${nodeName}${rs}; it remains paired and was not recreated.`,
        );
        return;
      }
    }

    const composite = new CompositeDeviceEntity(
      this,
      candidate.deviceId,
      nodeName,
      candidate.members,
      candidate.config?.primary_entity,
    );
    const endpoint = await composite.createEndpoint();
    await this.registerDevice(endpoint);
    const serverNode = (endpoint as any).serverNode;
    if (!serverNode) {
      await this.unregisterDevice(endpoint).catch(() => undefined);
      throw new Error(
        `Matter server node was not created for device ${candidate.deviceId}.`,
      );
    }
    if (!serverNode.lifecycle?.isOnline) await serverNode.start();
    // Atomic verification: verify that all member endpoints exist and root is online
    for (const member of candidate.members) {
      const ep = composite.endpoints.get(member.entityId);
      if (!ep) {
        throw new Error(
          `Composite member ${member.entityId} was not created in composite device ${nodeName}.`,
        );
      }
    }

    this.compositeDevices.set(candidate.deviceId, composite);
    this.matterbridgeDevices.set(
      this.compositeStorageKey(candidate.deviceId),
      endpoint,
    );
    candidate.members.forEach((member) =>
      this.compositeMembership.set(member.entityId, candidate.deviceId),
    );
    await composite.syncInitialState();
    const primaryState = this.entities.get(composite.primaryEntityId)?.state;
    if (primaryState && isUnavailable(primaryState)) {
      void (composite as any).setReachability?.(false);
    }
    this.log.notice(
      `Exported composite Matter device ${idn}${nodeName}${rs} with endpoints: ${candidate.members.map((member) => member.entityId).join(", ")}`,
    );
  }

  /** Create a bridged endpoint and let Matterbridge own its lifecycle. */
  private async activateEntity(
    entityId: string,
    forceRecreate = false,
  ): Promise<void> {
    if (this.matterbridgeDevices.has(entityId) && !forceRecreate) return;
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} was not discovered.`);

    if (entityId.startsWith("camera.")) {
      const cameraEntity = entity as CameraEntity;
      const record = this.getOrCreateHomeKitCameraRecord(entityId);
      const homekitAcc = await cameraEntity.setupHomeKitAccessory(record);
      await homekitAcc.publish();
      record.published = true;
      record.strategy =
        cameraEntity.capabilities?.strategy || "passthrough_h264";
      record.state = cameraEntity.state?.state || "idle";
      await this.saveHomeKitCameraRecords();
      this.exportedDevices.add(entityId);
      this.log.notice(
        `Exported HomeKit standalone camera accessory for ${idn}${entityId}${rs} (port ${record.port}, PIN: ${record.pincode})`,
      );
      return;
    }

    try {
      const endpoint = await entity.createEndpoint();
      if (!forceRecreate) {
        const existingEndpoint = endpoint.uniqueId
          ? this.getDeviceByUniqueId(endpoint.uniqueId)
          : endpoint.deviceName
            ? this.getDeviceByName(endpoint.deviceName)
            : undefined;
        if (existingEndpoint?.serverNode) {
          entity.adoptEndpoint(existingEndpoint);
          this.matterbridgeDevices.set(entityId, existingEndpoint);
          await entity.syncInitialState();
          if (isUnavailable(entity.state)) {
            void (entity as any).setReachability?.(false);
          }
          this.log.notice(
            `Reused existing Matter endpoint ${idn}${entityId}${rs}; it remains paired and was not recreated.`,
          );
          return;
        }
      }
      await this.registerDevice(endpoint);
      // Matterbridge creates the ServerNode during registerDevice(), but nodes
      // added dynamically after the initial startup interval are not started
      // by that interval. Start this node explicitly so its commissionable
      // mDNS record (_matterc._udp) is present before showing its QR code.
      const serverNode = (endpoint as any).serverNode;
      if (!serverNode) {
        throw new Error(`Matter server node was not created for ${entityId}.`);
      }
      if (!serverNode.lifecycle?.isOnline) {
        await serverNode.start();
      }
      this.matterbridgeDevices.set(entityId, endpoint);
      await entity.syncInitialState();
      if (isUnavailable(entity.state)) {
        void (entity as any).setReachability?.(false);
      }
      this.log.notice(`Exported bridged endpoint ${idn}${entityId}${rs}`);
    } catch (err) {
      this.log.error(`Failed to activate entity ${entityId}: ${err}`);
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo publicar el accesorio Matter: ${String(err)}`,
      );
      throw err;
    }
  }

  /** Create an MQTT bridged endpoint and let Matterbridge own its lifecycle. */
  public async activateMqttEntity(entityId: string): Promise<void> {
    if (this.matterbridgeDevices.has(entityId)) return;
    const entity = this.mqttEntities.get(entityId);
    if (!entity) throw new Error(`MQTT Entity ${entityId} was not discovered.`);

    try {
      const endpoint = await entity.createEndpoint();
      const existingEndpoint = endpoint.uniqueId
        ? this.getDeviceByUniqueId(endpoint.uniqueId)
        : endpoint.deviceName
          ? this.getDeviceByName(endpoint.deviceName)
          : undefined;
      if (existingEndpoint?.serverNode) {
        entity.adoptEndpoint(existingEndpoint);
        this.matterbridgeDevices.set(entityId, existingEndpoint);
        await entity.syncInitialState();
        this.log.notice(
          `Reused existing Matter endpoint ${idn}${entityId}${rs}; it remains paired.`,
        );
        return;
      }
      await this.registerDevice(endpoint);
      const serverNode = (endpoint as any).serverNode;
      if (!serverNode) {
        throw new Error(`Matter server node was not created for ${entityId}.`);
      }
      if (!serverNode.lifecycle?.isOnline) {
        await serverNode.start();
      }
      this.matterbridgeDevices.set(entityId, endpoint);
      await entity.syncInitialState();
      this.log.notice(`Exported bridged MQTT endpoint ${idn}${entityId}${rs}`);
    } catch (err) {
      this.log.error(`Failed to activate MQTT entity ${entityId}: ${err}`);
      throw err;
    }
  }

  /**
   * Manually export an entity as an Accessory and save to config.
   */
  public async manualRegister(
    entityId: string,
  ): Promise<{ success: boolean; error?: string; pairingCode?: string | null; manualPairingCode?: string | null }> {
    if (entityId.startsWith("mqtt.")) {
      try {
        this.exportedDevices.add(entityId);
        await this.activateMqttEntity(entityId);
        await this.saveExportedDevices();
        this.log.notice(
          `Manually exported bridged MQTT endpoint for ${entityId}`,
        );
        return { success: true };
      } catch (err) {
        this.exportedDevices.delete(entityId);
        this.log.error(
          `Failed to manually register MQTT entity ${entityId}: ${err}`,
        );
        return { success: false, error: String(err) };
      }
    }
    if (!this.entities.has(entityId)) {
      return { success: false, error: "Device not found in discovery." };
    }
    if (this.isAuxiliaryEntity(entityId)) {
      return {
        success: false,
        error:
          "This is an auxiliary action of the main device and cannot be exported independently.",
      };
    }
    // DPS generic entities are display-only datapoints; they cannot be published.
    if (this.isDpsGenericEntity(entityId)) {
      return {
        success: false,
        error:
          "Esta entidad es un datapoint genérico DPS y no se puede publicar en Matter.",
      };
    }
    const deviceId = (this.ha as any).hassEntities?.get(entityId)?.device_id;
    // Multi-switch: each canal is registered as an independent Matter accessory.
    // Skip the composite path entirely so every switch gets its own QR code.
    const isMultiSwitch = deviceId ? this.isMultiSwitchDevice(deviceId) : false;
    try {
      const composite = isMultiSwitch
        ? undefined
        : this.getCompositeCandidate(entityId);
      if (composite) {
        const key = this.compositeStorageKey(composite.deviceId);
        this.exportedDevices.add(key);
        composite.members.forEach((member) =>
          this.exportedDevices.delete(member.entityId),
        );
        try {
          await this.activateComposite(entityId);
          await this.saveExportedDevices();
          // Return the pairing code immediately so the frontend can show the QR
          // without waiting for the next /api/custom/devices poll.
          const compositeEndpoint = this.matterbridgeDevices.get(key);
          const connection = compositeEndpoint
            ? this.getMatterConnectionInfo(compositeEndpoint)
            : null;
          return {
            success: true,
            pairingCode: connection?.pairingCode ?? null,
            manualPairingCode: connection?.manualPairingCode ?? null,
          };
        } catch (error) {
          this.exportedDevices.delete(key);
          throw error;
        }
      }
      this.exportedDevices.add(entityId);
      await this.activateEntity(entityId);
      await this.saveExportedDevices();
      this.log.notice(
        `Manually exported bridged endpoint for ${entityId}${isMultiSwitch ? " (multi-switch: independent QR)" : ""}`,
      );
      return { success: true };
    } catch (err) {
      this.exportedDevices.delete(entityId);
      this.log.error(`Failed to manually register ${entityId}: ${err}`);
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo publicar manualmente: ${String(err)}`,
      );
      return { success: false, error: String(err) };
    }
  }

  /**
   * Manually unregister an Accessory and save to config.
   */
  public async manualUnregister(
    entityId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (entityId.startsWith("mqtt.")) {
        this.exportedDevices.delete(entityId);
        const endpoint = this.matterbridgeDevices.get(entityId);
        if (endpoint) {
          const serverNode = (endpoint as any).serverNode;
          if (serverNode?.lifecycle?.isOnline) {
            await serverNode.close();
          }
          await this.unregisterDevice(endpoint);
          this.matterbridgeDevices.delete(entityId);
        }
        await this.saveExportedDevices();
        this.log.notice(`Manually unregistered MQTT endpoint ${entityId}`);
        return { success: true };
      }

      if (entityId.startsWith("camera.")) {
        this.exportedDevices.delete(entityId);
        const cameraEntity = this.entities.get(entityId) as
          CameraEntity | undefined;
        if (cameraEntity?.homekitAccessory) {
          await cameraEntity.homekitAccessory.unpublish();
        }
        const record = this.homekitCameraRecords.get(entityId);
        if (record) {
          record.published = false;
          await this.saveHomeKitCameraRecords();
        }
        await this.saveExportedDevices();
        this.log.notice(`Manually unregistered HomeKit camera ${entityId}`);
        return { success: true };
      }

      const compositeDeviceId =
        this.compositeMembership.get(entityId) ??
        this.getCompositeCandidate(entityId)?.deviceId;
      if (compositeDeviceId) {
        const key = this.compositeStorageKey(compositeDeviceId);
        this.exportedDevices.delete(key);
        const candidate = this.getCompositeCandidate(entityId);
        candidate?.members.forEach((member) =>
          this.exportedDevices.delete(member.entityId),
        );
        // A reconnect can reuse a Matterbridge-owned node before this process
        // has a CompositeDeviceEntity wrapper for it. It still needs the same
        // teardown path; otherwise an old node remains advertised forever.
        await this.disposeCompositeNode(compositeDeviceId);
        await this.saveExportedDevices();
        return { success: true };
      }
      this.exportedDevices.delete(entityId);
      const endpoint = this.matterbridgeDevices.get(entityId);
      if (endpoint) {
        // Server-mode endpoints are not stopped by Matterbridge's dynamic
        // unregister path. Close this node first to avoid stale mDNS records.
        const serverNode = (endpoint as any).serverNode;
        if (serverNode?.lifecycle?.isOnline) {
          await serverNode.close();
        }
        await this.unregisterDevice(endpoint);
        this.matterbridgeDevices.delete(entityId);
      }
      await this.saveExportedDevices();
      this.log.notice(`Removed bridged endpoint for ${entityId}`);
      return { success: true };
    } catch (err) {
      this.log.error(`Failed to manually unregister ${entityId}: ${err}`);
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo retirar el accesorio: ${String(err)}`,
      );
      return { success: false, error: String(err) };
    }
  }

  /** Stop and unregister a composite node while keeping its export selection. */
  private async disposeCompositeNode(deviceId: string): Promise<void> {
    const key = this.compositeStorageKey(deviceId);
    const endpoint = this.matterbridgeDevices.get(key) as any;
    if (endpoint?.serverNode?.lifecycle?.isOnline)
      await endpoint.serverNode.close();
    if (endpoint) await this.unregisterDevice(endpoint);
    this.matterbridgeDevices.delete(key);

    const members =
      this.compositeDevices.get(deviceId)?.members ??
      Array.from(this.compositeMembership.entries())
        .filter(([, memberDeviceId]) => memberDeviceId === deviceId)
        .map(([memberId]) => ({ entityId: memberId }));
    members.forEach((member) =>
      this.compositeMembership.delete(member.entityId),
    );
    this.compositeDevices.delete(deviceId);
  }

  /**
   * Factory-reset an accessory and rebuild its endpoint tree from the latest
   * Home Assistant capabilities. Matter descriptors are immutable after
   * commissioning, so erasing fabrics alone cannot add ColorControl to a
   * light that was first published as on/off-only.
   */
  public async resetMatterAccessory(entityId: string): Promise<{
    success: boolean;
    error?: string;
    pairingCode?: string | null;
    manualPairingCode?: string | null;
  }> {
    const compositeDeviceId =
      this.compositeMembership.get(entityId) ??
      this.getCompositeCandidate(entityId)?.deviceId;
    const endpoint = this.getMatterEndpointForEntity(
      entityId,
      compositeDeviceId,
    );
    const serverNode = endpoint?.serverNode;
    if (!endpoint || !serverNode) {
      return {
        success: false,
        error:
          "El accesorio Matter no está activo o su nodo aún no está listo.",
      };
    }

    try {
      const storeId = String(endpoint.deviceName ?? "").replace(/[ .]/g, "");

      // 1. In-memory cleanup before stopping the node
      if (serverNode) {
        try {
          if (typeof (serverNode as any).resetStorage === "function") {
            await (serverNode as any).resetStorage();
          }
        } catch (e) {
          this.log.debug(`[Reset] ServerNode resetStorage: ${e}`);
        }
      }

      // 2. Shut down and unregister the old endpoint
      if (compositeDeviceId) {
        await this.disposeCompositeNode(compositeDeviceId);
      } else {
        if (serverNode.lifecycle?.isOnline) await serverNode.close();
        await this.unregisterDevice(endpoint);
        this.matterbridgeDevices.delete(entityId);
      }

      // 3. Purge all persisted storage folders for this node from disk
      const candidates = [
        (this.matterbridge as any).matterbridgeDirectory,
        path.join(process.env.HOME || "/root", ".matterbridge"),
        "/data/.matterbridge",
        "/data",
        "/root/.matterbridge",
      ].filter(Boolean) as string[];

      const possibleIds = new Set<string>(
        [
          storeId,
          String(endpoint.deviceName ?? "").replace(/[ .]/g, ""),
          String((endpoint as any).name ?? "").replace(/[ .]/g, ""),
          String(endpoint.id ?? "").replace(/[ .]/g, ""),
          (serverNode as any).id,
        ].filter(Boolean),
      );

      if (compositeDeviceId) {
        possibleIds.add(compositeDeviceId.replace(/[ .]/g, ""));
        possibleIds.add(`device_${compositeDeviceId}`);
      }

      for (const baseDir of candidates) {
        const storageDir = path.join(baseDir, "matterstorage");
        if (!fsSync.existsSync(storageDir)) continue;
        try {
          const dirs = await fs.readdir(storageDir);
          for (const d of dirs) {
            const match = Array.from(possibleIds).some(
              (id) =>
                d.toLowerCase() === id.toLowerCase() ||
                (id.length > 5 && d.toLowerCase().includes(id.toLowerCase())),
            );
            if (match) {
              const fullPath = path.join(storageDir, d);
              await fs.rm(fullPath, { recursive: true, force: true });
              this.log.notice(`[Reset] Purged storage folder: ${fullPath}`);
            }
          }
        } catch (err) {
          this.log.debug(`[Reset] Storage scan error for ${storageDir}: ${err}`);
        }
      }

      // 4. Legacy storage service context clear
      const bridgeRuntime = this.matterbridge as any;
      const managedStorage =
        bridgeRuntime.serverNodeStorageManagers?.get?.(storeId);
      const storageService = bridgeRuntime.matterStorageService;
      const storageManager =
        managedStorage ?? (await storageService?.open?.(storeId));
      try {
        await storageManager?.createContext?.("persist")?.clearAll?.();
        await storageManager?.createContext?.("fabrics")?.clearAll?.();
        await storageManager?.createContext?.("commissioning")?.clearAll?.();
        await storageManager
          ?.createContext?.("operationalCredentials")
          ?.clearAll?.();
      } finally {
        if (!managedStorage) await storageManager?.close?.();
      }

      if (compositeDeviceId) {
        await this.activateComposite(entityId, true);
      } else {
        await this.activateEntity(entityId, true);
      }
      this.clearMatterAccessoryProblems(entityId, compositeDeviceId);

      // Actively wait for the new serverNode to come online and return its QR immediately
      const newEndpoint = this.getMatterEndpointForEntity(
        entityId,
        compositeDeviceId,
      );
      let connection = newEndpoint
        ? this.getMatterConnectionInfo(newEndpoint)
        : undefined;
      if (!connection?.pairingCode && newEndpoint) {
        for (let attempt = 0; attempt < 30; attempt++) {
          await new Promise((r) => setTimeout(r, 200));
          connection = this.getMatterConnectionInfo(newEndpoint);
          if (connection?.pairingCode) break;
        }
      }

      this.log.notice(
        `Matter factory reset and capability rebuild completed for ${idn}${compositeDeviceId ? `device:${compositeDeviceId}` : entityId}${rs}`,
      );
      this.recordEntityDiagnostic(
        entityId,
        `✓ Accesorio desvinculado de todas las casas. Nuevo código QR generado.`,
        "info",
      );
      this.pushEntityUpdate(entityId);
      return {
        success: true,
        pairingCode: connection?.pairingCode ?? null,
        manualPairingCode: connection?.manualPairingCode ?? null,
      };
    } catch (error) {
      this.log.error(
        `Failed to factory reset Matter accessory ${entityId}: ${error}`,
      );
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo restablecer Matter: ${String(error)}`,
      );
      return { success: false, error: String(error) };
    }
  }

  /** Refresh a single node's Matter advertisement without removing fabrics. */
  public async refreshMatterAccessory(
    entityId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const compositeDeviceId =
      this.compositeMembership.get(entityId) ??
      this.getCompositeCandidate(entityId)?.deviceId;
    const endpoint = this.getMatterEndpointForEntity(
      entityId,
      compositeDeviceId,
    );
    const serverNode = endpoint?.serverNode;
    if (!endpoint || !serverNode) {
      return {
        success: false,
        error:
          "El accesorio Matter no está activo o su nodo aún no está listo.",
      };
    }
    try {
      const composite = compositeDeviceId
        ? this.compositeDevices.get(compositeDeviceId)
        : undefined;
      const entitiesToSync = composite
        ? composite.members.map((member) => this.entities.get(member.entityId))
        : [this.entities.get(entityId)];
      await Promise.all(
        entitiesToSync.map(async (entity) => {
          await entity?.syncInitialState?.();
          if (entity && typeof (entity as any).setReachability === "function") {
            const isAvail = !isUnavailable(entity.state);
            void (entity as any).setReachability(isAvail);
          }
        }),
      );
      // `close()` permanently disposes a Matter.js ServerNode and cannot be
      // followed by start(). A soft reset refreshes its live operational state
      // and sessions without deleting fabrics or the pairing credentials.
      await serverNode.reset();
      await serverNode.start();
      this.clearMatterAccessoryProblems(entityId, compositeDeviceId);
      this.recordEntityDiagnostic(
        entityId,
        "Sincronización completada: estado de Home Assistant reaplicado y nodo Matter reiniciado.",
        "info",
      );
      this.pushEntityUpdate(entityId);
      this.log.notice(
        `Matter connection refresh requested for ${idn}${compositeDeviceId ? `device:${compositeDeviceId}` : entityId}${rs}`,
      );
      return { success: true };
    } catch (error) {
      this.log.error(
        `Failed to refresh Matter accessory ${entityId}: ${error}`,
      );
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo actualizar el estado Matter: ${String(error)}`,
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Reset HomeKit camera pairing: unpublishes the HAP accessory, regenerates MAC/setupID/PIN,
   * updates persisted records, and republishes the accessory as fresh so it can be added to another home.
   */
  public async resetCameraPairing(entityId: string): Promise<{
    success: boolean;
    error?: string;
    record?: HomeKitCameraStorageRecord;
    setupUri?: string;
  }> {
    try {
      if (entityId.startsWith("scrypted.")) {
        const cameraId = entityId.substring("scrypted.".length);
        let acc = ScryptedHomeKitBridge.getAccessory(cameraId);
        if (!acc) {
          const store = await ScryptedStorage.load();
          const cam = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId,
          );
          if (cam) {
            await ScryptedHomeKitBridge.mountCamera(this, cam);
            acc = ScryptedHomeKitBridge.getAccessory(cameraId);
          }
        }
        if (!acc) {
          return {
            success: false,
            error: `Cámara Scrypted "${cameraId}" no encontrada.`,
          };
        }

        const newRecord = await acc.resetPairing();
        this.homekitCameraRecords.set(entityId, newRecord);
        await this.saveHomeKitCameraRecords();

        const store = await ScryptedStorage.load();
        const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
        if (cam) {
          cam.identity.homeKitSetupUri = acc.setupUri;
          cam.identity.homeKitPincode = newRecord.pincode;
          cam.identity.homeKitSetupId = newRecord.setupId;
          cam.identity.homeKitPort = newRecord.port;
          cam.identity.homeKitPairingState = "not_paired";
          await ScryptedStorage.save(store);
        }

        this.log.notice(
          `[ScryptedHomeKit] Reset HomeKit pairing for ${entityId}: New port ${newRecord.port}, setupId ${newRecord.setupId}, URI ${acc.setupUri}`,
        );

        return {
          success: true,
          record: newRecord,
          setupUri: acc.setupUri,
        };
      }

      if (entityId.startsWith("cameraui.") || entityId.startsWith("camera.cameraui_")) {
        const cameraId = entityId.startsWith("cameraui.")
          ? entityId.substring("cameraui.".length)
          : entityId.substring("camera.".length);
        let acc = CameraUiHomeKitBridge.getAccessory(cameraId);
        if (!acc) {
          const store = await CameraUiStorage.load();
          const cam = store.cameras.find((c) => c.id === cameraId);
          if (cam) {
            await CameraUiHomeKitBridge.mountCamera(this, cam);
            acc = CameraUiHomeKitBridge.getAccessory(cameraId);
          }
        }
        if (!acc) {
          return {
            success: false,
            error: `Cámara Camera.UI "${cameraId}" no encontrada.`,
          };
        }

        const newRecord = await acc.resetPairing();
        const store = await CameraUiStorage.load();
        const cam = store.cameras.find((c) => c.id === cameraId);
        if (cam) {
          cam.setupUri = acc.setupUri;
          cam.pincode = newRecord.pincode;
          cam.setupId = newRecord.setupId;
          cam.port = newRecord.port;
          cam.isPaired = false;
          await CameraUiStorage.save(store);
        }

        this.log.notice(
          `[CameraUiHomeKit] Reset HomeKit pairing for ${entityId}: New port ${newRecord.port}, setupId ${newRecord.setupId}, URI ${acc.setupUri}`,
        );

        return {
          success: true,
          record: newRecord,
          setupUri: acc.setupUri,
        };
      }

      const cameraEntity = this.entities.get(entityId) as
        CameraEntity | undefined;
      if (!cameraEntity) {
        return {
          success: false,
          error: "Camera entity not found in discovery.",
        };
      }
      if (!cameraEntity.homekitAccessory) {
        const record = this.getOrCreateHomeKitCameraRecord(entityId);
        await cameraEntity.setupHomeKitAccessory(record);
      }
      const newRecord = await cameraEntity.homekitAccessory!.resetPairing();
      this.homekitCameraRecords.set(entityId, newRecord);
      await this.saveHomeKitCameraRecords();
      this.log.notice(
        `Reset HomeKit pairing for ${entityId}: New PIN ${newRecord.pincode}, port ${newRecord.port}, MAC ${newRecord.username}`,
      );
      this.pushEntityUpdate(entityId);
      return {
        success: true,
        record: newRecord,
        setupUri: cameraEntity.homekitAccessory?.setupUri,
      };
    } catch (err) {
      this.log.error(`Failed to reset camera pairing for ${entityId}: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  /** Save an explicit camera-to-motion-sensor link for MQTT/cloud cameras. */
  public async setCameraMotionSensor(
    entityId: string,
    motionEntityId?: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!entityId.startsWith("camera.") || !this.entities.has(entityId)) {
      return { success: false, error: "Camera entity not found." };
    }
    if (
      motionEntityId &&
      (!motionEntityId.startsWith("binary_sensor.") ||
        !this.ha.hassStates.has(motionEntityId))
    ) {
      return { success: false, error: "Choose an existing binary_sensor." };
    }
    const record = this.getOrCreateHomeKitCameraRecord(entityId);
    record.motionEntityId = motionEntityId || undefined;
    record.lastUpdated = new Date().toISOString();
    await this.saveHomeKitCameraRecords();
    this.pushEntityUpdate(entityId);
    return { success: true };
  }

  /** Toggle HKSV recording support for a camera accessory. */
  public async toggleCameraHksv(
    entityId: string,
    enabled: boolean,
  ): Promise<{
    success: boolean;
    error?: string;
    record?: HomeKitCameraStorageRecord;
  }> {
    try {
      const record = this.homekitCameraRecords.get(entityId);
      if (!record) {
        return {
          success: false,
          error: `Camera record not found for ${entityId}`,
        };
      }
      record.hksvEnabled = enabled;
      record.hksvState = enabled
        ? record.hksvVerified
          ? "verified"
          : "waiting_hub"
        : "configurable";
      await this.saveHomeKitCameraRecords();
      this.pushEntityUpdate(entityId);
      return { success: true, record };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }

  /** Open basic commissioning window on a node for multi-admin pairing. */
  public async openMatterCommissioningWindow(entityId: string): Promise<{
    success: boolean;
    error?: string;
    pairingCode?: string | null;
    manualPairingCode?: string | null;
    windowTimeout?: number;
  }> {
    const compositeDeviceId =
      this.compositeMembership.get(entityId) ??
      this.getCompositeCandidate(entityId)?.deviceId;
    let endpoint = this.getMatterEndpointForEntity(
      entityId,
      compositeDeviceId,
    );
    let serverNode = endpoint?.serverNode;
    if (!serverNode && (this.matterbridge as any)?.serverNode) {
      serverNode = (this.matterbridge as any).serverNode;
      endpoint = this.matterbridge;
    }
    if (!endpoint || !serverNode) {
      return {
        success: false,
        error:
          "El accesorio Matter no está activo o su nodo aún no está listo.",
      };
    }
    try {
      let opened = false;

      // 1. Try Matter.js ServerNode behavior via agent transaction
      if (typeof (serverNode as any).act === "function") {
        try {
          await (serverNode as any).act(async (agent: any) => {
            const comm =
              agent.commissioning ??
              agent.commissioningServer ??
              agent.behaviors?.commissioning;
            if (comm && typeof comm.enterCommissionableMode === "function") {
              await comm.enterCommissionableMode();
              opened = true;
            }
          });
        } catch (actErr) {
          this.log.debug(`Agent enterCommissionableMode threw: ${actErr}`);
        }
      }

      // 2. Direct DeviceCommissioner call if agent didn't handle it
      if (!opened) {
        try {
          const { DeviceCommissioner } = (await import("@matter/protocol" as any)) as any;
          const commissioner = (serverNode as any).env?.get?.(
            DeviceCommissioner,
          );
          if (
            commissioner &&
            typeof commissioner.allowBasicCommissioning === "function"
          ) {
            await commissioner.allowBasicCommissioning();
            opened = true;
          }
        } catch (envErr) {
          this.log.debug(`Direct allowBasicCommissioning threw: ${envErr}`);
        }
      }

      if (!opened) {
        throw new Error(
          "No se pudo iniciar el modo emparejable en el nodo Matter.",
        );
      }

      const connection = this.getMatterConnectionInfo(endpoint);
      const timestamp = new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.recordEntityDiagnostic(
        entityId,
        `✓ Ventana de emparejamiento (Multi-Admin) abierta a las ${timestamp} por 15 min. Listo para escanear en Google Home, Alexa o Apple Home.`,
        "info",
      );
      this.pushEntityUpdate(entityId);

      this.log.notice(
        `Commissioning window opened for ${idn}${compositeDeviceId ? `device:${compositeDeviceId}` : entityId}${rs}`,
      );

      return {
        success: true,
        pairingCode: connection.pairingCode,
        manualPairingCode: connection.manualPairingCode,
        windowTimeout: 900,
      };
    } catch (error) {
      this.log.error(
        `Failed to open commissioning window for ${entityId}: ${error}`,
      );
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo abrir la ventana de emparejamiento Matter: ${String(error)}`,
      );
      return { success: false, error: String(error) };
    }
  }

  /** Remove a specific fabric from a node without resetting everything. */
  public async removeMatterFabric(
    entityId: string,
    fabricIndexOrIdStr: string,
  ): Promise<{
    success: boolean;
    error?: string;
    remainingFabrics?: number;
    pairingCode?: string | null;
    manualPairingCode?: string | null;
  }> {
    const compositeDeviceId =
      this.compositeMembership.get(entityId) ??
      this.getCompositeCandidate(entityId)?.deviceId;
    const endpoint = this.getMatterEndpointForEntity(
      entityId,
      compositeDeviceId,
    );
    const serverNode = endpoint?.serverNode;
    if (!endpoint || !serverNode) {
      return {
        success: false,
        error:
          "El accesorio Matter no está activo o su nodo aún no está listo.",
      };
    }
    try {
      const targetStr = String(fabricIndexOrIdStr).trim();
      const targetNum = Number(targetStr);
      let removed = false;

      const nodeState = serverNode.state as any;
      const liveFabricSource =
        nodeState.operationalCredentials?.fabrics ??
        nodeState.operationalCredentialsServer?.fabrics ??
        endpoint?.serverNode?.behaviors?.operationalCredentials?.state
          ?.fabrics ??
        nodeState.commissioning?.fabrics;

      let rawFabrics: any[] = [];
      if (liveFabricSource !== undefined && liveFabricSource !== null) {
        rawFabrics = Array.isArray(liveFabricSource)
          ? liveFabricSource
          : Object.values(liveFabricSource);
      }

      // If only 1 fabric exists or none, removing it is a full reset
      if (rawFabrics.length <= 1) {
        return await this.resetMatterAccessory(entityId);
      }

      const matchedFabric = rawFabrics.find(
        (f: any) =>
          String(f?.fabricIndex) === targetStr ||
          String(f?.fabricId) === targetStr ||
          Number(f?.fabricIndex) === targetNum,
      );

      const fabricIndex =
        matchedFabric && matchedFabric.fabricIndex !== undefined
          ? Number(matchedFabric.fabricIndex)
          : targetNum <= 254 && targetNum > 0
            ? targetNum
            : 1;

      // 1. Try deleting fabric directly via dynamic import of FabricManager if available
      try {
        const { FabricManager } = (await import("@matter/protocol" as any)) as any;
        const fabricManager = (serverNode as any).env?.get?.(FabricManager);
        if (fabricManager) {
          let fabric = fabricManager.maybeFor(fabricIndex);
          if (!fabric) {
            for (const f of fabricManager.fabrics ?? []) {
              if (
                Number(f.fabricIndex) === targetNum ||
                String(f.fabricId) === targetStr ||
                String(f.fabricIndex) === targetStr
              ) {
                fabric = f;
                break;
              }
            }
          }
          if (fabric) {
            this.log.notice(
              `[removeFabric] Deleting fabric ${fabric.fabricIndex} (id: ${fabric.fabricId}) from ${entityId}`,
            );
            await fabric.delete();
            removed = true;
          }
        }
      } catch (err) {
        this.log.debug(
          `[removeFabric] Direct FabricManager dynamic import: ${err}`,
        );
      }

      // 2. Fallback to ServerNode behavior removal via agent transaction
      if (!removed && typeof (serverNode as any).act === "function") {
        try {
          await (serverNode as any).act(async (agent: any) => {
            const opCreds =
              agent.operationalCredentials ??
              agent.behaviors?.operationalCredentials;
            if (opCreds?.removeFabric) {
              await opCreds.removeFabric({ fabricIndex });
              removed = true;
            }
          });
        } catch {
          // If transaction fails, fallback to reset
        }
      }

      const connection = this.getMatterConnectionInfo(endpoint);
      if (connection.fabricCount === 0 || !removed) {
        return await this.resetMatterAccessory(entityId);
      }

      const controllerName = matchedFabric
        ? (MATTER_CONTROLLER_VENDORS[
            matchedFabric.rootNodeId?.vendorId ??
              matchedFabric.rootPartnerNodeId?.vendorId ??
              0
          ] ?? "Controlador Matter")
        : "Controlador Matter";
      const timestamp = new Date().toLocaleTimeString("es-MX", {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.recordEntityDiagnostic(
        entityId,
        `✓ Desconectado de ${controllerName} a las ${timestamp}. Fabrics restantes: ${connection.fabricCount}.`,
        "info",
      );
      this.pushEntityUpdate(entityId);
      return {
        success: true,
        remainingFabrics: connection.fabricCount,
        pairingCode: connection.pairingCode,
        manualPairingCode: connection.manualPairingCode,
      };
    } catch (error) {
      this.log.notice(
        `Resetting Matter accessory ${entityId} on fabric removal: ${error}`,
      );
      return await this.resetMatterAccessory(entityId);
    }
  }

  /** A successful connection or state sync means the accessory is healthy again. */
  private clearMatterAccessoryProblems(
    entityId: string,
    compositeDeviceId?: string,
  ) {
    if (compositeDeviceId) {
      const composite = this.compositeDevices.get(compositeDeviceId);
      composite?.members.forEach((member) =>
        this.clearEntityProblem(member.entityId),
      );
      return;
    }
    this.clearEntityProblem(entityId);
  }

  private async saveExportedDevices() {
    try {
      await fs.writeFile(
        "/data/exported-devices.json",
        JSON.stringify(Array.from(this.exportedDevices)),
        "utf8",
      );
    } catch (err) {
      this.log.error(`Failed to save exported-devices.json: ${err}`);
    }
  }

  /** Broadcast an entity state update to all connected SSE clients. */
  private pushEntityUpdate(entityId: string): void {
    if (this.sseSubscribers.size === 0) return;
    try {
      const compositeDeviceId =
        this.compositeMembership.get(entityId) ??
        this.getCompositeCandidate(entityId)?.deviceId;
      const endpoint = this.getMatterEndpointForEntity(
        entityId,
        compositeDeviceId,
      );
      const connection = endpoint
        ? this.getMatterConnectionInfo(endpoint)
        : undefined;
      const entity = this.entities.get(entityId);
      if (!entity) return;
      const payload = JSON.stringify({
        entityId,
        commissioned: connection?.commissioned ?? false,
        pairingCode: connection?.pairingCode ?? null,
        manualPairingCode: connection?.manualPairingCode ?? null,
        fabricCount: connection?.fabricCount ?? 0,
        matterFabrics: connection?.fabrics ?? [],
        homeName: connection?.homeName ?? null,
        exported:
          this.exportedDevices.has(entityId) ||
          (compositeDeviceId
            ? this.exportedDevices.has(
                this.compositeStorageKey(compositeDeviceId),
              )
            : false),
      });
      const msg = `data: ${payload}\n\n`;
      for (const sub of this.sseSubscribers) {
        if (sub.destroyed || sub.writableEnded) {
          this.sseSubscribers.delete(sub);
          continue;
        }
        try {
          sub.write(msg);
        } catch {
          this.sseSubscribers.delete(sub);
        }
      }
    } catch {
      // non-critical
    }
  }

  /** Broadcast an arbitrary event message to all connected SSE clients. */
  private broadcastSseMessage(
    type: string,
    data: Record<string, unknown>,
  ): void {
    if (this.sseSubscribers.size === 0) return;
    try {
      const msg = `data: ${JSON.stringify({ type, ...data })}\n\n`;
      for (const sub of this.sseSubscribers) {
        if (sub.destroyed || sub.writableEnded) {
          this.sseSubscribers.delete(sub);
          continue;
        }
        try {
          sub.write(msg);
        } catch {
          this.sseSubscribers.delete(sub);
        }
      }
    } catch {
      // non-critical
    }
  }

  private async saveDeviceOverrides() {
    try {
      await fs.writeFile(
        "/data/device-overrides.json",
        JSON.stringify(this.deviceOverrides, null, 2),
        "utf8",
      );
    } catch (err) {
      this.log.error(`Failed to save device-overrides.json: ${err}`);
    }
  }

  public async setDeviceProfile(
    entityId: string,
    profileId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const entity = this.entities.get(entityId);
    if (!entity)
      return { success: false, error: "Device not found in discovery." };
    const [domain] = entityId.split(".");
    if (
      !getExportProfile(domain, profileId) ||
      !(MatterDeviceTypes as any)[profileId]
    ) {
      return {
        success: false,
        error: "The selected Matter profile is not valid for this entity.",
      };
    }
    if (this.isAuxiliaryEntity(entityId)) {
      return {
        success: false,
        error: "Auxiliary actions inherit the profile of their main device.",
      };
    }

    try {
      const wasExported = this.exportedDevices.has(entityId);
      const state = entity.state;
      if (wasExported) await this.manualUnregister(entityId);
      this.deviceOverrides[entityId] = profileId;
      await this.saveDeviceOverrides();
      this.entities.delete(entityId);
      this.matterbridgeDevices.delete(entityId);
      await this.registerHAEntity(state);
      if (wasExported) await this.manualRegister(entityId);
      return { success: true };
    } catch (error) {
      this.log.error(
        `Failed to update Matter profile for ${entityId}: ${error}`,
      );
      this.recordEntityDiagnostic(
        entityId,
        `No se pudo actualizar el perfil Matter: ${String(error)}`,
      );
      return { success: false, error: String(error) };
    }
  }

  /**
   * Real-time state synchronization from HA to Matter.
   */
  private handleEntityStateChange(entityId: string, newState: HassState) {
    const entity = this.entities.get(entityId);
    if (!entity) {
      // An entity may become available after HA's initial snapshot.
      void this.registerHAEntity(newState);
      return;
    }
    entity.state = newState;
    if (this.observeHomeAssistantAvailability(entityId, newState)) {
      // `unavailable` is not a real off/unlocked/closed reading. Keep the last
      // valid Matter value so one failed integration cannot falsify an entire
      // composite device or make it appear to have shut down.
      return;
    }
    if (this.isEntityExported(entityId))
      this.queueStateUpdate(entityId, newState);

    if (entityId.startsWith("binary_sensor.")) {
      const isMotionState = newState.state === "on";
      for (const cam of this.entities.values()) {
        if (cam instanceof CameraEntity && cam.homekitAccessory) {
          const isLinked =
            cam.homekitAccessory.linkedMotionEntityId === entityId ||
            (this.ha.hassEntities.get(entityId)?.device_id &&
              this.ha.hassEntities.get(entityId)?.device_id ===
                this.ha.hassEntities.get(cam.entityId)?.device_id);
          if (isLinked) {
            cam.homekitAccessory.updateMotionState(isMotionState);
          }
        }
      }

      // Update Camera.UI active accessories (OpenCV motion / person / vehicle / animal)
      const allCuiAccessories = CameraUiHomeKitBridge.getAllAccessories();
      const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanEntityId = clean(entityId);

      for (const [cuiId, accessory] of allCuiAccessories) {
        if (!accessory) continue;
        const linkedId = accessory.linkedMotionEntityId;
        const camName = accessory.record?.name || "";
        const rawCuiId = cuiId.replace(/^cameraui_/, "");
        const cleanCuiId = clean(rawCuiId);
        const cleanCamName = clean(camName);

        const entityFriendlyName = (this.ha?.hassStates?.get(entityId)?.attributes?.friendly_name || "").toLowerCase();
        const cleanFriendlyName = clean(entityFriendlyName);
        const nameWords = camName.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
        const allWordsMatch =
          nameWords.length > 0 &&
          nameWords.every((w) => cleanEntityId.includes(w) || cleanFriendlyName.includes(w));

        const isMotionClass =
          entityId.includes("motion") ||
          entityId.includes("movimiento") ||
          entityId.includes("vehicle") ||
          entityId.includes("vehiculo") ||
          entityId.includes("car") ||
          entityId.includes("auto") ||
          entityId.includes("person") ||
          entityId.includes("persona") ||
          entityId.includes("animal") ||
          entityId.includes("pet") ||
          entityId.includes("detection") ||
          entityId.includes("occupancy") ||
          entityId.includes("presence");

        const isLinked =
          linkedId === entityId ||
          (cleanCuiId.length >= 4 && cleanEntityId.includes(cleanCuiId)) ||
          (cleanCamName.length >= 3 && cleanEntityId.includes(cleanCamName)) ||
          allWordsMatch ||
          this.matchCameraIdentifier({ id: cuiId, name: camName }, entityId) ||
          this.matchCameraIdentifier({ id: cuiId, name: camName }, entityFriendlyName) ||
          ((accessory.record as any)?.realEntities?.some((re: any) => re.id === entityId)) ||
          Boolean(CameraUiStorage.getCachedStore()?.cameras?.find((c) => c.id === cuiId)?.realEntities?.some((re) => re.id === entityId)) ||
          (allCuiAccessories.size === 1 && isMotionClass) ||
          (this.ha.hassEntities.get(entityId)?.device_id &&
            this.ha.hassEntities.get(entityId)?.device_id ===
              this.ha.hassEntities.get(`camera.${cuiId}`)?.device_id);

        if (isLinked) {
          let detectedLabel = "HA Sensor";
          if (cleanEntityId.includes("persona") || cleanEntityId.includes("person")) detectedLabel = "IA Persona";
          else if (cleanEntityId.includes("vehiculo") || cleanEntityId.includes("vehicle") || cleanEntityId.includes("car") || cleanEntityId.includes("auto")) detectedLabel = "IA Vehículo";
          else if (cleanEntityId.includes("animal") || cleanEntityId.includes("pet")) detectedLabel = "IA Animal";
          else if (cleanEntityId.includes("motion") || cleanEntityId.includes("movimiento")) detectedLabel = "Sensor Movimiento";

          this.log.notice(
            `[Camera.UI] Cambio de estado de movimiento (${isMotionState ? "DETECTADO" : "REPOSO"}) desde HA (${entityId}, ${detectedLabel}) para cámara "${accessory.record?.name || cuiId}"`,
          );
          CameraUiHomeKitBridge.updateMotion(cuiId, isMotionState, this, `${detectedLabel} (${entityFriendlyName || entityId})`);
        }
      }
    }

    if (entityId.startsWith("light.") || entityId.startsWith("switch.") || entityId.startsWith("siren.")) {
      const isOn = newState.state === "on";
      for (const cam of this.entities.values()) {
        if (cam instanceof CameraEntity && cam.homekitAccessory) {
          if (cam.homekitAccessory.linkedLightEntityId === entityId) {
            cam.homekitAccessory.updateLightState(isOn);
          }
          if (cam.homekitAccessory.linkedSirenEntityId === entityId) {
            cam.homekitAccessory.updateSirenState(isOn);
          }
        }
      }
      const allCuiAccessories = CameraUiHomeKitBridge.getAllAccessories();
      for (const [, accessory] of allCuiAccessories) {
        if (!accessory) continue;
        if (accessory.linkedLightEntityId === entityId) {
          accessory.updateLightState(isOn);
        }
        if (accessory.linkedSirenEntityId === entityId) {
          accessory.updateSirenState(isOn);
        }
      }
    }

    if (entityId.startsWith("select.")) {
      const deviceId = this.ha.hassEntities.get(entityId)?.device_id;
      for (const [vId, vEntity] of this.entities.entries()) {
        if (
          vId.startsWith("vacuum.") &&
          vEntity instanceof VacuumEntity &&
          this.isEntityExported(vId)
        ) {
          const vDeviceId = this.ha.hassEntities.get(vId)?.device_id;
          if (
            (deviceId && vDeviceId === deviceId) ||
            entityId.includes(vId.split(".")[1])
          ) {
            this.queueStateUpdate(vId, vEntity.state);
          }
        }
      }
    }
  }

  private queueStateUpdate(entityId: string, state: HassState) {
    this.pendingStateUpdates.set(entityId, state);
    if (this.stateUpdateFlushScheduled || this.stateUpdateFlushInFlight) return;
    this.stateUpdateFlushScheduled = true;
    setImmediate(() => void this.flushStateUpdates());
  }

  private async flushStateUpdates() {
    if (this.stateUpdateFlushInFlight) return this.stateUpdateFlushInFlight;
    this.stateUpdateFlushScheduled = false;
    this.stateUpdateFlushInFlight = (async () => {
      while (this.pendingStateUpdates.size) {
        const updates = [...this.pendingStateUpdates.entries()];
        this.pendingStateUpdates.clear();
        const results = await Promise.allSettled(
          updates.map(async ([entityId, state]) => {
            const compositeDeviceId = this.compositeMembership.get(entityId);
            if (compositeDeviceId) {
              const composite = this.compositeDevices.get(compositeDeviceId);
              if (!composite)
                throw new Error(
                  `Composite runtime ${compositeDeviceId} is not attached.`,
                );
              await composite.updateEntity(entityId, state);
              if (!isUnavailable(state))
                this.clearMatterAccessoryProblems(entityId, compositeDeviceId);
              return;
            }
            const entity = this.entities.get(entityId);
            if (entity && this.isEntityExported(entityId)) {
              await entity.updateState(state);
              if (!isUnavailable(state)) this.clearEntityProblem(entityId);
            }
          }),
        );
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            const [entityId] = updates[index];
            const message = `No se pudo sincronizar el estado con Matter: ${String(result.reason)}`;
            this.log.error(`${message} (${entityId})`);
            this.recordEntityDiagnostic(entityId, message);
          }
        });
        updates.forEach(([entityId, state]) => {
          this.broadcastSseMessage("state_changed", {
            entityId,
            state: state.state,
            attributes: state.attributes,
          });
        });
      }
    })().finally(() => {
      this.stateUpdateFlushInFlight = undefined;
      if (this.pendingStateUpdates.size && !this.stateUpdateFlushScheduled) {
        this.stateUpdateFlushScheduled = true;
        setImmediate(() => void this.flushStateUpdates());
      }
    });
    return this.stateUpdateFlushInFlight;
  }

  /**
   * Start custom HTTP server on port 8285 for Liquid Glass UI.
   */
  private startUiServer(): Promise<void> {
    const server = http.createServer(async (req, res) => {
      const urlObj = new URL(
        req.url ?? "",
        `http://${req.headers.host ?? "localhost"}`,
      );

      // If requested at the base Ingress URL without a trailing slash,
      // redirect to the same URL with a trailing slash.
      // This is crucial so that browser relative links (like "./style.css")
      // resolve correctly under the Ingress path.
      const redirectRegex = /^\/api\/hassio_ingress\/[^/]+$/;
      if (redirectRegex.test(urlObj.pathname)) {
        res.writeHead(301, { Location: `${urlObj.pathname}/` });
        res.end();
        return;
      }

      let pathname = urlObj.pathname;

      // Extract and strip Ingress path prefix if present
      const ingressPath = req.headers["x-ingress-path"];
      if (
        typeof ingressPath === "string" &&
        ingressPath &&
        pathname.startsWith(ingressPath)
      ) {
        pathname = pathname.substring(ingressPath.length);
      } else {
        const ingressRegex = /^\/api\/hassio_ingress\/[^/]+/;
        const match = pathname.match(ingressRegex);
        if (match) {
          pathname = pathname.substring(match[0].length);
        }
      }

      if (pathname === "" || pathname === "//") {
        pathname = "/";
      }

      this.log.debug(
        `[UI Server] ${req.method} ${pathname} (raw: ${urlObj.pathname})`,
      );

      const adminToken = process.env.MATTER_AIO_ADMIN_TOKEN;
      if (
        req.method === "POST" &&
        adminToken &&
        req.headers["x-matter-aio-token"] !== adminToken
      ) {
        res.writeHead(403, {
          "Content-Type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify({ success: false, error: "Forbidden" }));
        return;
      }

      try {
        if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
          let content = await this.readFrontendFile("index.html");
          if (content) {
            // Ensure proper base URL when loaded through Home Assistant Ingress
            const ingressHeader = req.headers["x-ingress-path"];
            let baseHref = "";
            if (typeof ingressHeader === "string" && ingressHeader) {
              baseHref = ingressHeader.endsWith("/") ? ingressHeader : `${ingressHeader}/`;
            } else {
              const ingressRegex = /^\/api\/hassio_ingress\/[^/]+/;
              const match = urlObj.pathname.match(ingressRegex);
              if (match) {
                baseHref = `${match[0]}/`;
              }
            }
            if (baseHref) {
              if (content.includes("<base ")) {
                content = content.replace(/<base[^>]*>/i, `<base href="${baseHref}">`);
              } else {
                content = content.replace("<head>", `<head>\n    <base href="${baseHref}">`);
              }
            }

            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              Pragma: "no-cache",
              Expires: "0",
            });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end("Not Found");
          }
          return;
        }

        // Generic static asset serving for Vite bundle (/assets/*, logo, fonts, etc.)
        const staticAssetMatch = pathname.match(
          /^\/(assets\/[^?#]+|[a-zA-Z0-9._-]+\.(?:png|svg|ico|jpg|jpeg|webp|woff2?|ttf|js|css|json|map))$/,
        );
        if (req.method === "GET" && staticAssetMatch) {
          const relPath = staticAssetMatch[1];
          const content = await this.readBinaryFile(relPath);
          if (content) {
            const ext = path.extname(relPath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              ".js": "application/javascript; charset=utf-8",
              ".css": "text/css; charset=utf-8",
              ".html": "text/html; charset=utf-8",
              ".json": "application/json; charset=utf-8",
              ".png": "image/png",
              ".jpg": "image/jpeg",
              ".jpeg": "image/jpeg",
              ".svg": "image/svg+xml",
              ".ico": "image/x-icon",
              ".woff": "font/woff",
              ".woff2": "font/woff2",
              ".ttf": "font/ttf",
              ".map": "application/json",
            };
            const isHashedAsset = relPath.startsWith("assets/");
            res.writeHead(200, {
              "Content-Type": mimeTypes[ext] || "application/octet-stream",
              "Cache-Control": isHashedAsset
                ? "public, max-age=31536000, immutable"
                : "no-cache, no-store, must-revalidate",
            });
            res.end(content);
            return;
          }
        }

        if (req.method === "GET" && pathname === "/api/custom/logs") {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ logs: getLogs() }));
          return;
        }

        if (req.method === "POST" && pathname === "/api/custom/logs/clear") {
          clearLogs();
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (req.method === "GET" && pathname === "/api/custom/mqtt-config") {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              host: (this.config as any).mqttHost || "",
              port: (this.config as any).mqttPort || 1883,
              user: (this.config as any).mqttUser || "",
              password: (this.config as any).mqttPassword || "",
            }),
          );
          return;
        }

        if (req.method === "POST" && pathname === "/api/custom/mqtt-config") {
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            (this.config as any).mqttHost = data.host;
            (this.config as any).mqttPort = data.port;
            (this.config as any).mqttUser = data.user;
            (this.config as any).mqttPassword = data.password;

            // To persist, write to /data/mqtt-config.json
            await fs.writeFile(
              "/data/mqtt-config.json",
              JSON.stringify(data),
              "utf8",
            );

            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ success: true }));
          } catch {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: "Invalid MQTT configuration payload.",
              }),
            );
          }
          return;
        }

        if (req.method === "GET" && pathname === "/api/custom/status") {
          const version = await this.getPackageVersion();
          let activeHomeName: string | null = null;
          let activeFabrics: any[] = [];
          let isCommissioned = false;

          for (const ent of this.entities.values()) {
            const ep = this.getMatterEndpointForEntity(ent.entityId);
            const conn = this.getMatterConnectionInfo(ep);
            if (conn.commissioned && conn.fabrics.length > 0) {
              isCommissioned = true;
              activeFabrics = conn.fabrics;
              activeHomeName = conn.homeName;
              break;
            }
          }

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              status: this.ha.connected ? "operativo" : "reconectando",
              version,
              matterbridgeVersion: this.matterbridge.matterbridgeVersion,
              bridgeMode: this.matterbridge.bridgeMode,
              qrPairingCode: "",
              manualPairingCode: "",
              commissioned: isCommissioned,
              homeName: activeHomeName,
              pairedFabrics: activeFabrics,
              systemInfo: {
                os: "Linux",
                nodeVersion: process.version,
                uptime: `${Math.floor(process.uptime())}s`,
                cpu: "—",
                memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`,
              },
              haStatus: this.ha.connected ? "conectado" : "desconectado",
            }),
          );
          return;
        }

        if (req.method === "GET" && pathname === "/api/custom/devices") {
          await this.refreshDiscoveryCatalog();
          const errorPattern =
            /\b(error|warn|warning|failed|failure|exception|unable|timeout)\b/i;
          const allErrorLogs = getLogs().filter((line) =>
            errorPattern.test(line),
          );
          const homeLocation =
            (this.ha as any)?.hassConfig?.location_name || null;
          const result = Array.from(this.entities.values()).flatMap((e) => {
            // Exclude generic DPS datapoints — they have no meaningful Matter mapping
            // and cluttering the panel with unnamed sensor rows harms usability.
            if (this.isDpsGenericEntity(e.entityId)) return [];
            const [domain] = e.entityId.split(".");
            // Include grouping metadata before activation. The frontend must
            // never offer a second toggle for a future child endpoint.
            const compositeCandidate = this.getCompositeCandidate(e.entityId);
            const compositeDeviceId =
              this.compositeMembership.get(e.entityId) ??
              compositeCandidate?.deviceId;
            const composite = compositeDeviceId
              ? this.compositeDevices.get(compositeDeviceId)
              : undefined;
            const compositePrimaryEntityId =
              composite?.primaryEntityId ??
              compositeCandidate?.config?.primary_entity ??
              compositeCandidate?.members.find((member) =>
                member.entityId.startsWith("camera."),
              )?.entityId ??
              compositeCandidate?.members.find((member) =>
                member.entityId.startsWith("humidifier."),
              )?.entityId ??
              compositeCandidate?.members.find((member) =>
                member.entityId.startsWith("lock."),
              )?.entityId ??
              compositeCandidate?.members.find((member) =>
                member.entityId.startsWith("fan."),
              )?.entityId ??
              compositeCandidate?.members[0]?.entityId ??
              null;
            const endpoint = this.getMatterEndpointForEntity(
              e.entityId,
              compositeDeviceId,
              compositePrimaryEntityId,
            );

            const connection = this.getMatterConnectionInfo(endpoint);

            const domainLabels: Record<string, string> = {
              camera: "Camera",
              fan: "Fan",
              humidifier: "Humidifier",
              light: "Light",
              switch: "Switch",
              climate: "Thermostat",
              lock: "DoorLock",
              cover: "WindowCovering",
              vacuum: "RoboticVacuumCleaner",
              media_player: "Speaker",
              sensor: "Sensor",
              binary_sensor: "BinarySensor",
            };
            const typeLabel =
              (e.constructor as any).matterTypeLabel ||
              domainLabels[domain] ||
              e.deviceType.name ||
              "Generic";

            return {
              entityId: e.entityId,
              domain: domain,
              state: e.state.state,
              attributes: { friendly_name: e.state.attributes?.friendly_name },
              deviceTypeLabel: typeLabel,
              matterType:
                domain === "fan"
                  ? "fan"
                  : domain === "humidifier"
                    ? "humidifier"
                    : e.deviceType.name,
              // Registry info
              ...this.getHaRegistryInfo(e.entityId),
              // Accessory status
              exported: this.isEntityExported(e.entityId),
              composite: compositeDeviceId !== undefined,
              compositeActive: composite !== undefined,
              compositeDeviceId: compositeDeviceId ?? null,
              compositePrimaryEntityId,
              auxiliary: this.isAuxiliaryEntity(e.entityId),
              primaryEntityId: this.getPrimaryEntityId(e.entityId) ?? null,
              profileId:
                this.deviceOverrides[e.entityId] ??
                this.getAutomaticProfile(e.entityId, e.state) ??
                getDefaultExportProfileId(domain) ??
                null,
              profiles: getExportProfiles(domain),
              pairingCode: connection.pairingCode,
              manualPairingCode: connection.manualPairingCode,
              commissioned: this.isEntityExported(e.entityId) && connection.commissioned,
              homeName: connection.homeName,
              controllerNames: connection.controllerNames,
              fabricCount: connection.fabricCount,
              matterFabrics: connection.fabrics,
              // Detect issues strictly on exported accessories (connection drops, unavailable state, active problems)
              hasIssue:
                this.isEntityExported(e.entityId) &&
                (this.entityProblems.has(e.entityId) || isUnavailable(e.state)),
              diagnostics: this.entityDiagnostics.get(e.entityId) ?? [],
              logs:
                this.isEntityExported(e.entityId)
                  ? this.getEntityErrorLogs(e.entityId, endpoint, allErrorLogs)
                  : [],
              homekitCamera:
                domain === "camera"
                  ? (() => {
                      const rec = this.homekitCameraRecords.get(e.entityId);
                      const cap = (e as CameraEntity).capabilities;
                      const hksvCapable =
                        rec?.hksvCapable ?? cap?.hksvCapable ?? false;
                      const hksvEnabled = rec?.hksvEnabled ?? true;
                      const hksvVerified = rec?.hksvVerified ?? false;
                      const hksvState =
                        rec?.hksvState ??
                        (hksvCapable
                          ? hksvEnabled
                            ? "waiting_hub"
                            : "configurable"
                          : "not_capable");

                      const linkedMotion = (e as CameraEntity).homekitAccessory
                        ?.linkedMotionEntityId;

                      let recordingStatus =
                        "🔴 HKSV bloqueado (Sin fuente STREAM)";
                      if (!cap?.hasLiveStream) {
                        recordingStatus =
                          "🔴 HKSV bloqueado (Live View / Fuente no disponible)";
                      } else if (hksvVerified) {
                        recordingStatus =
                          "✅ HKSV verificado (Grabando en iCloud)";
                      } else if (hksvState === "ready") {
                        recordingStatus =
                          "🟡 HKSV habilitado, esperando evento";
                      } else if (hksvState === "waiting_hub") {
                        recordingStatus = "⏳ Esperando Home Hub / iCloud+";
                      } else if (hksvState === "configurable") {
                        recordingStatus = "⚙️ HKSV configurable";
                      } else if (hksvState === "error") {
                        recordingStatus =
                          "⚠️ HKSV con error (Live View activo)";
                      }

                      return {
                        published: rec?.published ?? false,
                        isPaired:
                          (e as CameraEntity).homekitAccessory?.isPaired() ??
                          rec?.isPaired ??
                          false,
                        hksvCapable,
                        hksvEnabled,
                        hksvVerified,
                        hksvState,
                        port: rec?.port ?? 51830,
                        pincode: rec?.pincode ?? "031-45-154",
                        username: rec?.username,
                        setupUri:
                          (e as CameraEntity).homekitAccessory?.setupUri || "",
                        strategy:
                          rec?.strategy || cap?.strategy || "unsupported",
                        hasAudio: cap?.hasAudio ?? false,
                        audioCodec: cap?.audioCodec ?? "none",
                        videoCodec: cap?.videoCodec ?? "h264",
                        liveViewStatus: cap?.hasLiveStream
                          ? cap?.strategy === "passthrough_h264"
                            ? "Passthrough H.264 (Sin transcodificación)"
                            : cap?.strategy === "passthrough_video_only"
                              ? "Passthrough H.264 (Video-only)"
                              : "Transcodificación H.264 activa"
                          : "Live View no disponible: Home Assistant no expone una fuente reproducible.",
                        snapshotStatus: "Disponible (Home Assistant Proxy)",
                        audioStatus: cap?.hasAudio
                          ? `Audio activo (${cap?.audioCodec})`
                          : "Sin audio (Video-only)",
                        recordingStatus,
                        pairingState:
                          (e as CameraEntity).homekitAccessory?.isPaired() ||
                          rec?.isPaired
                            ? "✅ Vinculado a Apple Home (Activo)"
                            : "⏳ Listo para vincular (Escanea el código QR en Apple Home)",
                        motionSensorSupported: Boolean(linkedMotion),
                        motionSensorEntityId: linkedMotion || null,
                        motionSensorStatus: linkedMotion
                          ? `Integrado (Vinculado a ${linkedMotion})`
                          : "MotionSensor no disponible desde Home Assistant",
                        ffmpegAvailable: Boolean(resolveFfmpegPath()),
                        ffmpegPath:
                          resolveFfmpegPath() || "No instalado en el sistema",
                        ffmpegVersion: getFfmpegVersion() || "N/A",
                      };
                    })()
                  : null,
            };
          });
          const mqttResults = Array.from(this.mqttEntities.values()).map(
            (m) => {
              const endpoint = this.matterbridgeDevices.get(m.entityId);
              const connection = this.getMatterConnectionInfo(endpoint);
              return {
                entityId: m.entityId,
                domain: m.domain,
                state: m.getStateString(),
                origin: "mqtt",
                attributes: { friendly_name: m.friendlyName, ...m.attributes },
                deviceTypeLabel:
                  "MQTT " +
                  (m.domain.charAt(0).toUpperCase() + m.domain.slice(1)),
                matterType: m.deviceType.name,
                device_id: m.deviceId,
                device_name: m.deviceName,
                area_id: null,
                area_name: m.areaName,
                manufacturer: m.manufacturer,
                model: m.model,
                entity_registry_id: null,
                platform: "mqtt",
                exported: this.isEntityExported(m.entityId),
                composite: false,
                compositeActive: false,
                compositeDeviceId: null,
                compositePrimaryEntityId: null,
                auxiliary: false,
                primaryEntityId: null,
                profileId: null,
                profiles: [],
                pairingCode: connection.pairingCode,
                manualPairingCode: connection.manualPairingCode,
                commissioned: this.isEntityExported(m.entityId) && connection.commissioned,
                homeName: connection.homeName,
                controllerNames: connection.controllerNames,
                fabricCount: connection.fabricCount,
                matterFabrics: connection.fabrics,
                hasIssue: (() => {
                  const stateStr = (m.getStateString() || "").toLowerCase();
                  const isMqttDown = stateStr === "offline" || stateStr === "unavailable" || stateStr === "unknown";
                  return this.isEntityExported(m.entityId) && isMqttDown;
                })(),
                diagnostics: this.entityDiagnostics.get(m.entityId) ?? [],
                logs: this.getEntityErrorLogs(m.entityId, endpoint, allErrorLogs),
              };
            },
          );

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify([...result, ...mqttResults]));
          return;
        }

        // POST /api/custom/register/:entityId
        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/register/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/register/".length),
          );
          const result = await this.manualRegister(entityId);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/unregister/:entityId
        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/unregister/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/unregister/".length),
          );
          const result = await this.manualUnregister(entityId);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/reset-accessory/:entityId
        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/reset-accessory/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/reset-accessory/".length),
          );
          const result = await this.runMatterAccessoryOperation(entityId, () =>
            this.resetMatterAccessory(entityId),
          );
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/reset-camera-pairing/:entityId
        const resetPairMatch = pathname.match(
          /\/reset-camera-pairing\/([^/]+)$/,
        );
        if (req.method === "POST" && resetPairMatch) {
          const entityId = decodeURIComponent(resetPairMatch[1]);
          const result = await this.resetCameraPairing(entityId);
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/camera-hksv/:entityId
        const hksvMatch = pathname.match(/\/camera-hksv\/([^/]+)$/);
        if (req.method === "POST" && hksvMatch) {
          const entityId = decodeURIComponent(hksvMatch[1]);
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let enabled = true;
          try {
            const parsed = JSON.parse(bodyStr);
            if (typeof parsed.enabled === "boolean") enabled = parsed.enabled;
          } catch {}

          const result = await this.toggleCameraHksv(entityId, enabled);
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/camera-motion-sensor/:entityId
        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/camera-motion-sensor/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/camera-motion-sensor/".length),
          );
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let motionEntityId: string | undefined;
          try {
            const parsed = JSON.parse(bodyStr);
            if (typeof parsed.motionEntityId === "string") {
              motionEntityId = parsed.motionEntityId || undefined;
            }
          } catch {}
          const result = await this.setCameraMotionSensor(
            entityId,
            motionEntityId,
          );
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/refresh-accessory/:entityId
        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/refresh-accessory/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/refresh-accessory/".length),
          );
          const result = await this.runMatterAccessoryOperation(entityId, () =>
            this.refreshMatterAccessory(entityId),
          );
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/open-commissioning/:entityId
        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/open-commissioning/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/open-commissioning/".length),
          );
          const result = await this.openMatterCommissioningWindow(entityId);
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        // POST / DELETE /api/custom/remove-fabric/:entityId/:fabricIndex
        if (
          (req.method === "POST" || req.method === "DELETE") &&
          pathname.startsWith("/api/custom/remove-fabric/")
        ) {
          const parts = pathname
            .substring("/api/custom/remove-fabric/".length)
            .split("/");
          const entityId = decodeURIComponent(parts[0]);
          const fabricIndex = parts[1] || "1";
          const result = await this.runMatterAccessoryOperation(entityId, () =>
            this.removeMatterFabric(entityId, fabricIndex),
          );
          res.writeHead(result.success ? 200 : 400, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(result));
          return;
        }

        if (
          req.method === "POST" &&
          pathname.startsWith("/api/custom/device-profile/")
        ) {
          const entityId = decodeURIComponent(
            pathname.substring("/api/custom/device-profile/".length),
          );
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body) as {
              profileId?: string;
              profile?: string;
            };
            const targetProfile = data.profileId || data.profile || "";
            const result = await this.setDeviceProfile(entityId, targetProfile);
            res.writeHead(result.success ? 200 : 400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify(result));
          } catch {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: "Invalid request body.",
              }),
            );
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/custom/scan-cameras" ||
            pathname === "/scan-cameras")
        ) {
          try {
            await this.refreshDiscoveryCatalog();
            const camerasCount = Array.from(this.entities.values()).filter(
              (e) => e.entityId.startsWith("camera."),
            ).length;
            this.log.notice(
              `Camera scan completed: ${camerasCount} cameras cataloged.`,
            );
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: true,
                count: camerasCount,
                message: `Descubrimiento de cámaras completado (${camerasCount} encontradas)`,
              }),
            );
          } catch (err) {
            res.writeHead(500, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: `Error al escanear cámaras: ${String(err)}`,
              }),
            );
          }
          return;
        }

        if (req.method === "POST" && pathname === "/api/custom/restart") {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              success: true,
              message: "Reiniciando el contenedor...",
            }),
          );
          this.log.warn("[UI Server] Restart requested, exiting process...");
          setTimeout(() => process.exit(0), 1000);
          return;
        }

        if (
          req.method === "POST" &&
          pathname === "/api/custom/device-override"
        ) {
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            const entityId = data.entityId;
            if (!entityId) throw new Error("Missing entityId");

            // Persist overrides to a JSON file in /data
            const overridesPath = "/data/device-overrides.json";
            let overrides: Record<string, string> = {};
            try {
              const raw = await fs.readFile(overridesPath, "utf8");
              overrides = JSON.parse(raw);
            } catch {
              /* first time */
            }

            if (data.exported === false) {
              overrides[entityId] = "_DISABLED_";
            } else if (data.matterType) {
              overrides[entityId] = data.matterType;
            } else if (data.exported === true) {
              if (overrides[entityId] === "_DISABLED_") {
                delete overrides[entityId];
              }
            }

            await fs.writeFile(
              overridesPath,
              JSON.stringify(overrides, null, 2),
              "utf8",
            );
            this.deviceOverrides = overrides;
            this.log.info(`[UI] Device override saved for ${entityId}`);
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ success: true }));
          } catch (parseErr) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "Invalid request body" }));
          }
          return;
        }

        // --- SCRYPTED & CAMERA REST ENDPOINTS ---

        if (
          req.method === "GET" &&
          (pathname === "/api/scrypted/config" ||
            pathname === "/api/custom/scrypted/config")
        ) {
          const store = await ScryptedStorage.load();
          const creds = store.scrypted.credentials ?? {
            authenticationMode: "username_password",
          };
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              serverUrl: store.scrypted.serverUrl || "",
              username: creds.username || "",
              hasPassword: Boolean(creds.passwordEncrypted),
              hasApiToken: Boolean(creds.apiTokenEncrypted),
              authenticationMode: creds.authenticationMode,
              allowSelfSignedCertificate:
                store.scrypted.allowSelfSignedCertificate ?? false,
              connectionStatus: store.scrypted.connectionStatus,
              autoReconnect: store.scrypted.autoReconnect ?? true,
              pollIntervalMinutes: store.scrypted.pollIntervalMinutes ?? 15,
              lastConnected: store.scrypted.lastConnected || null,
              schemaVersion: store.schemaVersion ?? 2,
            }),
          );
          return;
        }

        if (
          req.method === "PUT" &&
          (pathname === "/api/scrypted/config" ||
            pathname === "/api/custom/scrypted/config")
        ) {
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            const store = await ScryptedStorage.load();

            if (!store.scrypted.credentials) {
              store.scrypted.credentials = {
                authenticationMode: "username_password",
              };
            }

            if (data.serverUrl !== undefined) {
              store.scrypted.serverUrl = String(data.serverUrl).trim();
            }
            if (data.username !== undefined) {
              store.scrypted.credentials.username = String(data.username)
                .replace(/[\x00-\x1f\x7f]/g, "")
                .trim()
                .slice(0, 128);
            }
            if (
              data.password &&
              typeof data.password === "string" &&
              data.password.trim().length > 0
            ) {
              store.scrypted.credentials.passwordEncrypted =
                await ScryptedCrypto.encrypt(
                  data.password,
                  "scrypted_password",
                );
              store.scrypted.credentials.authenticationMode =
                "username_password";
            }
            if (data.clearPassword === true) {
              store.scrypted.credentials.passwordEncrypted = undefined;
            }
            if (
              data.apiToken &&
              typeof data.apiToken === "string" &&
              data.apiToken.trim().length > 0
            ) {
              store.scrypted.credentials.apiTokenEncrypted =
                await ScryptedCrypto.encrypt(
                  data.apiToken.trim(),
                  "scrypted_api_token",
                );
              store.scrypted.credentials.authenticationMode = "api_token";
            }
            if (data.clearApiToken === true) {
              store.scrypted.credentials.apiTokenEncrypted = undefined;
            }
            if (data.allowSelfSignedCertificate !== undefined) {
              store.scrypted.allowSelfSignedCertificate = Boolean(
                data.allowSelfSignedCertificate,
              );
            }
            if (data.autoReconnect !== undefined) {
              store.scrypted.autoReconnect = Boolean(data.autoReconnect);
            }
            if (data.pollIntervalMinutes !== undefined) {
              store.scrypted.pollIntervalMinutes =
                Number(data.pollIntervalMinutes) || 15;
            }

            await ScryptedStorage.save(store);
            void ScryptedReconnectManager.getInstance().attemptConnection(
              false,
            );

            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: true,
                message: "Configuración de Scrypted guardada.",
              }),
            );
          } catch (err: any) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: err.message || "Error al guardar configuración",
              }),
            );
          }
          return;
        }

        if (
          req.method === "DELETE" &&
          (pathname === "/api/scrypted/config" ||
            pathname === "/api/custom/scrypted/config")
        ) {
          try {
            const reconnectMgr = ScryptedReconnectManager.getInstance();
            reconnectMgr.destroy();
            const store = await ScryptedStorage.load();
            for (const cam of store.cameras?.cameras || []) {
              try {
                const acc = ScryptedHomeKitBridge.getAccessory(cam.cameraId);
                if (acc) {
                  await acc.unpublish();
                }
              } catch {}
            }
            store.scrypted.credentials = {
              authenticationMode: "username_password",
            };
            store.scrypted.serverUrl = "";
            store.scrypted.serverId = "";
            store.scrypted.allowSelfSignedCertificate = false;
            store.scrypted.connectionStatus = "not_configured";
            store.scrypted.lastConnected = undefined;
            store.cameras = { cameras: [] };
            await ScryptedStorage.save(store);
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: true,
                message:
                  "Configuración de Scrypted y cámaras asociadas eliminadas correctamente.",
              }),
            );
          } catch (err: any) {
            res.writeHead(500, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: "Error al eliminar configuración",
              }),
            );
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/scrypted/connection-test" ||
            pathname === "/api/custom/scrypted/connection-test")
        ) {
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            const testServerUrl =
              typeof data.serverUrl === "string" ? data.serverUrl.trim() : "";
            const testUsername =
              typeof data.username === "string"
                ? data.username.trim()
                : undefined;
            const testPassword =
              typeof data.password === "string" ? data.password : undefined;
            const allowSelfSigned = Boolean(data.allowSelfSignedCertificate);

            const result = await ScryptedClient.testConnection(
              testServerUrl,
              {
                username: testUsername,
                authenticationMode: "username_password",
              },
              testPassword,
              allowSelfSigned,
            );
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                ok: false,
                message: "Error en prueba de conexión",
              }),
            );
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/scrypted/connect-and-load-cameras" ||
            pathname === "/api/custom/scrypted/connect-and-load-cameras")
        ) {
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            const serverUrl =
              typeof data.serverUrl === "string" ? data.serverUrl.trim() : "";
            const username =
              typeof data.username === "string"
                ? data.username.trim()
                : undefined;
            const password =
              typeof data.password === "string" ? data.password : undefined;
            const allowSelfSigned = Boolean(data.allowSelfSignedCertificate);
            const apiToken =
              typeof data.apiToken === "string" && data.apiToken.trim()
                ? data.apiToken.trim()
                : undefined;

            if (!serverUrl || !username || !password) {
              res.writeHead(400, {
                "Content-Type": "application/json; charset=utf-8",
              });
              res.end(
                JSON.stringify({
                  success: false,
                  error: "Faltan URL, usuario o contraseña",
                }),
              );
              return;
            }

            // Test credentials via SDK before saving anything
            const credentials = {
              username,
              authenticationMode: "username_password" as const,
            };
            const testResult = await ScryptedClient.testConnection(
              serverUrl,
              credentials,
              password,
              allowSelfSigned,
            );
            if (!testResult.ok) {
              res.writeHead(401, {
                "Content-Type": "application/json; charset=utf-8",
              });
              res.end(
                JSON.stringify({
                  success: false,
                  error: testResult.message,
                  errorCode: testResult.errorCode,
                }),
              );
              return;
            }

            // Auth OK — save credentials securely
            const store = await ScryptedStorage.load();
            store.scrypted.serverUrl = serverUrl;
            store.scrypted.allowSelfSignedCertificate = allowSelfSigned;
            if (!store.scrypted.credentials) {
              store.scrypted.credentials = {
                authenticationMode: "username_password",
              };
            }
            store.scrypted.credentials.username = username;
            store.scrypted.credentials.authenticationMode = "username_password";
            store.scrypted.credentials.passwordEncrypted =
              await ScryptedCrypto.encrypt(password, "scrypted_password");
            if (apiToken) {
              store.scrypted.credentials.apiTokenEncrypted =
                await ScryptedCrypto.encrypt(apiToken, "scrypted_api_token");
            }
            store.scrypted.autoReconnect = data.autoReconnect !== false;
            await ScryptedStorage.save(store);

            // Connect full session and load cameras
            const previousCameraIds = new Set(
              store.cameras.cameras.map((c) => c.cameraId),
            );
            const reconnectMgr = ScryptedReconnectManager.getInstance();
            reconnectMgr.resetAuthFailure();
            await reconnectMgr.forceRefresh();

            const currentStore = ScryptedStorage.getStore();
            const rawCameras = currentStore.cameras?.cameras || [];

            for (const cam of rawCameras) {
              if (cam.exportConfig.homeKitEnabled) {
                try {
                  await ScryptedHomeKitBridge.mountCamera(this, cam);
                } catch {}
              }
              if (cam.exportConfig.matterEnabled) {
                try {
                  await ScryptedMatterBridge.mountCamera(this, cam);
                } catch {}
              }
            }

            const currentCameras = rawCameras.map((cam) => {
              const acc = ScryptedHomeKitBridge.getAccessory(cam.cameraId);
              let setupUri: string | undefined;
              try {
                if (acc && acc.isPublished) {
                  setupUri = acc.setupUri;
                }
              } catch {}
              return {
                ...cam,
                identity: {
                  ...cam.identity,
                  homeKitAccessoryId: `scrypted.${cam.cameraId}`,
                  homeKitSetupUri: setupUri || cam.identity?.homeKitSetupUri,
                  homeKitPincode:
                    acc?.record?.pincode ||
                    cam.identity?.homeKitPincode ||
                    "031-45-154",
                  homeKitSetupId:
                    acc?.record?.setupId || cam.identity?.homeKitSetupId,
                  homeKitPort: acc?.record?.port || cam.identity?.homeKitPort,
                  homeKitPairingState: acc?.isPaired()
                    ? "paired"
                    : "not_paired",
                },
              };
            });

            const currentIds = new Set(currentCameras.map((c) => c.cameraId));
            const newCameras = [...currentIds].filter(
              (id) => !previousCameraIds.has(id),
            ).length;
            const updatedCameras = [...currentIds].filter((id) =>
              previousCameraIds.has(id),
            ).length;
            const totalCameras = currentCameras.length;

            const responsePayload = {
              success: true,
              authenticationMode: "username_password",
              totalCameras,
              newCameras,
              updatedCameras,
              removedCameras: 0,
              skippedCameras: 0,
              noCamerasFound: totalCameras === 0,
              cameras: currentCameras,
              lastFetched:
                currentStore.cameras?.lastFetched || new Date().toISOString(),
            };

            this.broadcastSseMessage("cameras_updated", {
              cameras: currentCameras,
            });

            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify(responsePayload));
          } catch (err: any) {
            res.writeHead(500, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: "Error al conectar y cargar cámaras",
              }),
            );
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/scrypted/load-cameras" ||
            pathname === "/api/custom/scrypted/load-cameras")
        ) {
          try {
            const previousCameras = new Set(
              ScryptedStorage.getStore().cameras?.cameras.map(
                (c) => c.cameraId,
              ) || [],
            );
            await ScryptedReconnectManager.getInstance().forceRefresh();
            const currentStore = ScryptedStorage.getStore();
            const rawCameras = currentStore.cameras?.cameras || [];

            for (const cam of rawCameras) {
              if (cam.exportConfig.homeKitEnabled) {
                try {
                  await ScryptedHomeKitBridge.mountCamera(this, cam);
                } catch {}
              }
              if (cam.exportConfig.matterEnabled) {
                try {
                  await ScryptedMatterBridge.mountCamera(this, cam);
                } catch {}
              }
            }

            const currentCamerasList = rawCameras.map((cam) => {
              const acc = ScryptedHomeKitBridge.getAccessory(cam.cameraId);
              let setupUri: string | undefined;
              try {
                if (acc && acc.isPublished) {
                  setupUri = acc.setupUri;
                }
              } catch {}
              return {
                ...cam,
                identity: {
                  ...cam.identity,
                  homeKitAccessoryId: `scrypted.${cam.cameraId}`,
                  homeKitSetupUri: setupUri || cam.identity?.homeKitSetupUri,
                  homeKitPincode:
                    acc?.record?.pincode ||
                    cam.identity?.homeKitPincode ||
                    "031-45-154",
                  homeKitSetupId:
                    acc?.record?.setupId || cam.identity?.homeKitSetupId,
                  homeKitPort: acc?.record?.port || cam.identity?.homeKitPort,
                  homeKitPairingState: acc?.isPaired()
                    ? "paired"
                    : "not_paired",
                },
              };
            });

            const currentCameras = new Set(
              currentCamerasList.map((c) => c.cameraId),
            );
            const newCameras = [...currentCameras].filter(
              (id) => !previousCameras.has(id),
            ).length;
            const removedCameras = [...previousCameras].filter(
              (id) => !currentCameras.has(id),
            ).length;
            const totalCameras = currentCamerasList.length;
            const updatedCameras = totalCameras;

            const payload = {
              success: true,
              totalCameras,
              newCameras,
              updatedCameras,
              removedCameras,
              cameras: currentCamerasList,
            };

            this.broadcastSseMessage("cameras_updated", payload);

            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify(payload));
          } catch (error: any) {
            res.writeHead(500, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: error.message || "Error al sincronizar cámaras",
              }),
            );
          }
          return;
        }
        // PATCH /api/custom/cameras/:id/identity
        const identityMatch = pathname.match(/\/cameras\/([^/]+)\/identity$/);
        if (req.method === "PATCH" && identityMatch) {
          const cameraId = decodeURIComponent(identityMatch[1]);
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);

            if (data.clear === true) {
              const ok = await ScryptedStorage.updateCameraIdentityOverride(
                cameraId,
                null,
              );
              res.writeHead(ok ? 200 : 404, {
                "Content-Type": "application/json; charset=utf-8",
              });
              res.end(
                JSON.stringify({
                  success: ok,
                  message: ok ? "Override eliminado" : "Cámara no encontrada",
                }),
              );
              return;
            }

            const manufacturer =
              typeof data.manufacturer === "string"
                ? data.manufacturer
                    .replace(/[\x00-\x1f\x7f]/g, "")
                    .trim()
                    .slice(0, 128)
                : undefined;
            const model =
              typeof data.model === "string"
                ? data.model
                    .replace(/[\x00-\x1f\x7f]/g, "")
                    .trim()
                    .slice(0, 128)
                : undefined;

            const override = {
              manufacturer,
              model,
              manufacturerSource: manufacturer ? "manual" : "unknown",
              modelSource: model ? "manual" : "unknown",
            } as import("./camera/scrypted/scrypted-types.js").CameraIdentityOverride;

            const ok = await ScryptedStorage.updateCameraIdentityOverride(
              cameraId,
              override,
            );
            res.writeHead(ok ? 200 : 404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: ok,
                message: ok
                  ? "Identidad actualizada"
                  : "Cámara no encontrada o marca inválida",
              }),
            );
          } catch (err: any) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: "Error al actualizar identidad",
              }),
            );
          }
          return;
        }

        if (
          req.method === "GET" &&
          (pathname === "/api/cameras" ||
            pathname === "/api/custom/cameras" ||
            pathname === "/api/scrypted/cameras" ||
            pathname === "/api/custom/scrypted/cameras")
        ) {
          const store = await ScryptedStorage.load();
          const matterInfo = this.getMatterConnectionInfo(this.matterbridge);
          const activeHomeName =
            matterInfo.homeName ||
            (this.ha as any)?.hassConfig?.location_name ||
            undefined;

          const isScryptedServerConnected =
            store.scrypted.connectionStatus === "connected";

          const enriched = (store.cameras.cameras || []).map((cam) => {
            const acc = ScryptedHomeKitBridge.getAccessory(cam.cameraId);
            let setupUri: string | undefined;
            let pairingState: "paired" | "not_paired" | "unverifiable" =
              "not_paired";
            try {
              if (acc) {
                pairingState = acc.getPairingState();
                if (acc.isPublished && pairingState !== "paired") {
                  setupUri = acc.setupUri;
                }
              }
            } catch {}

            const isPaired = pairingState === "paired";
            const isCamOnline = isScryptedServerConnected && cam.status?.isOnline === true;
            const liveStatus = {
              ...cam.status,
              connection: isCamOnline ? ("online" as const) : ("offline" as const),
              isOnline: isCamOnline,
              lastError: isScryptedServerConnected
                ? cam.status?.lastError
                : "Servidor Scrypted apagado o sin conexión",
            };

            const bindingState = {
              matterCommissioned: matterInfo.commissioned,
              matterState: matterInfo.commissioned
                ? ("commissioned" as const)
                : ("pending" as const),
              fabricCount: matterInfo.fabricCount,
              fabrics: (matterInfo.fabrics || []).map((f: any) => ({
                fabricIndex: Number(f.fabricIndex || 1),
                fabricId: f.fabricId
                  ? `0x${BigInt(f.fabricId).toString(16).toUpperCase()}`
                  : "Desconocido",
                nodeId: f.nodeId || "Desconocido",
                label: f.label || undefined,
                ecosystemHint:
                  f.vendorId === 4937
                    ? ("apple_home" as const)
                    : f.vendorId === 24582
                      ? ("google_home" as const)
                      : f.vendorId === 4447
                        ? ("amazon_alexa" as const)
                        : f.vendorId === 4448
                          ? ("samsung_smartthings" as const)
                          : ("other" as const),
              })),
              fabricsCheckedAt: new Date().toISOString(),
              multiAdminState:
                matterInfo.fabricCount > 1
                  ? ("in_use" as const)
                  : matterInfo.fabricCount === 1
                    ? ("in_use" as const)
                    : ("available" as const),
              homeKitPairingState: pairingState,
              homeName: activeHomeName,
            };

            const realEntities = this.findLinkedCameraEntities(cam.name, cam.cameraId);
            return {
              ...cam,
              status: liveStatus,
              realEntities,
              displaySerialNumber:
                cam.displaySerialNumber ||
                cam.serialNumber ||
                "Serial no disponible",
              bindingState,
              identity: {
                ...cam.identity,
                matterPairingCode:
                  cam.identity?.matterPairingCode ||
                  matterInfo.pairingCode ||
                  undefined,
                homeKitAccessoryId: `scrypted.${cam.cameraId}`,
                homeKitSetupUri: isPaired
                  ? undefined
                  : setupUri || cam.identity?.homeKitSetupUri,
                homeKitPincode:
                  acc?.record?.pincode ||
                  cam.identity?.homeKitPincode ||
                  "031-45-154",
                homeKitSetupId:
                  acc?.record?.setupId || cam.identity?.homeKitSetupId,
                homeKitPort: acc?.record?.port || cam.identity?.homeKitPort,
                homeKitPairingState: isPaired ? "paired" : "not_paired",
              },
            };
          });
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify(enriched));
          return;
        }

        const stateMatch = pathname.match(/\/cameras\/([^/]+)\/state$/);
        if (req.method === "GET" && stateMatch) {
          const cameraId = decodeURIComponent(stateMatch[1]);
          const store = await ScryptedStorage.load();
          const camera = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId,
          );
          if (!camera) {
            res.writeHead(404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "Cámara no encontrada" }));
            return;
          }
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              camera,
              status: camera.status,
              capabilities: camera.capabilities,
            }),
          );
          return;
        }

        const refreshMatch = pathname.match(/\/cameras\/([^/]+)\/refresh$/);
        if (req.method === "POST" && refreshMatch) {
          const cameraId = decodeURIComponent(refreshMatch[1]);
          const store = await ScryptedStorage.load();
          const camera = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId,
          );

          if (!camera) {
            res.writeHead(404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "Cámara no encontrada" }));
            return;
          }
          // TCP probe is diagnostic only — tests Scrypted server reachability.
          // It does NOT verify that the RTSP stream path exists or returns valid SDP.
          // Only a full RTSP DESCRIBE with valid SDP may set cache to "fresh".
          let scryptedHost = "127.0.0.1";
          try {
            if (camera.source.serverId) {
              scryptedHost = new URL(camera.source.serverId).hostname;
            }
          } catch {}
          const host = camera.source.streamReference?.host || scryptedHost;
          const port = camera.source.streamReference?.port || 8554;
          const portReachable = await ScryptedClient.probeRtspPort(host, port);
          // Only update connection status — never mark cache as "fresh" from TCP probe
          camera.status.connection = portReachable ? "online" : "offline";
          // cache stays at its current value — TCP probe does NOT verify RTSP path
          camera.status.lastVerified = new Date().toISOString();
          await ScryptedStorage.save(store);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, camera }));
          return;
        }

        // POST /api/custom/cameras/:id/stream-url
        const streamUrlMatch = pathname.match(
          /\/cameras\/([^/]+)\/stream-url$/,
        );
        if (req.method === "POST" && streamUrlMatch) {
          const cameraId = decodeURIComponent(streamUrlMatch[1]);
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let parsed: any = {};
          try {
            parsed = JSON.parse(bodyStr);
          } catch {}

          const streamUrl = String(parsed.streamUrl || "").trim();
          if (!streamUrl) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "streamUrl es requerido" }));
            return;
          }

          let updated = await ScryptedStorage.updateCameraStreamUrl(
            cameraId,
            streamUrl,
          );
          if (!updated) {
            const cuiStore = await CameraUiStorage.load();
            const cleanId = cameraId
              .replace(/^camera\.cameraui_/, "")
              .replace(/^camera\./, "")
              .replace(/^cameraui_/, "");
            const cuiCam = cuiStore.cameras.find(
              (c) =>
                c.id === cameraId ||
                c.id === cleanId ||
                `cameraui_${cleanId}` === c.id,
            );
            if (cuiCam) {
              await CameraUiStorage.updateCamera(cuiCam.id, (cam) => {
                cam.rtspUrl = streamUrl;
                return cam;
              });
              updated = true;
              try {
                const refreshedStore = await CameraUiStorage.load();
                const refreshedCam = refreshedStore.cameras.find((c) => c.id === cuiCam.id) || cuiCam;
                await CameraUiHomeKitBridge.mountCamera(this, refreshedCam, {
                  forceRemount: true,
                });
              } catch (remountErr) {
                this.log.warn(`[Camera.UI] Error al remontar cámara tras cambio de RTSP: ${remountErr}`);
              }
            } else {
              // Check if it's a native Home Assistant camera entity (e.g. Google Nest / go2rtc)
              const haState =
                this.ha?.hassStates?.get(cameraId) ||
                this.ha?.hassStates?.get(`camera.${cleanId}`);
              if (haState) {
                const friendlyName =
                  (haState.attributes as any)?.friendly_name ||
                  cleanId.replace(/_/g, " ").toUpperCase();
                const newCam: any = {
                  id: cameraId,
                  name: friendlyName,
                  manufacturer: (haState.attributes as any)?.brand || "Home Assistant",
                  model: (haState.attributes as any)?.model_name || "Camera IP",
                  rtspUrl: streamUrl,
                  hasAudio: true,
                  homeKitEnabled: true,
                  status: "online",
                  pincode: "031-45-154",
                  setupId: "HA01",
                };
                cuiStore.cameras.push(newCam);
                await CameraUiStorage.save(cuiStore);
                updated = true;
                try {
                  await CameraUiHomeKitBridge.mountCamera(this, newCam);
                } catch (mountErr) {
                  this.log.error(
                    `Error mounting HA camera ${cameraId} to HomeKit: ${mountErr}`,
                  );
                }
              }
            }
          }
          if (!updated) {
            res.writeHead(404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "Cámara no encontrada" }));
            return;
          }

          // Remount camera in HomeKit if it was in Scrypted store
          const store = await ScryptedStorage.load();
          const cam = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId,
          );
          if (cam) {
            try {
              await ScryptedHomeKitBridge.unmountCamera(cameraId);
              await ScryptedHomeKitBridge.mountCamera(this, cam);
            } catch (mountErr) {
              this.log.error(
                `Error remounting camera ${cameraId} after stream URL update: ${mountErr}`,
              );
            }
          }

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: true, streamUrl }));
          return;
        }

        // POST /api/custom/cameras/probe-stream
        if (
          req.method === "POST" &&
          (pathname === "/api/cameras/probe-stream" ||
            pathname === "/api/custom/cameras/probe-stream")
        ) {
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let parsed: any = {};
          try {
            parsed = JSON.parse(bodyStr);
          } catch {}

          const rawUrl = String(parsed.streamUrl || "").trim();
          let host = "127.0.0.1";
          let port = 8554;

          try {
            const u = new URL(rawUrl);
            host = u.hostname;
            port = u.port
              ? parseInt(u.port, 10)
              : u.protocol === "rtsps:"
                ? 322
                : 554;
          } catch {
            if (parsed.host) host = String(parsed.host);
            if (parsed.port) port = Number(parsed.port);
          }

          const reachable = await ScryptedClient.probeRtspPort(
            host,
            port,
            3000,
          );
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ ok: reachable, host, port }));
          return;
        }

        // POST /api/custom/cameras/:id/verify-stream
        const verifyStreamMatch = pathname.match(
          /\/cameras\/([^/]+)\/verify-stream$/,
        );
        if (req.method === "POST" && verifyStreamMatch) {
          const cameraId = decodeURIComponent(verifyStreamMatch[1]);
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let parsed: any = {};
          try {
            parsed = JSON.parse(bodyStr);
          } catch {}

          const store = await ScryptedStorage.load();
          const cleanId = cameraId
            .replace(/^camera\.cameraui_/, "")
            .replace(/^camera\./, "")
            .replace(/^cameraui_/, "");
          const scryptedCam = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId || c.cameraId === cleanId,
          );

          const cuiStore = await CameraUiStorage.load();
          const cuiCam = cuiStore.cameras.find(
            (c) =>
              c.id === cameraId ||
              c.id === cleanId ||
              `cameraui_${cleanId}` === c.id ||
              c.name.toLowerCase() === cameraId.toLowerCase(),
          );

          const haState =
            this.ha?.hassStates?.get(cameraId) ||
            this.ha?.hassStates?.get(`camera.${cleanId}`);

          let targetUrl =
            String(parsed.streamUrl || "").trim() ||
            scryptedCam?.source.streamReference?.directUrl ||
            cuiCam?.rtspUrl ||
            (haState?.attributes as any)?.stream_source ||
            "";

          if (!targetUrl) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                error:
                  "No se proporcionó una URL de stream RTSP/HTTP para verificar.",
              }),
            );
            return;
          }

          try {
            if (
              (targetUrl.startsWith("rtsp://localhost") ||
                targetUrl.startsWith("rtsp://127.0.0.1") ||
                targetUrl.startsWith("rtsps://localhost") ||
                targetUrl.startsWith("rtsps://127.0.0.1")) &&
              store.scrypted?.serverUrl &&
              store.scrypted.connectionStatus === "connected" &&
              scryptedCam
            ) {
              const parsedServer = new URL(store.scrypted.serverUrl);
              if (
                parsedServer.hostname &&
                parsedServer.hostname !== "localhost" &&
                parsedServer.hostname !== "127.0.0.1"
              ) {
                targetUrl = targetUrl
                  .replace("://localhost", `://${parsedServer.hostname}`)
                  .replace("://127.0.0.1", `://${parsedServer.hostname}`);
              }
            }
          } catch {}

          const transport = parsed.transport === "udp" ? "udp" : "tcp";
          ScryptedStreamValidator.clearCache();
          // An on-demand UI check must never monopolize the add-on.  It is a
          // quick reachability/metadata check; the full GOP analysis belongs
          // to the explicit diagnostics endpoint below.
          const validation = await ScryptedStreamValidator.validateStreamUrl(
            targetUrl,
            cameraId,
            Math.min(Math.max(Number(parsed.timeoutMs) || 3500, 1000), 5000),
            undefined,
            transport,
          );

          if (scryptedCam) {
            await ScryptedStorage.updateCameraStreamValidation(
              scryptedCam.cameraId,
              validation.status,
              validation.error,
              validation.status === "verified"
                ? {
                    videoCodec: validation.videoCodec as any,
                    audioCodec: validation.audioCodec as any,
                    resolution: validation.resolution,
                    fps: validation.fps,
                    hasAudio: validation.hasAudio ?? true,
                    needsDumpExtra: validation.needsDumpExtra,
                    gopSeconds: validation.gopSeconds,
                  }
                : undefined,
              validation.metrics,
            );

            if (validation.status === "verified") {
              scryptedCam.status.connection = "online";
              scryptedCam.status.cache = "fresh";
              await ScryptedStorage.save(store);

              try {
                if (scryptedCam.exportConfig?.homeKitEnabled) {
                  await ScryptedHomeKitBridge.mountCamera(this, scryptedCam);
                }
              } catch (remountErr) {
                this.log.warn(
                  `[Scrypted] Remount HAP after verification note: ${remountErr}`,
                );
              }
            }
          }

          if (cuiCam) {
            await CameraUiStorage.updateCamera(cuiCam.id, (cam) => {
              cam.rtspUrl = targetUrl;
              if (validation.status === "verified") {
                cam.status = "online";
                cam.videoCodecSource = "ffprobe";
                cam.codecProbeUrl = targetUrl;
                cam.codecProbedAt = validation.validatedAt;
                if (validation.resolution) {
                  cam.width = validation.resolution.width;
                  cam.height = validation.resolution.height;
                }
                if (validation.fps) cam.fps = validation.fps;
                if (validation.videoCodec) cam.videoCodec = validation.videoCodec;
                if (validation.audioCodec) cam.audioCodec = validation.audioCodec;
                if (validation.hasAudio !== undefined)
                  cam.hasAudio = validation.hasAudio;
              }
              return cam;
            });
          }

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              ok: validation.status === "verified",
              status: validation.status,
              validation,
              camera: scryptedCam || cuiCam || { id: cameraId, name: cameraId },
            }),
          );
          return;
        }

        // POST /api/custom/cameras/:id/diagnose-stream
        const diagnoseStreamMatch = pathname.match(
          /\/cameras\/([^/]+)\/diagnose-stream$/,
        );
        if (req.method === "POST" && diagnoseStreamMatch) {
          const cameraId = decodeURIComponent(diagnoseStreamMatch[1]);
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let parsed: any = {};
          try {
            parsed = JSON.parse(bodyStr);
          } catch {}

          const store = await ScryptedStorage.load();
          const cleanId = cameraId
            .replace(/^camera\.cameraui_/, "")
            .replace(/^camera\./, "")
            .replace(/^cameraui_/, "");
          const scryptedCam = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId || c.cameraId === cleanId,
          );

          const cuiStore = await CameraUiStorage.load();
          const cuiCam = cuiStore.cameras.find(
            (c) =>
              c.id === cameraId ||
              c.id === cleanId ||
              `cameraui_${cleanId}` === c.id ||
              c.name.toLowerCase() === cameraId.toLowerCase(),
          );

          const haState =
            this.ha?.hassStates?.get(cameraId) ||
            this.ha?.hassStates?.get(`camera.${cleanId}`);

          if (!scryptedCam && !cuiCam && !haState) {
            res.writeHead(404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "Cámara no encontrada" }));
            return;
          }

          let targetUrl =
            String(parsed.streamUrl || "").trim() ||
            scryptedCam?.source.streamReference?.directUrl ||
            cuiCam?.rtspUrl ||
            (haState?.attributes as any)?.stream_source ||
            "";

          try {
            if (
              (targetUrl.startsWith("rtsp://localhost") ||
                targetUrl.startsWith("rtsp://127.0.0.1") ||
                targetUrl.startsWith("rtsps://localhost") ||
                targetUrl.startsWith("rtsps://127.0.0.1")) &&
              store.scrypted?.serverUrl
            ) {
              const parsedServer = new URL(store.scrypted.serverUrl);
              if (
                parsedServer.hostname &&
                parsedServer.hostname !== "localhost" &&
                parsedServer.hostname !== "127.0.0.1"
              ) {
                targetUrl = targetUrl
                  .replace("://localhost", `://${parsedServer.hostname}`)
                  .replace("://127.0.0.1", `://${parsedServer.hostname}`);
              }
            }
          } catch {}

          if (!targetUrl) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error:
                  "La cámara no tiene una URL de stream RTSP configurada ni descubierta. Ingresa una URL o activa el stream en Scrypted.",
                cause: "missing_stream_url",
              }),
            );
            return;
          }

          const sanitizedUrl = sanitizeUrlCredentials(targetUrl);
          this.log.notice(
            `[DiagnoseStream][${cameraId}] Iniciando diagnóstico de stream RTSP/HTTP: ${sanitizedUrl}`,
          );

          const transport = parsed.transport === "udp" ? "udp" : "tcp";
          ScryptedStreamValidator.clearCache();
          const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
            targetUrl,
            cameraId,
            parsed.timeoutMs ? Number(parsed.timeoutMs) : 8000,
            transport,
          );

          if (scryptedCam) {
            scryptedCam.capabilities.latencyMetrics = metrics;
            if (metrics.observedGopSeconds?.value) {
              if (!scryptedCam.capabilities.observed) {
                scryptedCam.capabilities.observed = {
                  videoCodec: "h264",
                  resolution: { width: 1920, height: 1080 },
                  hasAudio: true,
                };
              }
              scryptedCam.capabilities.observed.gopSeconds =
                metrics.observedGopSeconds.value;
            }
            await ScryptedStorage.save(store);
          }

          if (metrics.failureCause || metrics.timeToDescribeMs?.value == null) {
            const cause = metrics.failureCause || "invalid_stream";
            const errorMsg =
              metrics.error || "No se pudo obtener información del stream RTSP.";
            this.log.warn(
              `[DiagnoseStream][${cameraId}] Diagnóstico fallido: causa=${cause} error="${errorMsg}" target=${sanitizedUrl}`,
            );
            res.writeHead(422, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: false,
                error: errorMsg,
                cause,
                metrics,
                camera: scryptedCam || cuiCam || { id: cameraId, name: cameraId },
              }),
            );
            return;
          }

          this.log.notice(
            `[DiagnoseStream][${cameraId}] Diagnóstico completado con éxito: describe=${metrics.timeToDescribeMs.value}ms 1erFrame=${metrics.timeToFirstFrameMs?.value ?? "N/A"}ms target=${sanitizedUrl}`,
          );
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              success: true,
              metrics,
              camera: scryptedCam || cuiCam || { id: cameraId, name: cameraId },
            }),
          );
          return;
        }

        // GET /api/custom/cameras/:id/snapshot or /api/cameras/:id/snapshot
        const snapshotMatch = pathname.match(
          /\/cameras\/([^/]+)\/snapshot$/,
        );
        if (req.method === "GET" && snapshotMatch) {
          const cameraId = decodeURIComponent(snapshotMatch[1]);
          const snapBuffer = await this.getCameraSnapshotBuffer(cameraId);
          if (snapBuffer && snapBuffer.length > 0) {
            res.writeHead(200, {
              "Content-Type": "image/jpeg",
              "Cache-Control": "no-cache, no-store, must-revalidate",
              "Content-Length": snapBuffer.length,
            });
            res.end(snapBuffer);
            return;
          }
          res.writeHead(200, {
            "Content-Type": "image/jpeg",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "X-Snapshot-Status": "fallback",
          });
          res.end(FALLBACK_JPEG_BUFFER);
          return;
        }

        // POST /api/custom/cameras/:id/select-profile
        const selectProfileMatch = pathname.match(
          /\/cameras\/([^/]+)\/select-profile$/,
        );
        if (req.method === "POST" && selectProfileMatch) {
          const cameraId = decodeURIComponent(selectProfileMatch[1]);
          let bodyStr = "";
          for await (const chunk of req) bodyStr += chunk.toString();
          let parsed: any = {};
          try {
            parsed = JSON.parse(bodyStr);
          } catch {}

          const profileId = String(parsed.profileId || "").trim();
          if (!profileId) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "profileId es requerido" }));
            return;
          }

          const ok = await ScryptedStorage.selectCameraStreamProfile(
            cameraId,
            profileId,
          );

          if (!ok) {
            res.writeHead(404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({ error: "Perfil o cámara no encontrados" }),
            );
            return;
          }

          const store = await ScryptedStorage.load();
          const cam = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId,
          );
          if (cam) {
            try {
              await ScryptedHomeKitBridge.unmountCamera(cameraId);
              await ScryptedHomeKitBridge.mountCamera(this, cam);
            } catch {}
          }

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              success: true,
              cameraId,
              profileId,
              camera: cam,
            }),
          );
          return;
        }

        const exportConfigMatch = pathname.match(
          /\/cameras\/([^/]+)\/export-config$/,
        );
        if (req.method === "PUT" && exportConfigMatch) {
          const cameraId = decodeURIComponent(exportConfigMatch[1]);
          try {
            const body = await this.readRequestBody(req);
            const exportConfig = JSON.parse(body);
            let updated = await ScryptedStorage.updateCameraExportConfig(
              cameraId,
              exportConfig,
            );
            let cam: any = null;
            if (!updated) {
              const cuiStore = await CameraUiStorage.load();
              const cleanId = cameraId
                .replace(/^camera\.cameraui_/, "")
                .replace(/^camera\./, "")
                .replace(/^cameraui_/, "");
              const cuiCam = cuiStore.cameras.find(
                (c) =>
                  c.id === cameraId ||
                  c.id === cleanId ||
                  `cameraui_${cleanId}` === c.id,
              );
              if (cuiCam) {
                await CameraUiStorage.updateCamera(cuiCam.id, (c) => {
                  if (exportConfig.rtspUrl) c.rtspUrl = exportConfig.rtspUrl;
                  if (exportConfig.model) c.model = exportConfig.model;
                  if (exportConfig.homeKitEnabled !== undefined) {
                    c.homeKitEnabled = exportConfig.homeKitEnabled;
                  }
                  if (exportConfig.lightEntityId !== undefined) {
                    c.lightEntityId = exportConfig.lightEntityId;
                  }
                  if (exportConfig.sirenEntityId !== undefined) {
                    c.sirenEntityId = exportConfig.sirenEntityId;
                  }
                  if (exportConfig.motionEntityId !== undefined) {
                    c.motionEntityId = exportConfig.motionEntityId;
                  }
                  return c;
                });
                const updatedStore = await CameraUiStorage.load();
                const freshCam =
                  updatedStore.cameras.find((c) => c.id === cuiCam.id) || cuiCam;
                if (freshCam.homeKitEnabled !== false) {
                  const servicesChanged =
                    exportConfig.lightEntityId !== undefined ||
                    exportConfig.sirenEntityId !== undefined ||
                    exportConfig.motionEntityId !== undefined;
                  await CameraUiHomeKitBridge.mountCamera(this, freshCam, {
                    forceRemount: servicesChanged,
                  });
                } else {
                  await CameraUiHomeKitBridge.unmountCamera(freshCam.id);
                }
                res.writeHead(200, {
                  "Content-Type": "application/json; charset=utf-8",
                });
                res.end(JSON.stringify({ success: true, camera: freshCam }));
                return;
              }
              res.writeHead(404, {
                "Content-Type": "application/json; charset=utf-8",
              });
              res.end(JSON.stringify({ error: "Cámara no encontrada" }));
              return;
            }
            const store = ScryptedStorage.getStore();
            cam = store.cameras.cameras.find(
              (c) => c.cameraId === cameraId,
            );
            if (cam) {
              if (cam.exportConfig.homeKitEnabled) {
                await ScryptedHomeKitBridge.mountCamera(this, cam);
              } else {
                ScryptedHomeKitBridge.unmountCamera(cameraId);
              }
              if (cam.exportConfig.matterEnabled) {
                await ScryptedMatterBridge.mountCamera(this, cam);
              } else {
                await ScryptedMatterBridge.unmountCamera(this, cameraId);
              }
            }
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ success: true, camera: cam }));
          } catch (err: any) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                error: err.message || "Error al actualizar exportConfig",
              }),
            );
          }
          return;
        }

        const recordingStatusMatch = pathname.match(
          /\/cameras\/([^/]+)\/recording-status$/,
        );
        if (req.method === "GET" && recordingStatusMatch) {
          const cameraId = decodeURIComponent(recordingStatusMatch[1]);
          const store = await ScryptedStorage.load();
          const camera = store.cameras.cameras.find(
            (c) => c.cameraId === cameraId,
          );
          if (!camera) {
            res.writeHead(404, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(JSON.stringify({ error: "Cámara no encontrada" }));
            return;
          }
          const hksvActive =
            camera.exportConfig.hksvEnabledByDefault &&
            camera.status.connection === "online";
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              cameraId,
              hksv: {
                enabled: camera.exportConfig.hksvEnabledByDefault,
                verified: hksvActive,
                status: hksvActive ? "ready" : "waiting_hub",
                destination: "iCloud+ vía Apple Home Hub (tvOS 27 / homeOS 27)",
              },
              stream: {
                strategy: "passthrough_h264",
                videoCodecCopy: true,
                zeroLocalReencoding: true,
              },
            }),
          );
          return;
        }

        const nasConfigMatch = pathname.match(
          /\/cameras\/([^/]+)\/nas-config$/,
        );
        if (req.method === "PUT" && nasConfigMatch) {
          const cameraId = decodeURIComponent(nasConfigMatch[1]);
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            let credentialsEncrypted = undefined;
            if (
              data.credentials &&
              typeof data.credentials === "string" &&
              data.credentials.trim().length > 0
            ) {
              credentialsEncrypted = await ScryptedCrypto.encrypt(
                data.credentials.trim(),
                "nas_credentials",
              );
            }
            await ScryptedStorage.updateCameraNasConfig(cameraId, {
              enabled: Boolean(data.enabled),
              protocol: data.protocol || "smb",
              endpoint: data.endpoint || "",
              credentialsEncrypted,
              path: data.path || "/",
              retentionDays: Number(data.retentionDays) || 30,
              maxSpaceGb: Number(data.maxSpaceGb) || 500,
              format: data.format || "fmp4",
            });
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                success: true,
                message: "Configuración NAS guardada.",
              }),
            );
          } catch (err: any) {
            res.writeHead(400, {
              "Content-Type": "application/json; charset=utf-8",
            });
            res.end(
              JSON.stringify({
                error: err.message || "Error al guardar configuración NAS",
              }),
            );
          }
          return;
        }

        const deleteCamMatch = pathname.match(/\/cameras\/([^/]+)$/);
        if (req.method === "DELETE" && deleteCamMatch) {
          const cameraId = decodeURIComponent(deleteCamMatch[1]);
          ScryptedHomeKitBridge.unmountCamera(cameraId);
          await ScryptedMatterBridge.unmountCamera(this, cameraId);
          const removed = await ScryptedStorage.removeCamera(cameraId);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(JSON.stringify({ success: removed }));
          return;
        }

        // ── Camera.UI REST Endpoints ──────────────────────────────────────────
        if (
          req.method === "GET" &&
          (pathname === "/api/cameraui/config" ||
            pathname === "/api/custom/cameraui/config")
        ) {
          const store = await CameraUiStorage.load();
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(
            JSON.stringify({
              enabled: store.config.enabled,
              serverUrl: store.config.serverUrl,
              username: store.config.username || "",
              hasPassword: Boolean(store.config.password),
              rtspUsername: store.config.rtspUsername || "",
              hasRtspPassword: Boolean(store.config.rtspPassword),
              mqttEnabled: store.config.mqttEnabled ?? true,
              mqttTopicPrefix: store.config.mqttTopicPrefix || "camera.ui",
              allowSelfSignedCertificate: store.config.allowSelfSignedCertificate ?? true,
              pollIntervalSeconds: store.config.pollIntervalSeconds || 300,
              lastSyncedAt: store.config.lastSyncedAt || null,
              lastError: store.config.lastError || null,
              connectionStatus:
                store.config.connectionStatus ||
                (store.config.enabled ? "disconnected" : "disabled"),
            }),
          );
          return;
        }

        if (
          (req.method === "POST" || req.method === "PUT") &&
          (pathname === "/api/cameraui/config" ||
            pathname === "/api/custom/cameraui/config")
        ) {
          try {
            const body = await this.readRequestBody(req);
            const data = JSON.parse(body);
            const store = await CameraUiStorage.load();
            const previousServerUrl = store.config.serverUrl;
            const previousRtspUsername = store.config.rtspUsername;
            const previousRtspPassword = store.config.rtspPassword;

            if (typeof data.enabled === "boolean") store.config.enabled = data.enabled;
            if (data.serverUrl !== undefined) store.config.serverUrl = String(data.serverUrl).trim();
            if (data.username !== undefined) store.config.username = String(data.username).trim();
            if (data.password !== undefined && String(data.password).length > 0) {
              store.config.password = String(data.password);
            }
            if (data.clearPassword === true) store.config.password = undefined;
            if (data.rtspUsername !== undefined) store.config.rtspUsername = String(data.rtspUsername).trim();
            if (data.rtspPassword !== undefined && String(data.rtspPassword).length > 0) {
              store.config.rtspPassword = String(data.rtspPassword);
            }
            if (data.clearRtspPassword === true) store.config.rtspPassword = undefined;
            if (typeof data.mqttEnabled === "boolean") store.config.mqttEnabled = data.mqttEnabled;
            if (data.mqttTopicPrefix !== undefined) store.config.mqttTopicPrefix = String(data.mqttTopicPrefix).trim();
            if (typeof data.allowSelfSignedCertificate === "boolean") {
              store.config.allowSelfSignedCertificate = data.allowSelfSignedCertificate;
            }

            await CameraUiStorage.save(store);
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: true, config: store.config }));

            // Respond before touching HAP. Previously each persisted camera was
            // remounted serially here, leaving the UI stuck on “Guardando”.
            const rtspChanged =
              previousServerUrl !== store.config.serverUrl ||
              previousRtspUsername !== store.config.rtspUsername ||
              previousRtspPassword !== store.config.rtspPassword;
            if (rtspChanged) {
              void (async () => {
                for (const camera of store.cameras) {
                  if (!camera.homeKitEnabled || !camera.rtspUrl) continue;
                  try {
                    await CameraUiHomeKitBridge.mountCamera(this, camera, { forceRemount: true });
                  } catch (mountErr) {
                    this.log.warn(`[Camera.UI] Error applying RTSP configuration to ${camera.name}: ${mountErr}`);
                  }
                }
                this.broadcastSseMessage("cameraui_updated", { connectionStatus: "connecting" });
              })();
            }
          } catch (err: any) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: err.message || "Error al guardar configuración de Camera.UI" }));
          }
          return;
        }

        if (
          req.method === "GET" &&
          (pathname === "/api/cameraui/debug-notifications" ||
            pathname === "/api/custom/cameraui/debug-notifications")
        ) {
          try {
            const store = await CameraUiStorage.load();
            const client = new CameraUiClient(store.config);
            await client.login();
            const rawNotifications = await client.getRecentNotifications();
            const activeAccessories = CameraUiHomeKitBridge.getAllAccessories();
            const mountedCameras = [...activeAccessories.entries()].map(([id, acc]) => ({
              cuiId: id,
              name: acc.record?.name,
              entityId: (acc as any).entityId,
            }));
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({
              lastKnownTimeSec: this.lastCameraUiNotificationTime,
              nowSec: Math.floor(Date.now() / 1000),
              serverUrl: store.config.serverUrl,
              notificationCount: rawNotifications.length,
              first5Notifications: rawNotifications.slice(0, 5),
              mountedCameras,
            }, null, 2));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/cameraui/motion" ||
            pathname === "/api/cameraui/webhook" ||
            pathname === "/api/custom/cameraui/motion")
        ) {
          try {
            const body = await this.readRequestBody(req);
            let data: any = {};
            try {
              if (body) data = JSON.parse(body);
            } catch {}

            const camIdentifier = String(
              data.camera ||
              data.name ||
              data.id ||
              data.title ||
              data.cameraName ||
              urlObj.searchParams.get("camera") ||
              urlObj.searchParams.get("name") ||
              "",
            ).trim();
            const isActive = data.state !== false && data.motion !== false && data.active !== false;
            const activeAccessories = CameraUiHomeKitBridge.getAllAccessories();
            const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const cleanId = clean(camIdentifier);

            let matched = false;
            for (const [cuiId, acc] of activeAccessories) {
              const accCleanCuiId = clean(cuiId.replace(/^cameraui_/, ""));
              const accCleanName = clean(acc.record?.name || "");
              const accWords = (acc.record?.name || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
              const wordsMatch = accWords.length > 0 && accWords.every((w) => cleanId.includes(w));
              if (
                cleanId === accCleanCuiId ||
                cleanId === accCleanName ||
                (cleanId.length >= 4 && (cleanId.includes(accCleanCuiId) || accCleanCuiId.includes(cleanId))) ||
                (cleanId.length >= 3 && (cleanId.includes(accCleanName) || accCleanName.includes(cleanId))) ||
                wordsMatch ||
                (activeAccessories.size === 1)
              ) {
                CameraUiHomeKitBridge.updateMotion(cuiId, isActive, this);
                this.broadcastSseMessage("cameraui_motion", { cameraId: cuiId, motionOn: isActive });
                this.log.notice(
                  `[Camera.UI][Webhook] Movimiento ${isActive ? "ACTIVADO" : "DESACTIVADO"} para "${acc.record?.name || cuiId}" en HomeKit y Matter`,
                );

                if (isActive && this.cameraAiDetector) {
                  const triggerInfo = data.trigger || data.label || data.type || data.target || data.subtitle || data.body || "webhook";
                  const allText = [
                    data.label,
                    data.trigger,
                    data.type,
                    data.target,
                    data.tag,
                    data.title,
                    data.subtitle,
                    data.body,
                    data.message,
                    typeof data.record === "string" ? data.record : JSON.stringify(data.record || {}),
                    typeof data.details === "string" ? data.details : JSON.stringify(data.details || {}),
                  ].filter(Boolean).join(" ").toLowerCase();

                  const isVehicle = /vehicle|vehiculo|vehículo|car|auto|camion|camión|truck|bus|motorcycle|moto/i.test(allText);
                  const isPerson = /person|persona|humano|human|face|cara/i.test(allText);
                  const isPet = /dog|perro|cat|gato|pet|animal|mascota|bird|ave/i.test(allText);
                  const targets: import("./camera/camera-types.js").CameraAiTarget[] = [];
                  if (isVehicle) targets.push("vehicle");
                  if (isPerson) targets.push("person");
                  if (isPet) targets.push("dog");
                  if (targets.length === 0) targets.push("person");

                  this.cameraAiDetector.dispatchDetection(this, cuiId, {
                    cameraId: cuiId,
                    timestamp: Date.now(),
                    targets,
                    labels: [String(triggerInfo)],
                    confidence: 0.95,
                    rawDetails: `Camera.UI Webhook: ${triggerInfo}`,
                  });

                  // Auto-reset motion after 10 seconds if Camera.UI only pushes active events
                  const existingTimer = this.cameraUiActiveMotionTimers.get(cuiId);
                  if (existingTimer) clearTimeout(existingTimer);
                  const resetTimer = setTimeout(() => {
                    CameraUiHomeKitBridge.updateMotion(cuiId, false, this);
                    this.broadcastSseMessage("cameraui_motion", { cameraId: cuiId, motionOn: false });
                    this.cameraUiActiveMotionTimers.delete(cuiId);
                  }, 10_000);
                  this.cameraUiActiveMotionTimers.set(cuiId, resetTimer);
                }
                matched = true;
                break;
              }
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: true }));
          } catch (err: any) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/cameraui/test-connection" ||
            pathname === "/api/custom/cameraui/test-connection")
        ) {
          try {
            const body = await this.readRequestBody(req);
            let data: any = {};
            try {
              if (body) data = JSON.parse(body);
            } catch {}

            const store = await CameraUiStorage.load();
            const serverUrl = String(data.serverUrl || store.config.serverUrl || "").trim();
            if (!serverUrl) {
              res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              res.end(
                JSON.stringify({
                  ok: false,
                  message:
                    "URL del servidor Camera.UI no configurada. Por favor ingresa la URL completa (ej. https://192.168.110.46:3543).",
                }),
              );
              return;
            }

            const username =
              data.username !== undefined && String(data.username).trim().length > 0
                ? String(data.username).trim()
                : store.config.username;
            const password =
              data.password !== undefined && String(data.password).length > 0
                ? String(data.password)
                : store.config.password;
            const allowSelfSigned =
              typeof data.allowSelfSignedCertificate === "boolean"
                ? data.allowSelfSignedCertificate
                : (store.config.allowSelfSignedCertificate ?? true);

            const client = new CameraUiClient({
              enabled: true,
              serverUrl,
              username,
              password,
              allowSelfSignedCertificate: allowSelfSigned,
            });
            const result = await client.testConnection();
            if (result.ok) {
              store.config.connectionStatus = "connected";
              store.config.enabled = true;
              if (result.activeUrl) {
                store.config.serverUrl = result.activeUrl;
              }
              store.cameras.forEach((cam) => {
                cam.status = "online";
              });
              await CameraUiStorage.save(store);
              this.broadcastSseMessage("cameraui_updated", { connectionStatus: "connected" });
            }
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(result));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ ok: false, message: err.message || "Error al probar conexión" }));
          }
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/cameraui/sync" ||
            pathname === "/api/custom/cameraui/sync")
        ) {
          try {
            const body = await this.readRequestBody(req);
            let data: any = {};
            try {
              if (body) data = JSON.parse(body);
            } catch {}

            const store = await CameraUiStorage.load();
            store.config.enabled = true;
            if (data.serverUrl) store.config.serverUrl = String(data.serverUrl).trim();
            if (data.username !== undefined) store.config.username = String(data.username).trim();
            if (data.password !== undefined && String(data.password).length > 0) {
              store.config.password = String(data.password);
            }
            if (typeof data.allowSelfSignedCertificate === "boolean") {
              store.config.allowSelfSignedCertificate = data.allowSelfSignedCertificate;
            }
            await CameraUiStorage.save(store);

            const client = new CameraUiClient(store.config);
            const discovered = await client.fetchCameras();
            const previousIds = new Set(store.cameras.map((c) => c.id));
            const previousSources = new Map(store.cameras.map((c) => [c.id, c.rtspUrl]));

            if (discovered.length === 0) {
              throw new Error("Camera.UI no devolvió cámaras ni una fuente RTSP viva. Se conservaron los emparejamientos y no se aplicó ninguna ruta almacenada.");
            }

            await CameraUiStorage.mergeDiscoveredCameras(discovered);
            void this.ensureGo2rtcStreamsRegistered();
            const updatedStore = await CameraUiStorage.updateConnectionStatus("connected");

            for (const camera of updatedStore.cameras) {
              if (camera.homeKitEnabled) {
                try {
                  await CameraUiHomeKitBridge.mountCamera(this, camera, {
                    // Preserve the HAP port, UUID and pairing while replacing
                    // an idle delegate whose Camera.UI source changed.
                    forceRemount: previousSources.has(camera.id) && previousSources.get(camera.id) !== camera.rtspUrl,
                  });
                } catch (mountErr) {
                  this.log.warn(`[Camera.UI] Error mounting ${camera.name}: ${mountErr}`);
                }
              }
            }

            const currentCameras = updatedStore.cameras.map((cam) => {
              const acc = CameraUiHomeKitBridge.getAccessory(cam.id);
              return {
                ...cam,
                setupUri: acc?.setupUri || cam.setupUri,
                isPaired: acc?.isPaired() ?? cam.isPaired ?? false,
              };
            });

            const newCameras = currentCameras.filter((c) => !previousIds.has(c.id)).length;
            this.broadcastSseMessage("cameraui_updated", { cameras: currentCameras, connectionStatus: "connected" });

            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(
              JSON.stringify({
                success: true,
                totalCameras: currentCameras.length,
                newCameras,
                cameras: currentCameras,
              }),
            );
          } catch (err: any) {
            await CameraUiStorage.updateConnectionStatus("disconnected", err.message);
            this.broadcastSseMessage("cameraui_updated", { connectionStatus: "disconnected" });
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: err.message || "Error al sincronizar cámaras de Camera.UI" }));
          }
          return;
        }

        if (
          req.method === "GET" &&
          (pathname === "/api/cameraui/cameras" ||
            pathname === "/api/custom/cameraui/cameras")
        ) {
          const store = await CameraUiStorage.load();
          const isCameraUiServerConnected = store.config.connectionStatus === "connected";
          const enriched = store.cameras.map((cam) => {
            const acc = CameraUiHomeKitBridge.getAccessory(cam.id);
            const livePaired = acc ? acc.isPaired() : (cam.isPaired ?? false);
            const isLiveAccessory = Boolean(acc && acc.isPublished);

            // Multi-vector liveness: camera is online if Camera.UI server is connected,
            // or if its HomeKit accessory is actively published on LAN, or if recorded status is online
            const effectiveStatus =
              isCameraUiServerConnected || isLiveAccessory || cam.status === "online"
                ? "online"
                : "offline";

            const realEntities = this.findLinkedCameraEntities(cam.name, cam.id);
            const hasLight = realEntities.some((e) => e.type === "light");
            const hasSiren = realEntities.some((e) => e.type === "siren");
            const lightEntity = realEntities.find((e) => e.type === "light");
            const sirenEntity = realEntities.find((e) => e.type === "siren");

            return {
              ...cam,
              status: effectiveStatus,
              setupUri: acc?.setupUri || cam.setupUri,
              isPaired: livePaired,
              port: acc?.record?.port || cam.port,
              pincode: acc?.record?.pincode || cam.pincode || "031-45-154",
              setupId: acc?.record?.setupId || cam.setupId,
              // The UI must never promote stale bridge capabilities to a
              // measured source codec. A verified ffprobe result wins, then
              // Camera.UI metadata is shown as metadata rather than proof.
              videoCodec:
                cam.videoCodecSource === "ffprobe" && cam.codecProbeUrl === cam.rtspUrl
                  ? cam.videoCodec
                  : cam.videoCodec,
              strategy: (acc?.capabilities?.strategy as any) || cam.strategy,
              width: acc?.capabilities?.resolution?.width || cam.width,
              height: acc?.capabilities?.resolution?.height || cam.height,
              fps: acc?.capabilities?.maxFps || cam.fps,
              activeController: acc?.record?.activeController || (acc ? "CameraController" : undefined),
              exportMode: acc?.record?.exportMode,
              hksvState: acc?.record?.hksvState,
              hksvVerified: acc?.record?.hksvVerified,
              audioCodec: acc?.capabilities?.audioCodec || (cam as any).audioCodec,
              audioSampleRate: acc?.capabilities?.audioSampleRate,
              audioChannels: acc?.capabilities?.audioChannels,
              audioIncompatibleReason: acc?.record?.audioIncompatibleReason,
              negotiatedConfiguration: acc?.recordingDelegate?.selectedConfiguration ? {
                resolution: acc.recordingDelegate.selectedConfiguration.videoCodec.resolution,
                fragmentLength: acc.recordingDelegate.selectedConfiguration.mediaContainerConfiguration.fragmentLength,
                prebufferLength: acc.recordingDelegate.selectedConfiguration.prebufferLength,
                audioSamplerate: acc.recordingDelegate.selectedConfiguration.audioCodec.samplerate,
              } : undefined,
              announcedResolutions: acc ? acc.buildRecordingResolutions() : undefined,
              hasLight,
              lightActive: lightEntity ? lightEntity.state : false,
              hasSiren,
              sirenActive: sirenEntity ? sirenEntity.state : false,
              realEntities,
            };
          });
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(enriched));
          return;
        }

        const cuiToggleMatch = pathname.match(
          /\/api\/(?:custom\/)?cameraui\/cameras\/([^/]+)\/toggle-homekit$/,
        );
        if (req.method === "POST" && cuiToggleMatch) {
          const cameraId = decodeURIComponent(cuiToggleMatch[1]);
          const store = await CameraUiStorage.load();
          const cam = store.cameras.find((c) => c.id === cameraId);
          if (!cam) {
            res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: "Cámara no encontrada" }));
            return;
          }
          cam.homeKitEnabled = !cam.homeKitEnabled;
          if (cam.homeKitEnabled) {
            await CameraUiHomeKitBridge.mountCamera(this, cam);
          } else {
            await CameraUiHomeKitBridge.unmountCamera(cameraId);
          }
          await CameraUiStorage.save(store);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: true, homeKitEnabled: cam.homeKitEnabled, camera: cam }));
          return;
        }

        const cuiResetMatch = pathname.match(
          /\/api\/(?:custom\/)?cameraui\/cameras\/([^/]+)\/reset-pairing$/,
        );
        if (req.method === "POST" && cuiResetMatch) {
          const cameraId = decodeURIComponent(cuiResetMatch[1]);
          const success = await CameraUiHomeKitBridge.resetPairing(this, cameraId);
          res.writeHead(success ? 200 : 400, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success }));
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/cameras/control-entity" ||
            pathname === "/api/custom/cameras/control-entity")
        ) {
          try {
            const rawBody = await this.readRequestBody(req);
            const body = rawBody ? JSON.parse(rawBody) : {};
            const { entityId, action } = body;
            if (!entityId) {
              res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ success: false, error: "entityId requerido" }));
              return;
            }
            const domain = entityId.split(".")[0];
            const service =
              action === "turn_on"
                ? "turn_on"
                : action === "turn_off"
                  ? "turn_off"
                  : "toggle";
            await this.ha?.callService(domain, service, entityId);
            const newState = this.ha?.hassStates?.get(entityId)?.state === "on";
            this.broadcastSseMessage("entity_state_changed", {
              entityId,
              state: newState,
            });
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: true, entityId, state: newState }));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        if (
          req.method === "GET" &&
          (pathname === "/api/cameras/ai-config" ||
            pathname === "/api/custom/cameras/ai-config")
        ) {
          const cameraId = urlObj.searchParams.get("cameraId");
          if (!cameraId) {
            res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: "cameraId requerido" }));
            return;
          }
          const config = this.cameraAiDetector.getConfig(cameraId);
          const active = this.cameraAiDetector.getActiveDetection(cameraId);
          res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ success: true, config, active }));
          return;
        }

        if (
          req.method === "POST" &&
          (pathname === "/api/cameras/ai-config" ||
            pathname === "/api/custom/cameras/ai-config")
        ) {
          try {
            const rawBody = await this.readRequestBody(req);
            const body = rawBody ? JSON.parse(rawBody) : {};
            const { cameraId, config } = body;
            if (!cameraId) {
              res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
              res.end(JSON.stringify({ success: false, error: "cameraId requerido" }));
              return;
            }
            const updated = this.cameraAiDetector.setConfig(cameraId, config || {});
            res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: true, config: updated }));
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
          return;
        }

        if (req.method === "POST" && pathname === "/api/custom/factoryreset") {
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
          });
          res.end(
            JSON.stringify({
              success: true,
              message: "Restableciendo de fábrica...",
            }),
          );
          this.log.warn(
            "[UI Server] Factory reset requested, wiping plugin overrides and exiting...",
          );
          setTimeout(async () => {
            try {
              const { rm } = await import("fs/promises");
              await rm("/data/device-overrides.json", { force: true });
              await rm("/data/exported-devices.json", { force: true });
              // A Matter factory reset must also remove Matterbridge's
              // persistent fabrics and commissioning data. Leaving this
              // directory behind makes a failed pairing look commissioned
              // and causes the old QR/node identity to be reused.
              await rm("/data/.matterbridge", { recursive: true, force: true });
            } catch (err) {
              this.log.error(`Failed to wipe storage: ${err}`);
            }
            process.exit(0);
          }, 1000);
          return;
        }

        // GET /api/custom/events - Server-Sent Events for real-time UI push
        if (req.method === "GET" && pathname === "/api/custom/events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders?.();
          this.sseSubscribers.add(res);

          const cleanup = () => {
            clearInterval(ping);
            this.sseSubscribers.delete(res);
          };

          const ping = setInterval(() => {
            if (res.destroyed || res.writableEnded) {
              cleanup();
              return;
            }
            try {
              res.write(":ping\n\n");
            } catch {
              cleanup();
            }
          }, 15000);

          req.on("close", cleanup);
          req.on("error", cleanup);
          req.on("aborted", cleanup);
          res.on("close", cleanup);
          res.on("error", cleanup);
          res.on("finish", cleanup);

          res.write(":ok\n\n");
          return;
        }

        res.writeHead(404);
        res.end("Not Found");
      } catch (err) {
        this.log.error(`UI Server error handling request: ${err}`);
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    });

    this.uiServer = server;
    return new Promise((resolve, reject) => {
      const startupError = (error: Error) => reject(error);
      server.once("error", startupError);
      server.listen(this._uiPort, "127.0.0.1", () => {
        server.off("error", startupError);
        server.on("error", (error) =>
          this.log.error(`Custom UI Server error: ${error}`),
        );
        this.log.notice(
          `Custom Liquid Glass UI Server listening on port ${this.uiServerPort}`,
        );
        resolve();
      });
    });
  }

  private async readFrontendFile(filename: string): Promise<string | null> {
    const dir = import.meta.dirname;
    const distPath = path.join(dir, "frontend", filename);
    const srcPath = path.join(dir, "../src/frontend", filename);
    try {
      return await fs.readFile(distPath, "utf8");
    } catch {
      try {
        return await fs.readFile(srcPath, "utf8");
      } catch {
        return null;
      }
    }
  }

  private async readBinaryFile(filename: string): Promise<Buffer | null> {
    const dir = import.meta.dirname;
    const distPath = path.join(dir, "frontend", filename);
    const srcPath = path.join(dir, "../src/frontend", filename);
    try {
      return await fs.readFile(distPath);
    } catch {
      try {
        return await fs.readFile(srcPath);
      } catch {
        return null;
      }
    }
  }

  private readRequestBody(
    req: http.IncomingMessage,
    maxBytes = 64 * 1024,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      let bytes = 0;
      let tooLarge = false;
      req.on("data", (chunk: Buffer) => {
        if (tooLarge) return;
        bytes += chunk.length;
        if (bytes > maxBytes) {
          tooLarge = true;
          body = "";
          return;
        }
        body += chunk.toString("utf8");
      });
      req.on("end", () =>
        tooLarge ? reject(new Error("Request body too large")) : resolve(body),
      );
      req.on("error", reject);
    });
  }

  private async getPackageVersion(): Promise<string> {
    if (this.packageVersion) return this.packageVersion;
    const dir = import.meta.dirname;
    const paths = [
      path.join(dir, "../package.json"),
      path.join(dir, "package.json"),
      path.join(dir, "../../package.json"),
    ];
    for (const p of paths) {
      try {
        const content = await fs.readFile(p, "utf8");
        const pkg = JSON.parse(content);
        if (pkg.version) {
          this.packageVersion = pkg.version;
          return pkg.version;
        }
      } catch {
        // try next
      }
    }
    return "unknown";
  }

  public async getCameraSnapshotBuffer(cameraId: string): Promise<Buffer | null> {
    const cleanId = cameraId
      .replace(/^camera\.cameraui_/, "")
      .replace(/^camera\./, "")
      .replace(/^cameraui_/, "")
      .replaceAll(".", "_");
    const snapPath = `/data/snapshots/${cleanId}.jpg`;
    try {
      if (fsSync.existsSync(snapPath)) {
        const stat = fsSync.statSync(snapPath);
        if (Date.now() - stat.mtimeMs < 10000 && stat.size > 1024) {
          return fsSync.readFileSync(snapPath);
        }
      }
    } catch {}

    // 1. Try Home Assistant fetchSnapshot if HA entity exists
    if (this.ha?.fetchSnapshot) {
      try {
        let haEntity = cameraId.startsWith("camera.") ? cameraId : undefined;
        if (!haEntity && this.ha.hassStates) {
          for (const id of this.ha.hassStates.keys()) {
            if (
              id.startsWith("camera.") &&
              (id.includes(cleanId) || cleanId.includes(id.replace(/^camera\./, "")))
            ) {
              haEntity = id;
              break;
            }
          }
        }
        if (haEntity) {
          const buf = await this.ha.fetchSnapshot(haEntity);
          if (buf && buf.length > 1024) {
            try {
              fsSync.mkdirSync("/data/snapshots", { recursive: true });
              fsSync.writeFileSync(snapPath, buf);
            } catch {}
            return buf;
          }
        }
      } catch {}
    }

    // 2. Resolve source stream URL from Scrypted or CameraUI
    let sourceUrl: string | undefined;
    let snapshotHttpUrl: string | undefined;

    try {
      const scStore = await ScryptedStorage.load();
      const scCam = scStore.cameras.cameras.find(
        (c) => c.cameraId === cameraId || c.cameraId === cleanId,
      );
      if (scCam) {
        snapshotHttpUrl = scCam.source.snapshotReference?.directUrl;
        sourceUrl = scCam.source.streamReference?.directUrl;
      }
    } catch {}

    if (!sourceUrl && !snapshotHttpUrl) {
      try {
        const cuiStore = await CameraUiStorage.load();
        const cuiCam = cuiStore.cameras.find(
          (c) =>
            c.id === cameraId ||
            c.id === cleanId ||
            `cameraui_${cleanId}` === c.id,
        );
        if (cuiCam) {
          snapshotHttpUrl = cuiCam.snapshotUrl;
          sourceUrl = cuiCam.rtspUrl;
        }
      } catch {}
    }

    // 3. If HTTP snapshot URL available, try fetching it
    if (snapshotHttpUrl?.startsWith("http")) {
      try {
        const headers: Record<string, string> = {};
        const token = this.ha?.getAccessToken?.() || this.ha?.wsAccessToken;
        if (token && snapshotHttpUrl.includes("/api/camera_proxy")) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const resp = await fetch(snapshotHttpUrl, {
          headers,
          signal: AbortSignal.timeout(3000),
        });
        if (resp.ok) {
          const buf = Buffer.from(await resp.arrayBuffer());
          if (buf.length > 1024) {
            try {
              fsSync.mkdirSync("/data/snapshots", { recursive: true });
              fsSync.writeFileSync(snapPath, buf);
            } catch {}
            return buf;
          }
        }
      } catch {}
    }

    // 4. Capture 1 frame via FFmpeg from sourceUrl
    if (sourceUrl) {
      const ffmpegPath = resolveFfmpegPath();
      if (ffmpegPath) {
        try {
          const buf = await new Promise<Buffer | null>((resolve) => {
            const args = [
              "-hide_banner",
              "-loglevel",
              "error",
              "-probesize",
              "32768",
              "-analyzeduration",
              "0",
              ...(sourceUrl.startsWith("rtsp://")
                ? ["-rtsp_transport", "tcp"]
                : []),
              "-fflags",
              "+nobuffer+flush_packets",
              "-flags",
              "low_delay",
              "-i",
              sourceUrl,
              "-frames:v",
              "1",
              "-f",
              "image2",
              "-q:v",
              "3",
              "pipe:1",
            ];
            const proc = spawn(ffmpegPath, args, {
              stdio: ["ignore", "pipe", "ignore"],
            });
            const chunks: Buffer[] = [];
            const timer = setTimeout(() => {
              try {
                proc.kill("SIGKILL");
              } catch {}
              resolve(null);
            }, 3500);
            proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
            proc.once("error", () => {
              clearTimeout(timer);
              resolve(null);
            });
            proc.once("close", () => {
              clearTimeout(timer);
              const result = Buffer.concat(chunks);
              resolve(result.length > 1024 ? result : null);
            });
          });

          if (buf) {
            try {
              fsSync.mkdirSync("/data/snapshots", { recursive: true });
              fsSync.writeFileSync(snapPath, buf);
            } catch {}
            return buf;
          }
        } catch {}
      }
    }

    // 5. Fallback: check if existing snapshot on disk exists regardless of age
    try {
      if (fsSync.existsSync(snapPath)) {
        return fsSync.readFileSync(snapPath);
      }
    } catch {}

    return null;
  }
}

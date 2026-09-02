import crypto from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type {
  ScryptedPersistentStore,
  CameraRecord,
  CameraExportConfig,
  CameraNasConfig,
  ScryptedConnectionStatus,
  CameraIdentityOverride,
  ScryptedCredentials,
  EncryptedSecret,
  ScryptedStreamProfile,
  StreamValidationStatus,
} from "./scrypted-types.js";

const SCHEMA_VERSION = 2;

/**
 * Returns true for values that should be treated as 'no data'.
 */
function isBlankOrUnknown(value?: string): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    v === "" ||
    v === "unknown" ||
    v === "n/a" ||
    v === "na" ||
    v === "desconocido" ||
    v === "sin marca" ||
    v === "other" ||
    v === "otras marcas" ||
    v === "generic" ||
    v === "cámara ip" ||
    v === "camara ip" ||
    v === "marca no identificada" ||
    v === "modelo no identificado"
  );
}

/**
 * Resolves the effective display manufacturer for a camera.
 * Rules: identityOverride.manufacturer → sourceManufacturer → 'Marca no identificada'
 */
export function resolveDisplayManufacturer(
  camera: Partial<CameraRecord>,
): string {
  const override = camera.identityOverride?.manufacturer?.trim();
  if (override && !isBlankOrUnknown(override)) return override;
  const source = camera.sourceManufacturer?.trim();
  if (source && !isBlankOrUnknown(source)) return source;
  // Also check legacy model/manufacturer field if any
  const legacy = (camera as any).manufacturer?.trim();
  if (legacy && !isBlankOrUnknown(legacy)) return legacy;
  return "Marca no identificada";
}

/**
 * Resolves the effective display model for a camera.
 * Rules: identityOverride.model → sourceModel → undefined (caller shows 'Modelo no identificado')
 */
export function resolveDisplayModel(
  camera: Partial<CameraRecord>,
): string | undefined {
  const override = camera.identityOverride?.model?.trim();
  if (override && !isBlankOrUnknown(override)) return override;
  const source = camera.sourceModel?.trim();
  if (source && !isBlankOrUnknown(source)) return source;
  const legacy = camera.model?.trim();
  if (legacy && !isBlankOrUnknown(legacy)) return legacy;
  return undefined;
}

/**
 * Resolves the effective display serial number for a camera.
 * Priority:
 * 1. identityOverride.serialNumber (manual user override in Matter All-in-One)
 * 2. camera.serialNumber (real manufacturer serial from device.info.serialNumber)
 * 3. plugin serial from metadata if present
 * 4. nativeId explicitly labeled as technical ID
 * 5. Fallback: 'Serial no disponible'
 * Note: Never uses IP address as serial number. Never exposes raw MAC unless user explicitly consented.
 */
export function resolveDisplaySerialNumber(
  camera: Partial<CameraRecord>,
): string {
  const override = camera.identityOverride?.serialNumber?.trim();
  if (override && !isBlankOrUnknown(override)) return override;
  const rawSerial = camera.serialNumber?.trim();
  if (
    rawSerial &&
    !isBlankOrUnknown(rawSerial) &&
    !rawSerial.startsWith("SCRYPTED-") &&
    !net.isIP(rawSerial)
  ) {
    return rawSerial;
  }
  return "Serial no disponible";
}
/**
 * Returns true if the given URL was fabricated using the prohibited pattern
 * `rtsp://<host>:8554/<cameraId>` where <cameraId> is a Scrypted numeric device ID.
 *
 * A Scrypted device ID (e.g. "51") is NEVER a valid RTSP path for Scrypted Rebroadcast.
 * This helper guards against stale invented URLs that may exist in persisted data.
 */
export function isInventedRtspUrl(url: string, cameraId: string): boolean {
  if (!url || !cameraId) return false;
  try {
    const u = new URL(url);
    // Prohibited: path is exactly /<cameraId> OR any path that is just /<digits>
    return u.pathname === `/${cameraId}` || /^\/\d+$/.test(u.pathname);
  } catch {
    return false;
  }
}

export class ScryptedStorage {
  private static storePath =
    process.env.SCRYPTED_STORE_PATH || "/data/scrypted-cameras-store.json";
  private static memoryStore: ScryptedPersistentStore | null = null;

  /**
   * Overrides store path (used in tests).
   */
  public static setStorePath(customPath: string): void {
    this.storePath = customPath;
    this.memoryStore = null;
  }

  public static getStorePath(): string {
    return this.storePath;
  }

  private static createDefaultStore(): ScryptedPersistentStore {
    return {
      schemaVersion: SCHEMA_VERSION,
      installation: {
        installationId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        encryptionKeyRef: "primary",
      },
      scrypted: {
        serverId: "",
        serverUrl: "",
        credentials: {
          authenticationMode: "username_password",
        },
        allowSelfSignedCertificate: false,
        connectionStatus: "not_configured",
        autoReconnect: true,
        pollIntervalMinutes: 15,
      },
      cameras: {
        cameras: [],
      },
      nas: {},
    };
  }

  /**
   * Migrates a v1 store (tokenEncrypted) to v2 (credentials structure).
   * Creates a .bak file before migration.
   */
  private static async migrateV1ToV2(
    raw: any,
  ): Promise<ScryptedPersistentStore> {
    try {
      const bakPath = `${this.storePath}.bak`;
      await fs.writeFile(bakPath, JSON.stringify(raw, null, 2), {
        mode: 0o600,
      });
    } catch {
      // Best effort
    }

    const legacyToken: EncryptedSecret | undefined =
      raw.scrypted?.tokenEncrypted;
    const credentials: ScryptedCredentials = {
      authenticationMode: legacyToken ? "api_token" : "username_password",
      apiTokenEncrypted: legacyToken
        ? { ...legacyToken, purpose: "scrypted_api_token" }
        : undefined,
    };

    const migrated: ScryptedPersistentStore = {
      schemaVersion: SCHEMA_VERSION,
      installation: raw.installation ?? {
        installationId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        encryptionKeyRef: "primary",
      },
      scrypted: {
        serverId: raw.scrypted?.serverId ?? "",
        serverUrl: raw.scrypted?.serverUrl ?? "",
        credentials,
        allowSelfSignedCertificate: false,
        lastConnected: raw.scrypted?.lastConnected,
        connectionStatus: raw.scrypted?.connectionStatus ?? "not_configured",
        autoReconnect: raw.scrypted?.autoReconnect ?? true,
        pollIntervalMinutes: raw.scrypted?.pollIntervalMinutes ?? 15,
      },
      cameras: {
        lastFetched: raw.cameras?.lastFetched,
        cameras: (raw.cameras?.cameras ?? []).map((c: any) => ({
          ...c,
          sourceManufacturer: c.sourceManufacturer ?? c.manufacturer,
          sourceModel: c.sourceModel ?? c.model,
          displayManufacturer: resolveDisplayManufacturer(c),
          displayModel: resolveDisplayModel(c),
          status: {
            ...c.status,
            cache: c.status?.cache ?? "stale",
          },
        })),
      },
      nas: raw.nas ?? {},
    };
    return migrated;
  }

  /**
   * Loads the persistent store into memory, creating defaults if not yet initialized.
   */
  public static async load(): Promise<ScryptedPersistentStore> {
    if (this.memoryStore) return this.memoryStore;

    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.installation) {
        if ((parsed.schemaVersion ?? 1) < SCHEMA_VERSION) {
          const migrated = await this.migrateV1ToV2(parsed);
          this.memoryStore = migrated;
          await this.save(migrated);
          return migrated;
        }
        this.memoryStore = parsed as ScryptedPersistentStore;
        return this.memoryStore;
      }
    } catch {
      // File does not exist or has invalid JSON; fall through to initialize
    }

    const initial = this.createDefaultStore();
    this.memoryStore = initial;
    await this.save(initial);
    return initial;
  }

  /**
   * Returns current in-memory store or initializes it.
   */
  public static getStore(): ScryptedPersistentStore {
    if (!this.memoryStore) {
      this.memoryStore = this.createDefaultStore();
    }
    return this.memoryStore;
  }

  /**
   * Saves store atomically using temporary file + sync + rename.
   */
  public static async save(store: ScryptedPersistentStore): Promise<void> {
    this.memoryStore = store;
    const jsonContent = JSON.stringify(store, null, 2);

    const targetPath = this.storePath;
    const tmpPath = `${targetPath}.tmp`;

    try {
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const handle = await fs.open(tmpPath, "w", 0o600);
      try {
        await handle.writeFile(jsonContent, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(tmpPath, targetPath);
    } catch {
      // Fall back to local ./data path if /data is not accessible
      const fallbackTarget = path.resolve("./data/scrypted-cameras-store.json");
      const fallbackTmp = `${fallbackTarget}.tmp`;
      await fs.mkdir(path.dirname(fallbackTarget), { recursive: true });
      const handle = await fs.open(fallbackTmp, "w", 0o600);
      try {
        await handle.writeFile(jsonContent, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(fallbackTmp, fallbackTarget);
      this.storePath = fallbackTarget;
    }
  }

  public static async updateConnectionStatus(
    status: ScryptedConnectionStatus,
  ): Promise<void> {
    const store = await this.load();
    store.scrypted.connectionStatus = status;
    if (status === "connected") {
      store.scrypted.lastConnected = new Date().toISOString();
    }
    await this.save(store);
  }

  /**
   * Clears only the passwordEncrypted field. Does not affect apiTokenEncrypted.
   */
  public static async clearPassword(): Promise<void> {
    const store = await this.load();
    if (store.scrypted.credentials) {
      store.scrypted.credentials.passwordEncrypted = undefined;
    }
    await this.save(store);
  }

  /**
   * Clears only the apiTokenEncrypted field. Does not affect passwordEncrypted.
   */
  public static async clearApiToken(): Promise<void> {
    const store = await this.load();
    if (store.scrypted.credentials) {
      store.scrypted.credentials.apiTokenEncrypted = undefined;
    }
    await this.save(store);
  }

  /**
   * Updates cameras, computing display values and preserving identityOverride.
   */
  public static async updateCameras(
    freshCameras: CameraRecord[],
  ): Promise<void> {
    const store = await this.load();
    const existingMap = new Map<string, CameraRecord>(
      store.cameras.cameras.map((c) => [c.cameraId, c]),
    );

    const merged = freshCameras.map((fresh) => {
      const existing = existingMap.get(fresh.cameraId);
      const identityOverride = existing?.identityOverride;

      // RULE: Never invent an RTSP URL from cameraId. The Scrypted device ID is NOT
      // a Rebroadcast path. Leave streamReference undefined until the user configures
      // a real URL or the SDK resolves a real profile via getVideoStreamOptions().
      // A manually-set directUrl is preserved only if it does not match the prohibited
      // invented pattern (path = /<numeric id>).
      const existingDirectUrl = existing?.source?.streamReference?.directUrl;
      const freshDirectUrl = fresh.source?.streamReference?.directUrl;

      const effectiveStreamReference:
        import("./scrypted-types.js").StreamReference | undefined =
        existingDirectUrl &&
        !isInventedRtspUrl(existingDirectUrl, fresh.cameraId)
          ? existing!.source.streamReference
          : freshDirectUrl && !isInventedRtspUrl(freshDirectUrl, fresh.cameraId)
            ? fresh.source.streamReference
            : undefined; // No URL — never fabricate one

      const updated: CameraRecord = {
        ...fresh,
        // Preserve manual identity overrides — never overwritten by sync
        identityOverride,
        // Recompute display values using new source data and preserved override
        displayManufacturer: resolveDisplayManufacturer({
          ...fresh,
          identityOverride,
        }),
        displayModel: resolveDisplayModel({
          ...fresh,
          identityOverride,
        }),
        displaySerialNumber: resolveDisplaySerialNumber({
          ...fresh,
          identityOverride,
        }),
        // Preserve export config and identity codes
        identity: {
          ...fresh.identity,
          matterPairingCode:
            existing?.identity?.matterPairingCode ||
            fresh.identity?.matterPairingCode,
          homeKitAccessoryId: existing?.identity?.homeKitAccessoryId,
          homeKitPairingState: existing?.identity?.homeKitPairingState,
          homeKitSetupUri:
            existing?.identity?.homeKitSetupUri ||
            fresh.identity?.homeKitSetupUri,
          homeKitPincode:
            existing?.identity?.homeKitPincode ||
            fresh.identity?.homeKitPincode,
          homeKitSetupId:
            existing?.identity?.homeKitSetupId ||
            fresh.identity?.homeKitSetupId,
          homeKitPort:
            existing?.identity?.homeKitPort || fresh.identity?.homeKitPort,
        },
        source: {
          ...fresh.source,
          streamReference: effectiveStreamReference,
          profiles:
            fresh.source?.profiles && fresh.source.profiles.length > 0
              ? fresh.source.profiles
              : existing?.source?.profiles,
          selectedProfileId:
            fresh.source?.selectedProfileId ||
            existing?.source?.selectedProfileId,
          streamValidationStatus:
            fresh.source?.streamValidationStatus ||
            existing?.source?.streamValidationStatus ||
            "not_checked",
          streamValidationError:
            fresh.source?.streamValidationError ||
            existing?.source?.streamValidationError,
          streamValidatedAt:
            fresh.source?.streamValidatedAt ||
            existing?.source?.streamValidatedAt,
        },
        exportConfig: existing
          ? { ...fresh.exportConfig, ...existing.exportConfig }
          : fresh.exportConfig,
        status: {
          ...fresh.status,
          cache: "fresh" as const,
          lastFetched: new Date().toISOString(),
        },
      };
      return updated;
    });

    store.cameras.cameras = merged;
    store.cameras.lastFetched = new Date().toISOString();
    await this.save(store);
  }

  /**
   * Updates camera identity override (manual brand/model).
   * If override is null, removes the override and restores source values.
   */
  public static async updateCameraIdentityOverride(
    cameraId: string,
    override: CameraIdentityOverride | null,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam) return false;

    if (override === null) {
      cam.identityOverride = undefined;
    } else {
      if (
        override.manufacturerSource === "manual" &&
        !override.manufacturer?.trim()
      ) {
        return false;
      }
      cam.identityOverride = {
        ...override,
        updatedAt: new Date().toISOString(),
      };
    }

    // Recompute display values
    cam.displayManufacturer = resolveDisplayManufacturer(cam);
    cam.displayModel = resolveDisplayModel(cam);
    cam.displaySerialNumber = resolveDisplaySerialNumber(cam);
    if (override?.serialNumber) {
      cam.serialNumber = override.serialNumber;
    }
    await this.save(store);
    return true;
  }

  public static async updateCameraExportConfig(
    cameraId: string,
    config: CameraExportConfig,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam) return false;
    cam.exportConfig = { ...cam.exportConfig, ...config };
    await this.save(store);
    return true;
  }

  public static async updateCameraNasConfig(
    cameraId: string,
    nasConfig: CameraNasConfig,
  ): Promise<void> {
    const store = await this.load();
    if (!store.nas) store.nas = {};
    store.nas[cameraId] = nasConfig;
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (cam) {
      cam.exportConfig.nasEnabled = nasConfig.enabled;
    }
    await this.save(store);
  }

  public static async removeCamera(cameraId: string): Promise<boolean> {
    const store = await this.load();
    const before = store.cameras.cameras.length;
    store.cameras.cameras = store.cameras.cameras.filter(
      (c) => c.cameraId !== cameraId,
    );
    if (store.nas) {
      delete store.nas[cameraId];
    }
    const removed = store.cameras.cameras.length < before;
    if (removed) {
      await this.save(store);
    }
    return removed;
  }

  public static async updateCameraStreamUrl(
    cameraId: string,
    streamUrl: string,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam) return false;

    const trimmed = streamUrl.trim();
    if (!trimmed) return false;

    // Reject obviously invented URLs (path = /<cameraId> or any pure numeric path)
    if (isInventedRtspUrl(trimmed, cameraId)) {
      return false;
    }

    let host: string | undefined;
    let port: number | undefined;
    let path: string | undefined;
    try {
      const u = new URL(trimmed);
      host = u.hostname || undefined;
      port = u.port
        ? parseInt(u.port, 10)
        : u.protocol === "rtsps:"
          ? 322
          : 554;
      path = u.pathname || undefined;
    } catch {
      // If URL doesn't parse, store directUrl without decomposed fields
    }

    cam.source.streamReference = {
      protocol: "rtsp",
      directUrl: trimmed,
      host,
      port,
      path,
      // verifiedAt is NOT set here — user-entered URL is "not_checked" until
      // a real RTSP DESCRIBE validation is performed via "Verificar stream"
    };
    await this.save(store);
    return true;
  }

  /**
   * Updates stream profiles discovered by the Scrypted SDK.
   */
  public static async updateCameraStreamProfiles(
    cameraId: string,
    profiles: ScryptedStreamProfile[],
    selectedProfileId?: string,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam) return false;

    cam.source.profiles = profiles;
    if (selectedProfileId) {
      cam.source.selectedProfileId = selectedProfileId;
    } else if (!cam.source.selectedProfileId && profiles.length > 0) {
      cam.source.selectedProfileId = profiles[0].id;
    }

    // If selected profile has a directUrl, update streamReference
    const activeProfile =
      profiles.find((p) => p.id === cam.source.selectedProfileId) ||
      profiles[0];
    if (
      activeProfile?.directUrl &&
      !isInventedRtspUrl(activeProfile.directUrl, cameraId)
    ) {
      let host: string | undefined;
      let port: number | undefined;
      let path: string | undefined;
      try {
        const u = new URL(activeProfile.directUrl);
        host = u.hostname || undefined;
        port = u.port
          ? parseInt(u.port, 10)
          : u.protocol === "rtsps:"
            ? 322
            : 554;
        path = u.pathname || undefined;
      } catch {}

      cam.source.streamReference = {
        protocol: "rtsp",
        directUrl: activeProfile.directUrl,
        host,
        port,
        path,
        validationStatus: activeProfile.validationStatus,
      };
      cam.source.streamValidationStatus = activeProfile.validationStatus;
    }

    await this.save(store);
    return true;
  }

  /**
   * Sets the active stream profile for a camera.
   */
  public static async selectCameraStreamProfile(
    cameraId: string,
    profileId: string,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam || !cam.source.profiles) return false;

    const profile = cam.source.profiles.find((p) => p.id === profileId);
    if (!profile) return false;

    cam.source.selectedProfileId = profileId;
    if (profile.directUrl && !isInventedRtspUrl(profile.directUrl, cameraId)) {
      let host: string | undefined;
      let port: number | undefined;
      let path: string | undefined;
      try {
        const u = new URL(profile.directUrl);
        host = u.hostname || undefined;
        port = u.port
          ? parseInt(u.port, 10)
          : u.protocol === "rtsps:"
            ? 322
            : 554;
        path = u.pathname || undefined;
      } catch {}

      cam.source.streamReference = {
        protocol: "rtsp",
        directUrl: profile.directUrl,
        host,
        port,
        path,
        validationStatus: profile.validationStatus,
      };
      cam.source.streamValidationStatus = profile.validationStatus;
    } else {
      cam.source.streamReference = undefined;
      cam.source.streamValidationStatus = "unsupported";
    }

    await this.save(store);
    return true;
  }

  /**
   * Updates stream validation status and optional error/timestamp, observed capabilities and metrics.
   */
  public static async updateCameraStreamValidation(
    cameraId: string,
    status: StreamValidationStatus,
    error?: string,
    capabilities?: Partial<import("./scrypted-types.js").StreamCapabilities>,
    metrics?: import("./scrypted-types.js").StreamLatencyMetrics,
  ): Promise<boolean> {
    const store = await this.load();
    const cam = store.cameras.cameras.find((c) => c.cameraId === cameraId);
    if (!cam) return false;

    const now = new Date().toISOString();
    cam.source.streamValidationStatus = status;
    cam.source.streamValidationError = error;
    cam.source.streamValidatedAt = now;

    if (capabilities) {
      cam.capabilities.observed = {
        ...(cam.capabilities.observed || {
          videoCodec: "h264",
          resolution: { width: 1920, height: 1080 },
          hasAudio: false,
        }),
        ...capabilities,
      };
      cam.capabilities.lastVerified = now;
    }

    if (metrics) {
      cam.capabilities.latencyMetrics = metrics;
    }

    if (cam.source.streamReference) {
      cam.source.streamReference.validationStatus = status;
      cam.source.streamReference.validationError = error;
      if (status === "verified") {
        cam.source.streamReference.verifiedAt = now;
      }
    }

    if (cam.source.selectedProfileId && cam.source.profiles) {
      const p = cam.source.profiles.find(
        (prof) => prof.id === cam.source.selectedProfileId,
      );
      if (p) {
        p.validationStatus = status;
        p.validationError = error;
        p.lastValidatedAt = now;
        if (capabilities?.resolution) p.resolution = capabilities.resolution;
        if (capabilities?.fps) p.fps = capabilities.fps;
        if (capabilities?.hasAudio !== undefined)
          p.hasAudio = capabilities.hasAudio;
        if (capabilities?.audioCodec) p.audioCodec = capabilities.audioCodec;
        if (capabilities?.gopSeconds !== undefined)
          p.gopSeconds = capabilities.gopSeconds;
        if (capabilities?.needsDumpExtra !== undefined)
          p.needsDumpExtra = capabilities.needsDumpExtra;
      }
    }

    await this.save(store);
    return true;
  }
}

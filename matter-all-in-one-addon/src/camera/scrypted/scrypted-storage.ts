import crypto from "node:crypto";
import fs from "node:fs/promises";
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
        // Preserve export config and identity codes
        identity: {
          ...fresh.identity,
          matterPairingCode:
            existing?.identity?.matterPairingCode ||
            fresh.identity?.matterPairingCode,
          homeKitAccessoryId:
            existing?.identity?.homeKitAccessoryId ||
            fresh.identity?.homeKitAccessoryId,
          homeKitPairingState:
            existing?.identity?.homeKitPairingState ||
            fresh.identity?.homeKitPairingState,
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
}

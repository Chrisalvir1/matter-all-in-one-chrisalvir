import { EventEmitter } from "node:events";
import { ScryptedStorage } from "./scrypted-storage.js";
import { ScryptedCrypto } from "./scrypted-crypto.js";
import { ScryptedClient } from "./scrypted-client.js";
import type {
  ScryptedConnectionStatus,
  CameraRecord,
} from "./scrypted-types.js";

export class ScryptedReconnectManager extends EventEmitter {
  private static instance: ScryptedReconnectManager | null = null;

  private retryCount = 0;
  private readonly backoffScheduleMinutes = [5, 10, 30, 60];
  private retryTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private inFlightCheck = false;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  public static getInstance(): ScryptedReconnectManager {
    if (!this.instance) {
      this.instance = new ScryptedReconnectManager();
    }
    return this.instance;
  }

  /**
   * Starts connection lifecycle during add-on boot.
   */
  public async initialize(): Promise<void> {
    const store = await ScryptedStorage.load();
    const serverUrl = store.scrypted.serverUrl;

    if (!serverUrl || serverUrl.trim().length === 0) {
      await ScryptedStorage.updateConnectionStatus("not_configured");
      this.emitStatus("not_configured", "Scrypted no está configurado.");
      return;
    }

    if (store.scrypted.autoReconnect) {
      // Begin background reconnection attempt without blocking fast boot
      void this.attemptConnection(true);
    } else {
      await ScryptedStorage.updateConnectionStatus("disconnected_using_cache");
      this.emitStatus(
        "disconnected_using_cache",
        "Auto-reconexión desactivada (usando caché).",
      );
    }
  }

  /**
   * Attempts connection to Scrypted, updating store and state machine.
   */
  public async attemptConnection(isBoot: boolean = false): Promise<boolean> {
    if (this.inFlightCheck) return false;
    this.inFlightCheck = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    try {
      const store = await ScryptedStorage.load();
      const serverUrl = store.scrypted.serverUrl;

      if (!serverUrl) {
        await ScryptedStorage.updateConnectionStatus("not_configured");
        this.emitStatus("not_configured", "Scrypted no configurado.");
        this.inFlightCheck = false;
        return false;
      }

      await ScryptedStorage.updateConnectionStatus("reconnecting");
      this.emitStatus("reconnecting", "Conectando con Scrypted…");

      let token: string | undefined;
      if (store.scrypted.tokenEncrypted) {
        try {
          token = await ScryptedCrypto.decrypt(
            store.scrypted.tokenEncrypted,
            "scrypted_auth",
          );
        } catch {
          await ScryptedStorage.updateConnectionStatus("error");
          this.emitStatus(
            "error",
            "Error al descifrar token de Scrypted. Reconfigure las credenciales.",
          );
          this.inFlightCheck = false;
          return false;
        }
      }

      const client = new ScryptedClient(serverUrl, token);
      const testResult = await client.testConnection();

      if (!testResult.ok) {
        const hasCachedCameras = store.cameras.cameras.length > 0;
        const nextStatus: ScryptedConnectionStatus = hasCachedCameras
          ? "disconnected_using_cache"
          : "error";

        await ScryptedStorage.updateConnectionStatus(nextStatus);
        this.emitStatus(nextStatus, testResult.message);
        this.scheduleNextRetry();
        this.inFlightCheck = false;
        return false;
      }

      // Connection succeeded! Reset retry counter
      this.retryCount = 0;
      await ScryptedStorage.updateConnectionStatus("connected");
      this.emitStatus(
        "connected",
        "Conectado a Scrypted. Cámaras y streams sincronizados.",
      );

      // Refresh camera states in background
      await this.refreshCameras(client);
      this.schedulePeriodicPolling(store.scrypted.pollIntervalMinutes);
      this.inFlightCheck = false;
      return true;
    } catch (err: any) {
      await ScryptedStorage.updateConnectionStatus("disconnected_using_cache");
      this.emitStatus(
        "disconnected_using_cache",
        `Error inesperado: ${err.message || err}`,
      );
      this.scheduleNextRetry();
      this.inFlightCheck = false;
      return false;
    }
  }

  /**
   * Forces an immediate manual refresh ("Actualizar ahora").
   */
  public async forceRefresh(): Promise<{
    ok: boolean;
    message: string;
    camerasCount: number;
  }> {
    const store = await ScryptedStorage.load();
    const serverUrl = store.scrypted.serverUrl;

    if (!serverUrl) {
      return {
        ok: false,
        message: "Scrypted no está configurado.",
        camerasCount: 0,
      };
    }

    let token: string | undefined;
    if (store.scrypted.tokenEncrypted) {
      try {
        token = await ScryptedCrypto.decrypt(
          store.scrypted.tokenEncrypted,
          "scrypted_auth",
        );
      } catch {
        return {
          ok: false,
          message: "No se pudo descifrar el token de autenticación.",
          camerasCount: 0,
        };
      }
    }

    const client = new ScryptedClient(serverUrl, token);
    const testResult = await client.testConnection();

    if (!testResult.ok) {
      await ScryptedStorage.updateConnectionStatus("disconnected_using_cache");
      this.emitStatus("disconnected_using_cache", testResult.message);
      return {
        ok: false,
        message: testResult.message,
        camerasCount: store.cameras.cameras.length,
      };
    }

    await ScryptedStorage.updateConnectionStatus("connected");
    const count = await this.refreshCameras(client);
    this.emitStatus(
      "connected",
      `Sincronización completada (${count} cámaras).`,
    );

    return {
      ok: true,
      message: `Actualizado con éxito. ${count} cámaras listas.`,
      camerasCount: count,
    };
  }

  private async refreshCameras(client: ScryptedClient): Promise<number> {
    try {
      const liveCameras = await client.loadCameras();
      if (liveCameras.length === 0) return 0;

      const store = await ScryptedStorage.load();
      const existingMap = new Map<string, CameraRecord>(
        store.cameras.cameras.map((c) => [c.cameraId, c]),
      );

      const mergedCameras: CameraRecord[] = liveCameras.map((fresh) => {
        const existing = existingMap.get(fresh.cameraId);
        if (!existing) return fresh;

        // Preserve export settings, custom Matter codes and pairing states
        return {
          ...fresh,
          identity: {
            ...fresh.identity,
            matterPairingCode:
              existing.identity.matterPairingCode ||
              fresh.identity.matterPairingCode,
            homeKitAccessoryId: existing.identity.homeKitAccessoryId,
            homeKitPairingState: existing.identity.homeKitPairingState,
          },
          exportConfig: {
            ...fresh.exportConfig,
            ...existing.exportConfig,
          },
          status: {
            ...fresh.status,
            cache: "fresh",
            lastFetched: new Date().toISOString(),
          },
        };
      });

      await ScryptedStorage.updateCameras(mergedCameras);
      this.emit("cameras_updated", mergedCameras);
      return mergedCameras.length;
    } catch {
      return 0;
    }
  }

  private scheduleNextRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);

    const backoffMin =
      this.backoffScheduleMinutes[
        Math.min(this.retryCount, this.backoffScheduleMinutes.length - 1)
      ];
    this.retryCount++;

    const delayMs = backoffMin * 60 * 1000;
    this.retryTimer = setTimeout(() => {
      void this.attemptConnection(false);
    }, delayMs);
  }

  private schedulePeriodicPolling(intervalMinutes: number = 15): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const ms = Math.max(5, intervalMinutes) * 60 * 1000;
    this.pollTimer = setInterval(() => {
      void this.attemptConnection(false);
    }, ms);
  }

  private emitStatus(status: ScryptedConnectionStatus, message: string): void {
    this.emit("status_change", {
      status,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  public stop(): void {
    this.destroy();
  }

  public destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.retryTimer = null;
    this.pollTimer = null;
  }
}

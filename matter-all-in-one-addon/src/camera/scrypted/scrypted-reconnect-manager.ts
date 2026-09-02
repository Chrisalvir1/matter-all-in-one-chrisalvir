import { EventEmitter } from "node:events";
import { ScryptedStorage } from "./scrypted-storage.js";
import { ScryptedCrypto } from "./scrypted-crypto.js";
import { ScryptedClient, type ScryptedSession } from "./scrypted-client.js";
import type { ScryptedConnectionStatus } from "./scrypted-types.js";

export class ScryptedReconnectManager extends EventEmitter {
  private static instance: ScryptedReconnectManager | null = null;

  private retryCount = 0;
  private readonly backoffScheduleMinutes = [5, 10, 30, 60];
  private retryTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private inFlightCheck = false;
  private activeSession: ScryptedSession | null = null;
  private authFailedPermanent = false;

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
    if (this.authFailedPermanent) return false;
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

      const credentials = store.scrypted.credentials ?? {
        authenticationMode: "username_password",
      };
      let password: string | undefined;

      if (credentials.passwordEncrypted) {
        try {
          password = await ScryptedCrypto.decrypt(
            credentials.passwordEncrypted,
            "scrypted_password",
          );
        } catch {
          await ScryptedStorage.updateConnectionStatus("error");
          this.authFailedPermanent = true;
          this.emitStatus(
            "error",
            "Error al descifrar contraseña de Scrypted. Reconfigure las credenciales.",
          );
          this.inFlightCheck = false;
          return false;
        }
      } else if (credentials.apiTokenEncrypted) {
        try {
          password = await ScryptedCrypto.decrypt(
            credentials.apiTokenEncrypted,
            "scrypted_api_token",
          );
        } catch {
          // Token decryption error
        }
      }

      // Disconnect previous session if any
      if (this.activeSession) {
        await ScryptedClient.disconnect(this.activeSession);
        this.activeSession = null;
      }

      const testResult = await ScryptedClient.testConnection(
        serverUrl,
        credentials,
        password,
        store.scrypted.allowSelfSignedCertificate,
      );

      if (!testResult.ok) {
        // If authentication failed permanently, stop retrying
        if (testResult.errorCode === "authentication_failed") {
          this.authFailedPermanent = true;
          await ScryptedStorage.updateConnectionStatus("error");
          this.emitStatus(
            "error",
            "No se pudo iniciar sesión en Scrypted. Verifica usuario y contraseña.",
          );
          this.inFlightCheck = false;
          return false;
        }

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

      // Connection succeeded! Connect full SDK session
      try {
        const session = await ScryptedClient.connect(
          serverUrl,
          credentials,
          password,
        );
        this.activeSession = session;
        this.retryCount = 0;
        this.authFailedPermanent = false;

        await ScryptedStorage.updateConnectionStatus("connected");
        this.emitStatus(
          "connected",
          "Conectado a Scrypted. Cámaras y streams sincronizados.",
        );

        // Refresh camera states in background
        await this.refreshCameras(session);
        this.schedulePeriodicPolling(store.scrypted.pollIntervalMinutes);
        this.inFlightCheck = false;
        return true;
      } catch (connectErr: any) {
        await ScryptedStorage.updateConnectionStatus(
          "disconnected_using_cache",
        );
        this.emitStatus(
          "disconnected_using_cache",
          "Sesión SDK no disponible; usando caché.",
        );
        this.scheduleNextRetry();
        this.inFlightCheck = false;
        return false;
      }
    } catch (err: any) {
      await ScryptedStorage.updateConnectionStatus("disconnected_using_cache");
      this.emitStatus(
        "disconnected_using_cache",
        "Error inesperado al conectar con Scrypted.",
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

    if (this.authFailedPermanent) {
      return {
        ok: false,
        message: "Autenticación fallida. Reconfigure las credenciales.",
        camerasCount: store.cameras.cameras.length,
      };
    }

    const credentials = store.scrypted.credentials ?? {
      authenticationMode: "username_password",
    };
    let password: string | undefined;

    if (credentials.passwordEncrypted) {
      try {
        password = await ScryptedCrypto.decrypt(
          credentials.passwordEncrypted,
          "scrypted_password",
        );
      } catch {
        return {
          ok: false,
          message: "No se pudo descifrar la contraseña de Scrypted.",
          camerasCount: store.cameras.cameras.length,
        };
      }
    } else if (credentials.apiTokenEncrypted) {
      try {
        password = await ScryptedCrypto.decrypt(
          credentials.apiTokenEncrypted,
          "scrypted_api_token",
        );
      } catch {
        // Fallback
      }
    }

    // Reuse or create session
    let session = this.activeSession;
    if (!session) {
      try {
        session = await ScryptedClient.connect(
          serverUrl,
          credentials,
          password,
        );
        this.activeSession = session;
      } catch (err: any) {
        await ScryptedStorage.updateConnectionStatus(
          "disconnected_using_cache",
        );
        return {
          ok: false,
          message: "No se puede conectar al servidor Scrypted.",
          camerasCount: store.cameras.cameras.length,
        };
      }
    }

    await ScryptedStorage.updateConnectionStatus("connected");
    const count = await this.refreshCameras(session);
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

  private async refreshCameras(session: ScryptedSession): Promise<number> {
    try {
      const liveCameras = await ScryptedClient.listCameras(session);
      await ScryptedStorage.updateCameras(liveCameras);
      this.emit("cameras_updated", liveCameras);
      return liveCameras.length;
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

  public resetAuthFailure(): void {
    this.authFailedPermanent = false;
    this.retryCount = 0;
  }

  public stop(): void {
    this.destroy();
  }

  public destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.retryTimer = null;
    this.pollTimer = null;
    if (this.activeSession) {
      void ScryptedClient.disconnect(this.activeSession);
      this.activeSession = null;
    }
  }
}

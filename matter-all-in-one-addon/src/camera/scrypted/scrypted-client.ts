import net from "node:net";
import type {
  CameraRecord,
  CameraSensorRecord,
  ScryptedErrorCode,
  ScryptedCredentials,
} from "./scrypted-types.js";

/** INTERNAL ONLY — never persist, serialize or log. */
export interface ScryptedSession {
  readonly sdk: any; // ScryptedClientStatic — opaque handle
  readonly connectedAt: string;
  readonly serverUrl: string;
  readonly username?: string;
}

export interface ScryptedConnectionResult {
  ok: boolean;
  errorCode?: ScryptedErrorCode;
  message: string;
  authenticationMode?: "username_password" | "api_token";
  latencyMs?: number;
  serverId?: string;
}

/**
 * Resolves manufacturer/model from Scrypted device info.
 * Returns undefined if not available — callers must handle fallback.
 */
function extractDeviceInfo(device: any): {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
} {
  const info = device?.info ?? {};
  return {
    manufacturer: info.manufacturer || device.manufacturer || undefined,
    model: info.model || device.model || undefined,
    serialNumber: info.serialNumber || device.serialNumber || undefined,
  };
}

/**
 * Returns true if the Scrypted device exposes camera-related interfaces.
 */
function isCameraDevice(device: any): boolean {
  if (!device || typeof device !== "object") return false;
  const interfaces: string[] = Array.isArray(device.interfaces)
    ? device.interfaces.map((i: any) => String(i))
    : [];
  const type = String(device.type || "").toLowerCase();
  return (
    type.includes("camera") ||
    interfaces.includes("Camera") ||
    interfaces.includes("VideoCamera") ||
    interfaces.includes("VideoCameraConfiguration") ||
    interfaces.includes("VideoRecorder") ||
    interfaces.includes("VideoClips")
  );
}

/**
 * Maps a Scrypted device to a CameraRecord with real data from the SDK.
 * Streams are marked as 'unverified' — no RTSP URL is constructed or assumed.
 */
function mapDeviceToCameraRecord(device: any, serverUrl: string): CameraRecord {
  const id = String(
    device.id ??
      device._id ??
      `scrypted_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  );
  const name = String(device.name ?? `Scrypted Camera ${id}`);
  const { manufacturer, model } = extractDeviceInfo(device);
  const interfaces: string[] = Array.isArray(device.interfaces)
    ? device.interfaces.map((i: any) => String(i))
    : [];

  const sensors: CameraSensorRecord[] = [];

  if (interfaces.includes("MotionSensor")) {
    sensors.push({
      sensorId: `${id}_motion`,
      type: "motion",
      name: `${name} – Movimiento`,
      enabled: true,
      state: false,
    });
  }

  if (interfaces.includes("Doorbell")) {
    sensors.push({
      sensorId: `${id}_doorbell`,
      type: "doorbell",
      name: `${name} – Timbre`,
      enabled: true,
      state: false,
    });
  }

  if (
    interfaces.includes("ObjectDetection") ||
    interfaces.includes("BinarySensor")
  ) {
    sensors.push({
      sensorId: `${id}_person`,
      type: "person",
      name: `${name} – Persona`,
      enabled: true,
      state: false,
    });
  }

  const resolvedManufacturer = manufacturer ?? undefined;
  const resolvedModel = model ?? undefined;

  return {
    cameraId: id,
    sourceId: `scrypted_${id}`,
    deviceId: id,
    name,
    enabled: true,
    sourceManufacturer: resolvedManufacturer,
    sourceModel: resolvedModel,
    model: resolvedModel, // compat
    displayManufacturer: resolvedManufacturer ?? "Marca no identificada",
    displayModel: resolvedModel,
    identity: {},
    source: {
      kind: "scrypted",
      serverId: serverUrl,
      deviceId: id,
      // Streams are NOT assumed. They remain unverified until the SDK
      // provides a real RTSP/WebRTC URL through the VideoCamera interface.
    },
    capabilities: {
      // No capabilities are assumed. Marked unverified until validated.
      qualityMode: "maximum_compatible",
      allowAutomaticFallback: false,
    },
    sensors,
    exportConfig: {
      matterEnabled: true,
      homeKitEnabled: true,
      hksvEnabledByDefault: true,
      googleHomeEnabled: false,
      alexaEnabled: false,
      smartThingsEnabled: false,
      nasEnabled: false,
    },
    status: {
      connection: "online",
      cache: "unverified",
      lastFetched: new Date().toISOString(),
    },
  };
}

/**
 * ScryptedClient — official SDK-based client for Scrypted integration.
 *
 * Authentication uses `@scrypted/client` exclusively:
 * - `loginScryptedClient` tests credentials via POST /login internally.
 * - `connectScryptedClient` establishes a full WebSocket/RPC session.
 *
 * No manual HTTP Basic Auth, Bearer tokens, cookies or REST endpoints
 * are used or assumed.
 */
export class ScryptedClient {
  private readonly serverUrl: string;
  private readonly token?: string;
  private readonly timeoutMs: number;

  constructor(serverUrl: string, token?: string, timeoutMs: number = 6000) {
    this.serverUrl = serverUrl;
    this.token = token;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Instance helper for backward compatibility in existing code.
   */
  public async testConnection(): Promise<ScryptedConnectionResult> {
    return ScryptedClient.testConnection(
      this.serverUrl,
      {
        username: "admin",
        authenticationMode: "username_password",
      },
      this.token,
      false,
    );
  }

  /**
   * Validates and normalizes the server URL.
   * Rejects non-HTTP/HTTPS, malformed URLs and removes trailing slashes.
   */
  public static validateServerUrl(rawUrl: string): {
    valid: boolean;
    error?: string;
    normalizedUrl?: string;
    url?: URL;
  } {
    if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
      return {
        valid: false,
        error: "La URL del servidor no puede estar vacía",
      };
    }
    try {
      const parsed = new URL(rawUrl.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return {
          valid: false,
          error: "Protocolo inválido (debe ser http:// o https://)",
        };
      }
      // Strip credentials from URL to prevent SSRF via embedded auth
      parsed.username = "";
      parsed.password = "";
      // Remove trailing slash for consistency
      const normalized = parsed.toString().replace(/\/+$/, "");
      return { valid: true, normalizedUrl: normalized, url: parsed };
    } catch {
      return { valid: false, error: "Formato de URL inválido" };
    }
  }

  /**
   * Tests connection using the official @scrypted/client SDK.
   * Uses loginScryptedClient internally (POST /login to Scrypted server).
   * Does NOT persist anything on failure.
   */
  public static async testConnection(
    serverUrl: string,
    credentials: Pick<
      ScryptedCredentials,
      "username" | "passwordEncrypted" | "authenticationMode"
    >,
    password: string | undefined,
    allowSelfSignedCertificate: boolean = false,
  ): Promise<ScryptedConnectionResult> {
    const urlCheck = ScryptedClient.validateServerUrl(serverUrl);
    if (!urlCheck.valid || !urlCheck.normalizedUrl) {
      return {
        ok: false,
        errorCode: "invalid_url",
        message: "La URL de Scrypted no es válida.",
      };
    }

    const username = credentials.username;
    if (!username || !password) {
      return {
        ok: false,
        errorCode: "authentication_failed",
        message:
          "No se pudo iniciar sesión en Scrypted. Verifica usuario y contraseña.",
      };
    }

    const start = Date.now();
    try {
      const scryptedModule: any = await import("@scrypted/client");
      const loginScryptedClient = scryptedModule.loginScryptedClient;

      if (typeof loginScryptedClient !== "function") {
        return {
          ok: false,
          errorCode: "unsupported_api",
          message:
            "Esta versión de Scrypted no ofrece las interfaces requeridas por la integración.",
        };
      }

      const loginResult = await loginScryptedClient({
        baseUrl: urlCheck.normalizedUrl,
        username,
        password,
      });

      if (loginResult?.error) {
        return {
          ok: false,
          errorCode: "authentication_failed",
          message:
            "No se pudo iniciar sesión en Scrypted. Verifica usuario y contraseña.",
          latencyMs: Date.now() - start,
        };
      }

      const latencyMs = Date.now() - start;
      return {
        ok: true,
        message:
          "Conexión correcta. Se autenticó mediante: usuario y contraseña",
        authenticationMode: "username_password",
        latencyMs,
        serverId: loginResult?.serverId,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return ScryptedClient.classifyError(err, latencyMs);
    }
  }

  /**
   * Establishes a full SDK session via connectScryptedClient.
   * The returned session object must stay in memory only.
   * Call disconnect(session) when done.
   */
  public static async connect(
    serverUrl: string,
    credentials: Pick<ScryptedCredentials, "username" | "authenticationMode">,
    password: string | undefined,
  ): Promise<ScryptedSession> {
    const urlCheck = ScryptedClient.validateServerUrl(serverUrl);
    if (!urlCheck.valid || !urlCheck.normalizedUrl) {
      throw new Error(`invalid_url: ${urlCheck.error}`);
    }

    const username = credentials.username;
    if (!username || !password) {
      throw new Error(
        "authentication_failed: username and password are required",
      );
    }

    const scryptedModule: any = await import("@scrypted/client");
    const connectScryptedClient = scryptedModule.connectScryptedClient;

    if (typeof connectScryptedClient !== "function") {
      throw new Error(
        "unsupported_api: connectScryptedClient function not found in @scrypted/client",
      );
    }

    const sdk = await connectScryptedClient({
      baseUrl: urlCheck.normalizedUrl,
      pluginId: "@scrypted/core",
      username,
      password,
    });

    return {
      sdk,
      connectedAt: new Date().toISOString(),
      serverUrl: urlCheck.normalizedUrl,
      username,
    };
  }

  /**
   * Enumerates all camera devices from the Scrypted server via systemManager.
   * Only reads real device data — no capabilities are hardcoded.
   */
  public static async listCameras(
    session: ScryptedSession,
  ): Promise<CameraRecord[]> {
    const systemManager = session.sdk?.systemManager;
    if (!systemManager) {
      throw new Error("unsupported_api: systemManager not available");
    }

    let deviceList: any[] = [];
    try {
      const state = await systemManager.getSystemState();
      if (state && typeof state === "object") {
        deviceList = Object.values(state);
      }
    } catch {
      try {
        const ids: string[] = (systemManager as any).getDeviceIds?.() ?? [];
        deviceList = await Promise.all(
          ids.map((id: string) => systemManager.getDeviceById(id)),
        );
      } catch {
        deviceList = [];
      }
    }

    const cameras: CameraRecord[] = [];
    for (const device of deviceList) {
      if (!device) continue;
      const dev = device.__proxy_props ? device : device;
      try {
        if (isCameraDevice(dev)) {
          cameras.push(mapDeviceToCameraRecord(dev, session.serverUrl));
        }
      } catch {
        // Skip devices that cannot be mapped
      }
    }
    return cameras;
  }

  /**
   * Disconnects an active SDK session.
   */
  public static async disconnect(session: ScryptedSession): Promise<void> {
    try {
      session.sdk?.disconnect?.();
    } catch {
      // Best effort
    }
  }

  /**
   * Classifies SDK errors into typed ScryptedErrorCode categories.
   * Never includes password, token, URL credentials or stack traces in messages.
   */
  public static classifyError(
    err: any,
    latencyMs?: number,
  ): ScryptedConnectionResult {
    const msg = String(err?.message || err || "").toLowerCase();
    const code = String(err?.code || "").toLowerCase();

    if (
      code === "econnrefused" ||
      code === "enotfound" ||
      code === "ehostunreach" ||
      code === "econnreset" ||
      msg.includes("econnrefused") ||
      msg.includes("fetch failed") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("abort")
    ) {
      return {
        ok: false,
        errorCode: "network_error",
        message:
          "No se puede conectar al servidor Scrypted. Revisa IP, puerto, red y firewall.",
        latencyMs,
      };
    }

    if (
      msg.includes("cert") ||
      msg.includes("ssl") ||
      msg.includes("tls") ||
      msg.includes("self signed") ||
      msg.includes("certificate") ||
      code === "depth_zero_self_signed_cert" ||
      code === "self_signed_cert_in_chain" ||
      code === "unable_to_verify_leaf_signature"
    ) {
      return {
        ok: false,
        errorCode: "tls_error",
        message:
          "El certificado HTTPS no fue aceptado. Comprueba el certificado o habilita explícitamente certificados autofirmados si confías en el servidor.",
        latencyMs,
      };
    }

    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("status 401") ||
      msg.includes("status 403") ||
      msg.includes("password") ||
      msg.includes("credentials") ||
      msg.includes("error")
    ) {
      return {
        ok: false,
        errorCode: "authentication_failed",
        message:
          "No se pudo iniciar sesión en Scrypted. Verifica usuario y contraseña.",
        latencyMs,
      };
    }

    return {
      ok: false,
      errorCode: "unknown",
      message:
        "Error desconocido al conectar con Scrypted. Revisa los logs del servidor.",
      latencyMs,
    };
  }

  /**
   * Tests whether an RTSP stream endpoint is accessible via TCP probe.
   * A successful probe does NOT guarantee stream availability.
   */
  public static async probeRtspPort(
    host: string,
    port: number = 8554,
    timeoutMs: number = 2500,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      let settled = false;

      socket.setTimeout(timeoutMs);
      socket.on("connect", () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(true);
        }
      });
      socket.on("timeout", () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(false);
        }
      });
      socket.on("error", () => {
        if (!settled) {
          settled = true;
          socket.destroy();
          resolve(false);
        }
      });
      try {
        socket.connect(port, host);
      } catch {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }
    });
  }
}

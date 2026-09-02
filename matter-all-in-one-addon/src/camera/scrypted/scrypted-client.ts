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
 * Helper to unwrap Scrypted state property wrappers ({ value: ... })
 * When querying Scrypted's systemState directly, each property is wrapped in an object: { value: ... }
 */
export function unwrapScryptedValue<T = any>(val: any): T {
  if (val !== null && typeof val === "object" && "value" in val) {
    return val.value;
  }
  return val;
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
  const rawInfo = unwrapScryptedValue(device?.info) ?? {};
  const manufacturer =
    unwrapScryptedValue(rawInfo.manufacturer) ||
    unwrapScryptedValue(device?.manufacturer) ||
    undefined;
  const model =
    unwrapScryptedValue(rawInfo.model) ||
    unwrapScryptedValue(device?.model) ||
    undefined;
  const serialNumber =
    unwrapScryptedValue(rawInfo.serialNumber) ||
    unwrapScryptedValue(device?.serialNumber) ||
    undefined;

  return {
    manufacturer:
      typeof manufacturer === "string" && manufacturer.trim()
        ? manufacturer.trim()
        : undefined,
    model: typeof model === "string" && model.trim() ? model.trim() : undefined,
    serialNumber:
      typeof serialNumber === "string" && serialNumber.trim()
        ? serialNumber.trim()
        : undefined,
  };
}

/**
 * Returns true if the Scrypted device exposes camera-related interfaces.
 */
function isCameraDevice(device: any): boolean {
  if (!device || typeof device !== "object") return false;

  const rawType = unwrapScryptedValue(device.type);
  const rawProvidedType = unwrapScryptedValue(device.providedType);
  const type = String(rawType || "").toLowerCase();
  const providedType = String(rawProvidedType || "").toLowerCase();

  const rawIfaces = unwrapScryptedValue(device.interfaces);
  const interfaces: string[] = Array.isArray(rawIfaces)
    ? rawIfaces.map((i: any) => String(unwrapScryptedValue(i)))
    : [];

  const rawProvidedIfaces = unwrapScryptedValue(device.providedInterfaces);
  const providedInterfaces: string[] = Array.isArray(rawProvidedIfaces)
    ? rawProvidedIfaces.map((i: any) => String(unwrapScryptedValue(i)))
    : [];

  const allInterfaces = [...interfaces, ...providedInterfaces];

  return (
    type.includes("camera") ||
    type.includes("doorbell") ||
    providedType.includes("camera") ||
    providedType.includes("doorbell") ||
    allInterfaces.includes("Camera") ||
    allInterfaces.includes("VideoCamera") ||
    allInterfaces.includes("VideoCameraConfiguration") ||
    allInterfaces.includes("VideoRecorder") ||
    allInterfaces.includes("VideoClips") ||
    allInterfaces.includes("RTCSignalingChannel")
  );
}

/**
 * Maps a Scrypted device to a CameraRecord with real data from the SDK.
 * Streams are marked as 'unverified' — no RTSP URL is constructed or assumed.
 */
function mapDeviceToCameraRecord(
  device: any,
  serverUrl: string,
  fallbackId?: string,
): CameraRecord {
  const rawId =
    unwrapScryptedValue(device.id) ??
    unwrapScryptedValue(device._id) ??
    fallbackId ??
    `scrypted_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const id = String(rawId);

  const rawName = unwrapScryptedValue(device.name);
  const name =
    typeof rawName === "string" && rawName.trim().length > 0
      ? rawName.trim()
      : `Scrypted Camera ${id}`;

  const { manufacturer, model } = extractDeviceInfo(device);

  const rawIfaces = unwrapScryptedValue(device.interfaces);
  const interfaces: string[] = Array.isArray(rawIfaces)
    ? rawIfaces.map((i: any) => String(unwrapScryptedValue(i)))
    : [];

  const rawProvidedIfaces = unwrapScryptedValue(device.providedInterfaces);
  const providedInterfaces: string[] = Array.isArray(rawProvidedIfaces)
    ? rawProvidedIfaces.map((i: any) => String(unwrapScryptedValue(i)))
    : [];

  const allInterfaces = [...interfaces, ...providedInterfaces];

  const sensors: CameraSensorRecord[] = [];

  if (allInterfaces.includes("MotionSensor")) {
    sensors.push({
      sensorId: `${id}_motion`,
      type: "motion",
      name: `${name} – Movimiento`,
      enabled: true,
      state: false,
    });
  }

  if (allInterfaces.includes("Doorbell")) {
    sensors.push({
      sensorId: `${id}_doorbell`,
      type: "doorbell",
      name: `${name} – Timbre`,
      enabled: true,
      state: false,
    });
  }

  if (
    allInterfaces.includes("ObjectDetection") ||
    allInterfaces.includes("BinarySensor")
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

    let rawState: Record<string, any> = {};
    try {
      if (typeof systemManager.getSystemState === "function") {
        rawState = (await systemManager.getSystemState()) || {};
      }
    } catch (err) {
      console.warn("[Scrypted] Error calling getSystemState():", err);
      rawState = {};
    }

    const deviceIds = Object.keys(rawState);
    const cameras: CameraRecord[] = [];
    const seenIds = new Set<string>();

    for (const id of deviceIds) {
      try {
        let dev: any = null;
        if (typeof systemManager.getDeviceById === "function") {
          try {
            dev = systemManager.getDeviceById(id);
          } catch {
            dev = null;
          }
        }

        const stateDev = rawState[id];

        // Merge properties from proxy and raw state to guarantee all fields are accessible
        const combined = {
          id,
          name: dev?.name ?? unwrapScryptedValue(stateDev?.name),
          type: dev?.type ?? unwrapScryptedValue(stateDev?.type),
          providedType:
            dev?.providedType ?? unwrapScryptedValue(stateDev?.providedType),
          interfaces:
            dev?.interfaces ?? unwrapScryptedValue(stateDev?.interfaces),
          providedInterfaces:
            dev?.providedInterfaces ??
            unwrapScryptedValue(stateDev?.providedInterfaces),
          info: dev?.info ?? unwrapScryptedValue(stateDev?.info),
          manufacturer:
            dev?.manufacturer ?? unwrapScryptedValue(stateDev?.manufacturer),
          model: dev?.model ?? unwrapScryptedValue(stateDev?.model),
          serialNumber:
            dev?.serialNumber ?? unwrapScryptedValue(stateDev?.serialNumber),
        };

        if (isCameraDevice(combined) && !seenIds.has(id)) {
          seenIds.add(id);
          cameras.push(
            mapDeviceToCameraRecord(combined, session.serverUrl, id),
          );
        }
      } catch {
        // Skip device that cannot be mapped
      }
    }

    // Fallback: If deviceIds was empty or an array of objects
    if (cameras.length === 0) {
      let fallbackList: any[] = [];
      if (Array.isArray(rawState)) {
        fallbackList = rawState;
      } else if (typeof (systemManager as any).getDeviceIds === "function") {
        try {
          const ids: string[] = (systemManager as any).getDeviceIds();
          fallbackList = ids.map((id) => systemManager.getDeviceById(id));
        } catch {}
      } else if (Object.keys(rawState).length > 0) {
        fallbackList = Object.values(rawState);
      }

      for (const dev of fallbackList) {
        if (!dev) continue;
        try {
          const id = String(unwrapScryptedValue(dev.id) || "");
          if (isCameraDevice(dev) && id && !seenIds.has(id)) {
            seenIds.add(id);
            cameras.push(mapDeviceToCameraRecord(dev, session.serverUrl, id));
          }
        } catch {}
      }
    }

    console.log(
      `[Scrypted] Discovered ${deviceIds.length} total devices in systemState, identified ${cameras.length} cameras.`,
    );

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

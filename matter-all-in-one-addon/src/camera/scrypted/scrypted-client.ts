import net from "node:net";
import type {
  CameraRecord,
  CameraSensorRecord,
  ScryptedErrorCode,
  ScryptedCredentials,
  ScryptedStreamProfile,
  StreamReference,
} from "./scrypted-types.js";
import { isInventedRtspUrl } from "./scrypted-storage.js";
import {
  adaptScryptedClientDiscovery,
  type ScryptedClientDiscoveryResponse,
} from "./scrypted-client-discovery-adapter.js";
import { ScryptedRuntimeFacade } from "./scrypted-runtime-facade.js";
import {
  createScryptedRuntimeConnection,
  type ScryptedRuntimeConnection,
  type ScryptedRuntimeFetcher,
} from "./scrypted-runtime-connector.js";
import type { ScryptedDiscoveryPayload } from "./scrypted-runtime-ingest.js";
import type { ScryptedRuntimeSnapshot } from "./scrypted-runtime-facade.js";

export class ScryptedClientError extends Error {
  public readonly code: ScryptedErrorCode;
  public readonly statusCode?: number;

  constructor(message: string, code: ScryptedErrorCode, statusCode?: number) {
    super(message);
    this.name = "ScryptedClientError";
    this.code = code;
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ScryptedClientError.prototype);
  }
}

export interface ScryptedClientOptions {
  token?: string;
  timeoutMs?: number;
  runtimeFacade?: ScryptedRuntimeFacade;
  endpointPath?: string;
}

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

  // Priority for serial:
  // 1. device.info.serialNumber (manufacturer serial)
  // 2. plugin-provided serial (device.info.serial)
  // 3. nativeId explicitly labeled as technical ID
  // Never use IP address as serial. Never publish MAC automatically as serial by default.
  let serialNumber =
    unwrapScryptedValue(rawInfo.serialNumber) ||
    unwrapScryptedValue(device?.serialNumber) ||
    undefined;

  if (!serialNumber) {
    const pluginSerial =
      unwrapScryptedValue(rawInfo.serial) ||
      unwrapScryptedValue(device?.serial);
    if (
      pluginSerial &&
      typeof pluginSerial === "string" &&
      !net.isIP(pluginSerial)
    ) {
      serialNumber = pluginSerial;
    }
  }

  if (!serialNumber) {
    const nativeId = unwrapScryptedValue(device?.nativeId);
    if (
      nativeId &&
      typeof nativeId === "string" &&
      !net.isIP(nativeId) &&
      nativeId.length >= 6
    ) {
      serialNumber = nativeId;
    }
  }

  if (
    serialNumber &&
    typeof serialNumber === "string" &&
    net.isIP(serialNumber)
  ) {
    serialNumber = undefined;
  }

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

  const { manufacturer, model, serialNumber } = extractDeviceInfo(device);

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

  if (
    allInterfaces.includes("AudioSensor") ||
    allInterfaces.includes("Microphone") ||
    allInterfaces.includes("Intercom") ||
    allInterfaces.includes("TwoWayAudio")
  ) {
    sensors.push({
      sensorId: `${id}_audio`,
      type: "occupancy",
      name: `${name} – Micrófono / Audio`,
      enabled: true,
      state: false,
    });
  }

  const resolvedManufacturer = manufacturer ?? undefined;
  const resolvedModel = model ?? undefined;

  let scryptedHost = "127.0.0.1";
  try {
    if (serverUrl) {
      scryptedHost = new URL(serverUrl).hostname;
    }
  } catch {}

  const discoveredDirectUrl =
    (typeof device.directUrl === "string" && device.directUrl.trim()) ||
    (typeof device.streamUrl === "string" && device.streamUrl.trim()) ||
    (typeof device.rtspUrl === "string" && device.rtspUrl.trim()) ||
    (typeof device.streamReference?.directUrl === "string" &&
      device.streamReference.directUrl.trim()) ||
    undefined;

  const validDirectUrl =
    discoveredDirectUrl && !isInventedRtspUrl(discoveredDirectUrl, id)
      ? discoveredDirectUrl
      : undefined;

  const streamReference: StreamReference | undefined = validDirectUrl
    ? {
        protocol: "rtsp",
        directUrl: validDirectUrl,
        validationStatus: "not_checked",
      }
    : undefined;

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
    displaySerialNumber: serialNumber || "Serial no disponible",
    serialNumber: serialNumber || undefined,
    identity: {},
    source: {
      kind: "scrypted",
      serverId: serverUrl,
      deviceId: id,
      streamReference,
      snapshotReference: device.snapshotReference ?? undefined,
      profiles: Array.isArray(device.profiles) ? device.profiles : undefined,
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
  public static runtimeFacade: ScryptedRuntimeFacade =
    new ScryptedRuntimeFacade();
  public runtimeFacade: ScryptedRuntimeFacade;

  public readonly serverUrl: string;
  public readonly token?: string;
  public readonly timeoutMs: number;
  public readonly endpointPath: string;

  constructor(
    serverUrl: string,
    tokenOrOptions?: string | ScryptedClientOptions,
    timeoutMs: number = 6000,
    runtimeFacade: ScryptedRuntimeFacade = ScryptedClient.runtimeFacade,
  ) {
    this.serverUrl = serverUrl;
    if (typeof tokenOrOptions === "object" && tokenOrOptions !== null) {
      this.token = tokenOrOptions.token;
      this.timeoutMs = tokenOrOptions.timeoutMs ?? timeoutMs;
      this.runtimeFacade = tokenOrOptions.runtimeFacade ?? runtimeFacade;
      this.endpointPath = tokenOrOptions.endpointPath ?? "/api/v1/devices";
    } else {
      this.token = tokenOrOptions;
      this.timeoutMs = timeoutMs;
      this.runtimeFacade = runtimeFacade;
      this.endpointPath = "/api/v1/devices";
    }
  }

  /**
   * Normalizes base URL and endpoint path to prevent double slashes.
   */
  public static normalizeUrl(
    baseUrl: string,
    endpointPath: string = "/api/v1/devices",
  ): string {
    const raw = (baseUrl || "").trim();
    if (!raw) {
      throw new ScryptedClientError(
        "La URL del servidor no puede estar vacía",
        "invalid_url",
      );
    }
    const cleanBase = raw.replace(/\/+$/, "");
    const cleanPath = (endpointPath || "").trim().replace(/^\/+/, "");
    return cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  }

  /**
   * Removes sensitive token occurrences from error strings.
   */
  private sanitizeErrorMessage(message: string): string {
    if (!this.token || !this.token.trim()) return message;
    return message.split(this.token).join("[REDACTED]");
  }

  /**
   * Performs real HTTP discovery against the Scrypted server.
   * - Uses fetch
   * - Normalizes base URL to avoid double slashes
   * - Supports configurable URL, optional token, configurable timeout with AbortController
   * - Sends token strictly via Authorization header
   * - Never logs or includes token in errors
   * - Safely converts network errors, timeout, HTTP 401/403/500, invalid JSON and incomplete responses.
   */
  public async fetchDiscovery(
    endpointPath?: string,
  ): Promise<ScryptedDiscoveryPayload> {
    const targetUrl = ScryptedClient.normalizeUrl(
      this.serverUrl,
      endpointPath ?? this.endpointPath,
    );

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (this.token && this.token.trim().length > 0) {
      headers["Authorization"] = this.token.startsWith("Bearer ")
        ? this.token.trim()
        : `Bearer ${this.token.trim()}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new ScryptedClientError(
            "Error de autenticación en Scrypted (HTTP 401). Verifica el token configurado.",
            "authentication_failed",
            401,
          );
        }
        if (response.status === 403) {
          throw new ScryptedClientError(
            "Acceso denegado en Scrypted (HTTP 403). Permisos insuficientes.",
            "permission_denied",
            403,
          );
        }
        if (response.status >= 500) {
          throw new ScryptedClientError(
            `Error interno del servidor Scrypted (HTTP ${response.status}).`,
            "server_error",
            response.status,
          );
        }
        throw new ScryptedClientError(
          `Error HTTP ${response.status} recibido de Scrypted.`,
          "unknown",
          response.status,
        );
      }

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ScryptedClientError(
          "Respuesta JSON inválida recibida del servidor Scrypted.",
          "invalid_json",
        );
      }

      if (!data || typeof data !== "object") {
        throw new ScryptedClientError(
          "Respuesta incompleta del servidor Scrypted: cuerpo de respuesta inválido.",
          "incomplete_response",
        );
      }

      let rawList: unknown[] | undefined;
      if (Array.isArray(data)) {
        rawList = data;
      } else if (Array.isArray((data as any).devices)) {
        rawList = (data as any).devices;
      } else if (Array.isArray((data as any).cameras)) {
        rawList = (data as any).cameras;
      }

      if (!rawList) {
        throw new ScryptedClientError(
          "Respuesta incompleta del servidor Scrypted: falta la propiedad devices o cameras.",
          "incomplete_response",
        );
      }

      const validDevices = rawList.filter(
        (d): d is Record<string, any> =>
          Boolean(d) &&
          typeof d === "object" &&
          typeof (d as any).id === "string" &&
          (d as any).id.trim().length > 0,
      );

      if (rawList.length > 0 && validDevices.length === 0) {
        throw new ScryptedClientError(
          "Respuesta incompleta del servidor Scrypted: dispositivos sin identificador válido.",
          "incomplete_response",
        );
      }

      return { devices: validDevices };
    } catch (err: any) {
      if (err instanceof ScryptedClientError) {
        throw err;
      }
      if (err?.name === "AbortError" || controller.signal.aborted) {
        throw new ScryptedClientError(
          `Tiempo de espera agotado al conectar con Scrypted (${this.timeoutMs}ms).`,
          "timeout",
        );
      }
      const safeMessage = this.sanitizeErrorMessage(
        err?.message || "Error de conexión",
      );
      throw new ScryptedClientError(
        `Error de red al conectar con Scrypted: ${safeMessage}`,
        "network_error",
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Discovers cameras through HTTP and ingests them into the runtime facade.
   */
  public async discover(
    endpointPath?: string,
  ): Promise<ScryptedRuntimeSnapshot> {
    try {
      const payload = await this.fetchDiscovery(endpointPath);
      this.runtimeFacade.setConnectionState(true);
      const snapshot = adaptScryptedClientDiscovery(
        this.runtimeFacade,
        payload,
      );
      return snapshot;
    } catch (err) {
      this.runtimeFacade.setConnectionState(false);
      throw err;
    }
  }

  /**
   * Returns a runtime connection bound to this client instance.
   */
  public createConnection(endpointPath?: string): ScryptedRuntimeConnection {
    return createScryptedRuntimeConnection(() =>
      this.fetchDiscovery(endpointPath),
    );
  }

  /**
   * Returns a fetcher function bound to this client instance.
   */
  public getFetcher(endpointPath?: string): ScryptedRuntimeFetcher {
    return () => this.fetchDiscovery(endpointPath);
  }

  /**
   * Fetches real stream profiles for a given camera device through active SDK session or HTTP.
   */
  public async fetchStreamProfiles(
    deviceId: string,
  ): Promise<ScryptedStreamProfile[]> {
    const cleanDeviceId = String(deviceId || "").trim();
    if (!cleanDeviceId) return [];

    // 1. If an SDK session is active in ScryptedReconnectManager, use it
    try {
      const { ScryptedReconnectManager } = await import(
        "./scrypted-reconnect-manager.js"
      );
      const reconnectMgr = ScryptedReconnectManager.getInstance();
      const activeSession = (reconnectMgr as any)?.activeSession;
      if (activeSession?.sdk) {
        const sdkProfiles = await ScryptedClient.fetchStreamProfiles(
          activeSession,
          cleanDeviceId,
        );
        if (sdkProfiles.length > 0) return sdkProfiles;
      }
    } catch {
      // Fallback to HTTP
    }

    // 2. Query Scrypted HTTP API
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.token && this.token.trim().length > 0) {
      headers["Authorization"] = this.token.startsWith("Bearer ")
        ? this.token.trim()
        : `Bearer ${this.token.trim()}`;
    }

    const profilesEndpoint = `/api/v1/devices/${encodeURIComponent(cleanDeviceId)}/getVideoStreamOptions`;
    const targetUrl = ScryptedClient.normalizeUrl(
      this.serverUrl,
      profilesEndpoint,
    );
    const now = new Date().toISOString();

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (response.ok) {
        let streamOptions: any = null;
        try {
          streamOptions = await response.json();
        } catch {
          streamOptions = null;
        }

        if (Array.isArray(streamOptions) && streamOptions.length > 0) {
          const profiles: ScryptedStreamProfile[] = [];
          for (const opt of streamOptions) {
            if (!opt) continue;
            let directUrl =
              typeof opt.url === "string" && opt.url.trim().length > 0
                ? opt.url.trim()
                : undefined;

            if (directUrl && isInventedRtspUrl(directUrl, cleanDeviceId)) {
              directUrl = undefined;
            }

            profiles.push({
              id: String(opt.id || opt.name || `stream_${profiles.length}`),
              name: String(
                opt.name || opt.id || `Stream ${profiles.length + 1}`,
              ),
              container: opt.container,
              videoCodec: opt.video?.codec,
              audioCodec: opt.audio?.codec,
              resolution:
                opt.video?.width && opt.video?.height
                  ? { width: opt.video.width, height: opt.video.height }
                  : undefined,
              fps: opt.video?.fps,
              bitrateKbps: opt.video?.bitrate
                ? Math.round(opt.video.bitrate / 1000)
                : undefined,
              hasAudio: Boolean(opt.audio),
              directUrl,
              discoveredAt: now,
              validationStatus: directUrl ? "not_checked" : "unsupported",
            });
          }
          if (profiles.length > 0) return profiles;
        }
      }
    } catch (err: any) {
      const safeMsg = this.sanitizeErrorMessage(
        err?.message || "Error al obtener perfiles HTTP",
      );
      console.warn(
        `[Scrypted][${cleanDeviceId}] Error al obtener perfiles de stream: ${safeMsg}`,
      );
    } finally {
      clearTimeout(timer);
    }

    return [];
  }

  /**
   * Instance helper for backward compatibility in existing code.
   */
  public async listCameras(session?: ScryptedSession): Promise<CameraRecord[]> {
    if (session) {
      return ScryptedClient.listCameras.call(this, session);
    }
    const snapshot = await this.discover();
    const rawDevices = (snapshot as any)?.cameras ?? [];
    const cameras = rawDevices.map((item: any) =>
      mapDeviceToCameraRecord(
        {
          id: item.normalized.id,
          name: item.normalized.name,
          manufacturer:
            item.normalized.brand !== "Marca no identificada"
              ? item.normalized.brand
              : undefined,
          model: item.normalized.model ?? undefined,
          directUrl: item.normalized.directUrl,
          streamReference: item.normalized.streamReference,
          snapshotReference: item.normalized.snapshotReference,
          profiles: item.normalized.profiles,
        },
        this.serverUrl,
        item.normalized.id,
      ),
    );

    for (const camera of cameras) {
      try {
        if (!camera.source.streamReference?.directUrl) {
          const profiles = await this.fetchStreamProfiles(camera.cameraId);
          if (profiles.length > 0) {
            camera.source.profiles = profiles;
            camera.source.selectedProfileId = profiles[0].id;
            const primary = profiles.find((p) => p.directUrl) || profiles[0];
            if (primary?.directUrl) {
              camera.source.streamReference = {
                protocol: "rtsp",
                directUrl: primary.directUrl,
                validationStatus: primary.validationStatus,
              };
              camera.source.streamValidationStatus = primary.validationStatus;
            }
          }
        }
      } catch (profileErr: any) {
        console.warn(
          `[Scrypted][${camera.cameraId}] Error al enriquecer perfiles: ${this.sanitizeErrorMessage(profileErr?.message || String(profileErr))}`,
        );
      }
    }

    return cameras;
  }

  /**
   * Instance helper for backward compatibility in existing code.
   */
  public async testConnection(): Promise<ScryptedConnectionResult> {
    if (this.token) {
      const start = Date.now();
      try {
        await this.fetchDiscovery();
        return {
          ok: true,
          message: "Conexión correcta con Scrypted mediante token API.",
          authenticationMode: "api_token",
          latencyMs: Date.now() - start,
        };
      } catch (err: any) {
        if (err instanceof ScryptedClientError) {
          return {
            ok: false,
            errorCode: err.code,
            message: this.sanitizeErrorMessage(err.message),
            latencyMs: Date.now() - start,
          };
        }
        return {
          ok: false,
          errorCode: "unknown",
          message: "Error al conectar con Scrypted.",
          latencyMs: Date.now() - start,
        };
      }
    }

    return ScryptedClient.testConnection(
      this.serverUrl,
      {
        username: "admin",
        authenticationMode: "username_password",
      },
      undefined,
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

    const response: ScryptedClientDiscoveryResponse = {
      devices:
        rawState?.devices ??
        (Array.isArray(rawState) ? rawState : undefined) ??
        (systemManager as any)?.devices ??
        (session.sdk as any)?.devices ??
        (session as any)?.devices,
      cameras:
        rawState?.cameras ??
        (systemManager as any)?.cameras ??
        (session.sdk as any)?.cameras ??
        (session as any)?.cameras,
    };

    const cameras: CameraRecord[] = [];
    const seenIds = new Set<string>();

    if (this && this.runtimeFacade) {
      const snapshot = adaptScryptedClientDiscovery(
        this.runtimeFacade,
        response,
      );
      if (snapshot.cameras && snapshot.cameras.length > 0) {
        const rawList = Array.isArray(response.devices)
          ? response.devices
          : Array.isArray(response.cameras)
            ? response.cameras
            : [];

        for (const item of snapshot.cameras) {
          const id = item.normalized.id;
          if (!seenIds.has(id)) {
            seenIds.add(id);
            const rawDev =
              rawList.find((d: any) => d && String(d.id) === id) ?? {};
            cameras.push(
              mapDeviceToCameraRecord(
                {
                  ...rawDev,
                  id,
                  name: item.normalized.name,
                  manufacturer:
                    item.normalized.brand !== "Marca no identificada"
                      ? item.normalized.brand
                      : rawDev?.manufacturer,
                  model: item.normalized.model ?? rawDev?.model,
                },
                session.serverUrl,
                id,
              ),
            );
          }
        }
      }
    }

    const deviceIds = Object.keys(rawState);

    if (cameras.length === 0) {
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
    }

    const totalCount = Array.isArray(response.devices)
      ? response.devices.length
      : Array.isArray(response.cameras)
        ? response.cameras.length
        : deviceIds.length;

    console.log(
      `[Scrypted] Discovered ${totalCount} total devices in systemState, identified ${cameras.length} cameras.`,
    );

    // Enrich cameras with real stream profiles from Scrypted SDK
    for (const camera of cameras) {
      try {
        const profiles = await ScryptedClient.fetchStreamProfiles(
          session,
          camera.cameraId,
        );
        if (profiles.length > 0) {
          camera.source.profiles = profiles;
          camera.source.selectedProfileId = profiles[0].id;
          const primary = profiles.find((p) => p.directUrl) || profiles[0];
          if (primary?.directUrl) {
            camera.source.streamReference = {
              protocol: "rtsp",
              directUrl: primary.directUrl,
              validationStatus: primary.validationStatus,
            };
            camera.source.streamValidationStatus = primary.validationStatus;
          }
        }
      } catch (profileErr) {
        console.warn(
          `[Scrypted] Failed to fetch stream profiles for ${camera.cameraId}:`,
          profileErr,
        );
      }
    }

    return cameras;
  }

  /**
   * Helper that converts a MediaObject to a URI string using mediaManager.
   * Tries convertMediaObjectToUrl, then convertMediaObjectToLocalUrl,
   * then convertMediaObjectToInsecureLocalUrl for maximum compatibility.
   */
  private static async resolveMediaObjectUri(
    mediaManager: any,
    mo: any,
  ): Promise<string | undefined> {
    if (!mediaManager || !mo) return undefined;
    const methods = [
      "convertMediaObjectToUrl",
      "convertMediaObjectToLocalUrl",
      "convertMediaObjectToInsecureLocalUrl",
    ];
    for (const method of methods) {
      if (typeof mediaManager[method] === "function") {
        try {
          const resolved = await mediaManager[method](mo, "text/x-uri");
          if (typeof resolved === "string" && resolved.trim().length > 0) {
            return resolved.trim();
          }
        } catch {
          // Try next converter
        }
      }
    }
    return undefined;
  }

  /**
   * Fetches real stream profiles for a given camera device using the official Scrypted SDK.
   * Calls device.getVideoStreamOptions() and optionally resolves direct stream URLs
   * using mediaManager converters.
   *
   * NEVER invents an RTSP URL. Returns [] if no stream options are available.
   */
  public static async fetchStreamProfiles(
    session: ScryptedSession,
    deviceId: string,
  ): Promise<ScryptedStreamProfile[]> {
    const systemManager = session.sdk?.systemManager;
    const mediaManager = session.sdk?.mediaManager;
    if (!systemManager) return [];

    let dev: any = null;
    try {
      if (typeof systemManager.getDeviceById === "function") {
        dev = systemManager.getDeviceById(deviceId);
      }
    } catch (err) {
      console.warn(`[Scrypted] getDeviceById(${deviceId}) failed:`, err);
      return [];
    }

    if (!dev) return [];

    const profiles: ScryptedStreamProfile[] = [];
    const now = new Date().toISOString();

    // 1. Check if device supports getVideoStreamOptions()
    if (typeof dev.getVideoStreamOptions === "function") {
      try {
        const streamOptions: any[] = (await dev.getVideoStreamOptions()) || [];
        if (Array.isArray(streamOptions)) {
          for (const opt of streamOptions) {
            if (!opt) continue;
            const profileId = String(
              opt.id || opt.name || `stream_${profiles.length}`,
            );
            const profileName = String(
              opt.name || opt.id || `Stream ${profiles.length + 1}`,
            );

            let directUrl: string | undefined = undefined;

            // If opt.url exists (direct RTSP from Rebroadcast plugin)
            if (typeof opt.url === "string" && opt.url.trim().length > 0) {
              directUrl = opt.url.trim();
            } else if (
              typeof dev.getVideoStream === "function" &&
              mediaManager
            ) {
              try {
                let mo: any = null;
                try {
                  mo = await dev.getVideoStream({ id: opt.id });
                } catch {
                  try {
                    mo = await dev.getVideoStream({ id: opt.id, destination: "local" });
                  } catch {}
                }
                if (mo) {
                  const resolvedUrl = await ScryptedClient.resolveMediaObjectUri(
                    mediaManager,
                    mo,
                  );
                  if (resolvedUrl) {
                    directUrl = resolvedUrl;
                  }
                }
              } catch {
                // Not all profiles can be converted to static URL directly; that's normal
              }
            }

            // Safety check: NEVER accept an invented URL (path is /<cameraId>)
            if (directUrl && isInventedRtspUrl(directUrl, deviceId)) {
              directUrl = undefined;
            }

            profiles.push({
              id: profileId,
              name: profileName,
              container: opt.container,
              videoCodec: opt.video?.codec,
              audioCodec: opt.audio?.codec,
              resolution:
                opt.video?.width && opt.video?.height
                  ? { width: opt.video.width, height: opt.video.height }
                  : undefined,
              fps: opt.video?.fps,
              bitrateKbps: opt.video?.bitrate
                ? Math.round(opt.video.bitrate / 1000)
                : undefined,
              hasAudio: Boolean(opt.audio),
              directUrl,
              discoveredAt: now,
              validationStatus: directUrl ? "not_checked" : "unsupported",
            });
          }
        }
      } catch (optErr) {
        console.warn(
          `[Scrypted][${deviceId}] Error calling getVideoStreamOptions:`,
          optErr,
        );
      }
    }

    // 2. If no profiles returned from getVideoStreamOptions but device has getVideoStream,
    // attempt default getVideoStream()
    if (
      profiles.length === 0 &&
      typeof dev.getVideoStream === "function" &&
      mediaManager
    ) {
      try {
        let mo: any = null;
        try {
          mo = await dev.getVideoStream();
        } catch {
          try {
            mo = await dev.getVideoStream({ destination: "local" });
          } catch {}
        }
        if (mo) {
          const resolvedUrl = await ScryptedClient.resolveMediaObjectUri(
            mediaManager,
            mo,
          );
          if (
            resolvedUrl &&
            !isInventedRtspUrl(resolvedUrl, deviceId)
          ) {
            profiles.push({
              id: "default",
              name: "Default Stream",
              directUrl: resolvedUrl,
              discoveredAt: now,
              validationStatus: "not_checked",
            });
          }
        }
      } catch {
        // Fallback also failed — return empty profiles
      }
    }

    return profiles;
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

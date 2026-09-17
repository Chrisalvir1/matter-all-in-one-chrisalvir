import type { CameraUiCameraRecord, CameraUiConfig } from "./cameraui-types.js";
import { sanitizeUrlCredentials } from "../homekit/ffmpeg-helper.js";

/**
 * Universal extractor to parse camera lists from any Camera.UI version response format:
 * - Direct array [...]
 * - Camera.UI v5 standard paginated { result: [...] }
 * - Legacy { cameras: [...] }
 * - Object dictionary { cameras: { "cam1": { ... } } }
 * - Object dictionary { result: { "cam1": { ... } } }
 * - Generic envelope { data: [...] } or { items: [...] }
 * - Top-level dictionary of camera objects { "patio": { name: "patio", ... } }
 */
export function extractRawCameras(json: any): any[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;

  if (typeof json !== "object") return [];

  // Check array properties
  if (Array.isArray(json.result)) return json.result;
  if (Array.isArray(json.cameras)) return json.cameras;
  if (Array.isArray(json.data)) return json.data;
  if (Array.isArray(json.items)) return json.items;

  // Check dictionary inside json.cameras
  if (json.cameras && typeof json.cameras === "object" && !Array.isArray(json.cameras)) {
    const dictValues = Object.entries(json.cameras)
      .map(([key, val]: [string, any]) => {
        if (val && typeof val === "object") {
          return { name: val.name || key, ...val };
        }
        return null;
      })
      .filter(Boolean);
    if (dictValues.length > 0) return dictValues;
  }

  // Check dictionary inside json.result
  if (json.result && typeof json.result === "object" && !Array.isArray(json.result)) {
    const dictValues = Object.entries(json.result)
      .map(([key, val]: [string, any]) => {
        if (val && typeof val === "object") {
          return { name: val.name || key, ...val };
        }
        return null;
      })
      .filter(Boolean);
    if (dictValues.length > 0) return dictValues;
  }

  // Check if json itself is a dictionary of camera definitions
  const candidateValues = Object.entries(json)
    .map(([key, val]: [string, any]) => {
      if (
        val &&
        typeof val === "object" &&
        (val.sources || val.videoConfig || val.name || val.id || val._id || val.uuid)
      ) {
        return { name: val.name || key, ...val };
      }
      return null;
    })
    .filter(Boolean);

  if (candidateValues.length > 0) return candidateValues;

  return [];
}

export class CameraUiClient {
  private accessToken?: string;

  constructor(private readonly config: CameraUiConfig) {
    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  private getBaseUrl(): string {
    let url = (this.config.serverUrl || "").trim();
    if (!url) return "";
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = `http://${url}`;
    }
    return url.replace(/\/+$/, "");
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.accessToken) {
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    } else if (this.config.username && this.config.password) {
      const creds = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${creds}`;
    }
    return headers;
  }

  /**
   * Attempts authentication with Camera.UI.
   * Modern Camera.UI uses POST /api/auth/login returning a Bearer JWT access_token.
   */
  public async login(): Promise<{ ok: boolean; message?: string; skipped?: boolean }> {
    if (!this.config.username || !this.config.password) {
      return { ok: true, skipped: true };
    }

    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return { ok: false, message: "URL del servidor Camera.UI no configurada" };
    }

    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    // Try modern Camera.UI auth endpoint
    try {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          username: this.config.username,
          password: this.config.password,
          kind: "web",
          persistent: true,
          device: { id: "matter-all-in-one", name: "Matter All-in-One Bridge" },
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const data = await res.json();
        const token =
          data?.access_token ||
          data?.tokens?.access ||
          data?.tokens?.access_token ||
          data?.token ||
          data?.accessToken;
        if (token) {
          this.accessToken = String(token);
          return { ok: true };
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message: `Credenciales incorrectas: usuario o contraseña rechazados por Camera.UI en ${baseUrl} (HTTP ${res.status}).`,
        };
      }

      // If 404, try alternate login routes
      if (res.status === 404) {
        const fallbackRoutes = ["/api/login", "/auth/login"];
        for (const route of fallbackRoutes) {
          try {
            const fallbackRes = await fetch(`${baseUrl}${route}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                username: this.config.username,
                password: this.config.password,
              }),
              signal: AbortSignal.timeout(5000),
            });
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              const token =
                fallbackData?.access_token ||
                fallbackData?.tokens?.access ||
                fallbackData?.token ||
                fallbackData?.accessToken;
              if (token) {
                this.accessToken = String(token);
                return { ok: true };
              }
            }
          } catch {}
        }
        return { ok: true, skipped: true };
      }
    } catch (err: any) {
      return {
        ok: false,
        message: `Error al conectar con el servicio de autenticación en ${baseUrl}: ${err.message || err}`,
      };
    }

    return { ok: true };
  }

  /**
   * Tests connection to the Camera.UI instance.
   */
  public async testConnection(): Promise<{ ok: boolean; message: string; version?: string }> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return { ok: false, message: "URL del servidor Camera.UI no configurada" };
    }

    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    // Attempt login first if credentials provided
    if (this.config.username && this.config.password) {
      const loginRes = await this.login();
      if (!loginRes.ok) {
        return {
          ok: false,
          message: loginRes.message || "Fallo de autenticación con Camera.UI.",
        };
      }
    }

    const testEndpoints = [
      "/api/cameras?page=1&pageSize=-1",
      "/api/cameras",
      "/cameras?page=1&pageSize=-1",
      "/cameras",
      "/api/config",
      "/config",
      "/api/system/version",
      "/",
    ];

    let lastError = "";

    for (const endpoint of testEndpoints) {
      try {
        const res = await fetch(`${baseUrl}${endpoint}`, {
          method: "GET",
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          let version = "active";
          let count = 0;
          try {
            const data = await res.json();
            if (data?.version) version = String(data.version);
            else if (data?.system?.version) version = String(data.system.version);

            const discovered = extractRawCameras(data);
            if (discovered.length > 0) {
              count = discovered.length;
            }
          } catch {}

          const countMsg = count > 0 ? ` (${count} cámara${count === 1 ? "" : "s"} detectada${count === 1 ? "" : "s"})` : "";
          return {
            ok: true,
            message: `Conexión exitosa con Camera.UI en ${baseUrl}${countMsg}`,
            version,
          };
        }

        if (res.status === 401 || res.status === 403) {
          return {
            ok: false,
            message: `Camera.UI en ${baseUrl} denegó el acceso (HTTP ${res.status}). Verifica el usuario y contraseña.`,
          };
        }

        lastError = `HTTP ${res.status} ${res.statusText}`;
      } catch (err: any) {
        lastError = err.message || String(err);
      }
    }

    return {
      ok: false,
      message: `No se pudo conectar a Camera.UI en ${baseUrl}: ${lastError}. Verifica que el servicio esté activo y el certificado SSL sea aceptado.`,
    };
  }

  /**
   * Fetches and normalizes camera definitions from Camera.UI.
   */
  public async fetchCameras(): Promise<CameraUiCameraRecord[]> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) return [];

    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    // Ensure authenticated if credentials present
    if (this.config.username && this.config.password && !this.accessToken) {
      await this.login();
    }

    let rawList: any[] = [];

    const endpointsToTry = [
      "/api/cameras?page=1&pageSize=-1",
      "/api/cameras",
      "/cameras?page=1&pageSize=-1",
      "/cameras",
      "/api/config",
      "/config",
    ];

    for (const ep of endpointsToTry) {
      try {
        let res = await fetch(`${baseUrl}${ep}`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(6000),
        });

        // If 401, token might have expired, re-login once and retry
        if (res.status === 401 && this.config.username && this.config.password) {
          const loginRes = await this.login();
          if (loginRes.ok) {
            res = await fetch(`${baseUrl}${ep}`, {
              headers: this.getHeaders(),
              signal: AbortSignal.timeout(6000),
            });
          }
        }

        if (res.ok) {
          const json = await res.json();
          const items = extractRawCameras(json);
          if (items.length > 0) {
            rawList = items;
            break;
          }
        }
      } catch {}
    }

    const results: CameraUiCameraRecord[] = [];
    let parsedHostname = "localhost";
    try {
      parsedHostname = new URL(baseUrl).hostname;
    } catch {}

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item) continue;

      const name = String(item.name || item.camera || item.title || `Camera-${i + 1}`).trim();
      const rawId = item._id || item.id || item.uuid || item.name || `cam_${i + 1}`;
      const safeId = String(rawId)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");

      const videoConfig = item.videoConfig || {};
      const sources: any[] = Array.isArray(item.sources) ? item.sources : [];

      // Look for sources in modern Camera.UI schema
      let mainSourceUrl: string | undefined;
      let subSourceUrl: string | undefined;
      let snapshotSourceUrl: string | undefined;
      let isMuted = false;

      if (sources.length > 0) {
        // High resolution or primary stream
        const highRes =
          sources.find((s) => s.role === "high-resolution" || s.role === "high" || s.role === "main") ||
          sources[0];
        if (highRes) {
          if (Array.isArray(highRes.urls) && highRes.urls.length > 0) {
            mainSourceUrl = this.cleanStreamUrl(highRes.urls[0]);
          } else if (typeof highRes.url === "string") {
            mainSourceUrl = this.cleanStreamUrl(highRes.url);
          } else if (typeof highRes.stream === "string") {
            mainSourceUrl = this.cleanStreamUrl(highRes.stream);
          }
          if (highRes.muted === true) {
            isMuted = true;
          }
        }

        // Sub stream / mid-low resolution
        const subRes = sources.find(
          (s) =>
            s.role === "mid-resolution" ||
            s.role === "mid" ||
            s.role === "low-resolution" ||
            s.role === "low" ||
            s.role === "sub",
        );
        if (subRes) {
          if (Array.isArray(subRes.urls) && subRes.urls.length > 0) {
            subSourceUrl = this.cleanStreamUrl(subRes.urls[0]);
          } else if (typeof subRes.url === "string") {
            subSourceUrl = this.cleanStreamUrl(subRes.url);
          } else if (typeof subRes.stream === "string") {
            subSourceUrl = this.cleanStreamUrl(subRes.stream);
          }
        }

        // Snapshot source
        const snap = sources.find((s) => s.role === "snapshot" || s.useForSnapshot === true);
        if (snap) {
          if (Array.isArray(snap.urls) && snap.urls.length > 0) {
            snapshotSourceUrl = this.cleanStreamUrl(snap.urls[0]);
          } else if (typeof snap.url === "string") {
            snapshotSourceUrl = this.cleanStreamUrl(snap.url);
          }
        }
      }

      // Legacy fallback to videoConfig
      let rtspUrl = mainSourceUrl || this.cleanStreamUrl(videoConfig.source);
      let subRtspUrl = subSourceUrl || this.cleanStreamUrl(videoConfig.subSource);
      let snapshotUrl =
        snapshotSourceUrl ||
        this.cleanStreamUrl(videoConfig.stillImageSource);

      // If no direct RTSP source was found, fallback to Camera.UI local RTSP restream
      if (!rtspUrl) {
        const safeName = encodeURIComponent(name.toLowerCase().replace(/\s+/g, "_"));
        rtspUrl = `rtsp://${parsedHostname}:8554/${safeName}`;
      }

      // Substitute localhost/127.0.0.1 in rtspUrl / subRtspUrl / snapshotUrl with actual server host
      if (parsedHostname !== "localhost" && parsedHostname !== "127.0.0.1") {
        if (rtspUrl) {
          rtspUrl = rtspUrl
            .replace("://localhost:", `://${parsedHostname}:`)
            .replace("://127.0.0.1:", `://${parsedHostname}:`)
            .replace("://localhost/", `://${parsedHostname}/`)
            .replace("://127.0.0.1/", `://${parsedHostname}/`);
        }
        if (subRtspUrl) {
          subRtspUrl = subRtspUrl
            .replace("://localhost:", `://${parsedHostname}:`)
            .replace("://127.0.0.1:", `://${parsedHostname}:`)
            .replace("://localhost/", `://${parsedHostname}/`)
            .replace("://127.0.0.1/", `://${parsedHostname}/`);
        }
        if (snapshotUrl) {
          snapshotUrl = snapshotUrl
            .replace("://localhost:", `://${parsedHostname}:`)
            .replace("://127.0.0.1:", `://${parsedHostname}:`)
            .replace("://localhost/", `://${parsedHostname}/`)
            .replace("://127.0.0.1/", `://${parsedHostname}/`);
        }
      }

      // Default snapshot from Camera.UI feed if stillImageSource not present
      if (!snapshotUrl) {
        snapshotUrl = `${baseUrl}/api/cameras/${encodeURIComponent(name)}/snapshot`;
      }

      const width = Number(videoConfig.maxWidth || item.width || 1920);
      const height = Number(videoConfig.maxHeight || item.height || 1080);
      const fps = Number(videoConfig.maxFPS || item.fps || 30);
      const hasAudio = !isMuted && videoConfig.audio !== false && item.muted !== true;

      // MQTT topics
      const mqttConfig = item.mqtt || {};
      const safeSlug = name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      const motionTopic =
        mqttConfig.motionTopic ||
        item.motionTopic ||
        `camera.ui/${safeSlug}/motion`;
      const doorbellTopic =
        mqttConfig.doorbellTopic ||
        item.doorbellTopic ||
        (item.doorbell ? `camera.ui/${safeSlug}/doorbell` : undefined);

      results.push({
        id: `cameraui_${safeId}`,
        name,
        manufacturer: item.info?.manufacturer || item.manufacturer || "Camera.UI",
        model: item.info?.model || item.model || "Network Camera",
        serialNumber: item.info?.serialNumber || item.serialNumber || `CUI-${safeId.toUpperCase()}`,
        rtspUrl,
        subRtspUrl,
        snapshotUrl,
        hasAudio,
        width,
        height,
        fps,
        motionTopic,
        doorbellTopic,
        motionActive: false,
        doorbellActive: false,
        status: "online",
        homeKitEnabled: true,
      });
    }

    return results;
  }

  private cleanStreamUrl(raw?: string): string | undefined {
    if (!raw || typeof raw !== "string") return undefined;
    let trimmed = raw.trim();
    if (trimmed.startsWith("-i ")) {
      trimmed = trimmed.substring(3).trim();
    }
    // Remove surrounding quotes if present
    trimmed = trimmed.replace(/^["']|["']$/g, "").trim();
    if (
      trimmed.startsWith("rtsp://") ||
      trimmed.startsWith("rtsps://") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      return trimmed;
    }
    return undefined;
  }
}


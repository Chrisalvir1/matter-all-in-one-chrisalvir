import type { CameraUiCameraRecord, CameraUiConfig } from "./cameraui-types.js";
import { sanitizeUrlCredentials } from "../homekit/ffmpeg-helper.js";

export class CameraUiClient {
  private accessToken?: string;

  constructor(private readonly config: CameraUiConfig) {
    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  private getBaseUrl(): string {
    let url = (this.config.serverUrl || "").trim();
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
        if (data?.access_token) {
          this.accessToken = String(data.access_token);
          return { ok: true };
        }
      }

      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          message: `Credenciales incorrectas: usuario o contraseña rechazados por Camera.UI (HTTP ${res.status}).`,
        };
      }

      // If 404, might be legacy Camera.UI
      if (res.status === 404) {
        try {
          const legacyRes = await fetch(`${baseUrl}/api/login`, {
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
          if (legacyRes.ok) {
            const legacyData = await legacyRes.json();
            if (legacyData?.access_token || legacyData?.token) {
              this.accessToken = String(legacyData.access_token || legacyData.token);
              return { ok: true };
            }
          }
        } catch {
          // Fallback to basic auth
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
      "/api/cameras",
      "/api/config",
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
            if (Array.isArray(data)) {
              count = data.length;
            } else if (Array.isArray(data?.cameras)) {
              count = data.cameras.length;
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

    // Try /api/cameras first
    try {
      let res = await fetch(`${baseUrl}/api/cameras`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000),
      });

      // If 401, token might have expired, re-login and retry
      if (res.status === 401 && this.config.username && this.config.password) {
        const loginRes = await this.login();
        if (loginRes.ok) {
          res = await fetch(`${baseUrl}/api/cameras`, {
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(6000),
          });
        }
      }

      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) {
          rawList = json;
        } else if (json && Array.isArray(json.cameras)) {
          rawList = json.cameras;
        }
      }
    } catch {}

    // Fallback to /api/config if /api/cameras was empty
    if (rawList.length === 0) {
      try {
        const res = await fetch(`${baseUrl}/api/config`, {
          headers: this.getHeaders(),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) {
          const json = await res.json();
          if (json && Array.isArray(json.cameras)) {
            rawList = json.cameras;
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
      const rawId = item.id || item.uuid || item.name || `cam_${i + 1}`;
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
          sources.find((s) => s.role === "high-resolution" || s.role === "main") ||
          sources[0];
        if (highRes) {
          if (Array.isArray(highRes.urls) && highRes.urls.length > 0) {
            mainSourceUrl = this.cleanStreamUrl(highRes.urls[0]);
          } else if (typeof highRes.url === "string") {
            mainSourceUrl = this.cleanStreamUrl(highRes.url);
          }
          if (highRes.muted === true) {
            isMuted = true;
          }
        }

        // Sub stream / mid-low resolution
        const subRes = sources.find(
          (s) => s.role === "mid-resolution" || s.role === "low-resolution" || s.role === "sub",
        );
        if (subRes) {
          if (Array.isArray(subRes.urls) && subRes.urls.length > 0) {
            subSourceUrl = this.cleanStreamUrl(subRes.urls[0]);
          } else if (typeof subRes.url === "string") {
            subSourceUrl = this.cleanStreamUrl(subRes.url);
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

      // Default snapshot from Camera.UI feed if stillImageSource not present
      if (!snapshotUrl) {
        snapshotUrl = `${baseUrl}/cameras/${encodeURIComponent(name)}/feed`;
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
        manufacturer: item.manufacturer || "Camera.UI",
        model: item.model || "Network Camera",
        serialNumber: item.serialNumber || `CUI-${safeId.toUpperCase()}`,
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

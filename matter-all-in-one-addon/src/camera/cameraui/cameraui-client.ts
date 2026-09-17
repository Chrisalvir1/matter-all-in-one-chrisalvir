import net from "node:net";
import type { CameraUiCameraRecord, CameraUiConfig } from "./cameraui-types.js";
import { sanitizeUrlCredentials } from "../homekit/ffmpeg-helper.js";

/**
 * Fast TCP socket check to verify if a camera's RTSP or HTTP stream port is reachable.
 */
export async function isCameraStreamReachable(
  streamUrl?: string,
  timeoutMs = 2000,
): Promise<boolean> {
  if (!streamUrl || typeof streamUrl !== "string") return false;
  try {
    const parsed = new URL(streamUrl);
    const host = parsed.hostname;
    let port = parsed.port ? Number(parsed.port) : undefined;
    if (!port) {
      if (parsed.protocol === "rtsp:") port = 554;
      else if (parsed.protocol === "rtsps:") port = 322;
      else if (parsed.protocol === "http:") port = 80;
      else if (parsed.protocol === "https:") port = 443;
      else port = 554;
    }
    return await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });
      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

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
  private resolvedBaseUrl?: string;
  private loginError?: string;

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

  public getCandidateUrls(): string[] {
    const configured = this.getBaseUrl();
    const candidates: string[] = [];
    if (this.resolvedBaseUrl) {
      candidates.push(this.resolvedBaseUrl);
    }
    if (configured) {
      candidates.push(configured);
      try {
        const u = new URL(configured);
        // Prioritize IPv4 127.0.0.1 if localhost was configured, avoiding IPv6 ::1 ECONNREFUSED in containers
        if (u.hostname === "localhost") {
          candidates.push(`${u.protocol}//127.0.0.1:${u.port || "8181"}`);
        } else if (u.hostname === "127.0.0.1") {
          candidates.push(`${u.protocol}//localhost:${u.port || "8181"}`);
        }
      } catch {}
    }

    // Common Home Assistant add-on locations
    candidates.push("http://127.0.0.1:8181");
    candidates.push("http://localhost:8181");
    candidates.push("http://a0d7b954-camera-ui:8181");
    candidates.push("http://homeassistant:8181");

    return Array.from(new Set(candidates.filter(Boolean)));
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
   * Modern Camera.UI may use POST /api/auth/login or session auth.
   * Universal HTTP Basic Auth is also handled transparently via getHeaders().
   */
  public async login(targetBaseUrl?: string): Promise<{ ok: boolean; message?: string; skipped?: boolean }> {
    if (!this.config.username || !this.config.password) {
      return { ok: true, skipped: true };
    }

    const baseUrl = targetBaseUrl || this.getBaseUrl();
    if (!baseUrl) {
      return { ok: false, message: "URL del servidor Camera.UI no configurada" };
    }

    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    const authEndpoints = ["/api/auth/login", "/api/login", "/auth/login"];

    for (const ep of authEndpoints) {
      try {
        const res = await fetch(`${baseUrl}${ep}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            ...this.getHeaders(),
          },
          body: JSON.stringify({
            username: this.config.username,
            password: this.config.password,
            kind: "web",
            persistent: true,
            device: { id: "matter-all-in-one", name: "Matter All-in-One Bridge" },
          }),
          signal: AbortSignal.timeout(5000),
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
            this.loginError = undefined;
            return { ok: true };
          }
        }

        if (res.status === 401 || res.status === 403) {
          this.loginError = `Credenciales incorrectas: usuario o contraseña rechazados por Camera.UI en ${baseUrl} (HTTP ${res.status}).`;
        }
      } catch {}
    }

    return { ok: true, skipped: true };
  }

  /**
   * Tests connection to the Camera.UI instance across candidate endpoints and hosts.
   */
  public async testConnection(): Promise<{ ok: boolean; message: string; version?: string; activeUrl?: string }> {
    const candidates = this.getCandidateUrls();
    if (candidates.length === 0) {
      return { ok: false, message: "URL del servidor Camera.UI no configurada" };
    }

    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    let lastError = "";
    let authFailureMessage: string | undefined;

    for (const baseUrl of candidates) {
      this.loginError = undefined;
      if (this.config.username && this.config.password) {
        await this.login(baseUrl);
      }

      const testEndpoints = [
        "/api/cameras?page=1&pageSize=-1",
        "/api/cameras",
        "/cameras?page=1&pageSize=-1",
        "/cameras",
        "/api/config",
        "/config",
        "/api/system/version",
        "/api/system",
        "/api/ping",
        "/",
      ];

      for (const endpoint of testEndpoints) {
        try {
          const res = await fetch(`${baseUrl}${endpoint}`, {
            method: "GET",
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(4000),
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

            this.resolvedBaseUrl = baseUrl;
            const countMsg = count > 0 ? ` (${count} cámara${count === 1 ? "" : "s"} detectada${count === 1 ? "" : "s"})` : "";
            return {
              ok: true,
              message: `Conexión exitosa con Camera.UI en ${baseUrl}${countMsg}`,
              version,
              activeUrl: baseUrl,
            };
          }

          if (res.status === 401 || res.status === 403) {
            authFailureMessage = `Credenciales incorrectas: Camera.UI en ${baseUrl} denegó el acceso (HTTP ${res.status}). Verifica el usuario y contraseña.`;
            break;
          }

          lastError = `HTTP ${res.status} ${res.statusText}`;
        } catch (err: any) {
          lastError = err.message || String(err);
        }
      }

      if (this.loginError && !authFailureMessage) {
        authFailureMessage = this.loginError;
      }
    }

    if (authFailureMessage) {
      return {
        ok: false,
        message: authFailureMessage,
      };
    }

    const primaryUrl = this.getBaseUrl() || candidates[0];
    return {
      ok: false,
      message: `No se pudo conectar a Camera.UI en ${primaryUrl}: ${lastError || "Servicio no disponible"}. Verifica que el servicio esté activo y el certificado SSL sea aceptado.`,
    };
  }

  /**
   * Fetches and normalizes camera definitions from Camera.UI.
   */
  public async fetchCameras(): Promise<CameraUiCameraRecord[]> {
    const candidates = this.getCandidateUrls();
    if (candidates.length === 0) return [];

    if (this.config.allowSelfSignedCertificate !== false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }

    let rawList: any[] = [];
    let successfulBaseUrl = "";

    const endpointsToTry = [
      "/api/cameras?page=1&pageSize=-1",
      "/api/cameras",
      "/cameras?page=1&pageSize=-1",
      "/cameras",
      "/api/config",
      "/config",
    ];

    for (const baseUrl of candidates) {
      if (this.config.username && this.config.password && !this.accessToken) {
        await this.login(baseUrl);
      }

      for (const ep of endpointsToTry) {
        try {
          let res = await fetch(`${baseUrl}${ep}`, {
            headers: this.getHeaders(),
            signal: AbortSignal.timeout(6000),
          });

          // If 401, token might have expired, re-login once and retry
          if (res.status === 401 && this.config.username && this.config.password) {
            const loginRes = await this.login(baseUrl);
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
              successfulBaseUrl = baseUrl;
              this.resolvedBaseUrl = baseUrl;
              break;
            }
          }
        } catch {}
      }

      if (rawList.length > 0) break;
    }

    if (rawList.length === 0) return [];

    const effectiveBaseUrl = successfulBaseUrl || this.getBaseUrl() || candidates[0];
    const results: CameraUiCameraRecord[] = [];
    let parsedHostname = "localhost";
    try {
      parsedHostname = new URL(effectiveBaseUrl).hostname;
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
        // High resolution or primary stream (Stream 1) - strictly prioritize Stream 1
        const highRes =
          sources.find(
            (s) =>
              s.role === "high-resolution" ||
              s.role === "high" ||
              s.role === "main" ||
              s.role === "stream1" ||
              (typeof s.name === "string" && /main|stream1|hq|primary/i.test(s.name)),
          ) ||
          sources.find((s) => {
            const u = Array.isArray(s.urls) ? s.urls[0] : s.url || s.stream || "";
            return /stream1|main|ch0|h264preview.*main/i.test(u);
          }) ||
          sources.find((s) => s.role !== "sub" && s.role !== "low" && s.role !== "snapshot") ||
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

      // Ensure rtspUrl strictly prioritizes Stream 1 (Full 100% Quality / Main Stream)
      if (rtspUrl) {
        if (
          (rtspUrl.includes("/stream2") || rtspUrl.includes("_sub") || rtspUrl.includes("/sub/")) &&
          subRtspUrl &&
          (subRtspUrl.includes("/stream1") || subRtspUrl.includes("_main") || subRtspUrl.includes("/main/"))
        ) {
          const temp = rtspUrl;
          rtspUrl = subRtspUrl;
          subRtspUrl = temp;
        } else if (rtspUrl.includes("/stream2")) {
          rtspUrl = rtspUrl.replace("/stream2", "/stream1");
        }
      }

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
        snapshotUrl = `${effectiveBaseUrl}/api/cameras/${encodeURIComponent(name)}/snapshot`;
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

      // Detect video codec: check videoConfig, sources, or known Tapo 2K/HEVC camera models
      const rawCodec = String(
        videoConfig.vcodec ||
        videoConfig.codec ||
        item.vcodec ||
        item.codec ||
        (sources[0] && (sources[0].codec || sources[0].vcodec)) ||
        "",
      ).toLowerCase();

      const modelName = String(item.info?.model || item.model || "").toLowerCase();
      const cameraTitle = name.toLowerCase();
      const isHevcDetected =
        rawCodec.includes("hevc") ||
        rawCodec.includes("265") ||
        /c402|c420|c425|c520|c320|c325|tc72/i.test(modelName) ||
        /c402|c420|c425|c520|c320|c325|tc72/i.test(cameraTitle) ||
        (width >= 2304 && (/tapo/i.test(cameraTitle) || /tapo/i.test(modelName)));

      const videoCodec = isHevcDetected ? "hevc" : rawCodec.includes("h264") ? "h264" : undefined;
      const strategy = isHevcDetected ? "passthrough_hevc" : "passthrough_h264";

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
        videoCodec,
        strategy,
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

    // Support tapo:// custom scheme from Camera.UI / homebridge-tapo-camera
    // e.g. tapo://user:password@192.168.1.100 -> rtsp://user:password@192.168.1.100:554/stream1
    if (trimmed.startsWith("tapo://")) {
      const afterProto = trimmed.substring(7);
      if (!afterProto.includes(":554") && !afterProto.includes("/")) {
        return `rtsp://${afterProto}:554/stream1`;
      } else if (!afterProto.includes("/")) {
        return `rtsp://${afterProto}/stream1`;
      }
      return `rtsp://${afterProto}`;
    }

    if (
      trimmed.startsWith("rtsp://") ||
      trimmed.startsWith("rtsps://") ||
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://")
    ) {
      // Strip URL fragments (#gop=1, #timeout=..., etc.) — RTSP does NOT support URL fragments
      // and FFmpeg will fail with "Invalid data found when processing input" if they are present.
      const hashIndex = trimmed.indexOf("#");
      if (hashIndex !== -1) {
        trimmed = trimmed.substring(0, hashIndex);
      }
      return trimmed || undefined;
    }
    return undefined;
  }
}


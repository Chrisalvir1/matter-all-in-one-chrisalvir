import type { CameraUiCameraRecord, CameraUiConfig } from "./cameraui-types.js";
import { sanitizeUrlCredentials } from "../homekit/ffmpeg-helper.js";

export class CameraUiClient {
  constructor(private readonly config: CameraUiConfig) {}

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
    if (this.config.username && this.config.password) {
      const creds = Buffer.from(
        `${this.config.username}:${this.config.password}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${creds}`;
    }
    return headers;
  }

  /**
   * Tests connection to the Camera.UI instance.
   */
  public async testConnection(): Promise<{ ok: boolean; message: string; version?: string }> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return { ok: false, message: "URL del servidor Camera.UI no configurada" };
    }

    const testEndpoints = [
      "/api/cameras",
      "/api/config",
      "/api/system/version",
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
          try {
            const data = await res.json();
            if (data?.version) version = String(data.version);
          } catch {}
          return {
            ok: true,
            message: `Conexión exitosa con Camera.UI (${baseUrl})`,
            version,
          };
        }
      } catch (err: any) {
        // Try next endpoint
      }
    }

    return {
      ok: false,
      message: `No se pudo contactar a Camera.UI en ${baseUrl}. Verifica que el servicio esté ejecutándose y la IP/puerto sean correctos.`,
    };
  }

  /**
   * Fetches and normalizes camera definitions from Camera.UI.
   */
  public async fetchCameras(): Promise<CameraUiCameraRecord[]> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) return [];

    let rawList: any[] = [];

    // Try /api/cameras first
    try {
      const res = await fetch(`${baseUrl}/api/cameras`, {
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(6000),
      });
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
    const parsedServer = new URL(baseUrl);

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item) continue;

      const name = String(item.name || item.camera || `Camera-${i + 1}`).trim();
      const id = (
        item.id ||
        item.name ||
        `cameraui_${name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`
      )
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_");

      const videoConfig = item.videoConfig || {};

      // Extract RTSP / HTTP URL from videoConfig.source (e.g. "-i rtsp://..." or direct "rtsp://...")
      let rtspUrl = this.cleanStreamUrl(videoConfig.source);
      let subRtspUrl = this.cleanStreamUrl(videoConfig.subSource);
      let snapshotUrl = this.cleanStreamUrl(videoConfig.stillImageSource);

      // If no direct RTSP source was found or if Camera.UI provides local restream feed:
      if (!rtspUrl) {
        // Camera.UI typically restream cameras at rtsp://<host>:8554/<name>
        const safeName = encodeURIComponent(name.toLowerCase().replace(/\s+/g, "_"));
        rtspUrl = `rtsp://${parsedServer.hostname}:8554/${safeName}`;
      }

      // Default snapshot from Camera.UI feed if stillImageSource not present
      if (!snapshotUrl) {
        snapshotUrl = `${baseUrl}/cameras/${encodeURIComponent(name)}/feed`;
      }

      const width = Number(videoConfig.maxWidth || item.width || 1920);
      const height = Number(videoConfig.maxHeight || item.height || 1080);
      const fps = Number(videoConfig.maxFPS || item.fps || 30);
      const hasAudio = videoConfig.audio !== false;

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
        id: `cameraui_${id}`,
        name,
        manufacturer: item.manufacturer || "Camera.UI",
        model: item.model || "Network Camera",
        serialNumber: item.serialNumber || `CUI-${id.toUpperCase()}`,
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

import {
  probeCameraSource,
  sanitizeUrlCredentials,
  type ProbeResult,
} from "../homekit/ffmpeg-helper.js";
import type {
  StreamValidationStatus,
  ScryptedStreamProfile,
} from "./scrypted-types.js";
import { isInventedRtspUrl } from "./scrypted-storage.js";

export interface StreamValidationResult {
  status: StreamValidationStatus;
  url: string;
  error?: string;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: { width: number; height: number };
  fps?: number;
  hasAudio?: boolean;
  validatedAt: string;
  probeMethod?: "ffprobe" | "ffmpeg";
}

export class ScryptedStreamValidator {
  /**
   * Validates a stream URL via ffprobe/ffmpeg without keeping the stream open.
   * Classifies results into typed StreamValidationStatus.
   */
  public static async validateStreamUrl(
    url: string,
    cameraId?: string,
    timeoutMs: number = 8000,
  ): Promise<StreamValidationResult> {
    const now = new Date().toISOString();
    const sanitized = sanitizeUrlCredentials(url);

    if (!url || typeof url !== "string" || url.trim().length === 0) {
      return {
        status: "not_checked",
        url: "",
        error: "URL no proporcionada",
        validatedAt: now,
      };
    }

    const trimmedUrl = url.trim();

    // Guard against invented URLs
    if (cameraId && isInventedRtspUrl(trimmedUrl, cameraId)) {
      return {
        status: "invalid",
        url: sanitized,
        error: `URL rechazada: contiene un ID de dispositivo como ruta ('${trimmedUrl}'), lo cual no es una ruta RTSP real de Scrypted Rebroadcast.`,
        validatedAt: now,
      };
    }

    try {
      const probe: ProbeResult = await probeCameraSource(trimmedUrl, {
        timeoutMs,
      });

      if (probe.valid && probe.videoCodec) {
        return {
          status: "verified",
          url: sanitized,
          videoCodec: probe.videoCodec,
          audioCodec: probe.audioCodec,
          resolution:
            probe.width && probe.height
              ? { width: probe.width, height: probe.height }
              : undefined,
          fps: probe.fps,
          hasAudio: probe.hasAudio,
          validatedAt: now,
          probeMethod: probe.probeMethod,
        };
      }

      // Analyze error string to determine specific failure status
      const errMsg = String(probe.error || "").toLowerCase();
      let status: StreamValidationStatus = "invalid";

      if (errMsg.includes("404") || errMsg.includes("not found")) {
        status = "not_found";
      } else if (
        errMsg.includes("401") ||
        errMsg.includes("403") ||
        errMsg.includes("unauthorized") ||
        errMsg.includes("forbidden")
      ) {
        status = "unauthorized";
      } else if (errMsg.includes("timeout") || errMsg.includes("timed out")) {
        status = "timeout";
      } else if (
        errMsg.includes("connection refused") ||
        errMsg.includes("econnrefused") ||
        errMsg.includes("host unreachable") ||
        errMsg.includes("network unreachable")
      ) {
        status = "source_offline";
      }

      return {
        status,
        url: sanitized,
        error: probe.error || "No se pudo obtener información del stream",
        validatedAt: now,
        probeMethod: probe.probeMethod,
      };
    } catch (err: any) {
      return {
        status: "invalid",
        url: sanitized,
        error: String(err?.message || err),
        validatedAt: now,
      };
    }
  }

  /**
   * Validates a specific stream profile.
   */
  public static async validateProfile(
    profile: ScryptedStreamProfile,
    cameraId?: string,
    timeoutMs: number = 8000,
  ): Promise<StreamValidationResult> {
    if (!profile.directUrl) {
      return {
        status: "unsupported",
        url: "",
        error: "El perfil no expone una URL directa reproducible",
        validatedAt: new Date().toISOString(),
      };
    }

    return await this.validateStreamUrl(profile.directUrl, cameraId, timeoutMs);
  }
}

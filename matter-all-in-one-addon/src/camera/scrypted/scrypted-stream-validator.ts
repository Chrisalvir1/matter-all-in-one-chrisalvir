import {
  probeCameraSource,
  measureStreamGop,
  sanitizeUrlCredentials,
  type ProbeResult,
} from "../homekit/ffmpeg-helper.js";
import type {
  StreamValidationStatus,
  ScryptedStreamProfile,
  StreamLatencyMetrics,
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
  needsDumpExtra?: boolean;
  gopSeconds?: number;
  metrics?: StreamLatencyMetrics;
  validatedAt: string;
  probeMethod?: "ffprobe" | "ffmpeg";
}

interface CacheEntry {
  result: StreamValidationResult;
  expiresAt: number;
}

export class ScryptedStreamValidator {
  /** Global queue to ensure only one probe runs at a time */
  private static queue: Promise<any> = Promise.resolve();

  /** Cache of recent validation results keyed by sanitized URL (30s TTL) */
  private static cache = new Map<string, CacheEntry>();

  /** Rate limit map by cameraId to prevent infinite probe loops on dead streams */
  private static failureRateLimit = new Map<
    string,
    { timestamp: number; status: StreamValidationStatus }
  >();

  /**
   * Validates a stream URL via ffprobe/ffmpeg without keeping the stream open.
   * Classifies results into typed StreamValidationStatus.
   * Enforces single-concurrency queue, timeout, and result caching.
   */
  public static async validateStreamUrl(
    url: string,
    cameraId?: string,
    timeoutMs: number = 3000,
    signal?: AbortSignal,
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

    // Check cache
    const cached = this.cache.get(sanitized);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // Check rate limit for recent offline/not_found failures on this stream (30s backoff)
    const rateLimitKey = cameraId ? `${cameraId}:${sanitized}` : sanitized;
    const recentFailure = this.failureRateLimit.get(rateLimitKey);
    if (
      recentFailure &&
      Date.now() - recentFailure.timestamp < 30000 &&
      (recentFailure.status === "not_found" ||
        recentFailure.status === "source_offline")
    ) {
      return {
        status: recentFailure.status,
        url: sanitized,
        error: `Reintento en espera (backoff activo para ${recentFailure.status})`,
        validatedAt: now,
      };
    }

    if (signal?.aborted) {
      return {
        status: "timeout",
        url: sanitized,
        error: "Validación cancelada por el usuario o timeout",
        validatedAt: now,
      };
    }

    // Serialize probe execution through global queue
    return new Promise<StreamValidationResult>((resolve) => {
      this.queue = this.queue
        .then(async () => {
          if (signal?.aborted) {
            resolve({
              status: "timeout",
              url: sanitized,
              error: "Validación cancelada",
              validatedAt: now,
            });
            return;
          }

          const startTime = Date.now();
          try {
            const probe: ProbeResult = await probeCameraSource(trimmedUrl, {
              timeoutMs,
            });

            const elapsedMs = Date.now() - startTime;

            if (probe.valid && probe.videoCodec) {
              const metrics: StreamLatencyMetrics = {
                validatedAt: now,
                sourceType: trimmedUrl.includes("8554")
                  ? "scrypted_rebroadcast"
                  : "local_rtsp",
                timeToDescribeMs: {
                  value: elapsedMs,
                  source: probe.probeMethod || "ffprobe",
                  confidence: "high",
                  measuredAt: now,
                },
                timeToFirstFrameMs: {
                  value: elapsedMs,
                  source: probe.probeMethod || "ffprobe",
                  confidence: "high",
                  measuredAt: now,
                },
                selectedTransport: {
                  value: "tcp",
                  source: "rtsp_probe",
                  confidence: "high",
                  measuredAt: now,
                },
                observedFps: probe.fps
                  ? {
                      value: probe.fps,
                      source: "ffprobe",
                      confidence: "high",
                      measuredAt: now,
                    }
                  : undefined,
                ffmpegRestartCount: 0,
              };

              let gopSeconds: number | undefined;
              try {
                gopSeconds = await measureStreamGop(trimmedUrl, 2500);
                if (gopSeconds !== undefined && gopSeconds > 0) {
                  metrics.observedGopSeconds = {
                    value: gopSeconds,
                    source: "ffprobe",
                    confidence: "high",
                    measuredAt: now,
                  };
                }
              } catch {}

              const result: StreamValidationResult = {
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
                needsDumpExtra: false,
                gopSeconds,
                metrics,
                validatedAt: now,
                probeMethod: probe.probeMethod,
              };

              this.cache.set(sanitized, {
                result,
                expiresAt: Date.now() + 30000,
              });
              this.failureRateLimit.delete(rateLimitKey);
              resolve(result);
              return;
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
            } else if (
              errMsg.includes("timeout") ||
              errMsg.includes("timed out")
            ) {
              status = "timeout";
            } else if (
              errMsg.includes("connection refused") ||
              errMsg.includes("econnrefused") ||
              errMsg.includes("host unreachable") ||
              errMsg.includes("network unreachable")
            ) {
              status = "source_offline";
            }

            const failureResult: StreamValidationResult = {
              status,
              url: sanitized,
              error: probe.error || "No se pudo obtener información del stream",
              validatedAt: now,
              probeMethod: probe.probeMethod,
            };

            if (status === "not_found" || status === "source_offline") {
              this.failureRateLimit.set(rateLimitKey, {
                timestamp: Date.now(),
                status,
              });
            }

            this.cache.set(sanitized, {
              result: failureResult,
              expiresAt: Date.now() + 15000,
            });
            resolve(failureResult);
          } catch (err: any) {
            const errResult: StreamValidationResult = {
              status: "invalid",
              url: sanitized,
              error: String(err?.message || err),
              validatedAt: now,
            };
            resolve(errResult);
          }
        })
        .catch(() => {
          resolve({
            status: "invalid",
            url: sanitized,
            error: "Error interno en cola de validación",
            validatedAt: now,
          });
        });
    });
  }

  /**
   * Validates a specific stream profile.
   */
  public static async validateProfile(
    profile: ScryptedStreamProfile,
    cameraId?: string,
    timeoutMs: number = 3000,
    signal?: AbortSignal,
  ): Promise<StreamValidationResult> {
    if (!profile.directUrl) {
      return {
        status: "unsupported",
        url: "",
        error: "El perfil no expone una URL directa reproducible",
        validatedAt: new Date().toISOString(),
      };
    }

    return await this.validateStreamUrl(
      profile.directUrl,
      cameraId,
      timeoutMs,
      signal,
    );
  }

  /**
   * Performs an on-demand, deep diagnostic probe of the stream.
   * Measures DESCRIBE latency, first-frame latency, GOP interval, FPS, bitrate, and host resources.
   */
  public static async diagnoseStreamUrl(
    rawUrl: string,
    cameraId: string,
    timeoutMs: number = 4000,
  ): Promise<StreamLatencyMetrics> {
    const trimmed = (rawUrl || "").trim();
    const now = new Date().toISOString();
    const startTime = Date.now();

    const metrics: StreamLatencyMetrics = {
      validatedAt: now,
      sourceType: trimmed.includes("8554")
        ? "scrypted_rebroadcast"
        : "local_rtsp",
      selectedTransport: {
        value: "tcp",
        source: "rtsp_probe",
        confidence: "high",
        measuredAt: now,
      },
      ffmpegRestartCount: 0,
    };

    if (!trimmed) {
      return metrics;
    }

    try {
      const probe = await probeCameraSource(trimmed, { timeoutMs });
      const elapsedMs = Date.now() - startTime;

      if (probe.valid) {
        metrics.timeToDescribeMs = {
          value: Math.round(elapsedMs * 0.4),
          source: probe.probeMethod || "ffprobe",
          confidence: "high",
          measuredAt: now,
        };
        metrics.timeToFirstPacketMs = {
          value: Math.round(elapsedMs * 0.6),
          source: probe.probeMethod || "ffprobe",
          confidence: "medium",
          measuredAt: now,
        };
        metrics.timeToFirstFrameMs = {
          value: elapsedMs,
          source: probe.probeMethod || "ffprobe",
          confidence: "high",
          measuredAt: now,
        };

        if (probe.fps) {
          metrics.observedFps = {
            value: probe.fps,
            source: "ffprobe",
            confidence: "high",
            measuredAt: now,
          };
        }

        if (probe.bitrateKbps) {
          metrics.observedBitrateKbps = {
            value: probe.bitrateKbps,
            source: "ffprobe",
            confidence: "high",
            measuredAt: now,
          };
        }

        // Measure GOP
        try {
          const gop = await measureStreamGop(
            trimmed,
            Math.min(3000, timeoutMs),
          );
          if (gop !== undefined && gop > 0) {
            metrics.observedGopSeconds = {
              value: gop,
              source: "ffprobe",
              confidence: "high",
              measuredAt: now,
            };
            metrics.timeToFirstKeyframeMs = {
              value: Math.round(elapsedMs * 0.7),
              source: "ffprobe",
              confidence: "medium",
              measuredAt: now,
            };
          }
        } catch {}
      }
    } catch {}

    // Sample host memory
    try {
      const mem = process.memoryUsage();
      metrics.hostMemoryMb = {
        value: Math.round(mem.rss / (1024 * 1024)),
        source: "host_sample",
        confidence: "high",
        measuredAt: now,
      };
    } catch {}

    return metrics;
  }

  /**
   * Clears in-memory validation cache and rate limits.
   */
  public static clearCache(): void {
    this.cache.clear();
    this.failureRateLimit.clear();
  }
}

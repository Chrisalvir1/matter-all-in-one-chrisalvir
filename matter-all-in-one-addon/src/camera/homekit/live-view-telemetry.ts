/**
 * Sanitized, in-memory diagnostics for classic HomeKit Live View sessions.
 * This module intentionally contains no transport or streaming controls.
 */

export type LiveViewProcessingMode =
  "copy" | "normalization" | "transcode" | "fallback";

export interface VideoStreamMetadata {
  codec?: string;
  profile?: string;
  level?: string;
  width?: number;
  height?: number;
  rFrameRate?: string;
  avgFrameRate?: string;
  fps?: number;
  bitrateKbps?: number;
  pixFmt?: string;
  metadataSource?:
    "ffprobe" | "ffmpeg-progress" | "ffmpeg-header" | "effective-command";
}

export interface LiveViewSessionTelemetry {
  sessionId: string;
  videoSsrc?: number;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  state: "active" | "finished" | "failed";
  requestedVideo: {
    width?: number;
    height?: number;
    fps?: number;
    profile?: string;
    level?: string;
    maxBitrateKbps?: number;
  };
  requestedAudio?: {
    codec?: string;
    sampleRate?: number;
    maxBitrateKbps?: number;
  };
  effectiveMode: LiveViewProcessingMode;
  output?: VideoStreamMetadata;
  fallbackReason?: string;
  error?: string;
}

const MAX_TEXT_LENGTH = 400;

/** Never retain process text that could carry stream credentials or key material. */
export function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let text = value
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, "[redacted-url]")
    .replace(/(authorization)\s*:\s*[^\r\n]+/gi, "$1=[redacted]")
    .replace(
      /(token|password|passwd|secret|api[_-]?key|access[_-]?token|srtp(?:[_-][a-z]+)*[_-]?(?:key|salt|params))\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    .replace(/(?:a=crypto|inline:)[^\s]+/gi, "[redacted-srtp]")
    .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, "[redacted-value]")
    .trim();
  if (!text) return undefined;
  if (text.length > MAX_TEXT_LENGTH)
    text = `${text.slice(0, MAX_TEXT_LENGTH)}…`;
  return text;
}

function rateToFps(rate?: string): number | undefined {
  if (!rate) return undefined;
  const [numerator, denominator] = rate.split("/").map(Number);
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  )
    return undefined;
  return Math.round((numerator / denominator) * 100) / 100;
}

/** Parse only FFmpeg's safe key=value progress records. */
export function mergeFfmpegProgress(
  output: VideoStreamMetadata | undefined,
  line: string,
): VideoStreamMetadata | undefined {
  const match = /^(fps|bitrate)=([^\r\n]+)$/.exec(line.trim());
  if (!match) return output;
  const next: VideoStreamMetadata = {
    ...(output || {}),
    metadataSource: "ffmpeg-progress",
  };
  if (match[1] === "fps") {
    const fps = Number(match[2]);
    if (Number.isFinite(fps) && fps >= 0) next.fps = fps;
  } else {
    const bitrate = Number.parseFloat(match[2].replace(/\s*kbits\/s/i, ""));
    if (Number.isFinite(bitrate) && bitrate >= 0) next.bitrateKbps = bitrate;
  }
  return next;
}

/**
 * Extract only FFmpeg's emitted video-stream header fields. The raw line is
 * intentionally discarded because input/output URLs can carry credentials.
 */
export function mergeFfmpegStreamHeader(
  output: VideoStreamMetadata | undefined,
  line: string,
): VideoStreamMetadata | undefined {
  if (!/Stream #\d+:\d+(?:\[[^\]]+\])?: Video:/i.test(line)) return output;
  const video = /Video:\s*([\w.-]+)(?:\s*\(([^)]+)\))?\s*,\s*([^,\s]+)/i.exec(
    line,
  );
  const dimensions = /(\d{2,5})x(\d{2,5})/.exec(line);
  const fps = /([\d.]+)\s*fps\b/i.exec(line);
  const bitrate = /([\d.]+)\s*kb\/s\b/i.exec(line);
  if (!video && !dimensions && !fps) return output;
  const merged: VideoStreamMetadata = {
    ...(output || {}),
    codec: video?.[1]?.toLowerCase() || output?.codec,
    profile: video?.[2] || output?.profile,
    pixFmt: video?.[3] || output?.pixFmt,
    width: dimensions ? Number(dimensions[1]) : output?.width,
    height: dimensions ? Number(dimensions[2]) : output?.height,
    fps: fps ? Number(fps[1]) : output?.fps,
    bitrateKbps: bitrate ? Number(bitrate[1]) : output?.bitrateKbps,
    metadataSource: "ffmpeg-header",
  };
  return merged;
}

export function createSessionTelemetry(input: {
  sessionId: string;
  videoSsrc?: number;
  video?: {
    width?: number;
    height?: number;
    fps?: number;
    profile?: string;
    level?: string;
    maxBitrateKbps?: number;
  };
  audio?: { codec?: string; sampleRate?: number; maxBitrateKbps?: number };
  effectiveMode: LiveViewProcessingMode;
  output?: VideoStreamMetadata;
  fallbackReason?: string;
}): LiveViewSessionTelemetry {
  return {
    sessionId: input.sessionId,
    videoSsrc: input.videoSsrc,
    startedAt: new Date().toISOString(),
    state: "active",
    requestedVideo: input.video || {},
    requestedAudio: input.audio,
    effectiveMode: input.effectiveMode,
    output: input.output,
    fallbackReason: sanitizeDiagnosticText(input.fallbackReason),
  };
}

export function finishSessionTelemetry(
  session: LiveViewSessionTelemetry,
  state: "finished" | "failed",
  error?: unknown,
): LiveViewSessionTelemetry {
  const endedAt = new Date().toISOString();
  return {
    ...session,
    state,
    endedAt,
    durationMs: Math.max(
      0,
      Date.parse(endedAt) - Date.parse(session.startedAt),
    ),
    error: sanitizeDiagnosticText(error),
  };
}

/** Keep the diagnostic history bounded without retaining any stream process data. */
export function retainRecentSessions(
  sessions: readonly LiveViewSessionTelemetry[],
  session: LiveViewSessionTelemetry,
  maximum = 8,
): LiveViewSessionTelemetry[] {
  return [session, ...sessions].slice(0, Math.max(0, maximum));
}

export function sourceMetadataFromProbe(probe: {
  videoCodec?: string;
  videoProfile?: string;
  videoLevel?: string;
  width?: number;
  height?: number;
  rFrameRate?: string;
  avgFrameRate?: string;
  bitrateKbps?: number;
  pixFmt?: string;
}): VideoStreamMetadata {
  const rFrameRate = probe.rFrameRate;
  const avgFrameRate = probe.avgFrameRate;
  return {
    codec: probe.videoCodec,
    profile: probe.videoProfile,
    level: probe.videoLevel,
    width: probe.width,
    height: probe.height,
    rFrameRate,
    avgFrameRate,
    fps: rateToFps(avgFrameRate) || rateToFps(rFrameRate),
    bitrateKbps: probe.bitrateKbps,
    pixFmt: probe.pixFmt,
    metadataSource: "ffprobe",
  };
}

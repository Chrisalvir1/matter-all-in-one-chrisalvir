import { spawn, spawnSync, ChildProcess } from "child_process";
import fs from "fs";
import { SRTPCryptoSuites } from "hap-nodejs";

export interface ProbeResult {
  valid: boolean;
  videoCodec?: string; // e.g. 'h264', 'hevc', 'mjpeg'
  audioCodec?: string; // e.g. 'aac', 'opus', 'pcm_alaw', 'none'
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  bitrateKbps?: number;
  gopSeconds?: number;
  error?: string;
  probeMethod?: "ffprobe" | "ffmpeg";
}

/**
 * Sanitizes URLs to prevent credentials, access tokens, and secrets from appearing in logs.
 */
export function sanitizeUrlCredentials(url: string): string {
  if (!url || typeof url !== "string") return "";
  let sanitized = url;

  // Mask user:password in scheme://user:pass@host:port/path
  const protoMatch = sanitized.match(/^([a-zA-Z0-9_+.-]+:\/\/)/);
  if (protoMatch) {
    const proto = protoMatch[1];
    const rest = sanitized.substring(proto.length);
    const slashIdx = rest.indexOf("/");
    const questionIdx = rest.indexOf("?");
    const pathStart =
      slashIdx !== -1
        ? slashIdx
        : questionIdx !== -1
          ? questionIdx
          : rest.length;
    const authority = rest.substring(0, pathStart);
    const pathAndQuery = rest.substring(pathStart);

    const atIdx = authority.lastIndexOf("@");
    if (atIdx !== -1) {
      const userInfo = authority.substring(0, atIdx);
      const hostPort = authority.substring(atIdx + 1);
      const user = userInfo.includes(":") ? userInfo.split(":")[0] : userInfo;
      sanitized = `${proto}${user}:***@${hostPort}${pathAndQuery}`;
    }
  }

  // Mask sensitive query parameters (token, auth, secret, api_key, access_token)
  sanitized = sanitized.replace(
    /([?&](?:token|auth|secret|api_key|access_token|key)=)([^&]+)/gi,
    "$1***",
  );

  return sanitized;
}

/**
 * Resolves the FFmpeg binary path in priority order:
 * 1. process.env.FFMPEG_PATH
 * 2. /usr/bin/ffmpeg (Docker/Alpine)
 * 3. /usr/local/bin/ffmpeg
 * 4. /opt/homebrew/bin/ffmpeg (macOS Apple Silicon)
 * 5. node_modules/ffmpeg-static/ffmpeg (bundled fallback)
 * 6. ffmpeg (in system PATH)
 */
export function resolveFfmpegPath(): string | null {
  const candidates: string[] = [];

  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim()) {
    candidates.push(process.env.FFMPEG_PATH.trim());
  }

  candidates.push(
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/bin/ffmpeg",
    "./node_modules/ffmpeg-static/ffmpeg",
    "../node_modules/ffmpeg-static/ffmpeg",
    "ffmpeg",
  );

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith("/") || candidate.startsWith(".")) {
        if (fs.existsSync(candidate)) {
          const stats = fs.statSync(candidate);
          if (stats.isFile()) {
            return candidate;
          }
        }
      } else {
        // Test PATH executable
        const probe = spawnSync(candidate, ["-version"], {
          timeout: 2000,
          stdio: ["ignore", "pipe", "ignore"],
        });
        if (probe.status === 0 || (probe.stdout && probe.stdout.length > 0)) {
          return candidate;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null;
}

/**
 * Resolves the FFprobe binary path in priority order:
 * 1. process.env.FFPROBE_PATH
 * 2. /usr/bin/ffprobe (Docker/Alpine)
 * 3. /usr/local/bin/ffprobe
 * 4. /opt/homebrew/bin/ffprobe (macOS Apple Silicon)
 * 5. ffprobe (in system PATH)
 */
export function resolveFfprobePath(): string | null {
  const candidates: string[] = [];

  if (process.env.FFPROBE_PATH && process.env.FFPROBE_PATH.trim()) {
    candidates.push(process.env.FFPROBE_PATH.trim());
  }

  candidates.push(
    "/usr/bin/ffprobe",
    "/usr/local/bin/ffprobe",
    "/opt/homebrew/bin/ffprobe",
    "/bin/ffprobe",
    "ffprobe",
  );

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith("/") || candidate.startsWith(".")) {
        if (fs.existsSync(candidate)) {
          const stats = fs.statSync(candidate);
          if (stats.isFile()) {
            return candidate;
          }
        }
      } else {
        const probe = spawnSync(candidate, ["-version"], {
          timeout: 2000,
          stdio: ["ignore", "pipe", "ignore"],
        });
        if (probe.status === 0 || (probe.stdout && probe.stdout.length > 0)) {
          return candidate;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null;
}

/**
 * Returns the version string of the selected FFmpeg binary.
 */
export function getFfmpegVersion(customPath?: string): string | null {
  const ffmpegPath = customPath || resolveFfmpegPath();
  if (!ffmpegPath) return null;

  try {
    const res = spawnSync(ffmpegPath, ["-version"], {
      timeout: 3000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });

    if (res.stdout) {
      const match = res.stdout.match(/ffmpeg\s+version\s+([^\s]+)/i);
      return match ? match[1] : res.stdout.split("\n")[0].trim();
    }
  } catch {
    // Ignore error
  }

  return null;
}

/**
 * Diagnostic probe function: checks a camera stream URL using ffprobe (preferred)
 * or ffmpeg (fallback) to extract video codec, audio codec, resolution, and fps.
 */
export async function probeCameraSource(
  sourceUrl: string,
  options: {
    timeoutMs?: number;
    httpBearerToken?: string;
    customFfprobePath?: string;
    customFfmpegPath?: string;
  } = {},
): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const ffprobePath = options.customFfprobePath || resolveFfprobePath();

  if (ffprobePath) {
    try {
      const result = await probeWithFfprobe(
        ffprobePath,
        sourceUrl,
        timeoutMs,
        options.httpBearerToken,
      );
      if (result.valid) {
        return result;
      }
    } catch {
      // Fallback to ffmpeg below
    }
  }

  const ffmpegPath = options.customFfmpegPath || resolveFfmpegPath();
  if (ffmpegPath) {
    try {
      return await probeWithFfmpeg(
        ffmpegPath,
        sourceUrl,
        timeoutMs,
        options.httpBearerToken,
      );
    } catch (err) {
      return {
        valid: false,
        hasAudio: false,
        error: String(err),
      };
    }
  }

  return {
    valid: false,
    hasAudio: false,
    error: "No FFprobe or FFmpeg binary available for probing",
  };
}

function probeWithFfprobe(
  ffprobePath: string,
  sourceUrl: string,
  timeoutMs: number,
  httpBearerToken?: string,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_type,codec_name,width,height,r_frame_rate",
      "-of",
      "json",
    ];

    if (
      (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) &&
      httpBearerToken
    ) {
      args.push("-headers", `Authorization: Bearer ${httpBearerToken}\r\n`);
    }

    if (sourceUrl.startsWith("rtsp://")) {
      args.push("-rtsp_transport", "tcp");
    }

    args.push(sourceUrl);

    const child = spawn(ffprobePath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdoutData = "";
    let stderrData = "";

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({
        valid: false,
        hasAudio: false,
        error: `ffprobe timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdoutData.trim()) {
        try {
          const data = JSON.parse(stdoutData);
          const streams = Array.isArray(data.streams) ? data.streams : [];
          const videoStream = streams.find(
            (s: any) => s.codec_type === "video",
          );
          const audioStream = streams.find(
            (s: any) => s.codec_type === "audio",
          );

          if (videoStream) {
            let fps: number | undefined;
            if (videoStream.r_frame_rate) {
              const parts = videoStream.r_frame_rate.split("/");
              if (parts.length === 2 && parseInt(parts[1], 10) > 0) {
                fps = Math.round(
                  parseInt(parts[0], 10) / parseInt(parts[1], 10),
                );
              }
            }

            resolve({
              valid: true,
              videoCodec: (videoStream.codec_name || "").toLowerCase(),
              audioCodec:
                (audioStream?.codec_name || "").toLowerCase() || undefined,
              width: videoStream.width,
              height: videoStream.height,
              fps,
              hasAudio: Boolean(audioStream),
              probeMethod: "ffprobe",
            });
            return;
          }
        } catch {
          // JSON parse failed, fall through to error
        }
      }

      resolve({
        valid: false,
        hasAudio: false,
        error: stderrData || `ffprobe exited with code ${code}`,
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        valid: false,
        hasAudio: false,
        error: String(err),
      });
    });
  });
}

function probeWithFfmpeg(
  ffmpegPath: string,
  sourceUrl: string,
  timeoutMs: number,
  httpBearerToken?: string,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-analyzeduration",
      "2000000",
      "-probesize",
      "2000000",
    ];

    if (
      (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) &&
      httpBearerToken
    ) {
      args.push("-headers", `Authorization: Bearer ${httpBearerToken}\r\n`);
    }

    if (sourceUrl.startsWith("rtsp://")) {
      args.push("-rtsp_transport", "tcp");
    }

    args.push("-i", sourceUrl, "-t", "1", "-f", "null", "-");

    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderrData = "";

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve({
        valid: false,
        hasAudio: false,
        error: `ffmpeg probe timeout after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    child.on("close", () => {
      clearTimeout(timer);

      let videoCodec: string | undefined;
      let audioCodec: string | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let fps: number | undefined;

      const videoMatch = stderrData.match(/Video:\s+([a-zA-Z0-9_-]+)/i);
      if (videoMatch) {
        videoCodec = videoMatch[1].toLowerCase();
      }

      const resMatch = stderrData.match(/(\d{3,5})x(\d{3,5})/);
      if (resMatch) {
        width = parseInt(resMatch[1], 10);
        height = parseInt(resMatch[2], 10);
      }

      const fpsMatch = stderrData.match(/(\d+(?:\.\d+)?)\s+fps/i);
      if (fpsMatch) {
        fps = Math.round(parseFloat(fpsMatch[1]));
      }

      const audioMatch = stderrData.match(/Audio:\s+([a-zA-Z0-9_-]+)/i);
      if (audioMatch) {
        audioCodec = audioMatch[1].toLowerCase();
      }

      const valid = Boolean(videoCodec);
      resolve({
        valid,
        videoCodec,
        audioCodec,
        width,
        height,
        fps,
        hasAudio: Boolean(audioCodec),
        probeMethod: "ffmpeg",
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        valid: false,
        hasAudio: false,
        error: String(err),
      });
    });
  });
}

/**
 * Measures the observed Keyframe / GOP interval in seconds by analyzing a 2-3s sample of the video stream.
 * Returns undefined if keyframes cannot be observed within the sample window.
 */
export async function measureStreamGop(
  sourceUrl: string,
  timeoutMs: number = 3000,
): Promise<number | undefined> {
  const ffprobePath = resolveFfprobePath();
  if (!ffprobePath) return undefined;

  return new Promise<number | undefined>((resolve) => {
    const args = [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "frame=pkt_pts_time,key_frame",
      "-read_intervals",
      "%+3",
      "-of",
      "json",
    ];

    if (sourceUrl.startsWith("rtsp://")) {
      args.push("-rtsp_transport", "tcp");
    }
    args.push(sourceUrl);

    const child = spawn(ffprobePath, args, {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let stdoutData = "";

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve(undefined);
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdoutData.trim()) {
        try {
          const parsed = JSON.parse(stdoutData);
          const frames = Array.isArray(parsed.frames) ? parsed.frames : [];
          const keyframes = frames.filter(
            (f: any) => f.key_frame === 1 && f.pkt_pts_time !== undefined,
          );
          if (keyframes.length >= 2) {
            const t1 = parseFloat(keyframes[0].pkt_pts_time);
            const t2 = parseFloat(keyframes[1].pkt_pts_time);
            if (!isNaN(t1) && !isNaN(t2) && t2 > t1) {
              const diff = Math.round((t2 - t1) * 10) / 10;
              resolve(diff > 0 ? diff : undefined);
              return;
            }
          }
        } catch {}
      }
      resolve(undefined);
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
  });
}

export interface StreamPipelineConfig {
  sourceUrl: string;
  targetAddress: string;
  videoPort: number;
  videoSsrc: number;
  videoPayloadType: number;
  videoCryptoSuite: SRTPCryptoSuites;
  videoKeySaltBase64: string;
  strategy:
    "passthrough_h264" | "passthrough_video_only" | "transcode_required";
  fps?: number;
  bitrateKbps?: number;
  httpBearerToken?: string;
  includeAudio?: boolean;
  audioPort?: number;
  audioSsrc?: number;
  audioPayloadType?: number;
  audioKeySaltBase64?: string;
  audioCodec?: string;
  needsDumpExtra?: boolean;
  transport?: "tcp" | "udp";
}

/**
 * Builds the complete FFmpeg CLI arguments array for sending HAP RTP/SRTP packets to Apple Home.
 */
export function buildFfmpegStreamArgs(config: StreamPipelineConfig): string[] {
  const srtpSuiteStr =
    config.videoCryptoSuite === SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80
      ? "AES_CM_256_HMAC_SHA1_80"
      : "AES_CM_128_HMAC_SHA1_80";

  // Omit localrtcpport to allow FFmpeg to bind to an ephemeral local port without host-network port collisions
  const videoSrtpUrl = `srtp://${config.targetAddress}:${config.videoPort}?rtcpport=${config.videoPort}&pkt_size=1316`;

  const isPassthrough =
    config.strategy === "passthrough_h264" ||
    config.strategy === "passthrough_video_only";

  const videoPayloadArgs: string[] = ["-map", "0:v:0"];

  if (isPassthrough) {
    // Passthrough H.264 (Remux directly without transcoding CPU overhead)
    videoPayloadArgs.push("-vcodec", "copy");
    if (config.needsDumpExtra) {
      videoPayloadArgs.push("-bsf:v", "dump_extra=freq=keyframe");
    }
  } else {
    // Transcode fallback for H.265 / MJPEG / incompatible formats
    const bitrate = config.bitrateKbps || 2000;
    const fps = config.fps || 30;
    videoPayloadArgs.push(
      "-vcodec",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "baseline",
      "-level:v",
      "3.1",
      "-r",
      String(fps),
      "-g",
      String(Math.max(1, fps * 2)),
      "-keyint_min",
      String(Math.max(1, fps)),
      "-b:v",
      `${bitrate}k`,
      "-bufsize",
      `${bitrate * 2}k`,
      "-maxrate",
      `${bitrate}k`,
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
    );
  }

  const inputArgs: string[] = ["-hide_banner", "-loglevel", "warning"];

  if (
    (config.sourceUrl.startsWith("http://") ||
      config.sourceUrl.startsWith("https://")) &&
    config.httpBearerToken
  ) {
    inputArgs.push(
      "-headers",
      `Authorization: Bearer ${config.httpBearerToken}\r\n`,
    );
  }

  if (config.sourceUrl.startsWith("rtsp://")) {
    const transport = config.transport || "tcp";
    inputArgs.push("-rtsp_transport", transport);
    inputArgs.push("-fflags", "+nobuffer+genpts");
    inputArgs.push("-use_wallclock_as_timestamps", "1");
  } else {
    inputArgs.push("-fflags", "+nobuffer");
  }

  inputArgs.push("-flags", "low_delay", "-i", config.sourceUrl);

  const args: string[] = [
    ...inputArgs,
    ...videoPayloadArgs,
    "-f",
    "rtp",
    "-payload_type",
    String(config.videoPayloadType || 99),
    "-ssrc",
    String(config.videoSsrc),
    "-srtp_out_suite",
    srtpSuiteStr,
    "-srtp_out_params",
    config.videoKeySaltBase64,
    videoSrtpUrl,
  ];

  // Optional audio pipeline (using tolerant -map 0:a:0? so stream won't crash if audio track is missing)
  if (
    config.includeAudio &&
    config.audioPort &&
    config.audioKeySaltBase64 &&
    config.strategy !== "passthrough_video_only"
  ) {
    const audioSrtpUrl = `srtp://${config.targetAddress}:${config.audioPort}?rtcpport=${config.audioPort}&pkt_size=188`;

    let audioArgs: string[];
    if (config.audioCodec === "opus") {
      audioArgs = [
        "-map",
        "0:a:0?",
        "-acodec",
        "libopus",
        "-application",
        "lowdelay",
        "-ar",
        "16k",
        "-b:a",
        "24k",
        "-ac",
        "1",
      ];
    } else if (config.audioCodec === "aac") {
      audioArgs = ["-map", "0:a:0?", "-acodec", "copy"];
    } else {
      audioArgs = [
        "-map",
        "0:a:0?",
        "-acodec",
        "aac",
        "-ar",
        "16k",
        "-b:a",
        "32k",
        "-ac",
        "1",
      ];
    }

    args.push(
      ...audioArgs,
      "-f",
      "rtp",
      "-payload_type",
      String(config.audioPayloadType || 110),
      "-ssrc",
      String(config.audioSsrc || 2),
      "-srtp_out_suite",
      srtpSuiteStr,
      "-srtp_out_params",
      config.audioKeySaltBase64,
      audioSrtpUrl,
    );
  }

  return args;
}

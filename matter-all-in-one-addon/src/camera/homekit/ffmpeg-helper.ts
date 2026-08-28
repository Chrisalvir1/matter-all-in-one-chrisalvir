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
 * 2. /usr/bin/ffmpeg
 * 3. /usr/local/bin/ffmpeg
 * 4. ffmpeg (in system PATH)
 */
export function resolveFfmpegPath(): string | null {
  const candidates: string[] = [];

  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim()) {
    candidates.push(process.env.FFMPEG_PATH.trim());
  }

  candidates.push("/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg");

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith("/")) {
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
 * 2. /usr/bin/ffprobe
 * 3. /usr/local/bin/ffprobe
 * 4. ffprobe (in system PATH)
 */
export function resolveFfprobePath(): string | null {
  const candidates: string[] = [];

  if (process.env.FFPROBE_PATH && process.env.FFPROBE_PATH.trim()) {
    candidates.push(process.env.FFPROBE_PATH.trim());
  }

  candidates.push("/usr/bin/ffprobe", "/usr/local/bin/ffprobe", "ffprobe");

  for (const candidate of candidates) {
    try {
      if (candidate.startsWith("/")) {
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
    customFfprobePath?: string;
    customFfmpegPath?: string;
  } = {},
): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? 4000;
  const ffprobePath = options.customFfprobePath || resolveFfprobePath();

  if (ffprobePath) {
    try {
      const result = await probeWithFfprobe(ffprobePath, sourceUrl, timeoutMs);
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
      return await probeWithFfmpeg(ffmpegPath, sourceUrl, timeoutMs);
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
    error: "FFmpeg/FFprobe binary not found on system",
  };
}

function probeWithFfprobe(
  ffprobePath: string,
  sourceUrl: string,
  timeoutMs: number,
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const args = [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_streams",
      "-show_format",
      "-analyzeduration",
      "2000000",
      "-probesize",
      "2000000",
      sourceUrl,
    ];

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
      if (code === 0 && stdoutData) {
        try {
          const json = JSON.parse(stdoutData);
          const streams = json.streams || [];
          const videoStream = streams.find(
            (s: any) => s.codec_type === "video",
          );
          const audioStream = streams.find(
            (s: any) => s.codec_type === "audio",
          );

          let fps: number | undefined;
          if (videoStream?.r_frame_rate) {
            const parts = String(videoStream.r_frame_rate).split("/");
            if (parts.length === 2 && Number(parts[1]) > 0) {
              fps = Math.round(Number(parts[0]) / Number(parts[1]));
            } else {
              fps = Number(videoStream.r_frame_rate) || undefined;
            }
          }

          resolve({
            valid: Boolean(videoStream),
            videoCodec: videoStream?.codec_name?.toLowerCase(),
            audioCodec: audioStream?.codec_name?.toLowerCase(),
            width: videoStream?.width ? Number(videoStream.width) : undefined,
            height: videoStream?.height
              ? Number(videoStream.height)
              : undefined,
            fps,
            hasAudio: Boolean(audioStream),
            probeMethod: "ffprobe",
          });
          return;
        } catch (parseErr) {
          resolve({
            valid: false,
            hasAudio: false,
            error: `Failed to parse ffprobe json: ${parseErr}`,
          });
          return;
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
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const args = [
      "-hide_banner",
      "-analyzeduration",
      "2000000",
      "-probesize",
      "2000000",
      "-i",
      sourceUrl,
      "-t",
      "1",
      "-f",
      "null",
      "-",
    ];

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
  includeAudio?: boolean;
  audioPort?: number;
  audioSsrc?: number;
  audioPayloadType?: number;
  audioKeySaltBase64?: string;
  audioCodec?: string;
}

/**
 * Builds the complete FFmpeg CLI arguments array for sending HAP RTP/SRTP packets to Apple Home.
 */
export function buildFfmpegStreamArgs(config: StreamPipelineConfig): string[] {
  const srtpSuiteStr =
    config.videoCryptoSuite === SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80
      ? "AES_CM_256_HMAC_SHA1_80"
      : "AES_CM_128_HMAC_SHA1_80";

  const videoSrtpUrl = `srtp://${config.targetAddress}:${config.videoPort}?rtcpport=${config.videoPort}&localrtcpport=${config.videoPort}&pkt_size=1316`;

  const isPassthrough =
    config.strategy === "passthrough_h264" ||
    config.strategy === "passthrough_video_only";

  const videoPayloadArgs: string[] = ["-map", "0:v:0"];

  if (isPassthrough) {
    // Passthrough H.264 (Remux directly without transcoding CPU overhead)
    videoPayloadArgs.push("-vcodec", "copy");
  } else {
    // Transcode fallback for H.265 / MJPEG / incompatible formats
    const bitrate = config.bitrateKbps || 2000;
    const fps = config.fps || 30;
    videoPayloadArgs.push(
      "-vcodec",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-r",
      String(fps),
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

  const args: string[] = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "+nobuffer",
    "-flags",
    "low_delay",
    "-i",
    config.sourceUrl,
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

  // Optional audio pipeline
  if (
    config.includeAudio &&
    config.audioPort &&
    config.audioKeySaltBase64 &&
    config.strategy !== "passthrough_video_only"
  ) {
    const audioSrtpUrl = `srtp://${config.targetAddress}:${config.audioPort}?rtcpport=${config.audioPort}&localrtcpport=${config.audioPort}&pkt_size=188`;

    const audioArgs =
      config.audioCodec === "aac"
        ? ["-map", "0:a:0", "-acodec", "copy"]
        : [
            "-map",
            "0:a:0",
            "-acodec",
            "aac",
            "-ar",
            "16k",
            "-b:a",
            "32k",
            "-ac",
            "1",
          ];

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

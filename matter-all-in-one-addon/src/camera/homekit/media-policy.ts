import { spawnSync } from "node:child_process";
import type { CameraCapabilitiesInfo } from "../camera-types.js";
import { resolveFfmpegPath, supportsFdkAac } from "./ffmpeg-helper.js";
export type H264VideoEncoder = "h264_videotoolbox" | "libx264";
const encoderCache = new Map<string, H264VideoEncoder | undefined>();
export function verifiedH264Encoder(
  binary = resolveFfmpegPath(),
): H264VideoEncoder | undefined {
  if (!binary) return;
  if (encoderCache.has(binary)) return encoderCache.get(binary);
  for (const encoder of ["h264_videotoolbox", "libx264"] as const) {
    try {
      const result = spawnSync(
        binary,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          "testsrc2=size=64x64:rate=1",
          "-frames:v",
          "1",
          "-vf",
          "format=yuv420p",
          "-c:v",
          encoder,
          "-f",
          "null",
          "-",
        ],
        { timeout: 3000, stdio: "ignore" },
      );
      if (result.status === 0) {
        encoderCache.set(binary, encoder);
        return encoder;
      }
    } catch {}
  }
  encoderCache.set(binary, undefined);
}
export function h264VideoPlan(
  c: CameraCapabilitiesInfo,
  encoder?: H264VideoEncoder,
  forceNormalization = false,
) {
  if (c.videoCodec !== "h264")
    throw new Error("Classic HAP requires an H264 source");
  const { width, height } =
    c.measuredVideo?.width && c.measuredVideo.height
      ? c.measuredVideo
      : c.resolution;
  if (!width || !height || width <= 0 || height <= 0)
    throw new Error("Source dimensions are unknown");
  if (width <= 1920 && height <= 1080 && !forceNormalization)
    return { mode: "copy" as const, width, height };
  if (!encoder)
    throw new Error(
      "H264 normalization requires a functionally verified encoder",
    );
  const ratio = Math.min(1, 1920 / width, 1080 / height);
  return {
    mode: "normalization" as const,
    width: Math.floor((width * ratio) / 2) * 2,
    height: Math.floor((height * ratio) / 2) * 2,
    encoder,
  };
}
export type H264AudioPlan =
  | {
      codec: "opus" | "aac_eld";
      sampleRate: number;
      channels: 1;
      packetTime: 20;
      copy: boolean;
    }
  | { codec: "unavailable"; reason: string };
export function h264AudioPlan(
  c: CameraCapabilitiesInfo,
  eldAvailable = supportsFdkAac(),
): H264AudioPlan {
  if (!c.hasAudio || c.audioCodec === "none")
    return { codec: "unavailable", reason: "Source has no audio" };
  const codec = String(c.audioCodec || "unknown").toLowerCase();
  if (
    codec === "opus" &&
    ["PROBED", "OBSERVED", "CACHED"].includes(c.audioProvenance || "") &&
    c.audioSampleRate === 48000 &&
    c.audioChannels === 1
  )
    return {
      codec: "opus",
      sampleRate: 48000,
      channels: 1,
      packetTime: 20,
      copy: true,
    };
  if (
    ![
      "opus",
      "aac",
      "aac_lc",
      "aac_eld",
      "pcma",
      "pcmu",
      "pcm",
      "pcm_alaw",
      "pcm_mulaw",
      "pcm_s16le",
      "pcm_s16be",
      "g711",
      "mp3",
    ].includes(codec)
  )
    return {
      codec: "unavailable",
      reason: "Source audio has not been validated",
    };
  if (!eldAvailable)
    return { codec: "unavailable", reason: "AAC-ELD encoder unavailable" };
  return {
    codec: "aac_eld",
    sampleRate: 24000,
    channels: 1,
    packetTime: 20,
    copy: false,
  };
}

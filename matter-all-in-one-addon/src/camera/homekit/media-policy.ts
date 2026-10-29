import * as tlv from "@homebridge/hap-nodejs/dist/lib/util/tlv.js";
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
  requested?: { width: number; height: number; fps?: number },
) {
  if (c.videoCodec !== "h264")
    throw new Error("Classic HAP requires an H264 source");
  const { width, height } =
    c.measuredVideo?.width && c.measuredVideo.height
      ? c.measuredVideo
      : c.resolution;
  if (!width || !height || width <= 0 || height <= 0)
    throw new Error("Source dimensions are unknown");
  const target =
    requested && requested.width > 0 && requested.height > 0
      ? {
          width: Math.min(1920, requested.width),
          height: Math.min(1080, requested.height),
        }
      : {
          width:
            Math.floor((width * Math.min(1, 1920 / width, 1080 / height)) / 2) *
            2,
          height:
            Math.floor(
              (height * Math.min(1, 1920 / width, 1080 / height)) / 2,
            ) * 2,
        };
  const sourceFps = c.measuredVideo?.fps || c.maxFps;
  const fps =
    requested?.fps && requested.fps > 0
      ? Math.min(requested.fps, sourceFps)
      : sourceFps;
  const rateChange = Boolean(
    requested?.fps && sourceFps && requested.fps < sourceFps,
  );
  if (
    width === target.width &&
    height === target.height &&
    !forceNormalization &&
    !rateChange
  )
    return { mode: "copy" as const, width, height };
  if (!encoder)
    throw new Error(
      "H264 normalization requires a functionally verified encoder",
    );
  return {
    mode: "normalization" as const,
    ...target,
    ...(requested ? { fps } : {}),
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

/** Output modes supported by classic HAP; source measurements remain separate. */
export function h264SupportedResolutions(
  c: CameraCapabilitiesInfo,
  canNormalize: boolean,
): [number, number, number][] {
  const width = c.measuredVideo?.width || c.resolution.width;
  const height = c.measuredVideo?.height || c.resolution.height;
  const rate = c.measuredVideo?.fps || c.maxFps;
  if (![width, height, rate].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("Camera geometry or frame rate is unknown");
  const scale = Math.min(1, 1920 / width, 1080 / height);
  if (scale < 1 && !canNormalize)
    throw new Error("Classic HAP normalization encoder unavailable");
  const native: [number, number] = [
    Math.floor((width * scale) / 2) * 2,
    Math.floor((height * scale) / 2) * 2,
  ];
  const ceiling = Math.min(30, Math.max(1, Math.round(rate)));
  // Include the actual rate (e.g. 10/24), plus standard rates up to that ceiling.
  const rates = canNormalize
    ? [...new Set([ceiling, ...[30, 25, 20, 15].filter((n) => n <= ceiling)])]
    : [ceiling];
  const sizes: [number, number][] = [native];
  if (canNormalize)
    sizes.push(
      ...(
        [
          [1920, 1080],
          [1280, 720],
          [640, 360],
          [480, 270],
          [320, 180],
          [320, 240],
        ] as [number, number][]
      ).filter(([w, h]) => w <= native[0] && h <= native[1]),
    );
  const seen = new Set<string>();
  return sizes
    .flatMap(([w, h]) =>
      rates.map((fps) => [w, h, fps] as [number, number, number]),
    )
    .filter((mode) => {
      const key = mode.join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** HAP R2 configuration; tested against the real classic controller. */
export function encodeH264SupportedVideo(
  resolutions: [number, number, number][],
): string {
  const parameters = tlv.encode(1, [0, 1, 2], 2, [0, 1, 2], 3, 0);
  const attributes = resolutions.map(([w, h, fps]) => {
    const width = Buffer.alloc(2),
      height = Buffer.alloc(2);
    width.writeUInt16LE(w);
    height.writeUInt16LE(h);
    return tlv.encode(1, width, 2, height, 3, fps);
  });
  return tlv
    .encode(1, tlv.encode(1, 0, 2, parameters, 3, attributes))
    .toString("base64");
}

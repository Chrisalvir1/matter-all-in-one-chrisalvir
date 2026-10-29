import { createHash } from "node:crypto";
import type {
  CameraCapabilitiesInfo,
  HomeKitCameraStorageRecord,
  ResolvedStreamSource,
} from "./camera-types.js";
import { CameraSourceResolver } from "./camera-source-resolver.js";
import {
  probeCameraSource,
  type ProbeResult,
} from "./homekit/ffmpeg-helper.js";
export type CapabilityProvenance =
  "DECLARED" | "PROBED" | "OBSERVED" | "CACHED" | "INFERRED" | "UNKNOWN";
export type CameraProvider =
  "home_assistant" | "camera_ui" | "scrypted" | "omni_tuya" | "rtsp";
export interface CameraSourceDescription {
  sourceType: CameraProvider;
  sourceId: string;
  renewableUrl: boolean;
  videoCodec: string;
  audioCodec: string;
  width: number;
  height: number;
  fps: number;
  videoProfile?: string;
  videoLevel?: string;
  pixelFormat?: string;
  gop?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  snapshotCapability: boolean;
  motionCapability: boolean;
  talkbackCapability: false;
  passthroughCapability: boolean;
  requiresTranscoding: boolean;
  availability: "available" | "unavailable" | "unknown";
  lastProbe?: number;
  capabilityProvenance: Partial<
    Record<"video" | "audio", CapabilityProvenance>
  >;
}
/** Cache capabilities only. Signed URLs and authentication never enter entries. */
export class CameraCapabilityCache {
  private entries = new Map<string, { at: number; value: ProbeResult }>();
  private generations = new Map<string, number>();
  private pending = new Map<string, Promise<ProbeResult>>();
  constructor(
    readonly ttlMs = 600000,
    private readonly now = Date.now,
  ) {}
  get(key: string) {
    const e = this.entries.get(key);
    if (!e || this.now() - e.at >= this.ttlMs) {
      this.entries.delete(key);
      return;
    }
    return { at: e.at, value: { ...e.value } };
  }
  invalidate(key: string) {
    this.entries.delete(key);
    this.pending.delete(key);
    this.generations.set(key, (this.generations.get(key) || 0) + 1);
  }
  async discover(key: string, probe: () => Promise<ProbeResult>) {
    const cached = this.get(key);
    if (cached) return cached;
    let pending = this.pending.get(key);
    if (!pending) {
      const generation = this.generations.get(key) || 0;
      pending = Promise.resolve().then(async () => {
        try {
          const result = await probe();
          if (!result.valid) throw new Error("Camera capability probe failed");
          const value: ProbeResult = { valid: true, hasAudio: result.hasAudio };
          const fields = [
            "videoCodec",
            "audioCodec",
            "width",
            "height",
            "fps",
            "bitrateKbps",
            "gopSeconds",
            "probeMethod",
            "selectedTransport",
            "videoProfile",
            "videoLevel",
            "rFrameRate",
            "avgFrameRate",
            "pixFmt",
            "audioSampleRate",
            "audioChannels",
          ] as const;
          for (const field of fields)
            if (result[field] !== undefined)
              (value as any)[field] = result[field];
          if (this.entries.size >= 128)
            this.entries.delete(this.entries.keys().next().value!);
          if ((this.generations.get(key) || 0) === generation)
            this.entries.set(key, { at: this.now(), value });
          return value;
        } catch {
          this.entries.delete(key);
          throw new Error("Camera capability probe failed");
        } finally {
          if (this.pending.get(key) === pending) this.pending.delete(key);
        }
      });
      this.pending.set(key, pending);
    }
    return { at: this.now(), value: { ...(await pending) } };
  }
}
const readerLeases = new WeakMap<object, Map<string, object>>();
const fallbackLeaseScope = {};
export const cameraCapabilityCache = new CameraCapabilityCache();
/** Provider adapters resolve sessions; every provider enters the same HAP engine. */
export class CameraSourceAdapter {
  constructor(
    readonly platform: any,
    readonly sourceId: string,
    public source: ResolvedStreamSource,
    readonly capabilities: CameraCapabilitiesInfo,
    readonly record?: HomeKitCameraStorageRecord,
    readonly cache = cameraCapabilityCache,
  ) {}
  get provider(): CameraProvider {
    const m = this.source.metadata || {};
    return m.isOmniTuyaDirect ||
      this.platform?.ha?.hassEntities?.get(this.sourceId)?.platform ===
        "omni_tuya_local" ||
      (!!this.record?.sourceCameraEntityId &&
        /tuya/i.test(
          `${this.record.manufacturer || ""} ${this.record.model || ""}`,
        ))
      ? "omni_tuya"
      : m.isCameraUi
        ? "camera_ui"
        : m.isScrypted
          ? "scrypted"
          : m.sourceCameraEntityId ||
              (this.sourceId.startsWith("camera.") &&
                this.platform?.ha?.hassStates?.has(this.sourceId))
            ? "home_assistant"
            : "rtsp";
  }
  get renewableUrl() {
    return (
      this.provider === "omni_tuya" ||
      this.source.sourceType === "hls" ||
      this.source.sourceType === "ha_proxy"
    );
  }
  get cacheKey() {
    return createHash("sha256")
      .update(
        `${this.sourceId}:${this.source.sourceType}:${this.renewableUrl ? this.source.metadata?.sourceCameraEntityId || this.sourceId : this.source.url || ""}`,
      )
      .digest("hex");
  }
  describe(): CameraSourceDescription {
    const c = this.capabilities,
      m = this.source.metadata || {},
      cached = this.cache.get(this.cacheKey);
    const state = this.platform?.ha?.hassStates?.get(
      this.source.metadata?.sourceCameraEntityId || this.sourceId,
    )?.state;
    return {
      sourceType: this.provider,
      sourceId: this.sourceId,
      renewableUrl: this.renewableUrl,
      videoCodec: c.videoCodec,
      audioCodec: c.audioCodec,
      width: c.resolution.width,
      height: c.resolution.height,
      fps: c.maxFps,
      videoProfile: c.measuredVideo?.profile || c.videoProfile,
      videoLevel: c.measuredVideo?.level,
      pixelFormat: c.measuredVideo?.pixFmt,
      gop: cached?.value.gopSeconds,
      audioSampleRate: c.audioSampleRate,
      audioChannels: c.audioChannels,
      snapshotCapability: !!c.snapshotSupported,
      motionCapability: !!(
        this.record?.motionEntityId ||
        m.hasCameraMotion ||
        m.isOmniTuyaDirect
      ),
      talkbackCapability: false,
      passthroughCapability: this.source.supportsPassthrough,
      requiresTranscoding: c.requiresTranscoding,
      availability: ["unavailable", "unknown", "off"].includes(state)
        ? "unavailable"
        : cached
          ? "available"
          : "unknown",
      lastProbe: cached?.at,
      capabilityProvenance: {
        video: cached
          ? "CACHED"
          : c.measuredVideo?.metadataSource === "ffprobe"
            ? "PROBED"
            : "DECLARED",
        audio: cached ? "CACHED" : c.audioProvenance || "UNKNOWN",
      },
    };
  }
  /** One active input owns a camera recording timeline. Prepared HAP slots consume none. */
  acquireReader(owner: object): () => void {
    const scope =
      this.platform && typeof this.platform === "object"
        ? this.platform
        : fallbackLeaseScope;
    let leases = readerLeases.get(scope);
    if (!leases) {
      leases = new Map();
      readerLeases.set(scope, leases);
    }
    const id =
      this.source.metadata?.sourceCameraEntityId ||
      this.record?.sourceCameraEntityId ||
      this.sourceId;
    const previous = leases.get(id);
    if (previous && previous !== owner)
      throw new Error("Camera input is already in use");
    leases.set(id, owner);
    return () => {
      if (leases!.get(id) === owner) leases!.delete(id);
    };
  }
  /** Authentication stays in transient process arguments and is scoped to the source origin. */
  inputArguments(source = this.source): string[] {
    if (!source.url || !/^https?:\/\//i.test(source.url)) return [];
    const scryptedToken = source.metadata?.scryptedToken;
    if (typeof scryptedToken === "string" && scryptedToken.trim())
      return [
        "-headers",
        `Authorization: ${scryptedToken.startsWith("Bearer ") ? scryptedToken : `Bearer ${scryptedToken}`}\r\n`,
      ];
    const base = this.platform?.ha?.getHttpBaseUrl?.();
    let sameOrigin = false;
    try {
      sameOrigin =
        !!base && new URL(source.url).origin === new URL(base).origin;
    } catch {}
    if (!sameOrigin) return [];
    const token =
      this.platform?.ha?.getAccessToken?.() || this.platform?.ha?.wsAccessToken;
    return token ? ["-headers", `Authorization: Bearer ${token}\r\n`] : [];
  }

  async resolveSession(): Promise<ResolvedStreamSource> {
    const id =
      this.source.metadata?.sourceCameraEntityId ||
      this.record?.sourceCameraEntityId ||
      this.sourceId;
    const state = this.platform?.ha?.hassStates?.get(id);
    if (this.provider === "omni_tuya") {
      const fresh = await CameraSourceResolver.resolveOmniTuyaRecordingSource(
        this.platform,
        id,
        state,
        false,
      );
      if (!fresh.url || fresh.sourceType === "ha_proxy")
        throw new Error("Renewable camera source unavailable");
      this.source = {
        ...fresh,
        metadata: {
          ...this.source.metadata,
          isOmniTuyaDirect: false,
          ...fresh.metadata,
        },
      };
      return this.source;
    }
    if ((!this.source.url || this.renewableUrl) && state) {
      this.source = await CameraSourceResolver.resolve(
        this.platform,
        id,
        state,
      );
    }
    if (!this.source.url) throw new Error("Camera source unavailable");
    return this.source;
  }
  async discover(url = this.source.url) {
    if (!url) throw new Error("Camera source unavailable");
    const cached = !!this.cache.get(this.cacheKey);
    const measurement = await this.cache.discover(this.cacheKey, () =>
      probeCameraSource(url, {
        timeoutMs: 4000,
        transport: "tcp",
        allowFallback: false,
        httpBearerToken: this.source.metadata?.isHaProxyStream
          ? this.platform?.ha?.getAccessToken?.()
          : undefined,
      }),
    );
    const p = measurement.value,
      c = this.capabilities;
    c.videoCodec = (
      p.videoCodec === "h265" ? "hevc" : p.videoCodec
    ) as CameraCapabilitiesInfo["videoCodec"];
    c.hasAudio = p.hasAudio;
    c.audioCodec = (p.audioCodec ||
      "none") as CameraCapabilitiesInfo["audioCodec"];
    c.audioSampleRate = p.audioSampleRate;
    c.audioChannels = p.audioChannels;
    c.audioProvenance = cached ? "CACHED" : "PROBED";
    if (p.width && p.height)
      c.resolution = { width: p.width, height: p.height };
    if (p.fps) c.maxFps = p.fps;
    c.measuredVideo = {
      codec: p.videoCodec,
      profile: p.videoProfile,
      level: p.videoLevel,
      width: p.width,
      height: p.height,
      fps: p.fps,
      pixFmt: p.pixFmt,
      rFrameRate: p.rFrameRate,
      avgFrameRate: p.avgFrameRate,
      metadataSource: "ffprobe",
    };
    return { probe: p, performed: !cached, at: measurement.at };
  }
  invalidate() {
    this.cache.invalidate(this.cacheKey);
  }
}

import { describe, expect, it, vi } from "vitest";
import {
  CameraCapabilityCache,
  CameraSourceAdapter,
} from "../src/camera/source-adapter.js";
import {
  h264AudioPlan,
  h264VideoPlan,
} from "../src/camera/homekit/media-policy.js";
import { HomeKitCameraStreamingDelegate } from "../src/camera/homekit/homekit-camera-stream.delegate.js";
import {
  AudioStreamingCodecType,
  StreamRequestTypes,
} from "@homebridge/hap-nodejs";
const capabilities: any = {
  hasLiveStream: true,
  streamSourceType: "rtsp",
  videoCodec: "h264",
  hasAudio: true,
  audioCodec: "aac_lc",
  resolution: { width: 1920, height: 1080 },
  maxFps: 15,
  strategy: "passthrough_h264",
  requiresTranscoding: false,
};
const source: any = {
  sourceType: "rtsp",
  url: "rtsp://invalid.example/source",
  supportsPassthrough: true,
  requiresBridge: false,
};
describe("codec policy is independent of source model", () => {
  it("produces the same H264 pipeline for identical capabilities with different model names", () => {
    const args = ["C120", "C402", "Wyze", "EZVIZ", "Generic"].map((model) =>
      new HomeKitCameraStreamingDelegate(
        {},
        "camera.fixture",
        { ...capabilities },
        source,
        { model } as any,
      ).buildStreamArgs(
        {
          sessionId: "fixture",
          targetAddress: "127.0.0.1",
          videoPort: 5000,
          localVideoPort: 5001,
          videoCryptoSuite: 0,
          videoKeySalt: Buffer.alloc(30),
          videoSsrc: 123,
        },
        {
          type: StreamRequestTypes.START,
          sessionID: "fixture",
          video: { width: 1920, height: 1080, fps: 15, pt: 99, mtu: 1200 },
        } as any,
      ),
    );
    for (const actual of args) expect(actual).toEqual(args[0]);
  });
});
describe("common camera source capabilities", () => {
  it.each(["home_assistant", "camera_ui", "scrypted", "omni_tuya", "rtsp"])(
    "describes %s without exposing URL or authentication",
    (provider) => {
      const m =
        provider === "camera_ui"
          ? { isCameraUi: true }
          : provider === "scrypted"
            ? { isScrypted: true }
            : provider === "omni_tuya"
              ? { isOmniTuyaDirect: true }
              : provider === "home_assistant"
                ? { sourceCameraEntityId: "camera.test" }
                : {};
      const adapter = new CameraSourceAdapter(
        {},
        "test",
        { ...source, metadata: m },
        capabilities,
      );
      expect(adapter.describe().sourceType).toBe(provider);
      expect(JSON.stringify(adapter.describe())).not.toContain("rtsp://");
      expect(adapter.describe().talkbackCapability).toBe(false);
    },
  );
  it("deduplicates discovery, applies TTL and invalidates failures without caching error credentials", async () => {
    let now = 0;
    const cache = new CameraCapabilityCache(100, () => now);
    const probe = vi.fn().mockResolvedValue({
      valid: true,
      videoCodec: "h264",
      hasAudio: false,
      error: "rtsp://user:secret@host?token=secret",
    });
    const [a, b] = await Promise.all([
      cache.discover("source", probe),
      cache.discover("source", probe),
    ]);
    expect(probe).toHaveBeenCalledTimes(1);
    expect(a.value).toEqual(b.value);
    expect(JSON.stringify(cache.get("source"))).not.toContain("secret");
    now = 101;
    expect(cache.get("source")).toBeUndefined();
    await expect(
      cache.discover("source", async () => {
        throw new Error("secret URL");
      }),
    ).rejects.toThrow("Camera capability probe failed");
    expect(cache.get("source")).toBeUndefined();
    await cache.discover("source", probe);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("does not resurrect a capability result invalidated during discovery", async () => {
    const cache = new CameraCapabilityCache();
    let finish!: (p: any) => void;
    const pending = cache.discover(
      "camera",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    cache.invalidate("camera");
    finish({ valid: true, hasAudio: false });
    await pending;
    expect(cache.get("camera")).toBeUndefined();
  });
  it("claims a single camera reader across adapters and releases idempotently", () => {
    const platform = {},
      a = new CameraSourceAdapter(platform, "camera.one", source, capabilities),
      b = new CameraSourceAdapter(platform, "camera.one", source, capabilities);
    const release = a.acquireReader({});
    expect(() => b.acquireReader({})).toThrow("already in use");
    release();
    release();
    const next = b.acquireReader({});
    next();
  });
  it("scopes transient HTTP authentication to HA origin and explicit Scrypted credentials", () => {
    const platform = {
      ha: {
        getHttpBaseUrl: () => "http://ha.example:8123",
        getAccessToken: () => "synthetic-ha-secret",
      },
    };
    const a = new CameraSourceAdapter(
      platform,
      "camera.fixture",
      { ...source, url: "http://ha.example:8123/api/hls" },
      capabilities,
    );
    expect(a.inputArguments()).toEqual([
      "-headers",
      "Authorization: Bearer synthetic-ha-secret\r\n",
    ]);
    expect(
      a.inputArguments({ ...source, url: "https://other.example/stream" }),
    ).toEqual([]);
    expect(a.inputArguments(source)).toEqual([]);
    expect(
      a.inputArguments({
        ...source,
        url: "https://scrypted.example/stream",
        metadata: { scryptedToken: "synthetic-scrypted" },
      }),
    ).toEqual(["-headers", "Authorization: Bearer synthetic-scrypted\r\n"]);
    expect(JSON.stringify(a.describe())).not.toContain("synthetic-ha-secret");
  });
  it("renews Omni sessions separately and does not persist signed URLs in capability entries", async () => {
    const renew = vi
      .fn()
      .mockResolvedValueOnce("rtsp://host/live?token=one")
      .mockResolvedValueOnce("rtsp://host/live?token=two");
    const adapter = new CameraSourceAdapter(
      { ha: { requestOmniTuyaCameraStream: renew } },
      "camera.test",
      { ...source, metadata: { isOmniTuyaDirect: true } },
      capabilities,
    );
    const first = (await adapter.resolveSession()).url,
      second = (await adapter.resolveSession()).url;
    expect(first).not.toBe(second);
    expect(renew).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(adapter.describe())).not.toContain("token=");
  });
  it("changes cache identity on a permanent source change", () => {
    const adapter = new CameraSourceAdapter({}, "id", source, capabilities);
    const old = adapter.cacheKey;
    adapter.source = { ...source, url: "rtsp://other/source" };
    expect(adapter.cacheKey).not.toBe(old);
  });
});
describe("classic H264 media policy", () => {
  it.each(["pcm_alaw", "pcma", "aac", "aac_lc", "pcm", "pcm_s16le"])(
    "%s uses AAC-ELD, never generic Opus",
    (audioCodec) => {
      expect(h264AudioPlan({ ...capabilities, audioCodec }, true)).toEqual({
        codec: "aac_eld",
        sampleRate: 24000,
        channels: 1,
        packetTime: 20,
        copy: false,
      });
    },
  );
  it("uses Opus only for a measured compatible native stream", () => {
    const native = {
      ...capabilities,
      audioCodec: "opus",
      audioSampleRate: 48000,
      audioChannels: 1,
      audioProvenance: "PROBED",
    };
    expect(h264AudioPlan(native, false).codec).toBe("opus");
    expect(
      h264AudioPlan({ ...native, audioProvenance: "DECLARED" }, false).codec,
    ).toBe("unavailable");
    expect(
      h264AudioPlan({ ...native, audioSampleRate: 8000 }, false).codec,
    ).toBe("unavailable");
  });
  it("does not invent audio or fall back to Opus when AAC-ELD is unavailable", () => {
    expect(
      h264AudioPlan({ ...capabilities, audioCodec: "unknown" }, true).codec,
    ).toBe("unavailable");
    expect(h264AudioPlan(capabilities, false).codec).toBe("unavailable");
    expect(
      h264AudioPlan({ ...capabilities, hasAudio: false }, true).codec,
    ).toBe("unavailable");
  });
  it("copies compatible H264 and normalizes by geometry with a verified encoder", () => {
    expect(h264VideoPlan(capabilities)).toEqual({
      mode: "copy",
      width: 1920,
      height: 1080,
    });
    expect(() =>
      h264VideoPlan({
        ...capabilities,
        resolution: { width: 2560, height: 1440 },
      }),
    ).toThrow("verified encoder");
    expect(
      h264VideoPlan(
        { ...capabilities, resolution: { width: 2560, height: 1440 } },
        "libx264",
      ),
    ).toEqual({
      mode: "normalization",
      width: 1920,
      height: 1080,
      encoder: "libx264",
    });
    expect(() =>
      h264VideoPlan({ ...capabilities, videoCodec: "hevc" }),
    ).toThrow("Classic HAP");
  });
  it("does not restart on a smaller reconfigure request", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      {},
      "camera.test",
      capabilities,
      source,
    );
    const stop = vi.spyOn(delegate as any, "stopStream"),
      done = vi.fn();
    delegate.handleStreamRequest(
      {
        sessionID: "existing",
        type: StreamRequestTypes.RECONFIGURE,
        video: { width: 1280, height: 720, fps: 15 },
      } as any,
      done,
    );
    expect(done).toHaveBeenCalledOnce();
    expect(stop).not.toHaveBeenCalled();
  });
  it("refuses a stale Opus negotiation for an AAC camera in the real delegate", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      {},
      "camera.test",
      capabilities,
      source,
    );
    expect(() =>
      delegate.buildStreamArgs(
        {
          sessionId: "test",
          targetAddress: "127.0.0.1",
          videoPort: 1234,
          localVideoPort: 1235,
          videoSsrc: 1,
          videoKeySalt: Buffer.alloc(30),
          videoCryptoSuite: 0,
          audioPort: 1236,
          localAudioPort: 1237,
          audioSsrc: 2,
          audioKeySalt: Buffer.alloc(30),
        } as any,
        {
          sessionID: "test",
          type: StreamRequestTypes.START,
          video: { width: 1920, height: 1080, fps: 15, pt: 99 },
          audio: { codec: AudioStreamingCodecType.OPUS, pt: 110 },
        } as any,
      ),
    ).toThrow("validated native Opus");
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("../src/camera/homekit/ffmpeg-helper.js", () => ({
  resolveFfmpegPath: () => "/usr/bin/ffmpeg",
  sanitizeUrlCredentials: (url: string) => url,
  getFfmpegVersion: () => "6.1.1",
}));

import {
  HomeKitCameraRecordingDelegate,
  resolveCameraSourceFps,
} from "../src/camera/homekit/homekit-camera-recording.delegate.js";
import {
  AudioRecordingCodecType,
  AudioBitrate,
  AudioRecordingSamplerate,
  MediaContainerType,
  VideoCodecType,
  H264Profile,
  H264Level,
  CameraRecordingConfiguration,
  HDSProtocolSpecificErrorReason,
} from "@homebridge/hap-nodejs";

const mockPlatform = {
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  saveHomeKitCameraRecords: vi.fn(),
};

function createMockRecord() {
  return {
    entityId: "camera.driveway",
    uuid: "1234-5678",
    username: "0E:11:22:33:44:55",
    pincode: "123-45-678",
    setupId: "DRIV",
    port: 51830,
    published: true,
    strategy: "passthrough_h264" as const,
    state: "idle",
    name: "Driveway Camera",
    manufacturer: "Tapo",
    model: "C210",
    serialNumber: "camera_driveway",
    hksvCapable: true,
    hksvEnabled: true,
    hksvVerified: false,
    hksvState: "waiting_hub" as const,
  };
}

function createMockCapabilities() {
  return {
    hasLiveStream: true,
    streamSourceType: "rtsp" as const,
    videoCodec: "h264" as const,
    hasAudio: true,
    audioCodec: "aac_lc" as const,
    resolution: { width: 1920, height: 1080 },
    maxFps: 30,
    strategy: "passthrough_h264" as const,
    requiresTranscoding: false,
    snapshotSupported: true,
    hksvCapable: true,
  };
}

function createMockConfiguration(): CameraRecordingConfiguration {
  return {
    prebufferLength: 4000,
    eventTriggerTypes: [1],
    mediaContainerConfiguration: {
      type: MediaContainerType.FRAGMENTED_MP4,
      fragmentLength: 4000,
    },
    videoCodec: {
      type: VideoCodecType.H264,
      parameters: {
        profile: H264Profile.MAIN,
        level: H264Level.LEVEL4_0,
        bitRate: 2000,
        iFrameInterval: 4000,
      },
      resolution: [1920, 1080, 30],
    },
    audioCodec: {
      type: AudioRecordingCodecType.AAC_LC,
      audioChannels: 1,
      bitrate: 32,
      samplerate: AudioRecordingSamplerate.KHZ_32,
      bitrateMode: AudioBitrate.VARIABLE,
    },
  };
}

describe("HomeKitCameraRecordingDelegate", () => {
  it("keeps the HKSV prebuffer ready while applying Home Hub configuration", () => {
    const record = createMockRecord();
    const capabilities = createMockCapabilities();
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    vi.spyOn(delegate as any, "startPrebufferPipeline").mockResolvedValue(
      undefined,
    );

    expect(record.hksvState).toBe("waiting_hub");

    // Home Hub selects configuration
    const config = createMockConfiguration();
    delegate.updateRecordingConfiguration(config);
    // The rolling prebuffer is already active, so applying the Home Hub
    // configuration keeps the delegate immediately recordable.
    expect(record.hksvState).toBe("ready");

    // User enables recording in Apple Home
    delegate.updateRecordingActive(true);
    expect(record.hksvState).toBe("ready");

    delegate.destroy();
  });

  it("yields initialization and prebuffer fragments during handleRecordingStreamRequest", async () => {
    const record = createMockRecord();
    const capabilities = createMockCapabilities();
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    vi.spyOn(delegate as any, "startPrebufferPipeline").mockResolvedValue(
      undefined,
    );

    const config = createMockConfiguration();
    delegate.updateRecordingConfiguration(config);
    delegate.updateRecordingActive(true);

    // Simulate segmenter emitting init + fragments
    (delegate as any).segmenter.emit(
      "initialization",
      Buffer.from("ftyp-moov-init-data"),
    );
    (delegate as any).segmenter.emit("fragment", {
      data: Buffer.from("moof-mdat-fragment-1"),
      isKeyframe: true,
      sequenceNumber: 1,
    });
    (delegate as any).segmenter.emit("fragment", {
      data: Buffer.from("moof-mdat-fragment-2"),
      isKeyframe: true,
      sequenceNumber: 2,
    });

    const abortController = new AbortController();
    const generator = delegate.handleRecordingStreamRequest(
      100,
      abortController.signal,
    );

    const packets: any[] = [];
    const first = await generator.next();
    if (!first.done) packets.push(first.value);
    const second = await generator.next();
    if (!second.done) packets.push(second.value);
    const third = await generator.next();
    if (!third.done) packets.push(third.value);

    // Packet 1: initialization
    expect(packets[0].data.toString()).toBe("ftyp-moov-init-data");
    expect(packets[0].isLast).toBe(false);

    // Packet 2: prebuffer fragment 1
    expect(packets[1].data.toString()).toBe("moof-mdat-fragment-1");

    // Packet 3: prebuffer fragment 2
    expect(packets[2].data.toString()).toBe("moof-mdat-fragment-2");

    abortController.abort();
    delegate.destroy();
  });

  it("marks hksvVerified ONLY after complete multi-fragment session is acknowledged cleanly", async () => {
    const record = createMockRecord();
    const capabilities = createMockCapabilities();
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    vi.spyOn(delegate as any, "startPrebufferPipeline").mockResolvedValue(
      undefined,
    );

    const config = createMockConfiguration();
    delegate.updateRecordingConfiguration(config);
    delegate.updateRecordingActive(true);

    (delegate as any).segmenter.emit(
      "initialization",
      Buffer.from("ftyp-moov-init"),
    );
    (delegate as any).segmenter.emit("fragment", {
      data: Buffer.from("fragment-1"),
      isKeyframe: true,
    });
    (delegate as any).segmenter.emit("fragment", {
      data: Buffer.from("fragment-2"),
      isKeyframe: true,
    });

    const abortController = new AbortController();
    const generator = delegate.handleRecordingStreamRequest(
      200,
      abortController.signal,
    );

    await generator.next(); // init
    await generator.next(); // frag 1
    await generator.next(); // frag 2

    expect(record.hksvVerified).toBe(false);

    // Home Hub acknowledges stream completion cleanly
    delegate.acknowledgeStream(200);
    delegate.closeRecordingStream(200, HDSProtocolSpecificErrorReason.NORMAL);

    expect(record.hksvVerified).toBe(true);
    expect(record.hksvState).toBe("verified");

    delegate.destroy();
  });

  it("copies AAC only when its exact sample rate and channel layout match Home Hub", () => {
    const capabilities = {
      ...createMockCapabilities(),
      audioCodec: "aac",
      audioSampleRate: 32000,
      audioChannels: 1,
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      createMockRecord(),
      capabilities,
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/stream",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();

    const args = delegate.buildPrebufferArgs("rtsp://camera.local/stream");
    expect(args).toContain("-vcodec");
    expect(args).toContain("copy");
    expect(args).toContain("-c:a");
    expect(args?.[args.indexOf("-c:a") + 1]).toBe("copy");
    delegate.destroy();
  });

  it("normalizes only audio when native AAC does not match Home Hub", () => {
    const capabilities = {
      ...createMockCapabilities(),
      audioCodec: "aac",
      audioSampleRate: 48000,
      audioChannels: 2,
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      createMockRecord(),
      capabilities,
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/stream",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();

    const args = delegate.buildPrebufferArgs("rtsp://camera.local/stream");
    expect(args?.[args.indexOf("-vcodec") + 1]).toBe("copy");
    expect(args?.[args.indexOf("-c:a") + 1]).toBe("aac");
    expect(args).toContain("32k");
    expect(args).toContain("1");
    delegate.destroy();
  });

  it("uses a bounded SPS/PPS probe and repaired audio clock for Tapo C402 HKSV", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.tapo_c402",
      name: "Tapo C402",
      model: "Tapo C402",
    };
    const capabilities = {
      ...createMockCapabilities(),
      audioCodec: "aac_lc",
      audioSampleRate: 16000,
      audioChannels: 1,
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.tapo_c402",
      record,
      capabilities,
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/c402",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    const selected = createMockConfiguration();
    selected.videoCodec.resolution = [1280, 720, 30];
    (delegate as any).selectedConfiguration = selected;

    const args = delegate.buildPrebufferArgs("rtsp://camera.local/c402");
    expect(args).toContain("1048576");
    expect(args).toContain("1000000");
    expect(args).toContain("+genpts+discardcorrupt");
    expect(args).not.toContain("+nobuffer+flush_packets+genpts+igndts");
    expect(args).toContain(
      "asetpts=N/SR/TB,aresample=async=1:min_hard_comp=0.100:first_pts=0",
    );
    expect(args).toContain("-copyts");
    expect(args).toContain("-start_at_zero");
    expect(args).not.toContain("-use_wallclock_as_timestamps");
    expect(args?.[args.indexOf("-vcodec") + 1]).toBe("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("-vf");
    delegate.destroy();
  });

  it("keeps Camera.UI wall-clock input disabled for EZVIZ timestamp repair", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.ezviz",
      name: "EZVIZ Patio",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.ezviz",
      record,
      createMockCapabilities(),
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/ezviz",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://camera.local/ezviz");
    expect(args).toContain("524288");
    expect(args).toContain("500000");
    expect(args).toContain("+genpts+discardcorrupt");
    expect(args).toContain("-copyts");
    expect(args).toContain("-start_at_zero");
    expect(args).not.toContain("-use_wallclock_as_timestamps");
    delegate.destroy();
  });

  it("repairs the C120 AAC clock and transcodes video to 1080p Level 4.0 for Apple Home Hub", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.tapo_c120",
      model: "C120",
      name: "Tapo C120",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.tapo_c120",
      record,
      {
        ...createMockCapabilities(),
        resolution: { width: 2560, height: 1440 },
        maxFps: 15,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/c120",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://camera.local/c120");
    // C120 must be transcoded to 1080p High Level 4.0 for HKSV compatibility
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("high");
    expect(args).toContain("4.0");
    expect(args).toContain("-r");
    expect(args).toContain("15");
    expect(args).toContain("+genpts+discardcorrupt");
    expect(args).toContain("-copyts");
    expect(args).toContain("-start_at_zero");
    expect(args).not.toContain("-use_wallclock_as_timestamps");
    delegate.destroy();
  });

  it("leaves non-C120 cameras with native H.264 passthrough copy", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.c210",
      model: "C210",
      name: "Tapo C210",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.c210",
      record,
      {
        ...createMockCapabilities(),
        resolution: { width: 1920, height: 1080 },
        maxFps: 25,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/c210",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://camera.local/c210");
    // Non-C120 camera must keep -vcodec copy
    expect(args?.[args.indexOf("-vcodec") + 1]).toBe("copy");
    expect(args).not.toContain("libx264");
    delegate.destroy();
  });

  it("leaves HEVC cameras untouched without libx264 transcoding", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.hevc",
      model: "Generic HEVC",
      name: "HEVC Camera",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.hevc",
      record,
      {
        ...createMockCapabilities(),
        videoCodec: "hevc" as any,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/hevc",
        supportsPassthrough: false,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://camera.local/hevc");
    // HEVC camera is rejected for passthrough without libx264
    expect(args).toBeNull();
    delegate.destroy();
  });
});

describe("HomeKitCameraRecordingDelegate — pause/resume symmetric cycle", () => {
  it("pausePrebuffer() is a no-op when recordingActive=false", () => {
    const record = { ...createMockRecord(), hksvEnabled: false };
    const capabilities = createMockCapabilities();
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    delegate.updateRecordingActive(false);
    const stopSpy = vi.spyOn(delegate as any, "stopPrebufferPipeline");

    // recordingActive is false
    delegate.pausePrebuffer();
    expect(stopSpy).not.toHaveBeenCalled();
    expect((delegate as any).isPausedByLiveStream).toBe(false);

    delegate.destroy();
  });

  it("resumePrebuffer() is a no-op when not paused by live view", () => {
    const record = createMockRecord();
    const capabilities = createMockCapabilities();
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    const startSpy = vi
      .spyOn(delegate as any, "startPrebufferPipeline")
      .mockResolvedValue(undefined);

    delegate.updateRecordingActive(true);
    startSpy.mockClear();

    // isPausedByLiveStream is false
    delegate.resumePrebuffer();
    expect(startSpy).not.toHaveBeenCalled();

    delegate.destroy();
  });

  it("pause and resume forms an idempotent symmetric cycle", () => {
    const record = createMockRecord();
    const capabilities = createMockCapabilities();
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    const stopSpy = vi.spyOn(delegate as any, "stopPrebufferPipeline");
    const startSpy = vi
      .spyOn(delegate as any, "startPrebufferPipeline")
      .mockResolvedValue(undefined);

    delegate.updateRecordingActive(true);
    stopSpy.mockClear();
    startSpy.mockClear();

    // Pause (session-start)
    delegate.pausePrebuffer();
    expect((delegate as any).isPausedByLiveStream).toBe(true);
    expect(stopSpy).toHaveBeenCalledOnce();
    startSpy.mockClear();

    // Second pause is a no-op (idempotent)
    delegate.pausePrebuffer();
    expect(stopSpy).toHaveBeenCalledOnce();

    // Resume (session-end)
    delegate.resumePrebuffer();
    expect((delegate as any).isPausedByLiveStream).toBe(false);
    expect(startSpy).toHaveBeenCalledOnce();

    // Second resume is a no-op (idempotent)
    delegate.resumePrebuffer();
    expect(startSpy).toHaveBeenCalledOnce();

    delegate.destroy();
  });
});

describe("HomeKitCameraRecordingDelegate — structured C120 identification & false-positive defense", () => {
  it("identifies C120 from structured record.model even if entityId and URL are generic", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.front_door",
      model: "C120",
      name: "Front Porch",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.front_door",
      record,
      {
        ...createMockCapabilities(),
        resolution: { width: 2560, height: 1440 },
        maxFps: 15,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100/stream1",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100/stream1");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("4.0");
    delegate.destroy();
  });

  it("identifies C120 from streamSource metadata.model", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.custom_stream",
      model: undefined,
      name: "Custom Cam",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.custom_stream",
      record,
      {
        ...createMockCapabilities(),
        resolution: { width: 2560, height: 1440 },
        maxFps: 15,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100/stream1",
        supportsPassthrough: true,
        requiresBridge: false,
        metadata: { model: "Tapo C120" },
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100/stream1");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("4.0");
    delegate.destroy();
  });

  it("does NOT falsely identify C1200 or C210 as C120", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.c1200_device",
      model: "C1200",
      name: "Outdoor C1200",
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.c1200_device",
      record,
      {
        ...createMockCapabilities(),
        resolution: { width: 1920, height: 1080 },
        maxFps: 25,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100/c1200",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();
    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100/c1200");
    // Must remain passthrough copy, NOT libx264
    expect(args?.[args.indexOf("-vcodec") + 1]).toBe("copy");
    expect(args).not.toContain("libx264");
    delegate.destroy();
  });
});

describe("HomeKitCameraRecordingDelegate — resolveCameraSourceFps & dynamic frame-rate handling", () => {
  it("returns undefined when camera has no measurement, no maxFps, and no record.fps", () => {
    const capabilities = createMockCapabilities();
    delete (capabilities as any).maxFps;
    delete (capabilities as any).measuredVideo;
    const record = createMockRecord();

    const fps = resolveCameraSourceFps(capabilities, record);
    expect(fps).toBeUndefined();
  });

  it("returns undefined if measured fps is non-positive or invalid", () => {
    const capabilities = {
      ...createMockCapabilities(),
      maxFps: 0,
      measuredVideo: { fps: 0, avgFrameRate: "0/0" },
    };
    expect(resolveCameraSourceFps(capabilities)).toBeUndefined();
  });

  it("correctly parses fractional avg_frame_rate (e.g. 24/1, 30000/1001)", () => {
    const cap24 = {
      ...createMockCapabilities(),
      maxFps: 0,
      measuredVideo: { avgFrameRate: "24/1" },
    };
    expect(resolveCameraSourceFps(cap24)).toBe(24);

    const cap30 = {
      ...createMockCapabilities(),
      maxFps: 0,
      measuredVideo: { avgFrameRate: "30000/1001" },
    };
    expect(resolveCameraSourceFps(cap30)).toBe(30);
  });

  it("strictly prioritizes measured fps over avg_frame_rate, and avg_frame_rate over r_frame_rate", () => {
    // 1. Measured fps beats avgFrameRate
    const cap1 = {
      ...createMockCapabilities(),
      measuredVideo: { fps: 20, avgFrameRate: "18/1", rFrameRate: "15/1" },
      maxFps: 30,
    };
    expect(resolveCameraSourceFps(cap1)).toBe(20);

    // 2. avgFrameRate beats rFrameRate and maxFps when fps is absent
    const cap2 = {
      ...createMockCapabilities(),
      measuredVideo: { avgFrameRate: "24/1", rFrameRate: "15/1" },
      maxFps: 30,
    };
    expect(resolveCameraSourceFps(cap2)).toBe(24);

    // 3. rFrameRate beats maxFps when fps and avgFrameRate are absent
    const cap3 = {
      ...createMockCapabilities(),
      measuredVideo: { rFrameRate: "25/1" },
      maxFps: 30,
    };
    expect(resolveCameraSourceFps(cap3)).toBe(25);
  });

  it("resolves configured maxFps when unmeasured (testing 10, 20, 24, and 30 fps)", () => {
    for (const targetFps of [10, 20, 24, 30]) {
      const cap = {
        ...createMockCapabilities(),
        measuredVideo: undefined,
        maxFps: targetFps,
      };
      expect(resolveCameraSourceFps(cap)).toBe(targetFps);
    }
  });

  it("resolves record.fps for C120 when capabilities lack metadata", () => {
    const cap = {
      ...createMockCapabilities(),
      measuredVideo: undefined,
      maxFps: 0,
    };
    const record = {
      ...createMockRecord(),
      fps: 15,
    };
    expect(resolveCameraSourceFps(cap, record)).toBe(15);
  });

  it("fails closed when Tapo C120 has neither measured nor configured FPS", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.tapo_c120",
      model: "C120",
    };
    const cap = {
      ...createMockCapabilities(),
      resolution: { width: 2560, height: 1440 },
      maxFps: 0,
      measuredVideo: undefined,
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.tapo_c120",
      record,
      cap,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100/c120",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();

    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100/c120");
    expect(args).toBeNull();
    expect(record.hksvState).toBe("not_capable");
    delegate.destroy();
  });

  it("applies exact FPS transcoding for Tapo C120 at 10, 20, 24, and 30 fps", () => {
    for (const fps of [10, 20, 24, 30]) {
      const record = {
        ...createMockRecord(),
        entityId: `camera.c120_${fps}`,
        model: "C120",
      };
      const cap = {
        ...createMockCapabilities(),
        resolution: { width: 2560, height: 1440 },
        maxFps: fps,
        measuredVideo: undefined,
      };
      const delegate = new HomeKitCameraRecordingDelegate(
        mockPlatform,
        record.entityId,
        record,
        cap,
        {
          sourceType: "rtsp",
          url: "rtsp://192.168.1.100/stream",
          supportsPassthrough: true,
          requiresBridge: false,
        },
      );
      (delegate as any).selectedConfiguration = createMockConfiguration();

      const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100/stream")!;
      expect(args).not.toBeNull();
      const rIdx = args.indexOf("-r");
      expect(rIdx).toBeGreaterThan(-1);
      expect(args[rIdx + 1]).toBe(String(fps));

      const gIdx = args.indexOf("-g");
      expect(args[gIdx + 1]).toBe(String(fps * 2));

      const keyintIdx = args.indexOf("-keyint_min");
      expect(args[keyintIdx + 1]).toBe(String(fps));

      delegate.destroy();
    }
  });

  it("never injects -r or transcode args into non-C120 cameras even if they have 24 or 30 fps", () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.reolink_backyard",
      model: "RLC-810A",
      name: "Backyard",
    };
    const cap = {
      ...createMockCapabilities(),
      resolution: { width: 3840, height: 2160 },
      maxFps: 25,
      measuredVideo: { fps: 25 },
    };
    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      record.entityId,
      record,
      cap,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.120/main",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );
    (delegate as any).selectedConfiguration = createMockConfiguration();

    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.120/main")!;
    expect(args).not.toBeNull();
    expect(args).not.toContain("-r");
    expect(args).not.toContain("libx264");
    expect(args[args.indexOf("-vcodec") + 1]).toBe("copy");
    delegate.destroy();
  });
});

describe("HomeKitCameraRecordingDelegate — end-to-end motion and HKSV clip lifecycle", () => {
  it("completes full cycle: motion trigger -> HKSV stream request -> prebuffer + event fragments -> acknowledgment -> hksvVerified", async () => {
    const record = {
      ...createMockRecord(),
      entityId: "camera.tapo_c120",
      model: "C120",
      name: "Tapo C120",
    };
    const capabilities = {
      ...createMockCapabilities(),
      resolution: { width: 2560, height: 1440 },
      maxFps: 15,
    };
    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://192.168.110.147:8554/tapo_c120",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraRecordingDelegate(
      mockPlatform,
      "camera.tapo_c120",
      record,
      capabilities,
      streamSource,
    );
    vi.spyOn(delegate as any, "startPrebufferPipeline").mockResolvedValue(
      undefined,
    );

    // 1. Configure HKSV
    const config = createMockConfiguration();
    delegate.updateRecordingConfiguration(config);
    delegate.updateRecordingActive(true);

    // 2. Prebuffer receives initialization segment and pre-event fragments
    (delegate as any).segmenter.emit(
      "initialization",
      Buffer.from("ftyp-moov-init"),
    );
    (delegate as any).segmenter.emit("fragment", {
      data: Buffer.from("prebuffer-frag-1"),
      isKeyframe: true,
      sequenceNumber: 1,
    });
    (delegate as any).segmenter.emit("fragment", {
      data: Buffer.from("prebuffer-frag-2"),
      isKeyframe: true,
      sequenceNumber: 2,
    });

    // 3. Real motion event triggers motion state
    delegate.handleMotionDetected(true);

    // 4. Apple Home Hub requests the recording stream for streamId 501
    const abortController = new AbortController();
    const generator = delegate.handleRecordingStreamRequest(
      501,
      abortController.signal,
    );

    // 5. Generator yields initialization segment followed by prebuffer fragments
    const p1 = await generator.next();
    expect(p1.value?.data.toString()).toBe("ftyp-moov-init");
    expect(p1.value?.isLast).toBe(false);

    const p2 = await generator.next();
    expect(p2.value?.data.toString()).toBe("prebuffer-frag-1");

    const p3 = await generator.next();
    expect(p3.value?.data.toString()).toBe("prebuffer-frag-2");

    // 6. Motion ends, Home Hub acknowledges stream and closes cleanly
    delegate.handleMotionDetected(false);
    expect(record.hksvVerified).toBe(false);

    delegate.acknowledgeStream(501);
    delegate.closeRecordingStream(501, HDSProtocolSpecificErrorReason.NORMAL);

    // 7. Stream cleanly verified
    expect(record.hksvVerified).toBe(true);
    expect(record.hksvState).toBe("verified");

    abortController.abort();
    delegate.destroy();
  });
});

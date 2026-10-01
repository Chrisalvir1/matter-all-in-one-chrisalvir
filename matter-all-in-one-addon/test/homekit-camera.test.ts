import { describe, expect, it, vi } from "vitest";
import {
  Characteristic,
  SRTPCryptoSuites,
  StreamRequestTypes,
  AudioStreamingCodecType,
  H264Profile,
} from "@homebridge/hap-nodejs";
import { EventEmitter } from "node:events";
import * as ffmpegHelper from "../src/camera/homekit/ffmpeg-helper.js";
import { HomeKitCameraAccessory } from "../src/camera/homekit/homekit-camera.accessory.js";
import {
  HomeKitCameraStreamingDelegate,
  resolveLiveViewFps,
} from "../src/camera/homekit/homekit-camera-stream.delegate.js";

function createPlatform() {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      notice: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    matterbridge: { matterbridgeVersion: "3.10.7" },
    ha: {
      hassEntities: new Map([
        ["camera.backyard", { device_id: "dev-backyard" }],
        ["binary_sensor.backyard_motion", { device_id: "dev-backyard" }],
      ]),
      hassStates: new Map([
        [
          "binary_sensor.backyard_motion",
          {
            entity_id: "binary_sensor.backyard_motion",
            state: "off",
            attributes: { device_class: "motion" },
          },
        ],
      ]),
    },
    saveHomeKitCameraRecords: vi.fn(),
  };
}

const capabilities = {
  hasLiveStream: true,
  streamSourceType: "rtsp" as const,
  videoCodec: "h264" as const,
  hasAudio: true,
  audioCodec: "aac_lc" as const,
  resolution: { width: 1920, height: 1080 },
  maxFps: 30,
  strategy: "transcode_required" as const,
  requiresTranscoding: true,
  snapshotSupported: true,
};

const rtspSource = {
  sourceType: "rtsp" as const,
  url: "rtsp://camera.local/live",
  supportsPassthrough: false,
  requiresBridge: true,
  metadata: { isScrypted: true, validationStatus: "verified" },
};

function createRecord(entityId = "camera.backyard", port = 51830) {
  return {
    entityId,
    uuid: "e4a2d8a0-1234-5678-9abc-def012345678",
    username: "0E:11:22:33:44:55",
    pincode: "123-45-678",
    setupId: "12AB",
    port,
    published: false,
    strategy: "transcode_required" as const,
    state: "idle",
    name: "Backyard Camera",
    manufacturer: "Matter all in one Chrisalvir",
    model: "Tapo Camera",
    serialNumber: "SCRYPTED-51",
  };
}

describe("HomeKitCameraAccessory production HAP graph", () => {
  it("creates one camera controller after attaching the motion service", () => {
    const accessory = new HomeKitCameraAccessory(
      createPlatform(),
      "camera.backyard",
      createRecord(),
      capabilities,
      rtspSource,
    );
    expect(accessory.controller).toBeDefined();
    expect(accessory.delegate).toBeDefined();
    expect(accessory.motionService).toBeDefined();
    expect(
      accessory.motionService?.getCharacteristic(Characteristic.MotionDetected)
        .value,
    ).toBe(false);
  });

  it("updates the real motion service", () => {
    const accessory = new HomeKitCameraAccessory(
      createPlatform(),
      "camera.backyard",
      createRecord(),
      capabilities,
      rtspSource,
    );
    accessory.updateMotionState(true);
    expect(
      accessory.motionService?.getCharacteristic(Characteristic.MotionDetected)
        .value,
    ).toBe(true);
  });

  it("keeps a Home Assistant RTSP camera motion service without mislabeling it Camera.UI", () => {
    const haSource = {
      ...rtspSource,
      metadata: {
        streamProvider: "home_assistant",
        hasCameraMotion: true,
        capabilitiesProbedBeforePublish: true,
      },
    };
    const accessory = new HomeKitCameraAccessory(
      createPlatform(),
      "camera.cameraui_c402",
      createRecord("camera.cameraui_c402"),
      capabilities,
      haSource,
    );

    expect(accessory.motionService).toBeDefined();
    accessory.updateMotionState(true);
    expect(
      accessory.motionService?.getCharacteristic(Characteristic.MotionDetected)
        .value,
    ).toBe(true);
  });

  it("advertises only the native passthrough capabilities outside C402", () => {
    const nativeCapabilities = {
      ...capabilities,
      resolution: { width: 2560, height: 1440 },
      maxFps: 20,
      videoProfile: "main",
    };
    const accessory = new HomeKitCameraAccessory(
      createPlatform(),
      "camera.backyard",
      createRecord(),
      nativeCapabilities,
      rtspSource,
    );

    expect((accessory as any).buildDeclaredResolutions()[0]).toEqual([
      2560, 1440, 20,
    ]);
    const options = (accessory as any).buildControllerOptions();
    expect(options.streamingOptions.video.resolutions[0]).toEqual([
      2560, 1440, 20,
    ]);
    expect(options.streamingOptions.audio.codecs[0].type).toEqual(
      AudioStreamingCodecType.AAC_ELD,
    );
    expect(options.streamingOptions.video.codec.profiles).toEqual([
      H264Profile.BASELINE,
      H264Profile.MAIN,
      H264Profile.HIGH,
    ]);
  });

  it("advertises AAC-ELD first and full ladder for Tapo C402", () => {
    const c402Capabilities = {
      ...capabilities,
      resolution: { width: 2560, height: 1440 },
      maxFps: 30,
      videoProfile: "high",
    };
    const c402Accessory = new HomeKitCameraAccessory(
      createPlatform(),
      "camera.cameraui_tapo_c402",
      createRecord("camera.cameraui_tapo_c402"),
      c402Capabilities,
      {
        ...rtspSource,
        url: "rtsp://192.168.110.147:62291/tapo-c402",
      },
    );

    const resolutions = (c402Accessory as any).buildDeclaredResolutions();
    expect(resolutions.length).toBeGreaterThan(1);
    expect(resolutions[0]).toEqual([2560, 1440, 30]);

    const options = (c402Accessory as any).buildControllerOptions();
    expect(options.streamingOptions.audio.codecs[0].type).toEqual(
      AudioStreamingCodecType.AAC_ELD,
    );
    expect(options.streamingOptions.video.codec.profiles).toEqual([
      H264Profile.BASELINE,
      H264Profile.MAIN,
      H264Profile.HIGH,
    ]);
  });

  it("creates an integrated motion service for a Scrypted camera", () => {
    const platform = createPlatform();
    platform.ha.hassEntities = new Map();
    platform.ha.hassStates = new Map();
    const accessory = new HomeKitCameraAccessory(
      platform,
      "scrypted.51",
      createRecord("scrypted.51", 51841),
      capabilities,
      rtspSource,
    );
    expect(accessory.motionService).toBeDefined();
  });

  it("does not invent motion for an unrelated non-Scrypted camera", () => {
    const platform = createPlatform();
    platform.ha.hassEntities = new Map([
      ["camera.standalone", { device_id: "standalone" }],
    ]);
    platform.ha.hassStates = new Map();
    const source = {
      ...rtspSource,
      metadata: { validationStatus: "verified" },
    };
    const accessory = new HomeKitCameraAccessory(
      platform,
      "camera.standalone",
      createRecord("camera.standalone", 51842),
      capabilities,
      source,
    );
    expect(accessory.motionService).toBeUndefined();
  });
});

describe("HomeKitCameraStreamingDelegate", () => {
  it("always returns a decodable JPEG fallback when no snapshot source exists", async () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      {
        sourceType: "unknown",
        supportsPassthrough: false,
        requiresBridge: true,
      },
    );
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      void delegate.handleSnapshotRequest(
        { width: 320, height: 240, reason: 0 },
        (error, result) => (error ? reject(error) : resolve(result!)),
      );
    });
    expect(buffer.length).toBeGreaterThan(128);
    expect([...buffer.subarray(0, 2)]).toEqual([0xff, 0xd8]);
    expect([...buffer.subarray(-2)]).toEqual([0xff, 0xd9]);
  });

  it("returns an accessory-local RTCP port and a generated SSRC", async () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );
    const response = await new Promise<any>((resolve, reject) => {
      delegate.prepareStream(
        {
          sessionID: "session-1",
          sourceAddress: "192.168.1.100",
          targetAddress: "192.168.1.50",
          video: {
            port: 5000,
            srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
            srtp_key: Buffer.alloc(16, 1),
            srtp_salt: Buffer.alloc(14, 2),
          },
          addressVersion: "ipv4",
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      );
    });
    expect(response.addressOverride).toBe("192.168.1.100");
    expect(response.video.port).not.toBe(5000);
    expect(response.video.port).toBeGreaterThan(0);
    expect(response.video.ssrc).toBeGreaterThan(0);
    expect(response.video.ssrc).not.toBe(1);
  });

  it("allocates unique local ports and SSRCs for concurrent sessions", async () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );
    const prepare = (sessionID: string) =>
      new Promise<any>((resolve, reject) => {
        delegate.prepareStream(
          {
            sessionID,
            targetAddress: "192.168.1.50",
            video: {
              port: 5000,
              srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
              srtp_key: Buffer.alloc(16, 1),
              srtp_salt: Buffer.alloc(14, 2),
            },
            addressVersion: "ipv4",
          },
          (error, result) => (error ? reject(error) : resolve(result)),
        );
      });
    const [first, second] = await Promise.all([
      prepare("session-a"),
      prepare("session-b"),
    ]);
    expect(first.video.port).not.toBe(second.video.port);
    expect(first.video.ssrc).not.toBe(second.video.ssrc);
    delegate.cleanupAllSessions();
  });

  it("cleans an unstarted session on STOP without throwing", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );
    const callback = vi.fn();
    delegate.handleStreamRequest(
      { sessionID: "missing", type: StreamRequestTypes.STOP },
      callback,
    );
    expect(callback).toHaveBeenCalledOnce();
  });

  it("builds H.264 video passthrough with AAC-ELD audio and without HA token for external streams", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      { ...capabilities, strategy: "passthrough_h264" },
      {
        ...rtspSource,
        url: "https://home.scrypted.app/endpoint/13/public/abc",
      },
    );

    const session = {
      sessionId: "session-pass",
      targetAddress: "192.168.1.50",
      videoPort: 5000,
      localVideoPort: 5001,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySalt: Buffer.alloc(30, 1),
      videoSsrc: 1111,
      audioPort: 5002,
      localAudioPort: 5003,
      audioCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      audioKeySalt: Buffer.alloc(30, 2),
      audioSsrc: 2222,
    };

    const request = {
      sessionID: "session-pass",
      type: StreamRequestTypes.START,
      video: {
        fps: 30,
        width: 1920,
        height: 1080,
        max_bit_rate: 4000,
        rtp: { port: 5000 } as any,
        srtp_key: Buffer.alloc(16),
        srtp_salt: Buffer.alloc(14),
      } as any,
      audio: {
        codec: AudioStreamingCodecType.AAC_ELD,
        channel: 1,
        bit_rate: 0,
        sample_rate: 16,
        packet_time: 20,
        pt: 110,
        max_bit_rate: 24,
        rtp: { port: 5002 } as any,
      } as any,
    };

    const capturedArgs = delegate.buildStreamArgs(session, request);

    // H.264 passthrough must repeat SPS/PPS on every keyframe so a newly opened
    // Apple Home view can decode the first GOP from a warm RTSP restream.
    expect(capturedArgs).toContain("-c:v");
    expect(capturedArgs).toContain("copy");
    expect(capturedArgs).toContain("dump_extra=freq=keyframe");

    // The source AAC is normalized to the AAC-ELD profile negotiated by HAP.
    expect(capturedArgs).toContain("-c:a");
    expect(capturedArgs).toContain("libfdk_aac");
    expect(capturedArgs).toContain("aac_eld");
    expect(capturedArgs).toContain("aresample=async=1:first_pts=0");
    expect(capturedArgs).not.toContain("libopus");

    // Verify HTTP/HTTPS robust flags
    expect(capturedArgs).toContain("-reconnect");
    expect(capturedArgs).toContain("-tls_verify");
    expect(capturedArgs).toContain("0");

    // Verify NO Home Assistant token was leaked to external URL
    expect(capturedArgs.join(" ")).not.toContain("Authorization: Bearer");

    // Verify localrtcpport is present in SRTP endpoints so iOS RTCP feedback reaches FFmpeg
    expect(capturedArgs.join(" ")).toContain("localrtcpport=5001");
    expect(capturedArgs.join(" ")).toContain("localrtcpport=5003");
  });

  it("passes HEVC source through natively using -c:v copy in streaming delegate", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "camera.hevc",
      {
        ...capabilities,
        videoCodec: "hevc",
        strategy: "passthrough_hevc",
        requiresTranscoding: false,
      } as any,
      { ...rtspSource, supportsPassthrough: true },
    );
    const args = delegate.buildStreamArgs(
      {
        sessionId: "hevc-session",
        targetAddress: "192.168.1.50",
        videoPort: 5000,
        localVideoPort: 5001,
        videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        videoKeySalt: Buffer.alloc(30, 1),
        videoSsrc: 1111,
      },
      {
        sessionID: "hevc-session",
        type: StreamRequestTypes.START,
        video: { fps: 30, width: 1920, height: 1080, pt: 99 } as any,
      } as any,
    );
    // HEVC is passed directly without transcoding
    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
  });

  it("builds low-latency RTSP passthrough args for Tapo C402 Live View", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "camera.tapo_c402",
      capabilities,
      {
        ...rtspSource,
        url: "rtsp://camera.local/tapo-c402",
        supportsPassthrough: true,
      },
    );
    const args = delegate.buildStreamArgs(
      {
        sessionId: "c402-session",
        targetAddress: "192.168.1.50",
        videoPort: 5000,
        localVideoPort: 5001,
        videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        videoKeySalt: Buffer.alloc(30, 1),
        videoSsrc: 1111,
      },
      {
        sessionID: "c402-session",
        type: StreamRequestTypes.START,
        video: { fps: 30, width: 1920, height: 1080, pt: 99 } as any,
      } as any,
    );
    // Tapo C402 is normalized only at the HAP RTP boundary to H.264 High L4.0.
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-level:v");
    expect(args).toContain("4.0");
    expect(args).toContain("-vf");
    expect(args).toContain("2097152");
    expect(args).toContain("3000000");
    expect(args).toContain("-progress");
    expect(args).toContain("pipe:1");
    expect(args).toContain("+genpts+discardcorrupt");
    expect(args).not.toContain("-avioflags");
  });
});

describe("HomeKitCameraStreamingDelegate — session lifecycle and zombie watchdog", () => {
  it("hasActiveSessions() returns false before any prepareStream", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );
    expect(delegate.hasActiveSessions()).toBe(false);
    expect(delegate.activeSessionCount()).toBe(0);
  });

  it("hasActiveSessions() returns true after prepareStream and false after cleanupAllSessions", async () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );

    await new Promise<void>((resolve, reject) => {
      delegate.prepareStream(
        {
          sessionID: "test-session-1",
          targetAddress: "192.168.1.50",
          video: {
            port: 5000,
            srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
            srtp_key: Buffer.alloc(16, 1),
            srtp_salt: Buffer.alloc(14, 2),
          },
          addressVersion: "ipv4",
        },
        (error) => (error ? reject(error) : resolve()),
      );
    });

    expect(delegate.hasActiveSessions()).toBe(true);
    expect(delegate.activeSessionCount()).toBe(1);

    delegate.cleanupAllSessions();
    expect(delegate.hasActiveSessions()).toBe(false);
    expect(delegate.activeSessionCount()).toBe(0);
  });

  it("emits session-end exactly once when all multiple concurrent sessions end", async () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );

    const prepare = (sessionID: string) =>
      new Promise<void>((resolve, reject) => {
        delegate.prepareStream(
          {
            sessionID,
            targetAddress: "192.168.1.50",
            video: {
              port: 5000,
              srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
              srtp_key: Buffer.alloc(16, 1),
              srtp_salt: Buffer.alloc(14, 2),
            },
            addressVersion: "ipv4",
          },
          (error) => (error ? reject(error) : resolve()),
        );
      });

    await prepare("sess-1");
    await prepare("sess-2");

    const sessionEndEvents: number[] = [];
    delegate.on("session-end", () => {
      sessionEndEvents.push(Date.now());
    });

    // Close session 1 — session 2 is still active
    delegate.handleStreamRequest(
      { sessionID: "sess-1", type: StreamRequestTypes.STOP },
      vi.fn(),
    );
    expect(delegate.hasActiveSessions()).toBe(true);
    expect(delegate.activeSessionCount()).toBe(1);
    expect(sessionEndEvents.length).toBe(0); // MUST NOT emit session-end while session 2 is active

    // Close session 2 — now activeSessions is 0
    delegate.handleStreamRequest(
      { sessionID: "sess-2", type: StreamRequestTypes.STOP },
      vi.fn(),
    );
    expect(delegate.hasActiveSessions()).toBe(false);
    expect(delegate.activeSessionCount()).toBe(0);
    expect(sessionEndEvents.length).toBe(1); // Emitted exactly once
  });

  it("watchdog auto-cleans orphaned prepareStream session after 45s and emits session-end", async () => {
    vi.useFakeTimers();

    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );

    await new Promise<void>((resolve, reject) => {
      delegate.prepareStream(
        {
          sessionID: "orphan-sess",
          targetAddress: "192.168.1.50",
          video: {
            port: 5000,
            srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
            srtp_key: Buffer.alloc(16, 1),
            srtp_salt: Buffer.alloc(14, 2),
          },
          addressVersion: "ipv4",
        },
        (error) => (error ? reject(error) : resolve()),
      );
    });

    expect(delegate.hasActiveSessions()).toBe(true);
    expect(delegate.activeSessionCount()).toBe(1);

    const sessionEndEvents: number[] = [];
    delegate.on("session-end", () => {
      sessionEndEvents.push(Date.now());
    });

    // Advance 46 seconds (past the 45s PREPARE_TIMEOUT_MS)
    vi.advanceTimersByTime(46_000);

    expect(delegate.hasActiveSessions()).toBe(false);
    expect(delegate.activeSessionCount()).toBe(0);
    expect(sessionEndEvents.length).toBe(1);

    vi.useRealTimers();
  });

  it("watchdog does NOT clean a session that has a running FFmpeg process", async () => {
    vi.useFakeTimers();

    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "scrypted.51",
      capabilities,
      rtspSource,
    );

    await new Promise<void>((resolve, reject) => {
      delegate.prepareStream(
        {
          sessionID: "active-ffmpeg-sess",
          targetAddress: "192.168.1.50",
          video: {
            port: 5000,
            srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
            srtp_key: Buffer.alloc(16, 1),
            srtp_salt: Buffer.alloc(14, 2),
          },
          addressVersion: "ipv4",
        },
        (error) => (error ? reject(error) : resolve()),
      );
    });

    // Simulate active process
    const sess = (delegate as any).activeSessions.get("active-ffmpeg-sess");
    sess.process = { killed: false, exitCode: null, kill: vi.fn() } as any;

    const sessionEndEvents: number[] = [];
    delegate.on("session-end", () => {
      sessionEndEvents.push(Date.now());
    });

    vi.advanceTimersByTime(46_000);

    // Process is still active, must not be cleaned up
    expect(delegate.hasActiveSessions()).toBe(true);
    expect(delegate.activeSessionCount()).toBe(1);
    expect(sessionEndEvents.length).toBe(0);

    delegate.cleanupAllSessions();
    vi.useRealTimers();
  });

  it("starts clean on add-on restart with 0 persistent sessions", () => {
    const delegate = new HomeKitCameraStreamingDelegate(
      createPlatform(),
      "camera.restarted",
      capabilities,
      rtspSource,
    );
    expect(delegate.hasActiveSessions()).toBe(false);
    expect(delegate.activeSessionCount()).toBe(0);
  });
});

describe("resolveLiveViewFps resolution and per-camera ceilings", () => {
  it("prioritizes requested FPS when valid and within camera max limit", () => {
    // Standard 30fps camera, Apple requests 25
    expect(resolveLiveViewFps(25, 30, 30, 30)).toBe(25);
    // Tapo C120 with 20fps hardware limit, Apple requests 15
    expect(resolveLiveViewFps(15, 20, 20, 20)).toBe(15);
    // Tapo C120 with 20fps hardware limit, Apple requests 20
    expect(resolveLiveViewFps(20, 20, 20, 20)).toBe(20);
  });

  it("strictly clamps Apple requested FPS to cameraMaxFps (e.g. C120 ceiling of 20)", () => {
    // Apple requests 30fps for C120, hardware limit is 20 -> resolves to 20
    expect(resolveLiveViewFps(30, 20, 20, 20)).toBe(20);
    // Apple requests 60fps for standard 30fps camera -> resolves to 30
    expect(resolveLiveViewFps(60, 30, 30, 30)).toBe(30);
  });

  it("falls back to source measured FPS when Apple omits video.fps", () => {
    // Apple omits fps, source measured is 20 for C120
    expect(resolveLiveViewFps(undefined, 20, undefined, 20)).toBe(20);
    // Apple omits fps, source measured is 25 for 30fps camera
    expect(resolveLiveViewFps(undefined, 25, 30, 30)).toBe(25);
    // Apple omits fps, source measured is 30 for C120 -> clamped to 20
    expect(resolveLiveViewFps(undefined, 30, undefined, 20)).toBe(20);
  });

  it("falls back to configured FPS when Apple and source FPS are omitted", () => {
    expect(resolveLiveViewFps(undefined, undefined, 15, 30)).toBe(15);
    // Configured 25 for C120 -> clamped to 20
    expect(resolveLiveViewFps(undefined, undefined, 25, 20)).toBe(20);
  });

  it("returns undefined when only cameraMaxFps is provided without specific inputs (cameraMaxFps is ceiling only)", () => {
    // cameraMaxFps is strictly a ceiling, never an effective measurement
    expect(
      resolveLiveViewFps(undefined, undefined, undefined, 20),
    ).toBeUndefined();
    expect(
      resolveLiveViewFps(undefined, undefined, undefined, 30),
    ).toBeUndefined();
  });

  it("returns undefined when no FPS data is available at all", () => {
    expect(
      resolveLiveViewFps(undefined, undefined, undefined, undefined),
    ).toBeUndefined();
  });

  it("ignores non-finite and non-positive numbers safely and returns undefined without valid inputs", () => {
    expect(resolveLiveViewFps(0, -10, NaN, 20)).toBeUndefined();
    expect(resolveLiveViewFps(NaN, Infinity, 0, undefined)).toBeUndefined();
  });
});

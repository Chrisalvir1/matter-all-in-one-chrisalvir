import { describe, expect, it, vi } from "vitest";

vi.mock("../src/camera/homekit/ffmpeg-helper.js", () => ({
  resolveFfmpegPath: () => "/usr/bin/ffmpeg",
  sanitizeUrlCredentials: (url: string) => url,
  getFfmpegVersion: () => "6.1.1",
}));

import { HomeKitCameraRecordingDelegate } from "../src/camera/homekit/homekit-camera-recording.delegate.js";
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
} from "hap-nodejs";

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
  it("initializes in waiting_hub state and updates state on configuration/active events", () => {
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

    expect(record.hksvState).toBe("waiting_hub");

    // Home Hub selects configuration
    const config = createMockConfiguration();
    delegate.updateRecordingConfiguration(config);
    expect(record.hksvState).toBe("configurable");

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
});

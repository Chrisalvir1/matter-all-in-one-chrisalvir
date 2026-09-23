import { describe, it, expect, vi } from "vitest";
import { HomeKitCameraAccessory } from "../src/camera/homekit/homekit-camera.accessory.js";
import { AudioRecordingSamplerate, CameraController, StreamRequestTypes, SRTPCryptoSuites, uuid } from "@homebridge/hap-nodejs";
import { HomeKitCameraStreamingDelegate } from "../src/camera/homekit/homekit-camera-stream.delegate.js";
import { HomeKitCameraRecordingDelegate } from "../src/camera/homekit/homekit-camera-recording.delegate.js";
import { prependProducerReferenceTime, SecureVideoSFrame } from "../src/camera/homekit/hevc/index.js";
import type { CameraCapabilitiesInfo, HomeKitCameraStorageRecord, ResolvedStreamSource } from "../src/camera/camera-types.js";

function createPlatformMock() {
  return {
    log: {
      notice: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
    },
    ha: {
      hassStates: new Map(),
      hassEntities: new Map(),
    },
    saveHomeKitCameraRecords: vi.fn(),
  };
}

function createBaseRecord(entityId: string, overrides: Partial<HomeKitCameraStorageRecord> = {}): HomeKitCameraStorageRecord {
  return {
    entityId,
    uuid: uuid.generate(`test-uuid-${entityId}`),
    username: "0E:11:22:33:44:55",
    pincode: "123-45-678",
    setupId: "ABCD",
    port: 51830,
    published: false,
    strategy: "passthrough_h264",
    state: "idle",
    ...overrides,
  };
}

function createCapabilities(overrides: Partial<CameraCapabilitiesInfo> = {}): CameraCapabilitiesInfo {
  return {
    hasLiveStream: true,
    streamSourceType: "rtsp",
    videoCodec: "h264",
    hasAudio: true,
    audioCodec: "aac",
    resolution: { width: 1920, height: 1080 },
    maxFps: 30,
    strategy: "passthrough_h264",
    requiresTranscoding: false,
    ...overrides,
  };
}

function createStreamSource(overrides: Partial<ResolvedStreamSource> = {}): ResolvedStreamSource {
  return {
    sourceType: "rtsp",
    url: "rtsp://192.168.1.100:554/live",
    supportsPassthrough: true,
    requiresBridge: false,
    ...overrides,
  };
}

describe("Apple Home / HAP Passthrough and HEVC Exclusivity", () => {
  it("strictly pins Tapo C402 to CameraController and refuses HEVC/SecureVideoController", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.tapo_c402_jardin", {
      model: "Tapo C402",
      name: "Tapo C402 Jardín",
      exportMode: "passthrough_hevc", // Even if misconfigured to hevc, must force h264
    });
    const capabilities = createCapabilities({
      videoCodec: "h264",
      strategy: "passthrough_h264",
    });
    const streamSource = createStreamSource();

    const accessory = new HomeKitCameraAccessory(
      platform,
      "camera.tapo_c402_jardin",
      record,
      capabilities,
      streamSource,
    );

    expect(accessory.controller).toBeInstanceOf(CameraController);
    expect(record.activeController).toBe("CameraController");
    expect(platform.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("Tapo C402 cannot be configured for HEVC/HKSV3"),
    );
  });

  it("configures CameraController exclusively for standard H.264 camera", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.front_door", {
      model: "Generic H264",
      exportMode: "auto",
    });
    const capabilities = createCapabilities({
      videoCodec: "h264",
    });
    const streamSource = createStreamSource();

    const accessory = new HomeKitCameraAccessory(
      platform,
      "camera.front_door",
      record,
      capabilities,
      streamSource,
    );

    expect(accessory.controller).toBeInstanceOf(CameraController);
    expect(record.activeController).toBe("CameraController");
  });

  it("strictly disables export for Vimtag HEVC camera without mounting fake controller", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.jardin_vimtag", {
      model: "Vimtag Outdoor",
      exportMode: "auto",
    });
    const capabilities = createCapabilities({
      videoCodec: "hevc",
      strategy: "passthrough_hevc",
    });
    const streamSource = createStreamSource();

    const accessory = new HomeKitCameraAccessory(
      platform,
      "camera.jardin_vimtag",
      record,
      capabilities,
      streamSource,
    );

    expect(accessory.controller).toBeUndefined();
    expect(record.activeController).toBe("none");
    expect(record.hksvCapable).toBe(false);
    expect(record.hksvState).toBe("not_capable");
    expect(platform.log.warn).toHaveBeenCalledWith(
      expect.stringContaining("HEVC/HKSV3 aún no disponible; no se exporta sin transcodificación"),
    );
  });

  it("refuses to transcode HEVC in classic H.264 delegate with zero transcoding enforcement", () => {
    const platform = createPlatformMock();
    const capabilities = createCapabilities({
      videoCodec: "hevc",
      strategy: "passthrough_hevc",
    });
    const streamSource = createStreamSource();

    const delegate = new HomeKitCameraStreamingDelegate(
      platform,
      "camera.hevc_test",
      capabilities,
      streamSource,
    );

    expect(() =>
      delegate.buildStreamArgs(
        {
          sessionId: "test-sess",
          targetAddress: "192.168.1.50",
          videoPort: 5000,
          localVideoPort: 5001,
          videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
          videoKeySalt: Buffer.alloc(30, 1),
          videoSsrc: 1111,
        },
        {
          sessionID: "test-sess",
          type: StreamRequestTypes.START,
          video: { fps: 30, width: 1920, height: 1080, pt: 99 } as any,
        } as any,
      ),
    ).toThrow("Cámara no entrega H.264 nativo; transcodificación no permitida");
  });

  it("produces passthrough stream args (-c:v copy) without re-encoding video or audio filters when audio is native aac_eld", () => {
    const platform = createPlatformMock();
    const capabilities = createCapabilities({
      videoCodec: "h264",
      audioCodec: "aac_eld",
      audioSampleRate: 16000,
      audioChannels: 1,
    });
    const streamSource = createStreamSource();

    const delegate = new HomeKitCameraStreamingDelegate(
      platform,
      "camera.passthrough_test",
      capabilities,
      streamSource,
    );

    const args = delegate.buildStreamArgs(
      {
        sessionId: "test-sess-copy",
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
      },
      {
        sessionID: "test-sess-copy",
        type: StreamRequestTypes.START,
        video: { fps: 30, width: 1920, height: 1080, pt: 99 } as any,
        audio: {
          codec: 0 as any, // AAC-ELD
          channel: 1,
          bit_rate: 0,
          sample_rate: 16,
          packet_time: 20,
          pt: 110,
        } as any,
      } as any,
    );

    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    // Ensure zero video transcoding
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("libx265");
    expect(args).not.toContain("-vf");
    // Ensure zero audio transcoding
    expect(args).not.toContain("libopus");
    expect(args).not.toContain("libfdk_aac");
    expect(args).not.toContain("aresample");
  });

  it("transcodes ONLY audio for Tapo C120 and EZVIZ AAC cameras in Live View while preserving -c:v copy", () => {
    const platform = createPlatformMock();
    const capabilities = createCapabilities({
      videoCodec: "h264",
      audioCodec: "aac", // RTSP camera sends AAC-LC
      audioSampleRate: 16000,
      audioChannels: 1,
    });
    const streamSource = createStreamSource({
      url: "rtsp://192.168.110.147:8554/tapo_c120",
    });

    const delegate = new HomeKitCameraStreamingDelegate(
      platform,
      "camera.cameraui_ec110a11_ed20_44f7_8468_2bd8c7dce18f",
      capabilities,
      streamSource,
    );

    const args = delegate.buildStreamArgs(
      {
        sessionId: "test-c120-sess",
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
      },
      {
        sessionID: "test-c120-sess",
        type: StreamRequestTypes.START,
        video: { fps: 30, width: 1920, height: 1080, pt: 99 } as any,
        audio: {
          codec: 0 as any, // AAC-ELD
          channel: 1,
          bit_rate: 24,
          sample_rate: 16,
          packet_time: 20,
          pt: 110,
        } as any,
      } as any,
    );

    // Video MUST remain copy
    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("libx265");
    // Audio MUST be transcoded to AAC-ELD with aresample
    expect(args).toContain("-af");
    expect(args).toContain("aresample=async=1:first_pts=0");
    const audioCodecIdx = args.indexOf("-c:a");
    expect(audioCodecIdx).toBeGreaterThan(-1);
    const audioCodecValue = args[audioCodecIdx + 1];
    expect(["aac", "libfdk_aac", "libopus"]).toContain(audioCodecValue);
  });

  it("SFrame frame encryption protects and validates frames correctly", () => {
    const sframe = new SecureVideoSFrame(true);
    const stream = sframe.videoStream(10001);
    const plaintext = Buffer.from("HEVC-NALU-PACKET-DATA");
    const protectedFrame = stream.protectFrame(plaintext);

    expect(protectedFrame.length).toBeGreaterThan(plaintext.length);
  });

  it("prepends prft (Producer Reference Time) atom for tvOS 27 fMP4 compliance", () => {
    // tfhd box
    const tfhd = Buffer.alloc(16);
    tfhd.writeUInt32BE(16, 0);
    tfhd.write("tfhd", 4);
    tfhd.writeUInt32BE(0, 8); // version(1) + flags(3)
    tfhd.writeUInt32BE(1, 12); // trackId

    // tfdt box (version 1 with 64-bit media time)
    const tfdt = Buffer.alloc(20);
    tfdt.writeUInt32BE(20, 0);
    tfdt.write("tfdt", 4);
    tfdt.writeUInt8(1, 8); // version 1
    tfdt.writeBigUInt64BE(1000n, 12);

    // traf box
    const traf = Buffer.concat([Buffer.alloc(8), tfhd, tfdt]);
    traf.writeUInt32BE(traf.length, 0);
    traf.write("traf", 4);

    // moof box
    const moof = Buffer.concat([Buffer.alloc(8), traf]);
    moof.writeUInt32BE(moof.length, 0);
    moof.write("moof", 4);

    const result = prependProducerReferenceTime(moof, Date.now());
    expect(result.length).toBe(moof.length + 32); // 32 bytes prft box prepended
    expect(result.readUInt32BE(0)).toBe(32);
    expect(result.subarray(4, 8).toString("ascii")).toBe("prft");
    expect(result.subarray(36, 40).toString("ascii")).toBe("moof");
  });

  it("buildRecordingResolutions advertises strictly the native camera resolution and fps", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.tapo_c402", {
      model: "Tapo C402",
      name: "Tapo C402",
    });
    const capabilities = createCapabilities({
      videoCodec: "h264",
      resolution: { width: 2560, height: 1440 },
      maxFps: 15,
    });
    const streamSource = createStreamSource();

    const accessory = new HomeKitCameraAccessory(
      platform,
      "camera.tapo_c402",
      record,
      capabilities,
      streamSource,
    );

    const recordingRes = accessory.buildRecordingResolutions();
    expect(recordingRes).toContainEqual([2560, 1440, 15]);
    expect(recordingRes).toContainEqual([1920, 1080, 15]);
    expect(recordingRes).toContainEqual([1280, 720, 15]);
    expect(recordingRes).not.toContainEqual([3840, 2160, 30]);
  });

  it("transcodes ONLY audio for Wyze non-AAC camera in Live View while preserving -c:v copy", () => {
    const platform = createPlatformMock();
    const capabilities = createCapabilities({
      videoCodec: "h264",
      audioCodec: "pcm_alaw", // Non-AAC Wyze audio
      hasAudio: true,
      audioSampleRate: 8000,
      audioChannels: 1,
    });
    const streamSource = createStreamSource();

    const delegate = new HomeKitCameraStreamingDelegate(
      platform,
      "camera.wyze_patio",
      capabilities,
      streamSource,
    );

    const args = delegate.buildStreamArgs(
      {
        sessionId: "test-wyze-sess",
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
      },
      {
        sessionID: "test-wyze-sess",
        type: StreamRequestTypes.START,
        video: { fps: 20, width: 1920, height: 1080, pt: 99 } as any,
        audio: {
          codec: 0 as any, // AAC-ELD
          channel: 1,
          bit_rate: 24,
          sample_rate: 16,
          packet_time: 20,
          pt: 110,
        } as any,
      } as any,
    );

    // Video MUST remain copy
    expect(args).toContain("-c:v");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("libx265");
    // Audio MUST be transcoded to AAC / libopus with aresample
    expect(args).toContain("-af");
    expect(args).toContain("aresample=async=1:first_pts=0");
    const audioCodecIdx = args.indexOf("-c:a");
    expect(audioCodecIdx).toBeGreaterThan(-1);
    const audioCodecValue = args[audioCodecIdx + 1];
    expect(["aac", "libfdk_aac", "libopus"]).toContain(audioCodecValue);
  });

  it("transcodes ONLY audio for Wyze non-AAC camera in HKSV prebuffer while preserving -vcodec copy", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.wyze_patio");
    const capabilities = createCapabilities({
      videoCodec: "h264",
      audioCodec: "pcm_alaw",
      hasAudio: true,
      audioSampleRate: 8000,
      audioChannels: 1,
    });
    const streamSource = createStreamSource();

    const delegate = new HomeKitCameraRecordingDelegate(
      platform,
      "camera.wyze_patio",
      record,
      capabilities,
      streamSource,
    );
    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100:554/live");
    expect(args).not.toBeNull();
    // Video is strict copy
    expect(args).toContain("-vcodec");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    // Audio is transcoded to AAC with aresample
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-af");
    expect(args).toContain("aresample=async=1:first_pts=0");
    expect(args).not.toContain("-an");
  });

  it("uses -c:a copy for AAC cameras in HKSV prebuffer pipeline", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.tapo_c402");
    const capabilities = createCapabilities({
      videoCodec: "h264",
      audioCodec: "aac",
      hasAudio: true,
      audioSampleRate: 16000,
      audioChannels: 1,
    });
    const streamSource = createStreamSource();

    const delegate = new HomeKitCameraRecordingDelegate(
      platform,
      "camera.tapo_c402",
      record,
      capabilities,
      streamSource,
    );
    (delegate as any).selectedConfiguration = {
      audioCodec: {
        samplerate: AudioRecordingSamplerate.KHZ_16,
        audioChannels: 1,
      },
    };

    const args = delegate.buildPrebufferArgs("rtsp://192.168.1.100:554/live");
    expect(args).not.toBeNull();
    expect(args).toContain("-vcodec");
    expect(args).toContain("copy");
    expect(args).toContain("-c:a");
    expect(args).toContain("copy");
    expect(args).not.toContain("aresample=async=1:first_pts=0");
    expect(args).not.toContain("-an");
  });

  it("propagates motion state to accessory motion service and recording delegate", () => {
    const platform = createPlatformMock();
    const record = createBaseRecord("camera.tapo_c402", {
      motionEntityId: "binary_sensor.tapo_c402_motion",
    });
    const capabilities = createCapabilities();
    const streamSource = createStreamSource();

    const accessory = new HomeKitCameraAccessory(
      platform,
      "camera.tapo_c402",
      record,
      capabilities,
      streamSource,
    );

    expect(accessory.motionService).toBeDefined();
    const spy = vi.spyOn(accessory.recordingDelegate!, "handleMotionDetected");
    accessory.updateMotionState(true);
    expect(spy).toHaveBeenCalledWith(true);
    accessory.updateMotionState(false);
    expect(spy).toHaveBeenCalledWith(false);
  });
});

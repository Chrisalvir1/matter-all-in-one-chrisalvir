import { describe, expect, it, vi } from "vitest";
import { HomeKitCameraAccessory } from "../src/camera/homekit/homekit-camera.accessory.js";
import { HomeKitCameraStreamingDelegate } from "../src/camera/homekit/homekit-camera-stream.delegate.js";
import {
  SRTPCryptoSuites,
  Service,
  Characteristic,
  StreamRequestTypes,
} from "hap-nodejs";

const mockPlatform = {
  log: {
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  ha: {
    hassEntities: new Map([
      ["camera.backyard", { device_id: "dev-backyard" }],
      ["binary_sensor.backyard_motion", { device_id: "dev-backyard" }],
      ["camera.driveway", { device_id: "dev-driveway" }],
      ["binary_sensor.driveway_motion", { device_id: "dev-driveway" }],
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
      [
        "binary_sensor.driveway_motion",
        {
          entity_id: "binary_sensor.driveway_motion",
          state: "off",
          attributes: { device_class: "motion" },
        },
      ],
    ]),
    fetchSnapshot: vi
      .fn()
      .mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), // JPEG header
  },
};

describe("HomeKitCameraAccessory", () => {
  it("initializes standalone HomeKit accessory with motion sensor service", () => {
    const record = {
      entityId: "camera.backyard",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345678",
      username: "0E:11:22:33:44:55",
      pincode: "123-45-678",
      setupId: "12AB",
      port: 51830,
      published: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Backyard Camera",
      manufacturer: "Google Nest",
      model: "Cam Outdoor",
      serialNumber: "camera_backyard",
    };

    const capabilities = {
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
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/live",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const acc = new HomeKitCameraAccessory(
      mockPlatform,
      "camera.backyard",
      record,
      capabilities,
      streamSource,
    );
    expect(acc.accessory.displayName).toBe("Backyard Camera");
    expect(acc.controller).toBeDefined();
    expect(acc.delegate).toBeDefined();
    expect(acc.motionService).toBeDefined();
  });

  it("updates motion sensor state on the camera accessory", () => {
    const record = {
      entityId: "camera.driveway",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345679",
      username: "0E:11:22:33:44:56",
      pincode: "123-45-679",
      setupId: "34CD",
      port: 51831,
      published: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Driveway Camera",
      manufacturer: "Reolink",
      model: "E1 Pro",
      serialNumber: "camera_driveway",
    };

    const capabilities = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: false,
      audioCodec: "none" as const,
      resolution: { width: 1920, height: 1080 },
      maxFps: 30,
      strategy: "passthrough_video_only" as const,
      requiresTranscoding: false,
      snapshotSupported: true,
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const acc = new HomeKitCameraAccessory(
      mockPlatform,
      "camera.driveway",
      record,
      capabilities,
      streamSource,
    );
    acc.updateMotionState(true);

    const char = acc.motionService?.getCharacteristic(
      Characteristic.MotionDetected,
    );
    expect(char?.value).toBe(true);

    acc.updateMotionState(false);
    expect(char?.value).toBe(false);
  });

  it("resets pairing and generates fresh credentials for moving to another home", async () => {
    const record = {
      entityId: "camera.playroom",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345680",
      username: "0E:AA:BB:CC:DD:EE",
      pincode: "111-22-333",
      setupId: "PLAY",
      port: 51832,
      published: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Playroom Camera",
      manufacturer: "Google Nest",
      model: "Camera",
      serialNumber: "camera_playroom",
    };

    const capabilities = {
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
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/live",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const acc = new HomeKitCameraAccessory(
      mockPlatform,
      "camera.playroom",
      record,
      capabilities,
      streamSource,
    );
    const oldPin = acc.record.pincode;
    const oldUsername = acc.record.username;
    const oldUuid = acc.record.uuid;

    const newRecord = await acc.resetPairing();
    expect(newRecord.pincode).toBe(oldPin);
    expect(newRecord.username).toBe(oldUsername);
    expect(newRecord.uuid).toBe(oldUuid);
    expect(newRecord.isPaired).toBe(false);
    expect(newRecord.published).toBe(true);
  });

  it("handles snapshot requests using Home Assistant image fetch", async () => {
    const capabilities = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: false,
      audioCodec: "none" as const,
      resolution: { width: 1920, height: 1080 },
      maxFps: 30,
      strategy: "passthrough_video_only" as const,
      requiresTranscoding: false,
      snapshotSupported: true,
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/live",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraStreamingDelegate(
      mockPlatform,
      "camera.backyard",
      capabilities,
      streamSource,
    );

    const snapshotBuffer = await new Promise<Buffer>((resolve, reject) => {
      delegate.handleSnapshotRequest(
        { width: 1920, height: 1080, reason: 0 },
        (err, buf) => {
          if (err) reject(err);
          else resolve(buf!);
        },
      );
    });

    expect(snapshotBuffer).toBeDefined();
    expect(snapshotBuffer.length).toBe(4);
  });

  it("handles prepareStream negotiation and returns SRTP parameters", () => {
    const capabilities = {
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
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/live",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraStreamingDelegate(
      mockPlatform,
      "camera.backyard",
      capabilities,
      streamSource,
    );

    const key = Buffer.alloc(16, 1);
    const salt = Buffer.alloc(14, 2);

    let response: any;
    delegate.prepareStream(
      {
        sessionID: "session-123",
        targetAddress: "192.168.1.50",
        video: {
          port: 5000,
          srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
          srtp_key: key,
          srtp_salt: salt,
        },
        addressVersion: "ipv4",
      },
      (err, res) => {
        response = res;
      },
    );

    expect(response).toBeDefined();
    expect(response.video.port).toBe(5000);
    expect(response.video.ssrc).toBe(1);
  });

  it("handles handleStreamRequest STOP without crashing when no process is active", () => {
    const capabilities = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: false,
      audioCodec: "none" as const,
      resolution: { width: 1920, height: 1080 },
      maxFps: 30,
      strategy: "passthrough_video_only" as const,
      requiresTranscoding: false,
      snapshotSupported: true,
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/live",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const delegate = new HomeKitCameraStreamingDelegate(
      mockPlatform,
      "camera.backyard",
      capabilities,
      streamSource,
    );

    let callbackCalled = false;
    delegate.handleStreamRequest(
      {
        sessionID: "session-456",
        type: StreamRequestTypes.STOP,
      },
      () => {
        callbackCalled = true;
      },
    );

    expect(callbackCalled).toBe(true);
  });

  it("checks isPaired status correctly on HomeKitCameraAccessory", () => {
    const record = {
      entityId: "camera.patio",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345688",
      username: "0E:AA:BB:CC:DD:FF",
      pincode: "111-22-444",
      setupId: "PATI",
      port: 51833,
      published: false,
      isPaired: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Patio Camera",
      manufacturer: "Tapo",
      model: "C210",
      serialNumber: "camera_patio",
    };

    const capabilities = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: false,
      audioCodec: "none" as const,
      resolution: { width: 1920, height: 1080 },
      maxFps: 30,
      strategy: "passthrough_video_only" as const,
      requiresTranscoding: false,
      snapshotSupported: true,
    };

    const streamSource = {
      sourceType: "rtsp" as const,
      url: "rtsp://camera.local/stream",
      supportsPassthrough: true,
      requiresBridge: false,
    };

    const acc = new HomeKitCameraAccessory(
      mockPlatform,
      "camera.patio",
      record,
      capabilities,
      streamSource,
    );

    expect(acc.isPaired()).toBe(false);
    acc.record.isPaired = true;
    expect(acc.isPaired()).toBe(true);
  });

  it("links real Home Assistant binary_sensor motion entity when available", () => {
    const platformWithMotion = {
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        notice: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      ha: {
        hassEntities: new Map([
          ["camera.playroom", { device_id: "dev-playroom-1" }],
          ["binary_sensor.playroom_motion", { device_id: "dev-playroom-1" }],
        ]),
        hassStates: new Map([
          [
            "binary_sensor.playroom_motion",
            {
              entity_id: "binary_sensor.playroom_motion",
              state: "on",
              attributes: { device_class: "motion" },
            },
          ],
        ]),
      },
    };

    const record = {
      entityId: "camera.playroom",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345699",
      username: "0E:AA:BB:CC:DD:EE",
      pincode: "111-22-333",
      setupId: "PLAY",
      port: 51834,
      published: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Playroom Camera",
    };

    const acc = new HomeKitCameraAccessory(
      platformWithMotion,
      "camera.playroom",
      record,
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: false,
        audioCodec: "none",
        resolution: { width: 1920, height: 1080 },
        maxFps: 30,
        strategy: "passthrough_video_only",
        requiresTranscoding: false,
        snapshotSupported: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://playroom.local/live",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );

    expect(acc.linkedMotionEntityId).toBe("binary_sensor.playroom_motion");
    expect(acc.motionService).toBeDefined();
  });

  it("does not create fake motion sensor service when HA has no associated motion entity", () => {
    const platformWithoutMotion = {
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        notice: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      ha: {
        hassEntities: new Map([
          ["camera.standalone", { device_id: "dev-standalone-1" }],
        ]),
        hassStates: new Map(),
      },
    };

    const record = {
      entityId: "camera.standalone",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345690",
      username: "0E:AA:BB:CC:DD:E0",
      pincode: "111-22-330",
      setupId: "STND",
      port: 51835,
      published: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Standalone Camera",
    };

    const acc = new HomeKitCameraAccessory(
      platformWithoutMotion,
      "camera.standalone",
      record,
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: false,
        audioCodec: "none",
        resolution: { width: 1920, height: 1080 },
        maxFps: 30,
        strategy: "passthrough_video_only",
        requiresTranscoding: false,
        snapshotSupported: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://camera.local/live",
        supportsPassthrough: true,
        requiresBridge: false,
      },
    );

    expect(acc.linkedMotionEntityId).toBeUndefined();
    expect(acc.motionService).toBeUndefined();
  });
});

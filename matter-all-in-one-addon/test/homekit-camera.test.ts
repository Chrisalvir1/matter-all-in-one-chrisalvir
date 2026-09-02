import { describe, expect, it, vi } from "vitest";
import {
  Characteristic,
  SRTPCryptoSuites,
  StreamRequestTypes,
} from "hap-nodejs";
import { HomeKitCameraAccessory } from "../src/camera/homekit/homekit-camera.accessory.js";
import { HomeKitCameraStreamingDelegate } from "../src/camera/homekit/homekit-camera-stream.delegate.js";

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
    const source = { ...rtspSource, metadata: { validationStatus: "verified" } };
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
});

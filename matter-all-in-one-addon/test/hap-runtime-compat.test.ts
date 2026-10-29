import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { createCipheriv } from "node:crypto";
import {
  Accessory,
  AccessoryInfo,
  CameraController,
  Characteristic,
  HAPStorage,
  SecureVideoController,
  Service,
  uuid,
  type CameraControllerOptions,
} from "@homebridge/hap-nodejs";
import {
  NativeChaCha20Poly1305Provider,
  PortableChaCha20Poly1305Provider,
} from "@homebridge/hap-nodejs/dist/lib/util/hapCrypto.js";
import { ControllerStorage } from "@homebridge/hap-nodejs/dist/lib/model/ControllerStorage.js";
const fixture = JSON.parse(
  readFileSync(
    new URL("fixtures/hap-upstream-223.json", import.meta.url),
    "utf8",
  ),
);
const directory = mkdtempSync(join(tmpdir(), "miao-hap-compat-"));
beforeAll(() => {
  HAPStorage.setCustomStoragePath(directory);
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function recording() {
  return {
    updateRecordingActive() {},
    updateRecordingConfiguration() {},
    async *handleRecordingStreamRequest() {},
    closeRecordingStream() {},
  };
}
function classic() {
  return new CameraController({
    cameraStreamCount: 1,
    delegate: {
      prepareStream() {},
      handleStreamRequest() {},
      handleSnapshotRequest() {},
    },
    streamingOptions: {
      supportedCryptoSuites: [0],
      video: {
        codec: { profiles: [0], levels: [0] },
        resolutions: [[640, 360, 15]],
      },
    },
    recording: {
      delegate: recording(),
      options: {
        prebufferLength: 8000,
        mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
        video: {
          type: 0,
          parameters: { profiles: [0], levels: [0] },
          resolutions: [[640, 360, 15]],
        },
        audio: { codecs: { type: 0, audioChannels: 1, samplerate: [5] } },
      },
    },
    sensors: { motion: true },
  } as CameraControllerOptions);
}
describe("production Secure Video HAP runtime compatibility", () => {
  it("loads the deterministic local dependency rather than the old symlink runtime", () => {
    const require = createRequire(import.meta.url);
    const p = require("@homebridge/hap-nodejs/package.json");
    expect(p.version).toBe("2.2.3-homekit4k.2");
    expect(require.resolve("@homebridge/hap-nodejs")).toContain(
      "vendor/hap-nodejs",
    );
  });
  it("constructs classic H264 recording/motion and restores the upstream controller fixture", () => {
    const controller = classic();
    const accessory = new Accessory("Fixture", fixture.uuid);
    try {
      accessory.configureController(controller);
      controller.deserialize(fixture.controller);
      expect(controller.serialize()).toEqual(fixture.controller);
      expect(accessory.UUID).toBe(fixture.uuid);
      expect(controller.recordingManagement).toBeDefined();
      expect(
        accessory.getService(Service.CameraRecordingManagement),
      ).toBeDefined();
      expect(
        accessory.getService(Service.DataStreamTransportManagement),
      ).toBeDefined();
      expect(accessory.getService(Service.MotionSensor)).toBeDefined();
    } finally {
      accessory.removeController(controller);
    }
  });
  it("loads and saves upstream AccessoryInfo without changing pairing, username, PIN or keys", () => {
    const key = AccessoryInfo.persistKey(fixture.username);
    HAPStorage.storage().setItemSync(key, fixture.accessoryInfo);
    const info = AccessoryInfo.load(fixture.username)!;
    expect(info.username).toBe(fixture.username);
    expect(info.pincode === fixture.accessoryInfo.pincode).toBe(true);
    expect(info.setupID).toBe(fixture.accessoryInfo.setupID);
    expect(info.paired()).toBe(true);
    expect(info.hasAdminPermissions("synthetic-controller")).toBe(true);
    expect(
      info.signSk.equals(Buffer.from(fixture.accessoryInfo.signSk, "hex")),
    ).toBe(true);
    info.save();
    const saved = HAPStorage.storage().getItem(key);
    expect(
      JSON.stringify(saved) === JSON.stringify(fixture.accessoryInfo),
    ).toBe(true);
  });
  it("restores the legacy ControllerStorage envelope without purging the camera settings", () => {
    const id = uuid.generate("isolated-controller-storage");
    const accessory = new Accessory("Fixture", id),
      controller = classic();
    const expected = structuredClone(fixture.controller);
    expected.streamManagements[0].active = false;
    const key = ControllerStorage.persistKey("02:00:00:00:23:01");
    HAPStorage.storage().setItemSync(key, {
      accessories: {
        [id]: [
          {
            type: controller.controllerId(),
            controllerData: { data: expected },
          },
        ],
      },
    });
    try {
      accessory.configureController(controller);
      accessory.controllerStorage.load("02:00:00:00:23:01");
      expect(controller.serialize()).toEqual(expected);
      accessory.controllerStorage.save();
      const saved = HAPStorage.storage().getItem(key);
      expect(saved.accessories[id][0].controllerData.data).toEqual(expected);
    } finally {
      accessory.removeController(controller);
    }
  });
  it("configures real Secure Video services and serializes/restores state without advertising talkback or CMAF", () => {
    const unavailable = async () => {
      throw new Error("not a media session");
    };
    const controller = new SecureVideoController({
      sensor: { uuid: uuid.generate("test-sensor"), width: 1920, height: 1080 },
      video: {
        codec: 2,
        tiers: [
          {
            identifier: 1,
            quality: 2,
            width: 1920,
            height: 1080,
            frameRate: 15,
            targetAverageBitrate: 1800,
            peakBitrate: 2000,
          },
        ],
      },
      audio: {
        twoWayAudio: false,
        tier: {
          identifier: 1,
          targetAverageBitrate: 24000,
          sampleRate: 4,
          bitDepth: 2,
          packetTime: 20,
          channels: 1,
        },
      },
      rtp: {
        delegate: {
          prepareStream: unavailable,
          startStream: async () => {},
          stopStream: async () => {},
        },
      },
      webrtc: {
        maxSessions: 6,
        delegate: {
          handleSolicitOffer: unavailable,
          handleProvideAnswer: async () => {},
          handleReoffer: unavailable,
          handleUpdateSession: async () => {},
          handleEndSession: async () => {},
        },
      },
      recording: {
        delegate: recording(),
        options: {
          prebufferLength: 8000,
          mediaContainerConfiguration: { type: 0, fragmentLength: 4000 },
          video: {
            type: 0,
            parameters: { profiles: [1], levels: [0, 1, 2] },
            resolutions: [[1920, 1080, 15]],
          },
          audio: { codecs: { type: 0, audioChannels: 1, samplerate: [5] } },
        },
      },
      snapshot: async () => Buffer.from([255, 216, 255, 217]),
    });
    const accessory = new Accessory(
      "Secure fixture",
      uuid.generate("secure-fixture"),
    );
    try {
      accessory.configureController(controller);
      for (const service of [
        Service.CameraOperatingMode,
        Service.CameraWebRTCStreamManagement,
        Service.CameraMultiTierRTPStreamManagement,
        Service.DataStreamTransportManagement,
      ])
        expect(accessory.getService(service)).toBeDefined();
      expect(accessory.getService(Service.Speaker)).toBeUndefined();
      accessory
        .getService(Service.CameraWebRTCStreamManagement)!
        .getCharacteristic(Characteristic.StreamingEnabled)
        .updateValue(false);
      const saved = controller.serialize()!;
      controller.deserialize(saved);
      expect(controller.serialize()).toEqual(saved);
      expect((controller as any).options.ingest).toBeUndefined();
    } finally {
      accessory.removeController(controller);
    }
  });
  it.each([NativeChaCha20Poly1305Provider, PortableChaCha20Poly1305Provider])(
    "preserves standard authenticated HAP crypto with independent node:crypto bytes (%s)",
    (Provider) => {
      const key = Buffer.alloc(32, 3),
        nonce = Buffer.alloc(12, 7),
        aad = Buffer.from([8, 0]),
        message = Buffer.from("deterministic HAP transport vector");
      const cipher = createCipheriv("chacha20-poly1305", key, nonce, {
        authTagLength: 16,
      });
      cipher.setAAD(aad, { plaintextLength: message.length });
      const expected = Buffer.concat([cipher.update(message), cipher.final()]);
      const tag = cipher.getAuthTag();
      const provider = new Provider();
      const encrypted = provider.seal(key, nonce, aad, message);
      expect(encrypted.ciphertext.equals(expected)).toBe(true);
      expect(encrypted.authTag.equals(tag)).toBe(true);
      expect(
        provider.open(key, nonce, aad, expected, tag).equals(message),
      ).toBe(true);
      const bad = Buffer.from(tag);
      bad[0] ^= 1;
      expect(() => provider.open(key, nonce, aad, expected, bad)).toThrow();
    },
  );
});

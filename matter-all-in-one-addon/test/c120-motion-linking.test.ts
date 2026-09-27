import { describe, expect, it, vi } from "vitest";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import { HomeKitCameraAccessory } from "../src/camera/homekit/homekit-camera.accessory.js";

function createMockPlatform(hasDeviceIdMatch = true) {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      notice: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    matterbridge: { matterbridgeVersion: "1.9.7" },
    ha: {
      hassEntities: new Map([
        ["camera.tapo_c120", { device_id: "dev-camera-c120" }],
        [
          "binary_sensor.tapo_c120_celda_de_movimiento",
          {
            device_id: hasDeviceIdMatch
              ? "dev-camera-c120"
              : "dev-tapo-integration",
          },
        ],
      ]),
      hassStates: new Map([
        [
          "camera.tapo_c120",
          {
            entity_id: "camera.tapo_c120",
            state: "streaming",
            attributes: {
              friendly_name: "Cámara Tapo C120 Patio",
              stream_source: "rtsp://192.168.1.100:554/stream1",
            },
          },
        ],
        [
          "binary_sensor.tapo_c120_celda_de_movimiento",
          {
            entity_id: "binary_sensor.tapo_c120_celda_de_movimiento",
            state: "off",
            attributes: {
              device_class: "motion",
              friendly_name: "Tapo C120 Celda de Movimiento",
            },
          },
        ],
      ]),
    },
    saveHomeKitCameraRecords: vi.fn(),
  };
}

describe("Tapo C120 Motion Sensor Linking & HKSV Triggering (v1.9.7)", () => {
  it("automatically discovers linked motion sensor for C120 with matching device_id", () => {
    const platform = createMockPlatform(true);
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        hksvEnabled: true,
      } as any,
      {
        hasLiveStream: true,
        videoCodec: "h264",
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100:554/stream1",
      } as any,
    );

    expect(acc.linkedMotionEntityId).toBe(
      "binary_sensor.tapo_c120_celda_de_movimiento",
    );
    expect(acc.motionService).toBeDefined();
    expect(
      acc.motionService?.getCharacteristic(Characteristic.MotionDetected),
    ).toBeDefined();
  });

  it("automatically links C120 motion sensor across integrations when device_id differs", () => {
    const platform = createMockPlatform(false); // different device_id
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        hksvEnabled: true,
      } as any,
      {
        hasLiveStream: true,
        videoCodec: "h264",
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100:554/stream1",
      } as any,
    );

    expect(acc.linkedMotionEntityId).toBe(
      "binary_sensor.tapo_c120_celda_de_movimiento",
    );
    expect(acc.motionService).toBeDefined();
  });

  it("ensures MotionSensor service is created even if motion sensor arrived after camera initialization", () => {
    const platform = {
      log: {
        debug: vi.fn(),
        info: vi.fn(),
        notice: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      matterbridge: { matterbridgeVersion: "1.9.7" },
      ha: { hassEntities: new Map(), hassStates: new Map() },
      saveHomeKitCameraRecords: vi.fn(),
    };

    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        hksvEnabled: true,
      } as any,
      {
        hasLiveStream: true,
        videoCodec: "h264",
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.100:554/stream1",
      } as any,
    );

    // C120 always has motionService created because isC120 / hksvEnabled is true
    expect(acc.motionService).toBeDefined();

    // Triggering motion state updates Characteristic.MotionDetected
    const spyUpdateChar = vi.spyOn(acc.motionService!, "updateCharacteristic");
    const spyRecordingMotion = vi.spyOn(
      acc.recordingDelegate!,
      "handleMotionDetected",
    );

    acc.updateMotionState(true);

    expect(spyUpdateChar).toHaveBeenCalledWith(
      Characteristic.MotionDetected,
      true,
    );
    expect(spyRecordingMotion).toHaveBeenCalledWith(true);

    acc.updateMotionState(false);
    expect(spyUpdateChar).toHaveBeenCalledWith(
      Characteristic.MotionDetected,
      false,
    );
    expect(spyRecordingMotion).toHaveBeenCalledWith(false);
  });
});

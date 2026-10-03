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

  it("advertises a complete standard resolution ladder for C120 including 2K 2560x1440 capped at 20 fps", () => {
    const platform = createMockPlatform(true);
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
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

    const ladder = acc.buildDeclaredResolutions();
    expect(ladder.length).toBeGreaterThanOrEqual(4);
    expect(ladder).toContainEqual([2560, 1440, 20]);
    expect(ladder).toContainEqual([1920, 1080, 20]);
    expect(ladder).toContainEqual([1280, 720, 20]);
    expect(ladder).toContainEqual([640, 360, 20]);
    expect(ladder).toContainEqual([320, 180, 20]);
    // Ensure all resolutions are capped at max 20 fps (physical hardware ceiling)
    for (const [w, h, fps] of ladder) {
      expect(fps).toBeLessThanOrEqual(20);
    }
  });

  it("identifies Tapo C120 with alias TAPO-SPOT and Tapo C402 with alias TAPO-FRENTE DE CALLE", () => {
    const platform = createMockPlatform(true);
    const accSpot = new HomeKitCameraAccessory(
      platform as any,
      "camera.cameraui_spot",
      {
        entityId: "camera.cameraui_spot",
        name: "TAPO-SPOT",
        model: "C120",
      } as any,
      {
        hasLiveStream: true,
        videoCodec: "h264",
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.110.147:8554/tapo_c120",
      } as any,
    );
    expect(accSpot.isTapoC120()).toBe(true);

    const accFrente = new HomeKitCameraAccessory(
      platform as any,
      "camera.cameraui_frente",
      {
        entityId: "camera.cameraui_frente",
        name: "TAPO-FRENTE DE CALLE",
        model: "Tapo C402",
      } as any,
      {
        hasLiveStream: true,
        videoCodec: "h264",
        resolution: { width: 2560, height: 1440 },
        maxFps: 30,
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.110.147:62291/tapo-c402",
      } as any,
    );
    expect(accFrente.isTapoC402()).toBe(true);
  });
});

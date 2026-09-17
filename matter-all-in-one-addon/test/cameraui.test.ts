import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { CameraUiClient } from "../src/camera/cameraui/cameraui-client.js";
import { CameraUiStorage } from "../src/camera/cameraui/cameraui-storage.js";
import { CameraUiHomeKitBridge } from "../src/camera/cameraui/cameraui-homekit-bridge.js";
import type { CameraUiCameraRecord } from "../src/camera/cameraui/cameraui-types.js";

describe("Camera.UI Client and Storage Integration", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("testConnection returns ok: true when /api/cameras returns 200", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ version: "5.0.27" }),
    } as any);

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "http://192.168.1.50:8181",
    });

    const res = await client.testConnection();
    expect(res.ok).toBe(true);
    expect(res.version).toBe("5.0.27");
  });

  it("testConnection returns ok: false when endpoint fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "http://192.168.1.50:8181",
    });

    const res = await client.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toContain("No se pudo contactar a Camera.UI");
  });

  it("fetchCameras correctly parses camera array with videoConfig and RTSP restream", async () => {
    const mockCameraUiResponse = [
      {
        name: "Entrada Principal",
        videoConfig: {
          source: "-i rtsp://admin:secret@192.168.1.120:554/h264Preview_01_main",
          stillImageSource: "-i http://192.168.1.120/snapshot.jpg",
          maxWidth: 2560,
          maxHeight: 1440,
          maxFPS: 30,
          audio: true,
        },
        smtp: { email: "frontdoor@example.com" },
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCameraUiResponse,
    } as any);

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "http://192.168.1.50:8181",
    });

    const cameras = await client.fetchCameras();
    expect(cameras.length).toBe(1);
    const cam = cameras[0];
    expect(cam.name).toBe("Entrada Principal");
    expect(cam.id).toBe("cameraui_entrada_principal");
    expect(cam.rtspUrl).toContain("rtsp://admin:secret@192.168.1.120:554/h264Preview_01_main");
    expect(cam.width).toBe(2560);
    expect(cam.height).toBe(1440);
    expect(cam.hasAudio).toBe(true);
    expect(cam.homeKitEnabled).toBe(true);
  });

  it("mergeDiscoveredCameras preserves existing pairing settings (port, setupId, PIN, paired state)", async () => {
    const existingCam: CameraUiCameraRecord = {
      id: "patio_trasero",
      name: "Patio Trasero",
      rtspUrl: "rtsp://192.168.1.121:554/stream1",
      port: 51877,
      username: "0E:AA:BB:CC:DD:EE",
      pincode: "031-45-154",
      setupId: "WXYZ",
      uuid: "uuid-existing-12345",
      isPaired: true,
      homeKitEnabled: true,
    };

    const dummyStore = {
      config: {
        enabled: true,
        serverUrl: "http://192.168.1.50:8181",
        mqttEnabled: true,
      },
      cameras: [existingCam],
    };

    vi.spyOn(CameraUiStorage, "load").mockResolvedValue(dummyStore as any);
    const saveSpy = vi.spyOn(CameraUiStorage, "save").mockResolvedValue();

    const freshlyDiscovered: CameraUiCameraRecord[] = [
      {
        id: "patio_trasero",
        name: "Patio Trasero Actualizado",
        rtspUrl: "rtsp://192.168.1.121:554/stream1_hq",
        width: 1920,
        height: 1080,
        hasAudio: true,
      },
    ];

    const result = await CameraUiStorage.mergeDiscoveredCameras(freshlyDiscovered);
    expect(result.cameras.length).toBe(1);
    const merged = result.cameras[0];
    // Preserved HAP pairing credentials
    expect(merged.port).toBe(51877);
    expect(merged.username).toBe("0E:AA:BB:CC:DD:EE");
    expect(merged.pincode).toBe("031-45-154");
    expect(merged.setupId).toBe("WXYZ");
    expect(merged.isPaired).toBe(true);
    // Updated stream URL
    expect(merged.rtspUrl).toBe("rtsp://192.168.1.121:554/stream1_hq");
    expect(saveSpy).toHaveBeenCalled();
  });
});

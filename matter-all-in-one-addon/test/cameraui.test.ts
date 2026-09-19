import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  CameraUiClient,
  isCameraStreamReachable,
} from "../src/camera/cameraui/cameraui-client.js";
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
    expect(res.message).toContain("No se pudo conectar a Camera.UI");
  });

  it("fetchCameras correctly parses camera array with videoConfig and RTSP restream", async () => {
    const mockCameraUiResponse = [
      {
        name: "Entrada Principal",
        videoConfig: {
          source:
            "-i rtsp://admin:secret@192.168.1.120:554/h264Preview_01_main",
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
    expect(cam.rtspUrl).toContain(
      "rtsp://admin:secret@192.168.1.120:554/h264Preview_01_main",
    );
    expect(cam.width).toBe(2560);
    expect(cam.height).toBe(1440);
    expect(cam.hasAudio).toBe(true);
    expect(cam.homeKitEnabled).toBe(true);
  });

  it("authenticates via POST /api/auth/login and sends Bearer token on subsequent requests", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, opts?: any) => {
        if (url.endsWith("/api/auth/login")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              access_token: "mock-jwt-token-xyz",
              access_token_expires_at: 9999999999,
            }),
          };
        }
        if (url.endsWith("/api/cameras")) {
          if (opts?.headers?.Authorization === "Bearer mock-jwt-token-xyz") {
            return {
              ok: true,
              status: 200,
              json: async () => [{ name: "Living Room", id: "cam_1" }],
            };
          }
          return {
            ok: false,
            status: 401,
            json: async () => ({ statusCode: 401 }),
          };
        }
        return { ok: false, status: 404 };
      });

    global.fetch = fetchMock;

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
      username: "admin",
      password: "secretpassword",
      allowSelfSignedCertificate: true,
    });

    const res = await client.testConnection();
    expect(res.ok).toBe(true);
    expect(res.message).toContain("Conexión exitosa");
    expect(res.message).toContain("1 cámara detectada");
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");
  });

  it("handles authentication failure when credentials are wrong", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/login")) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ statusCode: 403, message: "Forbidden" }),
        };
      }
      return { ok: false, status: 404 };
    });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
      username: "admin",
      password: "wrongpassword",
      allowSelfSignedCertificate: true,
    });

    const res = await client.testConnection();
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Credenciales incorrectas");
  });

  it("fetchCameras parses modern Camera.UI schema with sources array and roles", async () => {
    const modernCameraList = [
      {
        name: "Jardin Exterior",
        uuid: "cui_gardencam_01",
        sources: [
          {
            role: "high-resolution",
            urls: [
              "rtsp://admin:pass@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0",
            ],
            muted: false,
            useForSnapshot: false,
          },
          {
            role: "mid-resolution",
            urls: [
              "rtsp://admin:pass@192.168.1.100:554/cam/realmonitor?channel=1&subtype=1",
            ],
          },
          {
            role: "snapshot",
            urls: ["http://192.168.1.100/snapshot.jpg"],
          },
        ],
        mqtt: {
          motionTopic: "camera.ui/jardin/motion",
          doorbellTopic: "camera.ui/jardin/doorbell",
        },
      },
    ];

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/api/cameras")) {
        return {
          ok: true,
          json: async () => modernCameraList,
        };
      }
      return { ok: false, status: 404 };
    });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
      allowSelfSignedCertificate: true,
    });

    const cameras = await client.fetchCameras();
    expect(cameras.length).toBe(1);
    const cam = cameras[0];
    expect(cam.name).toBe("Jardin Exterior");
    expect(cam.id).toBe("cameraui_cui_gardencam_01");
    expect(cam.rtspUrl).toBe(
      "rtsp://admin:pass@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0",
    );
    expect(cam.subRtspUrl).toBe(
      "rtsp://admin:pass@192.168.1.100:554/cam/realmonitor?channel=1&subtype=1",
    );
    expect(cam.snapshotUrl).toBe("http://192.168.1.100/snapshot.jpg");
    expect(cam.hasAudio).toBe(true);
    expect(cam.motionTopic).toBe("camera.ui/jardin/motion");
    expect(cam.doorbellTopic).toBe("camera.ui/jardin/doorbell");
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

    const result =
      await CameraUiStorage.mergeDiscoveredCameras(freshlyDiscovered);
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

  it("keeps an exported paired camera when a Camera.UI sync is partial", async () => {
    const pairedCamera: CameraUiCameraRecord = {
      id: "garage",
      name: "Garage",
      rtspUrl: "rtsp://camera.local:554/main",
      port: 51878,
      uuid: "garage-hap-uuid",
      isPaired: true,
      homeKitEnabled: true,
    };
    const discoveredCamera: CameraUiCameraRecord = {
      id: "front-door",
      name: "Front Door",
      rtspUrl: "rtsp://camera.local:554/front-door",
      homeKitEnabled: true,
    };
    const store = {
      config: { enabled: true },
      cameras: [pairedCamera, discoveredCamera],
    };

    vi.spyOn(CameraUiStorage, "load").mockResolvedValue(store as any);
    vi.spyOn(CameraUiStorage, "save").mockResolvedValue();

    const result = await CameraUiStorage.mergeDiscoveredCameras([
      discoveredCamera,
    ]);

    expect(result.cameras).toHaveLength(2);
    expect(
      result.cameras.find((camera) => camera.id === "garage"),
    ).toMatchObject({
      rtspUrl: "rtsp://camera.local:554/main",
      port: 51878,
      uuid: "garage-hap-uuid",
      isPaired: true,
    });
  });

  it("does not republish an idle paired HAP accessory during a Camera.UI refresh", async () => {
    const accessory = {
      isStreaming: false,
      unpublish: vi.fn(),
    };
    const accessories = (CameraUiHomeKitBridge as any).activeAccessories as Map<
      string,
      unknown
    >;
    accessories.set("paired-camera", accessory);

    try {
      const result = await CameraUiHomeKitBridge.mountCamera(
        {},
        {
          id: "paired-camera",
          name: "Paired Camera",
          rtspUrl: "rtsp://camera.local:554/main",
          homeKitEnabled: true,
          isPaired: true,
        },
      );

      expect(result).toBe(accessory);
      expect(accessory.unpublish).not.toHaveBeenCalled();
    } finally {
      accessories.delete("paired-camera");
    }
  });

  it("fetchCameras parses Camera.UI v5 { result: [...] } and replaces localhost in stream URLs", async () => {
    const cameraUiV5Response = {
      result: [
        {
          _id: "660c1d2e3f4a5b6c7d8e9f01",
          name: "Camara Patio 2K",
          room: "Exterior",
          sources: [
            {
              name: "high",
              role: "high-resolution",
              urls: ["rtsp://localhost:8554/camara_patio_2k"],
              muted: false,
            },
            {
              name: "sub",
              role: "mid-resolution",
              urls: ["rtsp://127.0.0.1:8554/camara_patio_2k_sub"],
            },
          ],
          info: {
            manufacturer: "Reolink",
            model: "RLC-810A",
            serialNumber: "95270001",
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: -1,
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/cameras")) {
        return {
          ok: true,
          json: async () => cameraUiV5Response,
        };
      }
      return { ok: false, status: 404 };
    });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
      allowSelfSignedCertificate: true,
    });

    const cameras = await client.fetchCameras();
    expect(cameras.length).toBe(1);
    const cam = cameras[0];
    expect(cam.name).toBe("Camara Patio 2K");
    expect(cam.id).toBe("cameraui_660c1d2e3f4a5b6c7d8e9f01");
    expect(cam.manufacturer).toBe("Reolink");
    expect(cam.model).toBe("RLC-810A");
    expect(cam.serialNumber).toBe("95270001");
    // Localhost must be substituted by the server host (192.168.110.147)
    expect(cam.rtspUrl).toBe("rtsp://192.168.110.147:8554/camara_patio_2k");
    expect(cam.subRtspUrl).toBe(
      "rtsp://192.168.110.147:8554/camara_patio_2k_sub",
    );
  });

  it("fetchCameras parses dictionary schema from /api/config", async () => {
    const configResponse = {
      cameras: {
        entrada: {
          name: "Entrada",
          sources: [
            {
              role: "high-resolution",
              urls: ["rtsp://192.168.110.46:8554/entrada"],
            },
          ],
          info: {
            manufacturer: "Hikvision",
            model: "DS-2CD2043G2",
          },
        },
      },
    };

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/cameras")) {
        return { ok: false, status: 404 };
      }
      if (url.includes("/api/config")) {
        return {
          ok: true,
          json: async () => configResponse,
        };
      }
      return { ok: false, status: 404 };
    });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
      allowSelfSignedCertificate: true,
    });

    const cameras = await client.fetchCameras();
    expect(cameras.length).toBe(1);
    expect(cameras[0].name).toBe("Entrada");
    expect(cameras[0].manufacturer).toBe("Hikvision");
    expect(cameras[0].rtspUrl).toBe("rtsp://192.168.110.147:8554/entrada");
  });

  it("authenticates via tokens.access object shape", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/api/auth/login")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            tokens: {
              access: "mock-jwt-nested-token",
            },
          }),
        };
      }
      if (url.includes("/api/cameras")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: [{ _id: "cam-test-1", name: "Camera One" }],
          }),
        };
      }
      return { ok: false, status: 404 };
    });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
      username: "admin",
      password: "somepassword",
    });

    const res = await client.testConnection();
    expect(res.ok).toBe(true);
    expect(res.message).toContain("1 cámara detectada");
  });

  it("converts tapo:// URLs to standard RTSP stream1 endpoints", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("/api/cameras")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              _id: "tapo-c402-cam",
              name: "APO C402 Prueba Cam",
              videoConfig: {
                source: "tapo://admin:mypassword@192.168.110.150",
                maxWidth: 2560,
                maxHeight: 1440,
                maxFPS: 25,
              },
            },
          ],
        };
      }
      return { ok: false, status: 404 };
    });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "https://192.168.110.46:3543",
    });

    const cameras = await client.fetchCameras();
    expect(cameras.length).toBe(1);
    expect(cameras[0].rtspUrl).toBe(
      "rtsp://admin:mypassword@192.168.110.150:554/stream1",
    );
    expect(cameras[0].videoCodec).toBe("hevc");
    expect(cameras[0].strategy).toBe("passthrough_hevc");
  });

  it("CameraUiStorage.updateCamera modifies the specified camera and persists updates", async () => {
    const store = await CameraUiStorage.load();
    store.cameras = [
      {
        id: "cameraui_cam_test",
        name: "Test Camera",
        hasAudio: true,
        homeKitEnabled: true,
        status: "online",
        isPaired: false,
      },
    ];
    await CameraUiStorage.save(store);

    await CameraUiStorage.updateCamera("cam_test", (cam) => {
      cam.isPaired = true;
      cam.videoCodec = "hevc";
      return cam;
    });

    const updated = await CameraUiStorage.load();
    const found = updated.cameras.find((c) => c.id === "cameraui_cam_test");
    expect(found).toBeDefined();
    expect(found?.isPaired).toBe(true);
    expect(found?.videoCodec).toBe("hevc");
  });

  it("getCandidateUrls includes IPv4 127.0.0.1, localhost, and Home Assistant add-on hosts", () => {
    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "http://localhost:8181",
    });

    const candidates = client.getCandidateUrls();
    expect(candidates).toContain("http://localhost:8181");
    expect(candidates).toContain("http://127.0.0.1:8181");
    expect(candidates).toContain("https://192.168.110.46:3543");
    expect(candidates).toContain("http://a0d7b954-camera-ui:8181");
    expect(candidates).toContain("http://homeassistant:8181");
  });

  it("testConnection succeeds via HTTP Basic Auth even when /api/auth/login returns 404", async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(async (url: string, opts?: any) => {
        if (url.includes("/api/auth/login")) {
          return { ok: false, status: 404 };
        }
        if (url.includes("/api/cameras")) {
          const auth = opts?.headers?.Authorization || "";
          const expectedAuth = `Basic ${Buffer.from("myuser:mypassword").toString("base64")}`;
          if (auth === expectedAuth) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                version: "5.0.28",
                result: [{ id: "c1", name: "Patio" }],
              }),
            };
          }
          return { ok: false, status: 401 };
        }
        return { ok: false, status: 404 };
      });

    const client = new CameraUiClient({
      enabled: true,
      serverUrl: "http://127.0.0.1:8181",
      username: "myuser",
      password: "mypassword",
    });

    const res = await client.testConnection();
    expect(res.ok).toBe(true);
    expect(res.message).toContain("Conexión exitosa con Camera.UI");
    expect(res.message).toContain("1 cámara detectada");
  });

  it("updateConnectionStatus('disconnected') preserves camera online status", async () => {
    const store = await CameraUiStorage.load();
    store.cameras = [
      {
        id: "cameraui_living",
        name: "Living Room",
        status: "online",
        hasAudio: true,
        homeKitEnabled: true,
      },
    ];
    await CameraUiStorage.save(store);

    await CameraUiStorage.updateConnectionStatus(
      "disconnected",
      "Server restarting",
    );
    const reloaded = await CameraUiStorage.load();
    expect(reloaded.config.connectionStatus).toBe("disconnected");
    expect(reloaded.config.lastError).toBe("Server restarting");
    // Camera status must not be forcefully wiped to offline
    expect(reloaded.cameras[0].status).toBe("online");
  });

  it("isCameraStreamReachable returns false gracefully on invalid or unroutable URLs", async () => {
    const res1 = await isCameraStreamReachable("");
    expect(res1).toBe(false);

    const res2 = await isCameraStreamReachable("invalid-url-schema");
    expect(res2).toBe(false);

    // Reserved test IP that drops packets immediately
    const res3 = await isCameraStreamReachable(
      "rtsp://192.0.2.1:554/stream",
      50,
    );
    expect(res3).toBe(false);
  });
});

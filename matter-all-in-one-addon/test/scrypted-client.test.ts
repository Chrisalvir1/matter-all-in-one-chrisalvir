import { describe, expect, it, vi, beforeEach } from "vitest";
import { ScryptedClient } from "../src/camera/scrypted/scrypted-client.js";

describe("ScryptedClient — URL validation", () => {
  it("rejects empty URL", () => {
    expect(ScryptedClient.validateServerUrl("").valid).toBe(false);
  });

  it("rejects non-HTTP protocols", () => {
    expect(
      ScryptedClient.validateServerUrl("ftp://192.168.1.50:10443").valid,
    ).toBe(false);
    expect(
      ScryptedClient.validateServerUrl("rtsp://192.168.1.50:8554").valid,
    ).toBe(false);
    expect(ScryptedClient.validateServerUrl("file:///etc/passwd").valid).toBe(
      false,
    );
  });

  it("accepts valid http/https URLs", () => {
    expect(
      ScryptedClient.validateServerUrl("http://192.168.1.50:10443").valid,
    ).toBe(true);
    expect(
      ScryptedClient.validateServerUrl("https://scrypted.local:10443").valid,
    ).toBe(true);
  });

  it("normalizes URL by removing trailing slashes", () => {
    const result = ScryptedClient.validateServerUrl(
      "https://192.168.1.50:10443/",
    );
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe("https://192.168.1.50:10443");
  });

  it("strips embedded credentials from URL to prevent SSRF", () => {
    const result = ScryptedClient.validateServerUrl(
      "https://admin:secret@192.168.1.50:10443",
    );
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).not.toContain("secret");
    expect(result.normalizedUrl).not.toContain("admin:");
  });
});

describe("ScryptedClient — testConnection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns authentication_failed when username/password missing", async () => {
    const result = await ScryptedClient.testConnection(
      "https://192.168.1.50:10443",
      { authenticationMode: "username_password" },
      undefined,
      false,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("authentication_failed");
  });

  it("returns invalid_url for empty serverUrl", async () => {
    const result = await ScryptedClient.testConnection(
      "",
      { username: "admin", authenticationMode: "username_password" },
      "password123",
      false,
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("invalid_url");
  });

  it("classifies network error correctly", async () => {
    // Port 65432 should be closed — simulates network_error
    const result = await ScryptedClient.testConnection(
      "http://127.0.0.1:65432",
      { username: "admin", authenticationMode: "username_password" },
      "password",
      false,
    );
    expect(result.ok).toBe(false);
    expect(["network_error", "authentication_failed", "unknown"]).toContain(
      result.errorCode,
    );
    expect(result.message).toBeTruthy();
    // Message must never contain the password
    expect(result.message).not.toContain("password");
  });
});

describe("ScryptedClient — listCameras (mocked session)", () => {
  it("throws unsupported_api when systemManager is unavailable", async () => {
    const fakeSession = {
      sdk: {},
      connectedAt: new Date().toISOString(),
      serverUrl: "https://host",
      username: "admin",
    };
    await expect(ScryptedClient.listCameras(fakeSession)).rejects.toThrow(
      "unsupported_api",
    );
  });

  it("returns empty array when no camera devices found", async () => {
    const fakeSession = {
      sdk: {
        systemManager: {
          getSystemState: async () => ({
            dev1: {
              id: "dev1",
              name: "SmartLight",
              type: "Light",
              interfaces: ["OnOff"],
            },
          }),
        },
      },
      connectedAt: new Date().toISOString(),
      serverUrl: "https://host",
      username: "admin",
    };
    const cameras = await ScryptedClient.listCameras(fakeSession);
    expect(cameras).toHaveLength(0);
  });

  it("maps camera devices to CameraRecord with real fields, no hardcoded capabilities", async () => {
    const fakeSession = {
      sdk: {
        systemManager: {
          getSystemState: async () => ({
            cam1: {
              id: "cam1",
              name: "Entrada Principal",
              type: "Camera",
              interfaces: ["Camera", "VideoCamera", "MotionSensor"],
              info: {
                manufacturer: "Tapo",
                model: "C125",
                serialNumber: "SN-001",
              },
            },
          }),
        },
      },
      connectedAt: new Date().toISOString(),
      serverUrl: "https://host",
      username: "admin",
    };
    const cameras = await ScryptedClient.listCameras(fakeSession);
    expect(cameras).toHaveLength(1);
    const cam = cameras[0];
    expect(cam.cameraId).toBe("cam1");
    expect(cam.name).toBe("Entrada Principal");
    expect(cam.sourceManufacturer).toBe("Tapo");
    expect(cam.sourceModel).toBe("C125");
    expect(cam.displayManufacturer).toBe("Tapo");
    // Capabilities are NOT hardcoded
    expect(cam.capabilities.observed).toBeUndefined();
    // Stream is NOT assumed
    expect(cam.source.streamReference).toBeUndefined();
    // Status cache is 'unverified'
    expect(cam.status.cache).toBe("unverified");
    // Motion sensor detected from interfaces
    expect(cam.sensors.some((s) => s.type === "motion")).toBe(true);
    // Quality mode defaults
    expect(cam.capabilities.qualityMode).toBe("maximum_compatible");
    expect(cam.capabilities.allowAutomaticFallback).toBe(false);
  });

  it("camera without manufacturer uses 'Marca no identificada' as displayManufacturer", async () => {
    const fakeSession = {
      sdk: {
        systemManager: {
          getSystemState: async () => ({
            cam2: {
              id: "cam2",
              name: "Cámara Sin Datos",
              type: "Camera",
              interfaces: ["Camera", "VideoCamera"],
              info: {},
            },
          }),
        },
      },
      connectedAt: new Date().toISOString(),
      serverUrl: "https://host",
      username: "admin",
    };
    const cameras = await ScryptedClient.listCameras(fakeSession);
    expect(cameras[0].displayManufacturer).toBe("Marca no identificada");
    expect(cameras[0].sourceManufacturer).toBeUndefined();
  });

  it("camera with manufacturer but no model has displayModel undefined", async () => {
    const fakeSession = {
      sdk: {
        systemManager: {
          getSystemState: async () => ({
            cam3: {
              id: "cam3",
              name: "Ring Doorbell",
              type: "Camera",
              interfaces: ["Camera", "VideoCamera", "Doorbell"],
              info: { manufacturer: "Ring" },
            },
          }),
        },
      },
      connectedAt: new Date().toISOString(),
      serverUrl: "https://host",
      username: "admin",
    };
    const cameras = await ScryptedClient.listCameras(fakeSession);
    expect(cameras[0].displayManufacturer).toBe("Ring");
    expect(cameras[0].displayModel).toBeUndefined();
    expect(cameras[0].sensors.some((s) => s.type === "doorbell")).toBe(true);
  });

  it("correctly decodes Scrypted real systemState with { value: ... } property wrappers and key as device ID", async () => {
    const fakeSession = {
      sdk: {
        systemManager: {
          getSystemState: async () => ({
            "34": {
              interfaces: {
                value: ["Camera", "VideoCamera", "MotionSensor", "Doorbell"],
              },
              type: { value: "Camera" },
              name: { value: "Tapo C125 Sala" },
              info: { value: { manufacturer: "Tapo", model: "C125" } },
            },
            "99": {
              interfaces: { value: ["OnOff"] },
              type: { value: "Switch" },
              name: { value: "Enchufe Luces" },
            },
          }),
        },
      },
      connectedAt: new Date().toISOString(),
      serverUrl: "https://192.168.110.46:10443",
      username: "admin",
    };

    const cameras = await ScryptedClient.listCameras(fakeSession);
    expect(cameras).toHaveLength(1);
    expect(cameras[0].cameraId).toBe("34");
    expect(cameras[0].name).toBe("Tapo C125 Sala");
    expect(cameras[0].sourceManufacturer).toBe("Tapo");
    expect(cameras[0].sourceModel).toBe("C125");
    expect(cameras[0].displayManufacturer).toBe("Tapo");
    expect(cameras[0].displayModel).toBe("C125");
    expect(cameras[0].sensors.some((s) => s.type === "motion")).toBe(true);
    expect(cameras[0].sensors.some((s) => s.type === "doorbell")).toBe(true);
  });

  it("disconnect calls sdk.disconnect", async () => {
    const disconnectFn = vi.fn();
    const fakeSession = {
      sdk: { disconnect: disconnectFn },
      connectedAt: new Date().toISOString(),
      serverUrl: "https://host",
      username: "admin",
    };
    await ScryptedClient.disconnect(fakeSession);
    expect(disconnectFn).toHaveBeenCalledOnce();
  });
});

describe("ScryptedClient — probeRtspPort", () => {
  it("returns false for closed port", async () => {
    const result = await ScryptedClient.probeRtspPort("127.0.0.1", 65430, 300);
    expect(result).toBe(false);
  });
});

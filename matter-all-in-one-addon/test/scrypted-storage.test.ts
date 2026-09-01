import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ScryptedStorage } from "../src/camera/scrypted/scrypted-storage.js";
import type { CameraRecord } from "../src/camera/scrypted/scrypted-types.js";

describe("ScryptedStorage persistent cache suite", () => {
  const tempStorePath = path.join(
    os.tmpdir(),
    `test-store-${Date.now()}-${Math.random().toString(36).substring(7)}.json`,
  );

  beforeEach(async () => {
    ScryptedStorage.setStorePath(tempStorePath);
    try {
      await fs.unlink(tempStorePath);
    } catch {}
  });

  it("creates a valid default store structure when loaded initially", async () => {
    const store = await ScryptedStorage.load();
    expect(store.installation.installationId).toBeTruthy();
    expect(store.scrypted.connectionStatus).toBe("not_configured");
    expect(store.cameras.cameras).toEqual([]);
  });

  it("persists cameras and retrieves them accurately across reloads (Fast Boot)", async () => {
    const mockCamera: CameraRecord = {
      cameraId: "cam_101",
      sourceId: "scrypted_device_101",
      deviceId: "scrypted_device_101",
      name: "Cámara Entrada",
      model: "Tapo C125",
      enabled: true,
      identity: {
        matterPairingCode: "ABCD-1234-EFGH",
      },
      source: {
        kind: "scrypted",
        serverId: "srv_1",
        deviceId: "dev_101",
        streamReference: {
          protocol: "rtsp",
          directUrl: "rtsp://192.168.1.50:8554/cam101",
        },
      },
      capabilities: {
        observed: {
          videoCodec: "h264",
          resolution: { width: 1920, height: 1080 },
          hasAudio: true,
          audioCodec: "aac",
        },
      },
      sensors: [
        {
          sensorId: "sens_motion_101",
          type: "motion",
          name: "Movimiento Entrada",
          enabled: true,
          state: false,
        },
      ],
      exportConfig: {
        matterEnabled: true,
        homeKitEnabled: true,
        hksvEnabledByDefault: true,
        googleHomeEnabled: false,
        alexaEnabled: false,
        smartThingsEnabled: false,
        nasEnabled: false,
      },
      status: {
        connection: "online",
        cache: "unverified",
      },
    };

    await ScryptedStorage.updateCameras([mockCamera]);

    // Force re-load from disk to simulate add-on restart
    ScryptedStorage.setStorePath(tempStorePath);
    const reloaded = await ScryptedStorage.load();

    expect(reloaded.cameras.cameras.length).toBe(1);
    expect(reloaded.cameras.cameras[0].cameraId).toBe("cam_101");
    expect(reloaded.cameras.cameras[0].model).toBe("Tapo C125");
    expect(reloaded.cameras.cameras[0].name).toBe("Cámara Entrada");
    expect(reloaded.cameras.cameras[0].sensors[0].type).toBe("motion");
  });

  it("updates camera export configuration and NAS configurations cleanly", async () => {
    await ScryptedStorage.load();
    const mockCamera: CameraRecord = {
      cameraId: "cam_202",
      sourceId: "src_202",
      deviceId: "dev_202",
      name: "Cámara Garaje",
      model: "Aqara G3",
      enabled: true,
      identity: {},
      source: { kind: "scrypted", serverId: "srv_1", deviceId: "dev_202" },
      capabilities: {},
      sensors: [],
      exportConfig: {
        matterEnabled: true,
        homeKitEnabled: true,
        hksvEnabledByDefault: true,
        googleHomeEnabled: false,
        alexaEnabled: false,
        smartThingsEnabled: false,
        nasEnabled: false,
      },
      status: { connection: "online", cache: "unverified" },
    };
    await ScryptedStorage.updateCameras([mockCamera]);

    const updated = await ScryptedStorage.updateCameraExportConfig("cam_202", {
      matterEnabled: true,
      homeKitEnabled: true,
      hksvEnabledByDefault: true,
      googleHomeEnabled: true,
      alexaEnabled: false,
      smartThingsEnabled: false,
      nasEnabled: true,
    });
    expect(updated).toBe(true);

    await ScryptedStorage.updateCameraNasConfig("cam_202", {
      enabled: true,
      protocol: "smb",
      endpoint: "smb://nas.local/security",
      path: "/cameras/garaje",
      retentionDays: 14,
      maxSpaceGb: 200,
      format: "fmp4",
    });

    const current = ScryptedStorage.getStore();
    expect(current.cameras.cameras[0].exportConfig.googleHomeEnabled).toBe(
      true,
    );
    expect(current.cameras.cameras[0].exportConfig.nasEnabled).toBe(true);
    expect(current.nas?.["cam_202"]?.protocol).toBe("smb");
  });
});

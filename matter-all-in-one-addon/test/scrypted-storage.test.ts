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

  it("migrates schema v1 (tokenEncrypted) to v2 (credentials structure) and writes .bak", async () => {
    const v1Store = {
      installation: {
        installationId: "inst_v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        encryptionKeyRef: "primary",
      },
      scrypted: {
        serverId: "srv_v1",
        serverUrl: "https://scrypted.local:10443",
        tokenEncrypted: {
          iv: "aXZfdGVzdA==",
          authTag: "dGFnX3Rlc3Q=",
          ciphertext: "Y2lwaGVyX3Rlc3Q=",
          purpose: "scrypted_auth",
          version: 1,
        },
        connectionStatus: "connected",
        autoReconnect: true,
        pollIntervalMinutes: 15,
      },
      cameras: {
        cameras: [
          {
            cameraId: "cam_v1",
            sourceId: "src_v1",
            deviceId: "dev_v1",
            name: "Cámara Legacy",
            manufacturer: "Tapo",
            model: "C125",
            enabled: true,
            identity: {},
            source: {
              kind: "scrypted",
              serverId: "srv_v1",
              deviceId: "dev_v1",
            },
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
            status: { connection: "online", cache: "fresh" },
          },
        ],
      },
    };

    await fs.writeFile(tempStorePath, JSON.stringify(v1Store, null, 2), {
      mode: 0o600,
    });

    // Load store — should trigger migration
    const migrated = await ScryptedStorage.load();

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.scrypted.credentials.authenticationMode).toBe("api_token");
    expect(migrated.scrypted.credentials.apiTokenEncrypted).toBeTruthy();
    expect(migrated.cameras.cameras[0].displayManufacturer).toBe("Tapo");
    expect(migrated.cameras.cameras[0].displayModel).toBe("C125");

    // Verify .bak file was written
    const bakExists = await fs
      .stat(`${tempStorePath}.bak`)
      .then(() => true)
      .catch(() => false);
    expect(bakExists).toBe(true);
  });

  it("clears password without affecting apiToken, and clears apiToken without affecting password", async () => {
    const store = await ScryptedStorage.load();
    store.scrypted.credentials = {
      authenticationMode: "username_password",
      username: "admin",
      passwordEncrypted: {
        iv: "aXY=",
        authTag: "dGFn",
        ciphertext: "Y2lwaGVy",
        purpose: "scrypted_password",
        version: 1,
      },
      apiTokenEncrypted: {
        iv: "aXYy",
        authTag: "dGFnMg==",
        ciphertext: "Y2lwaGVyMg==",
        purpose: "scrypted_api_token",
        version: 1,
      },
    };
    await ScryptedStorage.save(store);

    await ScryptedStorage.clearPassword();
    const afterClearPw = ScryptedStorage.getStore();
    expect(afterClearPw.scrypted.credentials.passwordEncrypted).toBeUndefined();
    expect(afterClearPw.scrypted.credentials.apiTokenEncrypted).toBeDefined();

    await ScryptedStorage.clearApiToken();
    const afterClearToken = ScryptedStorage.getStore();
    expect(
      afterClearToken.scrypted.credentials.apiTokenEncrypted,
    ).toBeUndefined();
  });

  it("preserves manual identityOverride across updateCameras sync", async () => {
    await ScryptedStorage.load();
    const initialCam: CameraRecord = {
      cameraId: "cam_override_1",
      sourceId: "src_1",
      deviceId: "dev_1",
      name: "Cámara Jardín",
      sourceManufacturer: "Unknown",
      sourceModel: "Generic 1080p",
      displayManufacturer: "Marca no identificada",
      displayModel: "Generic 1080p",
      enabled: true,
      identity: {},
      source: { kind: "scrypted", serverId: "srv_1", deviceId: "dev_1" },
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
    await ScryptedStorage.updateCameras([initialCam]);

    // Apply manual override: user changes brand to "Reolink" and model to "RLC-810A"
    const overrideSuccess = await ScryptedStorage.updateCameraIdentityOverride(
      "cam_override_1",
      {
        manufacturer: "Reolink",
        model: "RLC-810A",
        manufacturerSource: "manual",
        modelSource: "manual",
      },
    );
    expect(overrideSuccess).toBe(true);

    const storeAfterOverride = ScryptedStorage.getStore();
    expect(storeAfterOverride.cameras.cameras[0].displayManufacturer).toBe(
      "Reolink",
    );
    expect(storeAfterOverride.cameras.cameras[0].displayModel).toBe("RLC-810A");

    // Simulate future sync from Scrypted: source reports "Tapo" as manufacturer
    const freshFromScrypted: CameraRecord = {
      ...initialCam,
      sourceManufacturer: "Tapo",
      sourceModel: "C125",
      displayManufacturer: "Tapo",
      displayModel: "C125",
    };
    await ScryptedStorage.updateCameras([freshFromScrypted]);

    // Manual override must be PRESERVED
    const storeAfterSync = ScryptedStorage.getStore();
    const updatedCam = storeAfterSync.cameras.cameras[0];
    expect(updatedCam.sourceManufacturer).toBe("Tapo"); // source updated
    expect(updatedCam.displayManufacturer).toBe("Reolink"); // override preserved!
    expect(updatedCam.displayModel).toBe("RLC-810A"); // override preserved!
    expect(updatedCam.identityOverride?.manufacturer).toBe("Reolink");

    // Now user clears the override
    const clearSuccess = await ScryptedStorage.updateCameraIdentityOverride(
      "cam_override_1",
      null,
    );
    expect(clearSuccess).toBe(true);

    const storeAfterClear = ScryptedStorage.getStore();
    // Should now fall back to sourceManufacturer ("Tapo")
    expect(storeAfterClear.cameras.cameras[0].displayManufacturer).toBe("Tapo");
    expect(storeAfterClear.cameras.cameras[0].displayModel).toBe("C125");
    expect(storeAfterClear.cameras.cameras[0].identityOverride).toBeUndefined();
  });
});

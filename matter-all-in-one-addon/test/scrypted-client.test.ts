import { describe, expect, it } from "vitest";
import { ScryptedClient } from "../src/camera/scrypted/scrypted-client.js";

describe("ScryptedClient API & Stream Validation Suite", () => {
  it("validates server URLs and rejects SSRF or malformed protocols", () => {
    expect(ScryptedClient.validateServerUrl("").valid).toBe(false);
    expect(
      ScryptedClient.validateServerUrl("ftp://192.168.1.50:10443").valid,
    ).toBe(false);
    expect(
      ScryptedClient.validateServerUrl("http://192.168.1.50:10443").valid,
    ).toBe(true);
    expect(
      ScryptedClient.validateServerUrl("https://scrypted.local:10443").valid,
    ).toBe(true);
  });

  it("handles connection test failures with clean human-readable error messages", async () => {
    // Port 65432 on 127.0.0.1 should not be open
    const client = new ScryptedClient("http://127.0.0.1:65432", undefined, 300);
    const result = await client.testConnection();

    expect(result.ok).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it("generates structured CameraRecord with integrated sensors from device data", async () => {
    const client = new ScryptedClient("http://192.168.1.50:10443");
    // Test internal mapper through duck typing
    const mockDevice = {
      id: "front_door_cam",
      name: "Cámara Puerta Principal",
      type: "Camera",
      model: "Tapo C125",
      interfaces: [
        "Camera",
        "VideoCamera",
        "MotionSensor",
        "Doorbell",
        "ObjectDetection",
      ],
    };

    const mapper = (client as any).mapScryptedDeviceToCameraRecord.bind(client);
    const record = mapper(mockDevice, "192.168.1.50");

    expect(record.cameraId).toBe("front_door_cam");
    expect(record.model).toBe("Tapo C125");
    expect(record.identity.matterPairingCode).toMatch(
      /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/,
    );
    expect(record.source.streamReference?.directUrl).toBe(
      "rtsp://192.168.1.50:8554/front_door_cam",
    );

    // Integrated sensors inside the camera card
    const sensorTypes = record.sensors.map((s: any) => s.type);
    expect(sensorTypes).toContain("motion");
    expect(sensorTypes).toContain("doorbell");
    expect(sensorTypes).toContain("person");
    expect(sensorTypes).toContain("package");

    // Export configurations by default
    expect(record.exportConfig.matterEnabled).toBe(true);
    expect(record.exportConfig.homeKitEnabled).toBe(true);
    expect(record.exportConfig.hksvEnabledByDefault).toBe(true);
  });
});

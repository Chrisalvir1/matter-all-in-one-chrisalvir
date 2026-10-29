import { describe, expect, it } from "vitest";
import { adaptHaDeviceToCameraRecord } from "../src/frontend/src/utils/ha-camera-record";
const device = (hap?: any, state = "idle") => ({
  id: "feeder",
  name: "COMEDERO MICHI",
  entities: [
    {
      entityId: "camera.feeder",
      name: "DPS camera",
      domain: "camera",
      state,
      homekitCamera: hap,
    },
    {
      entityId: "switch.feed",
      name: "Alimentar ahora",
      domain: "switch",
      exported: true,
      commissioned: true,
    },
  ],
});
describe("HA camera HAP identity", () => {
  it("preserves actual accessory credentials and user device name", () => {
    const record = adaptHaDeviceToCameraRecord(
      device({
        published: true,
        isPaired: false,
        pincode: "123-45-678",
        setupId: "REAL",
        setupUri: "X-HM://actual",
        port: 51999,
      }),
    );
    expect(record.name).toBe("COMEDERO MICHI");
    expect(record.identity).toEqual({
      homeKitPincode: "123-45-678",
      homeKitSetupId: "REAL",
      homeKitSetupUri: "X-HM://actual",
      homeKitPort: 51999,
      homeKitPairingState: "not_paired",
    });
    expect(record.exportConfig?.homeKitEnabled).toBe(true);
  });
  it("does not fabricate credentials, publication or HAP pairing from Matter", () => {
    const record = adaptHaDeviceToCameraRecord(device());
    expect(record.identity?.homeKitPincode).toBeUndefined();
    expect(record.identity?.homeKitSetupId).toBeUndefined();
    expect(record.identity?.homeKitPairingState).toBe("not_paired");
    expect(record.exportConfig?.homeKitEnabled).toBe(false);
  });
  it("preserves runtime diagnostics and unavailable state", () => {
    const telemetry = { active: [], recent: [] };
    const record = adaptHaDeviceToCameraRecord(
      device({ isPaired: true, liveViewTelemetry: telemetry }, "unavailable"),
    );
    expect(record.status?.isOnline).toBe(false);
    expect(record.identity?.homeKitPairingState).toBe("paired");
    expect(record.liveViewTelemetry).toBe(telemetry);
  });
});

describe("camera control semantics", () => {
  it("does not treat unrelated binary sensors as motion and deduplicates IDs", () => {
    const dev = device();
    dev.entities.push({
      entityId: "binary_sensor.feeder_battery_low",
      name: "Batería baja",
      domain: "binary_sensor",
      state: "on",
    } as any);
    dev.entities.push({
      entityId: "binary_sensor.feeder_motion",
      name: "Movimiento",
      domain: "binary_sensor",
      state: "on",
    } as any);
    dev.entities.push(dev.entities[1]);
    const record = adaptHaDeviceToCameraRecord(dev);
    expect(record.sensors?.map((sensor) => sensor.sensorId)).toEqual([
      "binary_sensor.feeder_motion",
    ]);
    expect(
      record.realEntities?.find((entity) => entity.id.endsWith("battery_low"))
        ?.type,
    ).toBe("other");
    expect(
      record.realEntities?.filter((entity) => entity.id === "switch.feed"),
    ).toHaveLength(1);
  });
});

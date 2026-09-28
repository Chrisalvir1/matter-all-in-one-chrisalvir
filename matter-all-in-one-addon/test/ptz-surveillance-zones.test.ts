import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  detectCameraPtzCapabilities,
  getDefaultPtzZones,
  MAX_PTZ_PRESETS,
} from "../src/camera/ptz/ptz-capabilities.js";
import { PtzZonesManager } from "../src/camera/ptz/ptz-zones-manager.js";
import { MatterPtzExporter } from "../src/camera/ptz/matter-ptz-exporter.js";
import { PtzMqttPublisher } from "../src/camera/ptz/ptz-mqtt-publisher.js";
import { toSystimeMs } from "../src/device-profiles.js";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

describe("PTZ Capabilities and Detection (Matter 1.6.1)", () => {
  it("detects hardware PTZ for cameras with Scrypted PanTiltZoom interface", () => {
    const info = detectCameraPtzCapabilities("camera.driveway", {}, {}, {
      name: "Tapo C210 Pan/Tilt",
      interfaces: ["PanTiltZoom", "Camera"],
    });

    expect(info.hasPtz).toBe(true);
    expect(info.ptzType).toBe("hardware");
    expect(info.supportsHardwarePtz).toBe(true);
    expect(info.maxPresets).toBe(MAX_PTZ_PRESETS);
    expect(info.zones.length).toBe(5);
  });

  it("detects hardware PTZ for cameras with PTZ keywords or onvif attributes", () => {
    const info = detectCameraPtzCapabilities("camera.living_room_ptz", {
      attributes: { friendly_name: "Cámara Sala PTZ", ptz: true },
    });

    expect(info.hasPtz).toBe(true);
    expect(info.ptzType).toBe("hardware");
  });

  it("does not invent PTZ for standard video stream cameras", () => {
    const info = detectCameraPtzCapabilities("camera.front_door", {
      state: "idle",
      attributes: { friendly_name: "Timbre Principal", frontend_stream_type: "hls" },
    }, {
      url: "rtsp://192.168.1.100:554/live",
    });

    expect(info.hasPtz).toBe(false);
    expect(info.ptzType).toBe("none");
    expect(info.supportsDigitalPtz).toBe(false);
  });

  it("returns exactly 5 default surveillance zones with valid viewports", () => {
    const zones = getDefaultPtzZones();
    expect(zones.length).toBe(5);
    expect(zones[0].id).toBe(1);
    expect(zones[4].id).toBe(5);
    for (const z of zones) {
      expect(z.viewport).toBeDefined();
      expect(z.viewport!.x).toBeGreaterThanOrEqual(0);
      expect(z.viewport!.y).toBeGreaterThanOrEqual(0);
      expect(z.viewport!.width).toBeGreaterThan(0);
      expect(z.viewport!.height).toBeGreaterThan(0);
    }
  });
});

describe("Surveillance Zones Manager (CRUD & Movement)", () => {
  let tempStore: string;
  let manager: PtzZonesManager;

  beforeEach(() => {
    tempStore = path.join(os.tmpdir(), `ptz-test-${Date.now()}-${Math.random()}.json`);
    manager = new PtzZonesManager(tempStore);
  });

  it("saves and activates zones up to maximum of 5 zones", async () => {
    const entityId = "camera.patio";
    manager.registerCamera(entityId);

    const updatedZone = await manager.saveZone(entityId, {
      id: 2,
      name: "Zona Piscina",
      viewport: { x: 0.2, y: 0.3, width: 0.4, height: 0.4 },
      enabled: true,
    });

    expect(updatedZone.name).toBe("Zona Piscina");
    const zones = manager.getZones(entityId);
    expect(zones.find((z) => z.id === 2)?.name).toBe("Zona Piscina");

    const activation = await manager.setActiveZone(entityId, 2);
    expect(activation.success).toBe(true);
    expect(manager.getCameraPtzInfo(entityId)?.currentZoneId).toBe(2);
  });

  it("rejects zone IDs outside 1..5", async () => {
    const entityId = "camera.garden";
    await expect(
      manager.saveZone(entityId, { id: 6, name: "Invalid Zone" }),
    ).rejects.toThrow();
    await expect(
      manager.saveZone(entityId, { id: 0, name: "Invalid Zone" }),
    ).rejects.toThrow();
  });

  it("executes directional arrow movements and updates viewport", async () => {
    const entityId = "camera.hall";
    manager.registerCamera(entityId);

    const movedRight = await manager.moveDirection(entityId, "right", 0.1);
    expect(movedRight).toBeDefined();
    const activeZone = movedRight!.zones.find((z) => z.id === movedRight!.currentZoneId);
    expect(activeZone?.viewport?.x).toBeGreaterThan(0);

    const zoomedIn = await manager.moveDirection(entityId, "zoom_in", 0.1);
    expect(zoomedIn).toBeDefined();
    const zoomedZone = zoomedIn!.zones.find((z) => z.id === zoomedIn!.currentZoneId);
    expect(zoomedZone?.viewport?.width).toBeLessThan(1);
  });
});

describe("Matter PTZ Exporter (Matter 1.6.1 Format)", () => {
  it("generates endpoint configuration with DPTZ clusters and Single-Switch controller", () => {
    const info = detectCameraPtzCapabilities("camera.backyard", {
      attributes: { friendly_name: "Patio Trasero" },
    }, { url: "rtsp://stream" });

    const config = MatterPtzExporter.generateEndpointConfig(info, 1920, 1080);
    expect(config.entityId).toBe("camera.backyard");
    expect(config.dptzStreams).toEqual([1]);
    expect(config.matterbridgeServerConfig.commands).toContain("DPTZSetViewport");
    expect(config.matterbridgeServerConfig.commands).toContain("DPTZRelativeMove");
    expect(config.matterbridgeServerConfig.commands).toContain("MPTZMoveToPreset");
    expect(config.singleSwitchZoneController.enabled).toBe(true);
    expect(config.singleSwitchZoneController.presets.length).toBe(5);
  });

  it("writes valid export file to disk", async () => {
    const tempStore = path.join(os.tmpdir(), `ptz-store-${Date.now()}.json`);
    const tempExport = path.join(os.tmpdir(), `ptz-export-${Date.now()}.json`);
    const manager = new PtzZonesManager(tempStore);
    manager.registerCamera("camera.living_room", { attributes: { ptz: true } });

    const exportData = await MatterPtzExporter.exportToFile(manager, tempExport);
    expect(exportData.schemaVersion).toBe("1.6.1");
    expect(exportData.camerasCount).toBe(1);

    const read = JSON.parse(await fs.readFile(tempExport, "utf-8"));
    expect(read.cameras[0].entityId).toBe("camera.living_room");
  });
});

describe("SystimeMs Datatype (Matter 1.6.1)", () => {
  it("converts timestamps, seconds, and dates to millisecond resolution", () => {
    const now = Date.now();
    expect(toSystimeMs(now)).toBe(now);

    const d = new Date(1700000000000);
    expect(toSystimeMs(d)).toBe(1700000000000);

    // Relative countdown in seconds (e.g. 120s -> 120000ms)
    expect(toSystimeMs(120)).toBe(120000);

    // ISO string conversion
    expect(toSystimeMs("2026-09-27T10:00:00.000Z")).toBe(
      Date.parse("2026-09-27T10:00:00.000Z"),
    );

    expect(toSystimeMs(undefined)).toBeUndefined();
    expect(toSystimeMs(null)).toBeUndefined();
  });
});

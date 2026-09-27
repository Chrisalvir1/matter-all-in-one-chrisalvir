/**
 * Matter PTZ Exporter for Matter 1.6.1 + MatterBridge 3.10.11.
 * Generates Matter DPTZ endpoints, presets, and single-switch zone controllers.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { PtzZonesManager } from "./ptz-zones-manager.js";
import { CameraPtzInfo, PtzZone } from "./ptz-capabilities.js";

export interface MatterPtzPresetDefinition {
  presetId: number;
  name: string;
  viewport: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  };
}

export interface MatterCameraEndpointConfig {
  entityId: string;
  uniqueId: string;
  name: string;
  ptzType: "hardware" | "digital";
  maxPresets: number;
  dptzStreams: number[];
  presets: MatterPtzPresetDefinition[];
  matterbridgeServerConfig: {
    clusterId: number; // 0x0551 CameraAvStreamManagement or 0x0550 CameraAvSettingsUserLevelManagement
    features: {
      digitalPtz: boolean;
      mechanicalPresets: boolean;
    };
    attributes: {
      dptzStreams: number[];
      maxPresets: number;
      mptzPresets: Array<{ id: number; name: string }>;
    };
    commands: string[];
  };
  /**
   * Unified Single-Switch accessory config for Apple Home / Google Home:
   * Exposes a Matter Switch / Mode Controller with directional buttons and zone presets.
   */
  singleSwitchZoneController: {
    enabled: boolean;
    switchEndpointId: string;
    switchName: string;
    presetsCount: number;
    presets: Array<{ id: number; name: string }>;
    directionalControls: string[];
  };
}

export interface MatterPtzExportFile {
  schemaVersion: "1.6.1";
  generatedAt: string;
  camerasCount: number;
  cameras: MatterCameraEndpointConfig[];
}

export class MatterPtzExporter {
  public static generateEndpointConfig(
    info: CameraPtzInfo,
    width = 1920,
    height = 1080,
  ): MatterCameraEndpointConfig {
    const safeId = info.entityId.replace(/\./g, "_");

    const presets: MatterPtzPresetDefinition[] = info.zones.map((zone) => {
      const vp = zone.viewport || { x: 0, y: 0, width: 1, height: 1 };
      return {
        presetId: zone.id,
        name: zone.name,
        viewport: {
          x1: Math.round(vp.x * width),
          y1: Math.round(vp.y * height),
          x2: Math.round((vp.x + vp.width) * width),
          y2: Math.round((vp.y + vp.height) * height),
        },
      };
    });

    const mptzPresets = info.zones.map((z) => ({
      id: z.id,
      name: z.name,
    }));

    return {
      entityId: info.entityId,
      uniqueId: `${safeId}_ptz_matter`,
      name: `${info.name} PTZ`,
      ptzType: info.ptzType === "hardware" ? "hardware" : "digital",
      maxPresets: Math.min(5, info.maxPresets || 5),
      dptzStreams: [1],
      presets,
      matterbridgeServerConfig: {
        clusterId: 0x0551, // Camera AV Stream Management / User Level AV Settings
        features: {
          digitalPtz: true,
          mechanicalPresets: info.ptzType === "hardware",
        },
        attributes: {
          dptzStreams: [1],
          maxPresets: Math.min(5, info.maxPresets || 5),
          mptzPresets,
        },
        commands: [
          "DPTZSetViewport",
          "DPTZRelativeMove",
          "MPTZMoveToPreset",
          "MPTZSavePreset",
          "MPTZRemovePreset",
        ],
      },
      singleSwitchZoneController: {
        enabled: true,
        switchEndpointId: `${safeId}_zone_switch`,
        switchName: `${info.name} Vigilancia Zonas`,
        presetsCount: info.zones.length,
        presets: mptzPresets,
        directionalControls: [
          "move_up",
          "move_down",
          "move_left",
          "move_right",
          "zoom_in",
          "zoom_out",
          "center",
        ],
      },
    };
  }

  public static async exportToFile(
    ptzManager: PtzZonesManager,
    outputPath?: string,
  ): Promise<MatterPtzExportFile> {
    const targetPath =
      outputPath ||
      path.resolve(process.cwd(), "generated/ptz-matter-config.json");

    await ptzManager.init();
    const cameras = ptzManager.getAllPtzCameras();
    const cameraConfigs: MatterCameraEndpointConfig[] = [];

    for (const cam of cameras) {
      if (cam.hasPtz) {
        cameraConfigs.push(MatterPtzExporter.generateEndpointConfig(cam));
      }
    }

    const exportData: MatterPtzExportFile = {
      schemaVersion: "1.6.1",
      generatedAt: new Date().toISOString(),
      camerasCount: cameraConfigs.length,
      cameras: cameraConfigs,
    };

    const targetDir = path.dirname(targetPath);
    if (!fsSync.existsSync(targetDir)) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    await fs.writeFile(
      targetPath,
      JSON.stringify(exportData, null, 2),
      "utf-8",
    );

    return exportData;
  }
}

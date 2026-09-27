#!/usr/bin/env node
/**
 * Standalone script to generate Matter 1.6.1 PTZ configuration file:
 * generated/ptz-matter-config.json
 */

import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";

async function main() {
  console.log("[generate-ptz-matter] Starting Matter 1.6.1 PTZ export...");

  const storePath =
    process.env.PTZ_STORE_PATH ||
    (fsSync.existsSync("/data/ptz-zones-store.json")
      ? "/data/ptz-zones-store.json"
      : path.resolve(process.cwd(), "ptz-zones-store.json"));

  let storeData = { version: 1, cameras: {} };

  if (fsSync.existsSync(storePath)) {
    try {
      const raw = await fs.readFile(storePath, "utf-8");
      storeData = JSON.parse(raw);
      console.log(`[generate-ptz-matter] Read storage from ${storePath}`);
    } catch (e) {
      console.warn(`[generate-ptz-matter] Note reading storage: ${e.message}`);
    }
  } else {
    console.log(`[generate-ptz-matter] No existing storage at ${storePath}, initializing defaults`);
  }

  const generatedDir = path.resolve(process.cwd(), "generated");
  if (!fsSync.existsSync(generatedDir)) {
    await fs.mkdir(generatedDir, { recursive: true });
  }

  const camerasList = [];

  for (const [entityId, entry] of Object.entries(storeData.cameras || {})) {
    const zones = entry.zones || [];
    const safeId = entityId.replace(/\./g, "_");

    const presets = zones.map((z) => ({
      presetId: z.id,
      name: z.name,
      viewport: z.viewport || { x: 0, y: 0, width: 1, height: 1 },
    }));

    camerasList.push({
      entityId,
      uniqueId: `${safeId}_ptz_matter`,
      name: `${entityId} PTZ`,
      ptzType: "digital",
      maxPresets: 5,
      dptzStreams: [1],
      presets,
      matterbridgeServerConfig: {
        clusterId: 0x0551,
        features: {
          digitalPtz: true,
          mechanicalPresets: false,
        },
        attributes: {
          dptzStreams: [1],
          maxPresets: 5,
          mptzPresets: zones.map((z) => ({ id: z.id, name: z.name })),
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
        switchName: `${entityId} Vigilancia Zonas`,
        presetsCount: zones.length,
        presets: zones.map((z) => ({ id: z.id, name: z.name })),
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
    });
  }

  const outputData = {
    schemaVersion: "1.6.1",
    generatedAt: new Date().toISOString(),
    camerasCount: camerasList.length,
    cameras: camerasList,
  };

  const outputPath = path.join(generatedDir, "ptz-matter-config.json");
  await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

  console.log(`[generate-ptz-matter] Successfully exported Matter 1.6.1 PTZ config to: ${outputPath}`);
}

main().catch((err) => {
  console.error("[generate-ptz-matter] Error:", err);
  process.exit(1);
});

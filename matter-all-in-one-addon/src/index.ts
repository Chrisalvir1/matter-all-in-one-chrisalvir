/**
 * Entry point for matter-all-in-one-chrisalvir plugin.
 */
import fs from "fs";
import { HAPStorage } from "hap-nodejs";
import { PlatformMatterbridge } from "matterbridge";
import { AnsiLogger } from "matterbridge/logger";
import {
  HomeAssistantPlatform,
  HomeAssistantPlatformConfig,
} from "./platform.js";

// Ensure HAP persistent storage resides in persistent /data directory
try {
  const hapPersistDir = fs.existsSync("/data")
    ? "/data/hap-persist"
    : "./persist";
  if (!fs.existsSync(hapPersistDir)) {
    fs.mkdirSync(hapPersistDir, { recursive: true });
  }
  HAPStorage.setCustomStoragePath(hapPersistDir);
} catch {}

/**
 * Initialize the plugin.
 */
export default function initializePlugin(
  matterbridge: PlatformMatterbridge,
  log: AnsiLogger,
  config: HomeAssistantPlatformConfig,
): HomeAssistantPlatform {
  // Prevent Matter.js or Node.js internal unhandled rejections from crashing the Addon
  process.on("unhandledRejection", (reason, promise) => {
    log.error(
      `[Anti-Crash] Unhandled Rejection at: ${promise} reason: ${reason}`,
    );
  });
  process.on("uncaughtException", (error) => {
    log.error(`[Anti-Crash] Uncaught Exception: ${error.message}`);
  });

  return new HomeAssistantPlatform(matterbridge, log, config);
}

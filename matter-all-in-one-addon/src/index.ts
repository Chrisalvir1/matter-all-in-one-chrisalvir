/**
 * Entry point for matter-all-in-one-chrisalvir plugin.
 */
import fs from "fs";
import { HAPStorage } from "@homebridge/hap-nodejs";
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
  // Failures must be visible, never swallowed. Rejections are logged with the
  // full stack. An uncaught exception leaves the process in an undefined state
  // (half-created Matter nodes, stale mDNS records), so exit and let the
  // Supervisor restart the add-on from the persisted, stable identities.
  process.on("unhandledRejection", (reason) => {
    const detail =
      reason instanceof Error ? (reason.stack ?? reason.message) : String(reason);
    log.error(`[Runtime] Unhandled rejection: ${detail}`);
  });
  process.on("uncaughtException", (error) => {
    log.error(`[Runtime] Uncaught exception, restarting: ${error.stack ?? error.message}`);
    setTimeout(() => process.exit(1), 500).unref();
  });

  return new HomeAssistantPlatform(matterbridge, log, config);
}

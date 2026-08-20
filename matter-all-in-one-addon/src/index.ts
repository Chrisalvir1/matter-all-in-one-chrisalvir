/**
 * Entry point for matter-all-in-one-chrisalvir plugin.
 */
import { PlatformMatterbridge } from "matterbridge";
import { AnsiLogger } from "matterbridge/logger";
import {
  HomeAssistantPlatform,
  HomeAssistantPlatformConfig,
} from "./platform.js";

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

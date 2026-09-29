import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Version resolved from the hap-nodejs package actually installed at runtime. */
export const HAP_NODEJS_VERSION = String(
  require("@homebridge/hap-nodejs/package.json").version || "2.2.3",
);

/**
 * Firmware revision shown for HAP accessories (Cameras & Generic IoT) in Apple Home and UI.
 */
export const HAP_FIRMWARE_REVISION = `HAP-NodeJS ${HAP_NODEJS_VERSION}`;

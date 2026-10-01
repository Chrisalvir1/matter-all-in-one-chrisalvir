import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Version resolved from the hap-nodejs package actually installed at runtime. */
export const HAP_NODEJS_VERSION = String(
  require("@homebridge/hap-nodejs/package.json").version || "2.2.3",
);

/**
 * HAP FirmwareRevision must be a plain version string for Apple Casa to expose
 * it in accessory settings. The descriptive runtime is published separately as
 * SoftwareRevision and retained for the add-on UI.
 */
export const HAP_FIRMWARE_REVISION = HAP_NODEJS_VERSION;
export const HAP_SOFTWARE_REVISION = `HAP-NodeJS ${HAP_NODEJS_VERSION}`;
export const HAP_FIRMWARE_DISPLAY = HAP_SOFTWARE_REVISION;

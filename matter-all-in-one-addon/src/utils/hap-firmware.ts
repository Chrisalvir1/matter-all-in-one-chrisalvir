import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Version resolved from the hap-nodejs package actually installed at runtime. */
export const HAP_NODEJS_VERSION = String(
  require("@homebridge/hap-nodejs/package.json").version || "2.2.3",
);

/**
 * Apple HomeKit HAP Characteristic.FirmwareRevision requires strict semver format
 * "<major>[.<minor>[.<revision>]]" (e.g. "2.2.3"). Non-numeric text strings
 * cause Apple Home to reject the accessory schema and report "No Response" / "Sin respuesta".
 */
export const HAP_FIRMWARE_REVISION = HAP_NODEJS_VERSION === "unknown" ? "2.2.3" : HAP_NODEJS_VERSION;

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Version resolved from the hap-nodejs package actually installed at runtime. */
export const HAP_NODEJS_VERSION = String(
  require("@homebridge/hap-nodejs/package.json").version || "unknown",
);

export const HAP_FIRMWARE_REVISION = `HAP-NodeJS ${HAP_NODEJS_VERSION}`;

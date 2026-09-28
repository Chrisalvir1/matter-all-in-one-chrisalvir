import type { MatterbridgeEndpoint } from "matterbridge";

/** Matter protocol version implemented by this build of the add-on. */
export const MATTER_PROTOCOL_VERSION = "1.6.1";

export function getMatterbridgeVersion(platform: any): string {
  const version = platform?.matterbridge?.matterbridgeVersion;
  return typeof version === "string" && version.trim()
    ? version.trim().replace(/^Matterbridge\s+/i, "")
    : "unknown";
}

/** Keep every Matter endpoint's Basic Information firmware metadata aligned. */
export function applyMatterFirmware(
  endpoint: MatterbridgeEndpoint,
  platform: any,
): void {
  const matterbridgeVersion = getMatterbridgeVersion(platform);
  const [major = 0, minor = 0, patch = 0] = matterbridgeVersion
    .split(/[-+.]/)
    .map((part) => Number.parseInt(part, 10) || 0);

  endpoint.softwareVersion = Math.min(
    0xffffffff,
    major * 1_000_000 + minor * 1_000 + patch,
  );
  endpoint.softwareVersionString =
    `Matter ${MATTER_PROTOCOL_VERSION} · Matterbridge ${matterbridgeVersion}`;
}

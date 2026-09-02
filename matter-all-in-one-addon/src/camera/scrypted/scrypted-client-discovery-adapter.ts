import { ScryptedRuntimeFacade, type ScryptedRuntimeSnapshot } from "./scrypted-runtime-facade.js";
import type { ScryptedDiscoveryPayload } from "./scrypted-runtime-ingest.js";
import { ingestScryptedDiscoveryPayload } from "./scrypted-runtime-ingest.js";

export type ScryptedClientDiscoveryResponse = {
  devices?: unknown;
  cameras?: unknown;
};

export function adaptScryptedClientDiscovery(
  facade: ScryptedRuntimeFacade,
  response: ScryptedClientDiscoveryResponse,
): ScryptedRuntimeSnapshot {
  const devices = Array.isArray(response.devices)
    ? response.devices
    : Array.isArray(response.cameras)
      ? response.cameras
      : [];

  return ingestScryptedDiscoveryPayload(facade, {
    devices,
  } satisfies ScryptedDiscoveryPayload);
}

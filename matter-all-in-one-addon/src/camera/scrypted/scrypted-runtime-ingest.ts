import type { ScryptedDiscoveryDevice } from "./scrypted-camera-discovery-adapter.js";
import { ScryptedRuntimeFacade, type ScryptedRuntimeSnapshot } from "./scrypted-runtime-facade.js";

export type ScryptedDiscoveryPayload = {
  devices?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toDevice(value: unknown): ScryptedDiscoveryDevice | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
    return null;
  }

  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : undefined,
    manufacturer:
      typeof value.manufacturer === "string" ? value.manufacturer : undefined,
    displayManufacturer:
      typeof value.displayManufacturer === "string"
        ? value.displayManufacturer
        : undefined,
    model: typeof value.model === "string" ? value.model : undefined,
    displayModel:
      typeof value.displayModel === "string" ? value.displayModel : undefined,
    online: typeof value.online === "boolean" ? value.online : undefined,
    sensors: Array.isArray(value.sensors) ? value.sensors : undefined,
    entities: Array.isArray(value.entities) ? value.entities : undefined,
    homeKitEnabled:
      typeof value.homeKitEnabled === "boolean"
        ? value.homeKitEnabled
        : undefined,
    matterEnabled:
      typeof value.matterEnabled === "boolean" ? value.matterEnabled : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
    deviceType:
      typeof value.deviceType === "string" ? value.deviceType : undefined,
  };
}

export function ingestScryptedDiscoveryPayload(
  facade: ScryptedRuntimeFacade,
  payload: ScryptedDiscoveryPayload,
): ScryptedRuntimeSnapshot {
  const rawDevices = Array.isArray(payload.devices) ? payload.devices : [];
  const devices = rawDevices
    .map(toDevice)
    .filter((device): device is ScryptedDiscoveryDevice => device !== null);
  return facade.ingestDevices(devices);
}

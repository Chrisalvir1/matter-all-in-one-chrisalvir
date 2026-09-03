export type ScryptedDiscoveryDevice = {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  displayManufacturer?: string | null;
  model?: string | null;
  displayModel?: string | null;
  online?: boolean | null;
  sensors?: unknown[] | null;
  entities?: unknown[] | null;
  homeKitEnabled?: boolean;
  matterEnabled?: boolean;
  directUrl?: string | null;
  streamUrl?: string | null;
  rtspUrl?: string | null;
  streamReference?: unknown | null;
  snapshotReference?: unknown | null;
  profiles?: unknown[] | null;
  videoStreamOptions?: unknown[] | null;
};

export type NormalizedScryptedCamera = {
  id: string;
  name: string;
  brand: string;
  model: string | null;
  source: "scrypted";
  online: boolean | null;
  entityCount: number;
  homeKit: {
    managedByScrypted: true;
    enabled: boolean;
  };
  matter: {
    experimental: true;
    enabled: boolean;
  };
  directUrl?: string;
  streamReference?: unknown;
  snapshotReference?: unknown;
  profiles?: unknown[];
};

export const UNKNOWN_BRAND = "Marca no identificada";

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length ? normalized : undefined;
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function normalizeScryptedCamera(
  device: ScryptedDiscoveryDevice,
): NormalizedScryptedCamera {
  const directUrl =
    text(device.directUrl) ?? text(device.streamUrl) ?? text(device.rtspUrl);
  return {
    id: device.id,
    name: text(device.name) ?? device.id,
    brand:
      text(device.displayManufacturer) ??
      text(device.manufacturer) ??
      UNKNOWN_BRAND,
    model: text(device.displayModel) ?? text(device.model) ?? null,
    source: "scrypted",
    online: typeof device.online === "boolean" ? device.online : null,
    entityCount: count(device.sensors) + count(device.entities),
    homeKit: {
      managedByScrypted: true,
      enabled: device.homeKitEnabled === true,
    },
    matter: {
      experimental: true,
      enabled: device.matterEnabled === true,
    },
    directUrl,
    streamReference: device.streamReference ?? undefined,
    snapshotReference: device.snapshotReference ?? undefined,
    profiles: Array.isArray(device.profiles) ? device.profiles : undefined,
  };
}

export function groupNormalizedScryptedCameras(
  devices: ScryptedDiscoveryDevice[],
): Record<string, NormalizedScryptedCamera[]> {
  return devices.reduce<Record<string, NormalizedScryptedCamera[]>>(
    (groups, device) => {
      const camera = normalizeScryptedCamera(device);
      (groups[camera.brand] ??= []).push(camera);
      return groups;
    },
    {},
  );
}

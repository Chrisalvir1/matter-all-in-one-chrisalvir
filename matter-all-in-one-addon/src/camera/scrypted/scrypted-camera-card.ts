export type ScryptedCameraInput = {
  id: string;
  name?: string;
  manufacturer?: string;
  displayManufacturer?: string;
  model?: string;
  displayModel?: string;
  sensors?: unknown[];
  entities?: unknown[];
  homeKitEnabled?: boolean;
  matterEnabled?: boolean;
  online?: boolean;
  directUrl?: string;
  streamUrl?: string;
  rtspUrl?: string;
  streamReference?: unknown;
  snapshotReference?: unknown;
  profiles?: unknown[];
  videoStreamOptions?: unknown[];
};

export type ScryptedCameraCard = {
  id: string;
  name: string;
  source: "scrypted";
  brand: string;
  model: string | null;
  entityCount: number;
  online: boolean | null;
  homeKit: {
    managedByScrypted: true;
    enabled: boolean;
  };
  matter: {
    experimental: true;
    enabled: boolean;
  };
};

const UNKNOWN_BRAND = "Marca no identificada";

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const result = value.trim();
  return result.length > 0 ? result : undefined;
}

export function toScryptedCameraCard(input: ScryptedCameraInput): ScryptedCameraCard {
  const brand = clean(input.displayManufacturer) ?? clean(input.manufacturer) ?? UNKNOWN_BRAND;
  const model = clean(input.displayModel) ?? clean(input.model) ?? null;
  const sensors = Array.isArray(input.sensors) ? input.sensors.length : 0;
  const entities = Array.isArray(input.entities) ? input.entities.length : 0;

  return {
    id: input.id,
    name: clean(input.name) ?? input.id,
    source: "scrypted",
    brand,
    model,
    entityCount: sensors + entities,
    online: typeof input.online === "boolean" ? input.online : null,
    homeKit: {
      managedByScrypted: true,
      enabled: input.homeKitEnabled === true,
    },
    matter: {
      experimental: true,
      enabled: input.matterEnabled === true,
    },
  };
}

export function groupScryptedCameraCards(
  inputs: ScryptedCameraInput[] | ScryptedCameraCard[],
): Record<string, ScryptedCameraCard[]> {
  return inputs.reduce<Record<string, ScryptedCameraCard[]>>((groups, input) => {
    const card = "source" in input ? input : toScryptedCameraCard(input);
    (groups[card.brand] ??= []).push(card);
    return groups;
  }, {});
}

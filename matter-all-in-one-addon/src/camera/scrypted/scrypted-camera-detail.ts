import type { NormalizedScryptedCamera } from "./scrypted-camera-normalizer.js";

export type ScryptedCameraDetail = {
  identity: {
    id: string;
    name: string;
    brand: string;
    model: string | null;
    source: "Scrypted";
  };
  entities: {
    count: number;
    label: string;
  };
  integrations: {
    homeKit: {
      owner: "Scrypted";
      enabled: boolean;
      instruction: string;
    };
    matter: {
      experimental: true;
      enabled: boolean;
      instruction: string;
    };
  };
  diagnostics: {
    online: boolean | null;
    technicalTransportVisibleByDefault: false;
    recordingEnabledByDefault: false;
    nvrEnabledByDefault: false;
  };
};

export function toScryptedCameraDetail(
  camera: NormalizedScryptedCamera,
): ScryptedCameraDetail {
  return {
    identity: {
      id: camera.id,
      name: camera.name,
      brand: camera.brand,
      model: camera.model,
      source: "Scrypted",
    },
    entities: {
      count: camera.entityCount,
      label: `${camera.entityCount} ${camera.entityCount === 1 ? "entidad" : "entidades"}`,
    },
    integrations: {
      homeKit: {
        owner: "Scrypted",
        enabled: camera.homeKit.enabled,
        instruction:
          "Obtén el código HomeKit desde el plugin HomeKit de Scrypted. Matter All-in-One no genera este código.",
      },
      matter: {
        experimental: true,
        enabled: camera.matter.enabled,
        instruction:
          "La exportación de cámaras por Matter es experimental y no es la ruta recomendada para Apple Home.",
      },
    },
    diagnostics: {
      online: camera.online,
      technicalTransportVisibleByDefault: false,
      recordingEnabledByDefault: false,
      nvrEnabledByDefault: false,
    },
  };
}

import type { NormalizedScryptedCamera } from "./scrypted-camera-normalizer.js";

export type CameraPresentation = {
  title: string;
  subtitle: string;
  status: "online" | "offline" | "unknown";
  statusLabel: string;
  entityLabel: string;
  showTechnicalTransport: false;
  showMatterPairingInSummary: false;
  homeKitLabel: "Gestionado por Scrypted";
  primaryAction: "configurar";
};

export function toCameraPresentation(
  camera: NormalizedScryptedCamera,
): CameraPresentation {
  const status =
    camera.online === true
      ? "online"
      : camera.online === false
        ? "offline"
        : "unknown";

  return {
    title: camera.name,
    subtitle: camera.model ? `${camera.brand} · ${camera.model}` : camera.brand,
    status,
    statusLabel:
      status === "online"
        ? "En línea"
        : status === "offline"
          ? "Sin conexión"
          : "Estado no verificado",
    entityLabel: `${camera.entityCount} ${camera.entityCount === 1 ? "entidad" : "entidades"}`,
    showTechnicalTransport: false,
    showMatterPairingInSummary: false,
    homeKitLabel: "Gestionado por Scrypted",
    primaryAction: "configurar",
  };
}

import type {
  CameraRecord,
  CameraUiCameraItem,
  DeviceRecord,
  EntityRecord,
} from "../types";

export function entityIssue(entity: EntityRecord): string | undefined {
  const active =
    entity.exported ||
    entity.commissioned ||
    entity.homekitCamera?.published ||
    entity.homekitCamera?.isPaired ||
    entity.hapAccessory?.published;
  if (!active) return;
  if (["unavailable", "unknown", "offline"].includes(entity.state)) {
    return `${entity.name}: ${entity.state === "unknown" ? "estado desconocido" : "desconectado en Home Assistant"}`;
  }
  if (entity.hasIssue) {
    const diagnostic = entity.logs?.find(
      (log) => log.level === "warning" || log.level === "error",
    );
    return diagnostic?.message || `${entity.name}: incidencia activa`;
  }
}

export function deviceNeedsAttention(device: DeviceRecord): boolean {
  return device.entities.some(entityIssue);
}

export function scryptedNeedsAttention(camera: CameraRecord): boolean {
  const active =
    camera.identity?.homeKitPairingState === "paired" ||
    camera.bindingState?.matterCommissioned === true ||
    Boolean(camera.identity?.matterPairingCode);
  return (
    active &&
    (camera.status?.connection === "offline" ||
      camera.status?.isOnline === false ||
      Boolean(camera.status?.lastError) ||
      camera.hasIssue === true)
  );
}

export function cameraUiNeedsAttention(camera: CameraUiCameraItem): boolean {
  return camera.homeKitEnabled !== false && camera.status === "offline";
}

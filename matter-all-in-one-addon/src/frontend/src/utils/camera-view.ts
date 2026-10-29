import type {
  CameraRecord,
  CameraUiCameraItem,
  CameraRealEntity,
} from "../types";
export type CameraViewSource = CameraRecord | CameraUiCameraItem;
export const isCameraUiSource = (
  camera: CameraViewSource,
): camera is CameraUiCameraItem => "id" in camera && !("cameraId" in camera);
export function cameraView(camera: CameraViewSource) {
  const cui = isCameraUiSource(camera);
  const record = camera as CameraRecord;
  return {
    id: cui ? camera.id : record.cameraId,
    name: camera.name,
    provider: cui
      ? camera.sourceProvider === "home_assistant"
        ? "Home Assistant"
        : camera.sourceProvider === "manual"
          ? "RTSP"
          : "Camera.UI"
      : record.provider === "home_assistant"
        ? "Home Assistant"
        : "Scrypted",
    online: cui
      ? camera.status === "online"
      : record.status?.isOnline === true &&
        record.status?.connection === "online",
    availability: cui
      ? camera.status || "unknown"
      : record.status?.cache === "stale" || record.status?.cache === "expired"
        ? "stale"
        : record.status?.connection || "unknown",
    published: cui
      ? camera.homeKitEnabled === true
      : record.exportConfig?.homeKitEnabled === true,
    paired: cui
      ? camera.isPaired === true
      : record.identity?.homeKitPairingState === "paired",
    setupUri: cui ? camera.setupUri : record.identity?.homeKitSetupUri,
    pin: cui ? camera.pincode : record.identity?.homeKitPincode,
    model: cui ? camera.model : record.displayModel || record.model,
    streamUrl: cui
      ? camera.rtspUrl || ""
      : record.source?.streamReference?.directUrl ||
        record.source?.profiles?.find((p) => p.directUrl)?.directUrl ||
        "",
  };
}
export function controlAvailability(entity: CameraRealEntity) {
  if (entity.availability === "stale") return "stale";
  if (
    entity.rawState === "unavailable" ||
    entity.availability === "unavailable"
  )
    return "unavailable";
  if (entity.rawState === "unknown" || entity.availability === "unknown")
    return "unknown";
  if (entity.availability === "available" || entity.rawState !== undefined)
    return "available";
  return "unknown";
}
export function cameraControlAction(
  entity: CameraRealEntity,
): "turn_on" | "turn_off" | "press" | undefined {
  if (
    controlAvailability(entity) !== "available" ||
    !entity.id.startsWith(`${entity.domain}.`)
  )
    return;
  if (entity.domain === "button") return "press";
  if (["switch", "light", "siren"].includes(entity.domain))
    return entity.state ? "turn_off" : "turn_on";
}
/** Redact URLs and security fields before displaying/copying diagnostics. */
export function safeCameraDiagnostics(value: unknown): string {
  const text =
    JSON.stringify(
      value,
      (key, item) =>
        /token|password|pincode|setupuri|setupid|pairingcode|manualcode|secret|key|directurl|rtspurl|sourceurl|codecprobeurl/i.test(
          key,
        )
          ? "[oculto]"
          : item,
      2,
    ) || "Sin datos";
  return text
    .replace(/(?:rtsps?|https?):\/\/[^\s"<>]+/gi, "[URL oculta]")
    .replace(/\b\d{3}-\d{2}-\d{3}\b/g, "[PIN oculto]")
    .replace(/("-srtp_(?:out|in)_params"\s*,\s*)"[^"]+"/gi, '$1"[oculto]"')
    .replace(/(-srtp_(?:out|in)_params\s+)[a-z0-9+/=]+/gi, "$1[oculto]")
    .replace(/Bearer\s+[a-z0-9._~+\/-]+/gi, "Bearer [oculto]");
}

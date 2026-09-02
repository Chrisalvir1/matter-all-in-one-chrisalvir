import { toScryptedCameraDetail, type ScryptedCameraDetail } from "./scrypted-camera-detail.js";
import { toScryptedCameraCard, type ScryptedCameraCard, type ScryptedCameraInput } from "./scrypted-camera-card.js";
import { toCameraPresentation, type CameraPresentation } from "./scrypted-camera-presentation.js";
import { normalizeScryptedCamera, type NormalizedScryptedCamera } from "./scrypted-camera-normalizer.js";

export type ScryptedDiscoveryDevice = ScryptedCameraInput & {
  type?: string;
  deviceType?: string;
};

export type ScryptedDiscoveryResult = {
  cameras: Array<{
    normalized: NormalizedScryptedCamera;
    card: ScryptedCameraCard;
    presentation: CameraPresentation;
    detail: ScryptedCameraDetail;
  }>;
};

function isCamera(device: ScryptedDiscoveryDevice): boolean {
  const type = `${device.type ?? ""} ${device.deviceType ?? ""}`.trim().toLowerCase();
  if (!type) return true;
  return type.includes("camera") || type.includes("doorbell");
}

export function adaptScryptedDiscovery(
  devices: ScryptedDiscoveryDevice[],
): ScryptedDiscoveryResult {
  return {
    cameras: devices.filter(isCamera).map((device) => {
      const normalized = normalizeScryptedCamera(device);
      return {
        normalized,
        card: toScryptedCameraCard(device),
        presentation: toCameraPresentation(normalized),
        detail: toScryptedCameraDetail(normalized),
      };
    }),
  };
}

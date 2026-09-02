export type ScryptedCameraPolicy = {
  discoveryEnabled: true;
  homeKitDelegatedToScrypted: true;
  matterCameraEnabled: false;
  nvrEnabled: false;
  recordingEnabled: false;
  transcodingEnabled: false;
  technicalDetailsVisibleByDefault: false;
};

export const DEFAULT_SCRYPTED_CAMERA_POLICY: ScryptedCameraPolicy = {
  discoveryEnabled: true,
  homeKitDelegatedToScrypted: true,
  matterCameraEnabled: false,
  nvrEnabled: false,
  recordingEnabled: false,
  transcodingEnabled: false,
  technicalDetailsVisibleByDefault: false,
};

export function isScryptedCameraExportAllowed(
  policy: ScryptedCameraPolicy = DEFAULT_SCRYPTED_CAMERA_POLICY,
): boolean {
  return policy.discoveryEnabled && policy.homeKitDelegatedToScrypted;
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCRYPTED_CAMERA_POLICY,
  isScryptedCameraExportAllowed,
} from "../src/camera/scrypted/scrypted-camera-policy.js";

describe("Scrypted camera policy", () => {
  it("defaults to discovery plus delegated HomeKit only", () => {
    expect(DEFAULT_SCRYPTED_CAMERA_POLICY).toEqual({
      discoveryEnabled: true,
      homeKitDelegatedToScrypted: true,
      matterCameraEnabled: false,
      nvrEnabled: false,
      recordingEnabled: false,
      transcodingEnabled: false,
      technicalDetailsVisibleByDefault: false,
    });
    expect(isScryptedCameraExportAllowed()).toBe(true);
  });

  it("does not allow camera export when discovery is disabled", () => {
    expect(
      isScryptedCameraExportAllowed({
        ...DEFAULT_SCRYPTED_CAMERA_POLICY,
        discoveryEnabled: false,
      }),
    ).toBe(false);
  });
});

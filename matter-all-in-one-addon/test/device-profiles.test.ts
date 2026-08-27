import { describe, expect, it } from "vitest";
import {
  getDefaultExportProfileId,
  getExportProfile,
  getExportProfiles,
} from "../src/device-profiles.js";

describe("device export profiles", () => {
  it("offers the official RVC profile as Apple Home-supported", () => {
    expect(getExportProfiles("vacuum")).toContainEqual(
      expect.objectContaining({
        id: "roboticVacuumCleaner",
        appleHome: "supported",
      }),
    );
    expect(getDefaultExportProfileId("vacuum")).toBe("roboticVacuumCleaner");
  });

  it("labels Basic Video Player as unsupported by Apple Home Matter", () => {
    expect(getExportProfile("media_player", "basicVideoPlayer")).toEqual(
      expect.objectContaining({ appleHome: "unsupported" }),
    );
  });

  it("uses an Apple Home-compatible media player fallback by default", () => {
    expect(getDefaultExportProfileId("media_player")).toBe("onOffPlugInUnit");
  });

  it("uses native Matter Fan by default", () => {
    expect(getDefaultExportProfileId("fan")).toBe("fan");
    expect(getExportProfile("fan", "fan")).toEqual(
      expect.objectContaining({ appleHome: "supported" }),
    );
  });

  it("offers fan and onOffLight profiles for switches and fans", () => {
    expect(getExportProfiles("switch")).toContainEqual(
      expect.objectContaining({ id: "fan", appleHome: "supported" }),
    );
    expect(getExportProfiles("fan")).toContainEqual(
      expect.objectContaining({ id: "onOffLight", appleHome: "supported" }),
    );
    expect(getExportProfiles("button")).toContainEqual(
      expect.objectContaining({ id: "onOffLight", appleHome: "supported" }),
    );
  });

  it("offers the Camera profile as experimental (published as on/off switch pending full camera cluster support)", () => {
    expect(getExportProfiles("camera")).toContainEqual(
      expect.objectContaining({
        id: "camera",
        // Camera is published as an on/off plug-in unit until Matterbridge
        // supports CameraAvStreamManagement (0x0551) + WebRtcTransportProvider (0x0553)
        appleHome: "experimental",
      }),
    );
    expect(getDefaultExportProfileId("camera")).toBe("camera");
  });
});

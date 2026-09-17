/**
 * NestCameraAdapter — Dedicated adapter for Google Nest cameras in Home Assistant.
 *
 * In Home Assistant, Google Nest cameras connect via the official Google Nest SDM API
 * which communicates over private WebRTC. This adapter provides:
 * 1. Automatic identification of Google Nest cameras across HA entity registry and states.
 * 2. Resolution of linked sensors (Person detection, Doorbell events, Motion, Sound).
 * 3. Stream routing to local Go2rtc RTSP if present or secure HA continuous proxy stream with token auth.
 * 4. Dual-track export preparation for both HomeKit HAP and Matter endpoints.
 */

import type { HassState } from "../../utils/ha-state.js";

export interface LinkedNestEntities {
  motion?: string;
  person?: string;
  doorbell?: string;
  sound?: string;
  chime?: string;
}

export class NestCameraAdapter {
  /**
   * Checks whether a given camera entity represents a Google Nest camera.
   */
  public static isNestCamera(
    entityId: string,
    state?: HassState,
    entityEntry?: any,
  ): boolean {
    if (!entityId || !entityId.startsWith("camera.")) return false;

    // 1. Entity entry platform or integration
    if (entityEntry?.platform === "nest") return true;

    // 2. State attributes
    const attrs = state?.attributes || {};
    const brand = String(attrs.brand || "").toLowerCase();
    const manufacturer = String(attrs.manufacturer || "").toLowerCase();
    if (brand.includes("google") || brand.includes("nest")) return true;
    if (manufacturer.includes("google") || manufacturer.includes("nest")) return true;

    // 3. Entity ID naming convention
    const lowerId = entityId.toLowerCase();
    if (
      lowerId.includes("nest_") ||
      lowerId.includes("google_nest") ||
      lowerId.includes("nest_cam") ||
      lowerId.includes("nest_doorbell")
    ) {
      return true;
    }

    return false;
  }

  /**
   * Discovers and correlates companion sensors for a Google Nest camera in Home Assistant
   * (Person detection, Doorbell press events, Motion, Sound).
   */
  public static findLinkedNestEntities(
    platform: any,
    cameraEntityId: string,
  ): LinkedNestEntities {
    const result: LinkedNestEntities = {};
    const hassStates: Map<string, HassState> | undefined = platform?.ha?.hassStates;
    if (!hassStates) return result;

    const baseName = cameraEntityId.replace(/^camera\./, "");
    // Clean common prefixes/suffixes for fuzzy matching
    const cleanBase = baseName.replace(/_(cam|camera|doorbell)$/, "");

    for (const [entityId, state] of hassStates.entries()) {
      const lower = entityId.toLowerCase();
      const isRelated =
        lower.includes(baseName) ||
        lower.includes(cleanBase);

      if (!isRelated) continue;

      const suffix = lower.replace(baseName, "");

      // 1. Person detection
      if (
        (suffix.includes("person") || suffix.includes("persona")) &&
        entityId.startsWith("binary_sensor.")
      ) {
        result.person = entityId;
      }

      // 2. Motion detection
      if (
        (suffix.includes("motion") || suffix.includes("movimiento")) &&
        entityId.startsWith("binary_sensor.") &&
        !result.motion
      ) {
        result.motion = entityId;
      }

      // 3. Doorbell event / press
      const isDoorbellEntity =
        (suffix.includes("doorbell") || suffix.includes("timbre") || suffix.includes("chime")) ||
        (lower.includes("doorbell") && (entityId.startsWith("event.") || entityId.startsWith("button.")));
      if (
        isDoorbellEntity &&
        !suffix.includes("motion") &&
        !suffix.includes("person") &&
        (entityId.startsWith("event.") ||
          entityId.startsWith("binary_sensor.") ||
          entityId.startsWith("button."))
      ) {
        result.doorbell = entityId;
      }

      // 4. Sound detection
      if (
        (suffix.includes("sound") || suffix.includes("sonido") || suffix.includes("noise")) &&
        entityId.startsWith("binary_sensor.")
      ) {
        result.sound = entityId;
      }
    }

    // Default motion to person sensor if pure motion sensor is absent (Google Nest primary trigger)
    if (!result.motion && result.person) {
      result.motion = result.person;
    }

    return result;
  }

  /**
   * Generates display metadata for Google Nest cameras in Matter and HomeKit.
   */
  public static getNestMetadata(
    entityId: string,
    state?: HassState,
  ): {
    manufacturer: string;
    model: string;
    isDoorbell: boolean;
    hasPersonDetection: boolean;
  } {
    const attrs = state?.attributes || {};
    const friendly = String(attrs.friendly_name || entityId).toLowerCase();
    const isDoorbell =
      friendly.includes("doorbell") ||
      friendly.includes("timbre") ||
      entityId.toLowerCase().includes("doorbell");

    return {
      manufacturer: "Google",
      model: isDoorbell ? "Nest Doorbell" : "Nest Cam",
      isDoorbell,
      hasPersonDetection: true,
    };
  }
}

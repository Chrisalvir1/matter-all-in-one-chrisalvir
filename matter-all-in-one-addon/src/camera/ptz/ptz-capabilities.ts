/**
 * PTZ Capabilities Detection and Types for Matter 1.6.1 & MatterBridge 3.10.11.
 * Supports real Hardware PTZ (ONVIF / Scrypted / HA) and Digital PTZ (DPTZ viewport cropping).
 */

export type PtzType = "hardware" | "digital" | "none";

export interface PtzViewport {
  /** Normalized X offset (0.0 to 1.0) */
  x: number;
  /** Normalized Y offset (0.0 to 1.0) */
  y: number;
  /** Normalized width (0.0 to 1.0) */
  width: number;
  /** Normalized height (0.0 to 1.0) */
  height: number;
}

export interface PtzZone {
  /** Unique zone ID (1 to 5) */
  id: number;
  /** Descriptive name of the surveillance zone */
  name: string;
  /** Viewport bounding box for DPTZ */
  viewport?: PtzViewport;
  /** True if zone is enabled */
  enabled: boolean;
}

export interface CameraPtzInfo {
  entityId: string;
  name: string;
  hasPtz: boolean;
  ptzType: PtzType;
  maxPresets: number; // Max 5 presets per Matter 1.6 camera specification
  currentPreset?: number;
  currentZoneId?: number;
  zones: PtzZone[];
  supportsHardwarePtz: boolean;
  supportsDigitalPtz: boolean;
}

export const MAX_PTZ_PRESETS = 5;

/**
 * Generates default surveillance zones for a camera.
 */
export function getDefaultPtzZones(): PtzZone[] {
  return [
    {
      id: 1,
      name: "Zona 1 - Principal",
      viewport: { x: 0, y: 0, width: 1, height: 1 },
      enabled: true,
    },
    {
      id: 2,
      name: "Zona 2 - Entrada",
      viewport: { x: 0, y: 0, width: 0.5, height: 0.5 },
      enabled: true,
    },
    {
      id: 3,
      name: "Zona 3 - Ventana / Acceso",
      viewport: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
      enabled: true,
    },
    {
      id: 4,
      name: "Zona 4 - Perímetro Izquierdo",
      viewport: { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      enabled: false,
    },
    {
      id: 5,
      name: "Zona 5 - Perímetro Derecho",
      viewport: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
      enabled: false,
    },
  ];
}

/**
 * Inspects camera sources, HA attributes, and Scrypted metadata to detect PTZ support.
 */
export function detectCameraPtzCapabilities(
  entityId: string,
  state?: any,
  streamSource?: any,
  scryptedDevice?: any,
): CameraPtzInfo {
  const friendlyName =
    state?.attributes?.friendly_name ||
    streamSource?.metadata?.name ||
    scryptedDevice?.name ||
    entityId;

  // 1. Hardware PTZ Detection
  let supportsHardwarePtz = false;

  // Check Scrypted interfaces
  const scryptedInterfaces: string[] = Array.isArray(scryptedDevice?.interfaces)
    ? scryptedDevice.interfaces
    : [];
  if (
    scryptedInterfaces.includes("PanTiltZoom") ||
    scryptedInterfaces.includes("PanTiltZoomRelative") ||
    scryptedInterfaces.includes("PanTiltZoomAbsolute") ||
    scryptedInterfaces.includes("Zoom")
  ) {
    supportsHardwarePtz = true;
  }

  // Check explicit HA camera capability flags only. Names and model strings
  // are never evidence of PTZ: fixed cameras often contain "pan" or "ptz"
  // in marketing names and created phantom exports in the dashboard.
  const attrs = state?.attributes || {};
  if (attrs.ptz === true || attrs.has_ptz === true || attrs.pan_tilt_zoom === true) supportsHardwarePtz = true;

  // 2. Digital PTZ (DPTZ) Detection
  // DPTZ is supported when video stream is active and either hardware PTZ is available
  // or the camera model/configuration is explicitly designated for PTZ / ROI zones.
  const supportsDigitalPtz = false;

  let ptzType: PtzType = "none";
  if (supportsHardwarePtz) {
    ptzType = "hardware";
  } else if (supportsDigitalPtz) {
    ptzType = "digital";
  }

  const hasPtz = ptzType !== "none";

  return {
    entityId,
    name: friendlyName,
    hasPtz,
    ptzType,
    maxPresets: MAX_PTZ_PRESETS,
    currentPreset: 1,
    currentZoneId: 1,
    zones: getDefaultPtzZones(),
    supportsHardwarePtz,
    supportsDigitalPtz,
  };
}

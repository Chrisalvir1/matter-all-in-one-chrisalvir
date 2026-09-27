/**
 * Export profiles offered by the UI.  These are deliberately constrained to
 * official Matterbridge device types; a profile never invents a device type.
 */
export type AppleHomeCompatibility =
  "supported" | "experimental" | "unsupported";

/**
 * Matter 1.6.1 systime-ms datatype representation.
 * Represents system time in milliseconds with millisecond resolution.
 */
export type SystimeMs = number;

/**
 * Converts a time value (seconds, ISO string, Date, or ms) to Matter 1.6.1 SystimeMs.
 */
export function toSystimeMs(
  value: number | string | Date | undefined | null,
): SystimeMs | undefined {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!isNaN(parsed)) return parsed;
    const num = Number(value);
    if (!isNaN(num)) return num > 1e11 ? num : num * 1000;
  }
  if (typeof value === "number") {
    return value < 1e7 ? Math.round(value * 1000) : Math.round(value);
  }
  return undefined;
}

export interface DeviceExportProfile {
  id: string;
  label: string;
  description: string;
  appleHome: AppleHomeCompatibility;
}

const profilesByDomain: Record<string, DeviceExportProfile[]> = {
  light: [
    {
      id: "onOffLight",
      label: "Luz On/Off",
      description: "Encendido y apagado.",
      appleHome: "supported",
    },
    {
      id: "dimmableLight",
      label: "Luz regulable",
      description: "Encendido, apagado y brillo.",
      appleHome: "supported",
    },
    {
      id: "colorTemperatureLight",
      label: "Luz con temperatura de color",
      description: "Brillo y blanco cálido/frío.",
      appleHome: "supported",
    },
    {
      id: "extendedColorLight",
      label: "Luz de color",
      description: "Brillo, color y temperatura de color.",
      appleHome: "supported",
    },
    {
      id: "dimmablePlugInUnit",
      label: "Enchufe regulable / Dimmer",
      description: "Interruptor o enchufe con control de brillo.",
      appleHome: "supported",
    },
  ],
  switch: [
    {
      id: "onOffPlugInUnit",
      label: "Enchufe",
      description: "Interruptor mostrado como toma de corriente.",
      appleHome: "supported",
    },
    {
      id: "onOffLight",
      label: "Luz On/Off",
      description: "Interruptor mostrado como luz.",
      appleHome: "supported",
    },
    {
      id: "fan",
      label: "Ventilador On/Off",
      description: "Interruptor mostrado como ventilador en Apple Home.",
      appleHome: "supported",
    },
    {
      id: "roboticVacuumCleaner",
      label: "Aspiradora robot (RVC)",
      description:
        "Tipo Matter RVC oficial con controles nativos en Apple Home.",
      appleHome: "supported",
    },
  ],
  fan: [
    {
      id: "fan",
      label: "Ventilador",
      description: "Control de ventilador Matter.",
      appleHome: "supported",
    },
    {
      id: "onOffPlugInUnit",
      label: "Enchufe On/Off",
      description: "Alternativa de máxima compatibilidad.",
      appleHome: "supported",
    },
    {
      id: "onOffLight",
      label: "Luz On/Off",
      description: "Ventilador mostrado como luz en Apple Home.",
      appleHome: "supported",
    },
  ],
  cover: [
    {
      id: "windowCovering",
      label: "Persiana o cortina",
      description: "Posición de apertura/cierre.",
      appleHome: "supported",
    },
    {
      id: "closure",
      label: "Cierre unificado",
      description: "Puerta, portón o garaje.",
      appleHome: "experimental",
    },
  ],
  lock: [
    {
      id: "doorLock",
      label: "Cerradura",
      description: "Estado y control de bloqueo.",
      appleHome: "supported",
    },
  ],
  climate: [
    {
      id: "thermostat",
      label: "Termostato",
      description: "Control HVAC.",
      appleHome: "supported",
    },
  ],
  vacuum: [
    {
      id: "onOffPlugInUnit",
      label: "Enchufe On/Off",
      description: "Alternativa de máxima compatibilidad.",
      appleHome: "supported",
    },
    {
      id: "roboticVacuumCleaner",
      label: "Aspiradora robot (RVC)",
      description:
        "Tipo Matter RVC oficial con controles nativos en Apple Home.",
      appleHome: "supported",
    },
  ],
  media_player: [
    {
      id: "basicVideoPlayer",
      label: "Reproductor de vídeo / TV",
      description: "Tipo Matter Basic Video Player oficial.",
      appleHome: "unsupported",
    },
    {
      id: "onOffPlugInUnit",
      label: "Enchufe On/Off",
      description: "Control de energía básico.",
      appleHome: "supported",
    },
  ],
  humidifier: [
    {
      id: "fan",
      label: "Difusor / Humidificador (Nivel de Vapor)",
      description:
        "Control de encendido y deslizador de vapor/niebla en Apple Home.",
      appleHome: "supported",
    },
    {
      id: "onOffPlugInUnit",
      label: "Enchufe On/Off",
      description: "Control de energía básico.",
      appleHome: "supported",
    },
  ],
  button: [
    {
      id: "onOffPlugInUnit",
      label: "Enchufe / Interruptor",
      description: "Botón expuesto como interruptor On/Off.",
      appleHome: "supported",
    },
    {
      id: "onOffLight",
      label: "Luz On/Off",
      description: "Botón expuesto como luz.",
      appleHome: "supported",
    },
  ],
  binary_sensor: [
    {
      id: "contactSensor",
      label: "Sensor de contacto",
      description: "Puerta, ventana o estado binario.",
      appleHome: "supported",
    },
    {
      id: "occupancySensor",
      label: "Sensor de movimiento",
      description: "Detección de presencia o movimiento.",
      appleHome: "supported",
    },
  ],
  sensor: [
    {
      id: "temperatureSensor",
      label: "Sensor de temperatura",
      description: "Medición de temperatura.",
      appleHome: "supported",
    },
    {
      id: "humiditySensor",
      label: "Sensor de humedad",
      description: "Medición de humedad relativa.",
      appleHome: "supported",
    },
    {
      id: "lightSensor",
      label: "Sensor de luz",
      description: "Medición de iluminancia (lux).",
      appleHome: "supported",
    },
  ],
  camera: [
    {
      id: "camera",
      label: "Cámara Apple Home (Live View & Passthrough H.264)",
      description:
        "Exporta la cámara a Apple Home vía HomeKit (HAP) con streaming de video H.264 sin transcodificación, snapshots periódicos y audio opcional.",
      appleHome: "supported",
    },
    {
      id: "matterCamera",
      label: "Cámara Matter 1.6.1 (WebRTC Live View)",
      description:
        "Cámara Matter oficial usando clusters Camera AV Stream Management (0x0551) y WebRTC Transport Provider (0x0553).",
      appleHome: "supported",
    },
    {
      id: "matterCameraPtz",
      label: "Cámara Matter 1.6.1 + PTZ & Zonas (DPTZ)",
      description:
        "Cámara Matter 1.6.1 con soporte de Digital PTZ (DPTZ), presets y hasta 5 zonas de vigilancia activables.",
      appleHome: "supported",
    },
    {
      id: "cameraZoneSwitch",
      label: "Interruptor Matter de Zonas de Vigilancia (Single Switch)",
      description:
        "Exporta un interruptor Matter para activar las zonas de vigilancia DPTZ y mover la cámara con flechas desde Apple Home y Google Home.",
      appleHome: "supported",
    },
    {
      id: "occupancySensor",
      label: "Sensor de movimiento / presencia",
      description: "Exportar eventos de detección de movimiento de la cámara.",
      appleHome: "supported",
    },
  ],
};

const defaultProfileByDomain: Record<string, string> = {
  camera: "camera",
  light: "dimmableLight",
  switch: "onOffPlugInUnit",
  fan: "fan",
  cover: "windowCovering",
  lock: "doorLock",
  climate: "thermostat",
  vacuum: "roboticVacuumCleaner",
  media_player: "onOffPlugInUnit",
  humidifier: "fan",
  button: "onOffPlugInUnit",
  binary_sensor: "contactSensor",
  sensor: "temperatureSensor",
};

export function getExportProfiles(domain: string): DeviceExportProfile[] {
  return profilesByDomain[domain] ?? [];
}

export function getExportProfile(
  domain: string,
  profileId?: string,
): DeviceExportProfile | undefined {
  return getExportProfiles(domain).find((profile) => profile.id === profileId);
}

export function getDefaultExportProfileId(domain: string): string | undefined {
  return defaultProfileByDomain[domain];
}

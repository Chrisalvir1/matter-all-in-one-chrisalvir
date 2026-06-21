/**
 * Export profiles offered by the UI.  These are deliberately constrained to
 * official Matterbridge device types; a profile never invents a device type.
 */
export type AppleHomeCompatibility = 'supported' | 'experimental' | 'unsupported';

export interface DeviceExportProfile {
  id: string;
  label: string;
  description: string;
  appleHome: AppleHomeCompatibility;
}

const profilesByDomain: Record<string, DeviceExportProfile[]> = {
  light: [
    { id: 'onOffLight', label: 'Luz On/Off', description: 'Encendido y apagado.', appleHome: 'supported' },
    { id: 'dimmableLight', label: 'Luz regulable', description: 'Encendido, apagado y brillo.', appleHome: 'supported' },
    { id: 'colorTemperatureLight', label: 'Luz con temperatura de color', description: 'Brillo y blanco cálido/frío.', appleHome: 'supported' },
    { id: 'extendedColorLight', label: 'Luz de color', description: 'Brillo, color y temperatura de color.', appleHome: 'supported' },
  ],
  switch: [
    { id: 'onOffPlugInUnit', label: 'Enchufe', description: 'Interruptor mostrado como toma de corriente.', appleHome: 'supported' },
    { id: 'onOffLight', label: 'Luz On/Off', description: 'Interruptor mostrado como luz.', appleHome: 'supported' },
  ],
  fan: [
    { id: 'fan', label: 'Ventilador', description: 'Control de ventilador Matter.', appleHome: 'experimental' },
    { id: 'onOffPlugInUnit', label: 'Enchufe On/Off', description: 'Alternativa de máxima compatibilidad.', appleHome: 'supported' },
  ],
  cover: [
    { id: 'windowCovering', label: 'Persiana o cortina', description: 'Posición de apertura/cierre.', appleHome: 'supported' },
    { id: 'closure', label: 'Cierre unificado', description: 'Puerta, portón o garaje.', appleHome: 'experimental' },
  ],
  lock: [
    { id: 'doorLock', label: 'Cerradura', description: 'Estado y control de bloqueo.', appleHome: 'supported' },
  ],
  climate: [
    { id: 'thermostat', label: 'Termostato', description: 'Control HVAC.', appleHome: 'supported' },
  ],
  vacuum: [
    { id: 'roboticVacuumCleaner', label: 'Aspiradora robot (RVC)', description: 'Tipo Matter RVC oficial con controles nativos en Apple Home.', appleHome: 'supported' },
  ],
  media_player: [
    { id: 'basicVideoPlayer', label: 'Reproductor de vídeo / TV', description: 'Tipo Matter Basic Video Player oficial.', appleHome: 'unsupported' },
    { id: 'onOffPlugInUnit', label: 'Enchufe On/Off', description: 'Control de energía básico.', appleHome: 'supported' },
  ],
  humidifier: [
    { id: 'fan', label: 'Ventilador', description: 'Mapea velocidad a nivel de humidificación.', appleHome: 'experimental' },
    { id: 'onOffPlugInUnit', label: 'Enchufe On/Off', description: 'Control de energía básico.', appleHome: 'supported' },
  ],
  button: [
    { id: 'onOffPlugInUnit', label: 'Acción On/Off', description: 'Solo para botones independientes.', appleHome: 'supported' },
  ],
};

const defaultProfileByDomain: Record<string, string> = {
  light: 'dimmableLight',
  switch: 'onOffPlugInUnit',
  fan: 'fan',
  cover: 'closure',
  lock: 'doorLock',
  climate: 'thermostat',
  vacuum: 'roboticVacuumCleaner',
  media_player: 'basicVideoPlayer',
  humidifier: 'onOffPlugInUnit',
  button: 'onOffPlugInUnit',
};

export function getExportProfiles(domain: string): DeviceExportProfile[] {
  return profilesByDomain[domain] ?? [];
}

export function getExportProfile(domain: string, profileId?: string): DeviceExportProfile | undefined {
  return getExportProfiles(domain).find((profile) => profile.id === profileId);
}

export function getDefaultExportProfileId(domain: string): string | undefined {
  return defaultProfileByDomain[domain];
}

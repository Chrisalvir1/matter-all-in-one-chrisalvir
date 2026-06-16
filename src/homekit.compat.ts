/**
 * HomeKit compatibility map for Matter 1.0-1.5 device types.
 * Helps determine routing and warning levels for HomeKit integration.
 */
export const homekitSupportedDeviceTypes = {
  // Matter 1.0-1.3 (totalmente soportados)
  onOffLight: true,
  dimmableLight: true,
  colorTemperatureLight: true,
  extendedColorLight: true,
  onOffPlugInUnit: true,
  dimmablePlugInUnit: true,
  doorLock: true,
  thermostat: true,
  windowCovering: true,  // legacy, usar closure
  contactSensor: true,
  occupancySensor: true,
  temperatureSensor: true,
  humiditySensor: true,
  illuminanceSensor: true,
  
  // Matter 1.4 (HomeKit aún NO soporta)
  waterHeater: false,
  evse: false,           // EV Charger
  solarPanel: false,
  heatPump: false,
  
  // Matter 1.5 (HomeKit SÍ soporta - 2025/2026)
  camera: true,          // ⭐ Nuevo
  closure: true,         // ⭐ Reemplaza WindowCovering
  soilSensor: true,      // ⭐ Nuevo
  energyTariff: false,   // ⚠️ Parcial
} as const;

export type HomeKitSupportedDeviceType = keyof typeof homekitSupportedDeviceTypes;

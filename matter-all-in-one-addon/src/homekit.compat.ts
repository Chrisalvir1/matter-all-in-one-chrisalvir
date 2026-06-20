export const homekitSupported = {
  camera: true,
  closure: true,
  soilSensor: true,
  waterHeater: false,
  evse: false,
  solarPanel: false,
  // Other defaults can be true or false depending on Matter 1.4+ vs HomeKit support
  onOffLight: true,
  dimmableLight: true,
  colorTemperatureLight: true,
  extendedColorLight: true,
  onOffPlugInUnit: true,
  dimmablePlugInUnit: true,
  doorLock: true,
  thermostat: true,
  windowCovering: true,
  contactSensor: true,
  occupancySensor: true,
  temperatureSensor: true,
  humiditySensor: true,
  illuminanceSensor: true,
  energyTariff: false,
  roboticVacuumCleaner: true,
  fan: true,
  humidifier: true
} as const;

export type HomeKitSupportedDeviceType = keyof typeof homekitSupported;

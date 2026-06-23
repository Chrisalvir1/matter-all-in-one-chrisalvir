export const homekitSupported = {
  // These Matter 1.5 types are not enabled by this bridge until their
  // transport/cluster mappings have been implemented and interoperably tested.
  camera: false,
  closure: false,
  soilSensor: false,
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
  humidifier: false
} as const;

export type HomeKitSupportedDeviceType = keyof typeof homekitSupported;

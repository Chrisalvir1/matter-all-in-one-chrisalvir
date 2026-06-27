/**
 * Matter 1.6 HomeKit compatibility map.
 *
 * Matter 1.6 (CSA, 17 Jun 2026) introduces: NFC commissioning, Joint Fabric,
 * Thermostat Suggestions and security sensor event history improvements.
 * These features are implemented by the Matter controller (Apple Home, Google, Amazon);
 * this bridge benefits automatically via matterbridge@3.9.2 which bundles the updated SDK.
 *
 * Device types marked `false` below are NOT enabled until transport/cluster
 * mappings have been implemented and interoperably tested with Matter 1.6 controllers.
 */
export const homekitSupported = {
  // Matter 1.6: not enabled pending full interop testing
  camera: false,
  closure: false,
  soilSensor: false,
  waterHeater: false,
  evse: false,
  solarPanel: false,
  // Fully supported — Matter 1.4+ and Apple Home verified
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
  humidifier: false,
} as const;

export type HomeKitSupportedDeviceType = keyof typeof homekitSupported;

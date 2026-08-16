import { DeviceTypeDefinition } from 'matterbridge';
import { homekitSupported } from './homekit.compat.js';

// We import the MatterDeviceTypes we exported previously, or we redefine them here
import {
  onOffLight,
  dimmableLight,
  colorTemperatureLight,
  extendedColorLight,
  onOffPlugInUnit,
  dimmablePlugInUnit,
  doorLock,
  thermostat,
  windowCovering,
  temperatureSensor,
  humiditySensor,
  contactSensor,
  occupancySensor,
  pressureSensor,
  flowSensor,
  lightSensor,
  roboticVacuumCleaner,
  basicVideoPlayer,
  fan,
  cooktop,
  oven,
  smokeCoAlarm,
  waterLeakDetector,
} from 'matterbridge';

export const MatterDeviceTypes = {
  onOffLight,
  dimmableLight,
  colorTemperatureLight,
  extendedColorLight,
  onOffPlugInUnit,
  dimmablePlugInUnit,
  doorLock,
  thermostat,
  windowCovering,
  temperatureSensor,
  humiditySensor,
  contactSensor,
  occupancySensor,
  pressureSensor,
  flowSensor,
  lightSensor,
  smokeCoAlarm,
  waterLeakDetector,

  camera: {
    code: 0x0510,
    name: 'Camera',
    deviceClass: 'Simple',
    category: 'Security',
  } as any as DeviceTypeDefinition,

  closure: {
    code: 0x000d,
    name: 'Closure',
    deviceClass: 'Simple',
    category: 'Closure',
  } as any as DeviceTypeDefinition,

  soilSensor: {
    code: 0x000c,
    name: 'SoilSensor',
    deviceClass: 'Simple',
    category: 'Sensor',
  } as any as DeviceTypeDefinition,

  energyTariff: {
    code: 0x000e,
    name: 'EnergyTariff',
    deviceClass: 'Simple',
    category: 'Utility',
  } as any as DeviceTypeDefinition,

  petFeeder: onOffPlugInUnit,

  roboticVacuumCleaner,

  basicVideoPlayer,

  fan,

  cooktop,

  oven,
};

export interface DeviceRegistryEntry {
  matterType: DeviceTypeDefinition;
  homekitSupported: boolean;
}

export const DEVICE_REGISTRY: Record<string, DeviceRegistryEntry> = {
  camera: { matterType: MatterDeviceTypes.camera, homekitSupported: homekitSupported.camera },
  cover: { matterType: MatterDeviceTypes.windowCovering, homekitSupported: homekitSupported.windowCovering },
  climate: { matterType: MatterDeviceTypes.thermostat, homekitSupported: homekitSupported.thermostat },
  lock: { matterType: MatterDeviceTypes.doorLock, homekitSupported: homekitSupported.doorLock },
  light: { matterType: MatterDeviceTypes.dimmableLight, homekitSupported: homekitSupported.dimmableLight },
  switch: { matterType: MatterDeviceTypes.onOffPlugInUnit, homekitSupported: homekitSupported.onOffPlugInUnit },
  vacuum: { matterType: MatterDeviceTypes.roboticVacuumCleaner, homekitSupported: homekitSupported.roboticVacuumCleaner },
  media_player: { matterType: MatterDeviceTypes.onOffPlugInUnit, homekitSupported: homekitSupported.onOffPlugInUnit },
  button: { matterType: MatterDeviceTypes.onOffPlugInUnit, homekitSupported: homekitSupported.onOffPlugInUnit },
  fan: { matterType: MatterDeviceTypes.fan, homekitSupported: homekitSupported.fan },
  humidifier: { matterType: MatterDeviceTypes.fan, homekitSupported: homekitSupported.fan },
  // Domain-level fallback mapping; specific device_classes logic may still need to be handled if required
  binary_sensor: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
  sensor: { matterType: MatterDeviceTypes.temperatureSensor, homekitSupported: homekitSupported.temperatureSensor },
};

// Add specific classes mapping for binary_sensor
export const DEVICE_CLASS_REGISTRY: Record<string, Record<string, DeviceRegistryEntry>> = {
  binary_sensor: {
    motion: { matterType: MatterDeviceTypes.occupancySensor, homekitSupported: homekitSupported.occupancySensor },
    occupancy: { matterType: MatterDeviceTypes.occupancySensor, homekitSupported: homekitSupported.occupancySensor },
    door: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    window: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    opening: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    smoke: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    gas: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    carbon_monoxide: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    moisture: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    safety: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
    tamper: { matterType: MatterDeviceTypes.contactSensor, homekitSupported: homekitSupported.contactSensor },
  },
  sensor: {
    temperature: { matterType: MatterDeviceTypes.temperatureSensor, homekitSupported: homekitSupported.temperatureSensor },
    humidity: { matterType: MatterDeviceTypes.humiditySensor, homekitSupported: homekitSupported.humiditySensor },
    illuminance: { matterType: MatterDeviceTypes.lightSensor, homekitSupported: homekitSupported.illuminanceSensor },
    moisture: { matterType: MatterDeviceTypes.humiditySensor, homekitSupported: homekitSupported.humiditySensor },
    monetary: { matterType: MatterDeviceTypes.energyTariff, homekitSupported: homekitSupported.energyTariff },
  }
};

/** Select the narrowest light device type supported by the HA capabilities. */
/**
 * HA can omit the current `color_temp_kelvin` value while a light is off.
 * Its supported mode, current mode and advertised min/max range are all
 * capability evidence and must therefore be considered when the Matter
 * endpoint is built.
 */
export function hasColorTemperatureCapability(attributes: Record<string, any> = {}): boolean {
  const modes: string[] = attributes.supported_color_modes ?? [];
  const supportedFeatures = Number(attributes.supported_features || 0);
  return modes.includes('color_temp')
    || (supportedFeatures & 2) !== 0
    || attributes.color_mode === 'color_temp'
    || attributes.color_temp !== undefined
    || attributes.color_temp_kelvin !== undefined
    || attributes.min_color_temp_kelvin !== undefined
    || attributes.max_color_temp_kelvin !== undefined
    || (typeof attributes.min_mireds === 'number' && typeof attributes.max_mireds === 'number');
}

export function getLightDeviceType(attributes: Record<string, any> = {}): DeviceTypeDefinition {
  const modes: string[] = attributes.supported_color_modes ?? [];
  const supportedFeatures = Number(attributes.supported_features || 0);
  if (modes.some((mode) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode)) || (supportedFeatures & 16) !== 0 || attributes.rgb_color !== undefined || attributes.hs_color !== undefined || attributes.xy_color !== undefined) {
    return MatterDeviceTypes.extendedColorLight;
  }
  if (hasColorTemperatureCapability(attributes)) {
    return MatterDeviceTypes.colorTemperatureLight;
  }
  if (modes.includes('brightness') || attributes.brightness !== undefined || (supportedFeatures & 1) !== 0) {
    return MatterDeviceTypes.dimmableLight;
  }
  return MatterDeviceTypes.onOffLight;
}

export function getDeviceTypeForEntity(domain: string, deviceClass?: string, attributes: Record<string, any> = {}): DeviceTypeDefinition {
  if (domain === 'light') return getLightDeviceType(attributes);
  if (deviceClass && DEVICE_CLASS_REGISTRY[domain]?.[deviceClass]) {
    return DEVICE_CLASS_REGISTRY[domain][deviceClass].matterType;
  }
  return DEVICE_REGISTRY[domain]?.matterType || MatterDeviceTypes.onOffPlugInUnit;
}

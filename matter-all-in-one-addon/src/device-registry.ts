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
};

export interface DeviceRegistryEntry {
  matterType: DeviceTypeDefinition;
  homekitSupported: boolean;
}

export const DEVICE_REGISTRY: Record<string, DeviceRegistryEntry> = {
  camera: { matterType: MatterDeviceTypes.camera, homekitSupported: homekitSupported.camera },
  cover: { matterType: MatterDeviceTypes.closure, homekitSupported: homekitSupported.closure }, // Note: unified cover
  climate: { matterType: MatterDeviceTypes.thermostat, homekitSupported: homekitSupported.thermostat },
  lock: { matterType: MatterDeviceTypes.doorLock, homekitSupported: homekitSupported.doorLock },
  light: { matterType: MatterDeviceTypes.dimmableLight, homekitSupported: homekitSupported.dimmableLight },
  switch: { matterType: MatterDeviceTypes.onOffPlugInUnit, homekitSupported: homekitSupported.onOffPlugInUnit },
  vacuum: { matterType: MatterDeviceTypes.onOffPlugInUnit, homekitSupported: homekitSupported.onOffPlugInUnit },
  button: { matterType: MatterDeviceTypes.onOffPlugInUnit, homekitSupported: homekitSupported.onOffPlugInUnit },
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
  },
  sensor: {
    temperature: { matterType: MatterDeviceTypes.temperatureSensor, homekitSupported: homekitSupported.temperatureSensor },
    humidity: { matterType: MatterDeviceTypes.humiditySensor, homekitSupported: homekitSupported.humiditySensor },
    illuminance: { matterType: MatterDeviceTypes.lightSensor, homekitSupported: homekitSupported.illuminanceSensor },
    moisture: { matterType: MatterDeviceTypes.soilSensor, homekitSupported: homekitSupported.soilSensor },
    monetary: { matterType: MatterDeviceTypes.energyTariff, homekitSupported: homekitSupported.energyTariff },
  }
};

export function getDeviceTypeForEntity(domain: string, deviceClass?: string): DeviceTypeDefinition {
  if (deviceClass && DEVICE_CLASS_REGISTRY[domain]?.[deviceClass]) {
    return DEVICE_CLASS_REGISTRY[domain][deviceClass].matterType;
  }
  return DEVICE_REGISTRY[domain]?.matterType || MatterDeviceTypes.onOffPlugInUnit;
}

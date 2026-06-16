/**
 * Device registry mapping Home Assistant domains and device classes to Matter 1.5 device types.
 */
import { DeviceTypeDefinition } from 'matterbridge';
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
} from 'matterbridge/matter/clusters';

// Matter 1.5 Device Types (represented as custom descriptors if not directly exported by matterbridge version)
export const MatterDeviceTypes = {
  // Standard
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

  // Matter 1.5 New Device Types
  camera: {
    code: 0x0510,
    name: 'Camera',
    deviceClass: 'Simple',
    category: 'Security',
  } as DeviceTypeDefinition,

  closure: {
    code: 0x000d, // Matter Closure Unified
    name: 'Closure',
    deviceClass: 'Simple',
    category: 'Closure',
  } as DeviceTypeDefinition,

  soilSensor: {
    code: 0x000c, // Custom or Soil moisture sensor type code
    name: 'SoilSensor',
    deviceClass: 'Simple',
    category: 'Sensor',
  } as DeviceTypeDefinition,

  energyTariff: {
    code: 0x000e, // Custom energy conditions
    name: 'EnergyTariff',
    deviceClass: 'Simple',
    category: 'Utility',
  } as DeviceTypeDefinition,
};

export interface DeviceMapping {
  deviceType: DeviceTypeDefinition;
  homekitCompatible: boolean;
}

/**
 * Registry mapping logic.
 */
export function getDeviceTypeForEntity(domain: string, deviceClass?: string): DeviceTypeDefinition {
  if (domain === 'camera') {
    return MatterDeviceTypes.camera;
  }

  if (domain === 'cover') {
    // Closure unified covers
    const closureClasses = ['garage_door', 'gate', 'blind', 'shade', 'curtain', 'awning'];
    if (deviceClass && closureClasses.includes(deviceClass)) {
      return MatterDeviceTypes.closure;
    }
    return MatterDeviceTypes.windowCovering;
  }

  if (domain === 'climate') {
    return MatterDeviceTypes.thermostat;
  }

  if (domain === 'lock') {
    return MatterDeviceTypes.doorLock;
  }

  if (domain === 'light') {
    return MatterDeviceTypes.dimmableLight; // Default to dimmable, refined by attributes
  }

  if (domain === 'switch') {
    return MatterDeviceTypes.onOffPlugInUnit;
  }

  if (domain === 'binary_sensor') {
    if (deviceClass === 'motion' || deviceClass === 'occupancy') {
      return MatterDeviceTypes.occupancySensor;
    }
    if (deviceClass === 'door' || deviceClass === 'window' || deviceClass === 'opening') {
      return MatterDeviceTypes.contactSensor;
    }
    return MatterDeviceTypes.contactSensor; // Fallback
  }

  if (domain === 'sensor') {
    if (deviceClass === 'temperature') {
      return MatterDeviceTypes.temperatureSensor;
    }
    if (deviceClass === 'humidity') {
      return MatterDeviceTypes.humiditySensor;
    }
    if (deviceClass === 'illuminance') {
      return MatterDeviceTypes.lightSensor;
    }
    if (deviceClass === 'moisture') {
      // moisture sensor is treated as Soil Sensor under Matter 1.5
      return MatterDeviceTypes.soilSensor;
    }
    if (deviceClass === 'monetary') {
      return MatterDeviceTypes.energyTariff;
    }
  }

  // Fallback to simple on/off plug
  return MatterDeviceTypes.onOffPlugInUnit;
}

import { describe, expect, it } from 'vitest';
import { getDeviceTypeForEntity, getLightDeviceType } from '../src/device-registry.js';

describe('light device type selection', () => {
  it('does not invent light capabilities', () => {
    expect(getLightDeviceType({}).name).toBe('OnOffLight');
    expect(getLightDeviceType({ brightness: 10 }).name).toBe('DimmableLight');
    expect(getLightDeviceType({ supported_color_modes: ['color_temp'] }).name).toBe('ColorTemperatureLight');
    expect(getLightDeviceType({ supported_color_modes: ['hs'] }).name).toBe('ExtendedColorLight');
  });

  it('keeps warm/cold capability when HA omits the current colour temperature', () => {
    expect(getLightDeviceType({
      color_mode: 'color_temp',
      min_color_temp_kelvin: 2200,
      max_color_temp_kelvin: 6500,
    }).name).toBe('ColorTemperatureLight');
  });
});

describe('Apple Home-safe default device types', () => {
  it('exports covers as WindowCovering by default', () => {
    const deviceType = getDeviceTypeForEntity('cover', 'garage_door');
    expect(deviceType.name).toMatch(/windowcovering/i);
    expect(deviceType.code).toBe(0x0202);
  });

  it('uses an Apple Home-compatible media player fallback by default', () => {
    const deviceType = getDeviceTypeForEntity('media_player');
    expect(deviceType.name).toMatch(/onoffpluginunit/i);
    expect(deviceType.code).toBe(0x010a);
  });

  it('exports fans as native Matter Fan by default', () => {
    const deviceType = getDeviceTypeForEntity('fan');
    expect(deviceType.name).toMatch(/fan/i);
    expect(deviceType.code).toBe(0x002b);
  });

  it('does not export moisture sensors as experimental SoilSensor by default', () => {
    const deviceType = getDeviceTypeForEntity('sensor', 'moisture');
    expect(deviceType.name).toMatch(/humiditysensor/i);
    expect(deviceType.code).toBe(0x0307);
  });
});

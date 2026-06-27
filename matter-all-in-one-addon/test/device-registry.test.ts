import { describe, expect, it } from 'vitest';
import { getLightDeviceType } from '../src/device-registry.js';

describe('light device type selection', () => {
  it('does not invent light capabilities', () => {
    expect(getLightDeviceType({}).name).toBe('OnOffLight');
    expect(getLightDeviceType({ brightness: 10 }).name).toBe('DimmableLight');
    expect(getLightDeviceType({ supported_color_modes: ['color_temp'] }).name).toBe('ColorTemperatureLight');
    expect(getLightDeviceType({ supported_color_modes: ['hs'] }).name).toBe('ExtendedColorLight');
  });
});

import { describe, it, expect } from 'vitest';
import { sensorConverter } from '../../src/converters/sensor.converter.js';

describe('sensorConverter', () => {
  it('should convert temperature values to hundredths of degree Celsius', () => {
    const state = { state: '22.5', attributes: {} } as any;
    expect(sensorConverter.toTemperature(state)).toBe(2250);
  });

  it('should convert humidity values to hundredths of percentage', () => {
    const state = { state: '45.8', attributes: {} } as any;
    expect(sensorConverter.toHumidity(state)).toBe(4580);
  });

  it('should convert lux to logarithmic illuminance values', () => {
    const state = { state: '100', attributes: {} } as any;
    // 10000 * log10(100) + 1 = 10000 * 2 + 1 = 20001
    expect(sensorConverter.toIlluminance(state)).toBe(20001);
  });
});

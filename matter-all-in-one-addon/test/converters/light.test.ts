import { describe, it, expect } from 'vitest';
import { lightConverter } from '../../src/converters/light.converter.js';

describe('lightConverter', () => {
  it('should convert state to OnOff strictly based on state', () => {
    const activeState = { state: 'on', attributes: {} } as any;
    const inactiveState = { state: 'off', attributes: { brightness: 255 } } as any;

    expect(lightConverter.toOnOff(activeState)).toBe(true);
    expect(lightConverter.toOnOff(inactiveState)).toBe(false);
  });

  it('should convert HA brightness (1..255) to Matter level (1..254)', () => {
    // Min HA brightness
    expect(lightConverter.toLevel(1)).toBe(1);
    // Max HA brightness
    expect(lightConverter.toLevel(255)).toBe(254);
    // Midpoint
    expect(lightConverter.toLevel(128)).toBe(127);
    // Defensive handling for non-conforming integration reporting 0
    expect(lightConverter.toLevel(0)).toBe(1);
  });

  it('should convert Matter level (1..254) to HA brightness (1..255)', () => {
    // Min Matter level
    expect(lightConverter.toHaBrightness(1)).toBe(1);
    // Max Matter level
    expect(lightConverter.toHaBrightness(254)).toBe(255);
    // Midpoint
    expect(lightConverter.toHaBrightness(127)).toBe(128);
    // Clamping
    expect(lightConverter.toHaBrightness(0)).toBe(1);
    expect(lightConverter.toHaBrightness(300)).toBe(255);
  });
});

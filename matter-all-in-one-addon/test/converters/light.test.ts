import { describe, it, expect } from 'vitest';
import { lightConverter } from '../../src/converters/light.converter.js';

describe('lightConverter', () => {
  it('should convert state to OnOff', () => {
    const activeState = { state: 'on', attributes: {} } as any;
    const inactiveState = { state: 'off', attributes: {} } as any;

    expect(lightConverter.toOnOff(activeState)).toBe(true);
    expect(lightConverter.toOnOff(inactiveState)).toBe(false);
  });

  it('should convert HA brightness to Matter level', () => {
    const state = { state: 'on', attributes: { brightness: 127 } } as any;
    expect(lightConverter.toLevel(state)).toBe(127);
  });

  it('should convert Matter level to HA brightness', () => {
    expect(lightConverter.toHaBrightness(126)).toBe(126);
  });
});

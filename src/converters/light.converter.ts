/**
 * Converter utility for light and switch domains.
 */
import { HassState } from '../utils/ha-state.js';

export const lightConverter = {
  /**
   * Map HA state to OnOff boolean.
   */
  toOnOff(state: HassState): boolean {
    return state.state === 'on';
  },

  /**
   * Map HA brightness (0..255) to Matter currentLevel (0..254).
   */
  toLevel(state: HassState): number {
    const brightness = state.attributes.brightness;
    if (brightness === undefined || brightness === null) return 0;
    return Math.round((brightness / 255) * 254);
  },

  /**
   * Map Matter currentLevel (0..254) back to HA brightness (0..255).
   */
  toHaBrightness(level: number): number {
    return Math.round((level / 254) * 255);
  },
};

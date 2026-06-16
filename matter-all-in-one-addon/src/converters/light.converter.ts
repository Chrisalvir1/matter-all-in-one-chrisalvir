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
   * Map HA brightness (0..255) to Matter currentLevel (1..254).
   *
   * Matter spec (LevelControl cluster): currentLevel=0 is explicitly
   * reserved and most controllers (including Apple Home) treat it as
   * invalid when minLevel > 0.  Govee and other dimmers report minLevel
   * up to 135, causing a constraint violation and an UnhandledRejection
   * if we send 0.  We clamp the minimum to 1 here; the off state is
   * always communicated through the OnOff cluster (onOff=false) rather
   * than by zeroing currentLevel.
   */
  toLevel(state: HassState): number {
    const brightness = state.attributes.brightness;
    if (brightness === undefined || brightness === null) return 1;
    const raw = Math.round((brightness / 255) * 254);
    return Math.max(1, raw);
  },

  /**
   * Map Matter currentLevel (0..254) back to HA brightness (0..255).
   */
  toHaBrightness(level: number): number {
    return Math.round((level / 254) * 255);
  },
};

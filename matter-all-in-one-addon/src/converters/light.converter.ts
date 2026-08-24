/**
 * Converter utility for light and switch domains.
 * Home Assistant is the authoritative state source for Matter All-in-One Creator.
 */
import { HassState } from '../utils/ha-state.js';

export const lightConverter = {
  /**
   * Map HA state to OnOff boolean.
   * State and is_on are the sole authority for OnOff; brightness is never used to infer power.
   */
  toOnOff(state: HassState): boolean {
    return state.state === 'on';
  },

  /**
   * Map HA brightness (1..255, with defensive fallback for 0) to Matter currentLevel (1..254).
   *
   * Modern Home Assistant specifies brightness in the range 1..255 (or null when off).
   * Matter LevelControl cluster specifies CurrentLevel in the range 1..254.
   *
   * If an uncompliant integration reports brightness 0, it is defensively clamped to 1
   * without affecting the OnOff state.
   */
  toLevel(state: HassState | number): number {
    const brightness = typeof state === 'number' ? state : state?.attributes?.brightness;
    if (brightness === undefined || brightness === null) return 1;
    // Defensive handling: clamp between 1 and 255 before mapping
    const clampedHa = Math.max(1, Math.min(255, brightness));
    const raw = Math.round((clampedHa / 255) * 254);
    return Math.max(1, Math.min(254, raw));
  },

  /**
   * Map Matter currentLevel (1..254) back to HA brightness (1..255).
   */
  toHaBrightness(level: number): number {
    const clampedLevel = Math.max(1, Math.min(254, level));
    const raw = Math.round((clampedLevel / 254) * 255);
    return Math.max(1, Math.min(255, raw));
  },
};


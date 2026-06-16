/**
 * Converter utility for climate (thermostat) domain.
 */
import { HassState } from '../utils/ha-state.js';

export const climateConverter = {
  /**
   * Convert Celsius temperature to Matter value (hundredths of a degree Celsius).
   */
  toMatterTemperature(celsius: number | undefined | null): number | null {
    if (celsius === undefined || celsius === null) return null;
    return Math.round(celsius * 100);
  },

  /**
   * Convert Matter temperature back to Celsius.
   */
  toCelsius(matterValue: number): number {
    return matterValue / 100;
  },

  /**
   * Map HA HVAC modes to Matter SystemMode values.
   */
  toMatterSystemMode(mode: string | null): number {
    switch (mode) {
      case 'off':
        return 0; // Off
      case 'heat':
        return 4; // Heat
      case 'cool':
        return 3; // Cool
      case 'auto':
      case 'heat_cool':
        return 1; // Auto
      default:
        return 0;
    }
  },

  /**
   * Map Matter SystemMode values back to HA HVAC modes.
   */
  toHaHvacMode(systemMode: number): string {
    switch (systemMode) {
      case 0:
        return 'off';
      case 4:
        return 'heat';
      case 3:
        return 'cool';
      case 1:
        return 'auto';
      default:
        return 'off';
    }
  },
};

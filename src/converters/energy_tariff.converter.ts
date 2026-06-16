/**
 * Converter utility for energy tariff and monetary sensors in Matter 1.5.
 */
import { HassState } from '../utils/ha-state.js';

export const energyTariffConverter = {
  /**
   * Convert monetary sensor value.
   */
  toTariffValue(state: HassState): number | null {
    const rawVal = parseFloat(state.state);
    if (isNaN(rawVal)) return null;
    return rawVal; // Return raw value representing financial or grid units
  },
};

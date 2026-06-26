/**
 * Converter utility for soil sensors.
 */
import { HassState } from '../utils/ha-state.js';

export const soilSensorConverter = {
  /**
   * Convert moisture state percentage to Matter format (0..10000).
   */
  toMoistureValue(state: HassState): number | null {
    const rawVal = parseFloat(state.state);
    if (isNaN(rawVal)) return null;
    return Math.round(rawVal * 100);
  },

  /**
   * Convert temperature state to Matter temperature format.
   */
  toTemperatureValue(state: HassState): number | null {
    const rawVal = parseFloat(state.state);
    if (isNaN(rawVal)) return null;
    return Math.round(rawVal * 100);
  },
};

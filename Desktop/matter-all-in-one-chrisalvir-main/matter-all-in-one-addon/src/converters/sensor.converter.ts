/**
 * Converter utility for sensor domain.
 */
import { HassState } from '../utils/ha-state.js';

export const sensorConverter = {
  /**
   * Convert temperature sensor value.
   */
  toTemperature(state: HassState): number | null {
    const val = parseFloat(state.state);
    if (isNaN(val)) return null;
    return Math.round(val * 100); // Matter Temp is in 0.01 C
  },

  /**
   * Convert relative humidity value.
   */
  toHumidity(state: HassState): number | null {
    const val = parseFloat(state.state);
    if (isNaN(val)) return null;
    return Math.round(val * 100); // Matter Humidity is in 0.01 %
  },

  /**
   * Convert light/illuminance value.
   */
  toIlluminance(state: HassState): number | null {
    const val = parseFloat(state.state);
    if (isNaN(val)) return null;
    // Matter Illuminance = 10000 * log10(Lux) + 1
    if (val <= 0) return 1;
    return Math.round(10000 * Math.log10(val) + 1);
  },
};

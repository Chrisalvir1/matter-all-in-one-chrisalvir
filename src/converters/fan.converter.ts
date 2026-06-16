/**
 * Converter utility for fan domain.
 */
import { HassState } from '../utils/ha-state.js';

export const fanConverter = {
  /**
   * Convert percentage attribute (0..100) from HA to Matter fan speed percentage (0..100).
   */
  toPercentage(state: HassState): number {
    return state.attributes.percentage ?? 0;
  },

  /**
   * Map Matter speed percentage back to HA preset/percentage.
   */
  toHaPercentage(percent: number): number {
    return percent;
  },
};

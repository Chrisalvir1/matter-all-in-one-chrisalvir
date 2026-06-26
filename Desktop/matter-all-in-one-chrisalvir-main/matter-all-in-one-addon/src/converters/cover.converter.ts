/**
 * Converter utility for cover domain to Matter 1.5.1 Closure values.
 */
import { HassState } from '../utils/ha-state.js';

export const coverConverter = {
  /**
   * Map HA current_position (0..100) to Matter currentPosition.
   */
  toPosition(state: HassState): number {
    const pos = state.attributes.current_position;
    if (pos === undefined || pos === null) return 0;
    return Math.round(pos);
  },

  /**
   * Map HA state to Closure status value.
   */
  toClosureStatus(state: HassState): number {
    if (state.state === 'closed') return 0;
    if (state.state === 'open') return 100;
    return state.attributes.current_position ?? 50;
  },
};

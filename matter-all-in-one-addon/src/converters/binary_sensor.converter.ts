/**
 * Converter utility for binary_sensor domain.
 */
import { HassState } from "../utils/ha-state.js";

export const binarySensorConverter = {
  /**
   * Convert state to boolean value.
   */
  toBooleanState(state: HassState): boolean {
    return state.state === "on";
  },

  /**
   * Matter contact sensor state: true is closed/contact, false is open.
   */
  toContactState(state: HassState): boolean {
    return state.state !== "on";
  },

  /**
   * Map to occupancy state (true means occupied).
   */
  toOccupancyState(state: HassState): boolean {
    return state.state === "on";
  },
};

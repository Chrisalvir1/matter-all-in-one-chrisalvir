/**
 * Converter utility for camera domain.
 */
import { HassState } from '../utils/ha-state.js';

export const cameraConverter = {
  /**
   * Determine stream options or states.
   */
  toStreamingState(state: HassState): boolean {
    return state.state === 'recording' || state.state === 'streaming';
  },
};

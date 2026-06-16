/**
 * Converter utility for lock domain.
 */
import { HassState } from '../utils/ha-state.js';

export enum MatterLockState {
  NotFullyLocked = 0,
  Locked = 1,
  Unlocked = 2,
  Unlatched = 3,
}

export const lockConverter = {
  /**
   * Map HA state to Matter LockState.
   */
  toLockState(state: HassState): MatterLockState {
    switch (state.state) {
      case 'locked':
        return MatterLockState.Locked;
      case 'unlocked':
        return MatterLockState.Unlocked;
      default:
        return MatterLockState.NotFullyLocked;
    }
  },

  /**
   * Map Matter LockState back to HA service call.
   */
  toHaService(lockState: MatterLockState): 'lock' | 'unlock' {
    return lockState === MatterLockState.Locked ? 'lock' : 'unlock';
  },
};

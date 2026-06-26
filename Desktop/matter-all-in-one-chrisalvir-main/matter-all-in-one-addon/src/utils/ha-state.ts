/**
 * Typings and utilities for Home Assistant entity states.
 */

export interface HassEntity {
  entity_id: string;
  name?: string;
  original_name?: string;
  device_id?: string;
  platform?: string;
  disabled_by?: string;
  hidden_by?: string;
}

export interface HassState {
  entity_id: string;
  state: string;
  attributes: {
    friendly_name?: string;
    device_class?: string;
    supported_features?: number;
    unit_of_measurement?: string;
    [key: string]: any;
  };
  last_changed: string;
  last_updated: string;
}

export interface HassEvent {
  event_type: string;
  data: {
    entity_id: string;
    old_state: HassState | null;
    new_state: HassState | null;
  };
  origin: string;
  time_fired: string;
  context: {
    id: string;
    parent_id: string | null;
    user_id: string | null;
  };
}

/**
 * Check if the state represents an unavailable entity.
 */
export function isUnavailable(state: HassState | null | undefined): boolean {
  if (!state) return true;
  return state.state === 'unavailable' || state.state === 'unknown';
}

/**
 * Extract numerical state from HA state, returning a default value if not valid.
 */
export function getNumericState(state: HassState | null | undefined, defaultValue = 0): number {
  if (!state) return defaultValue;
  const num = parseFloat(state.state);
  return isNaN(num) ? defaultValue : num;
}

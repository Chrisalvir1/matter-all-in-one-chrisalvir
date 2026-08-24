/**
 * Converter utilities for the HA `fan` domain.
 *
 * Design principles (enforced here and in all callers):
 *
 * 1. ON/OFF state comes ONLY from `state` / `is_on` — NEVER from `percentage > 0`.
 *    A fan can be OFF with a remembered `percentage` of 32, 88 or 100.
 *
 * 2. `last_*` attributes (last_is_on, last_percentage, last_direction, …) are
 *    memory, not current state.  They MUST NOT overwrite current attributes.
 *
 * 3. The three physical fans have 6 discrete speeds (step ≈ 16.667 %).
 *    HA may return non-round values (e.g. 32, 88).  We normalise to the
 *    nearest physical level for commands to HA; we accept any value from HA
 *    for Matter updates (round to nearest integer).
 *
 * 4. Hysteresis: do not re-send a speed command if the delta from the last
 *    acknowledged value is within ±SPEED_HYSTERESIS_PCT (avoids oscillation
 *    between adjacent levels on successive HomeKit slider drags).
 *
 * 5. AirflowDirection: `forward` → Forward (0), `reverse` → Reverse (1).
 *    Only use `last_direction` for restoration, never as the current direction.
 */
import { FanControl } from 'matterbridge/matter/clusters';
import type { HassState } from '../utils/ha-state.js';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The three fans each have 6 physical speed steps.
 * Representative percentages: 16.67, 33.33, 50, 66.67, 83.33, 100.
 * Using the midpoints between steps as thresholds.
 */
export const FAN_SPEED_LEVELS = [
  { speed: 1, pct: 16.67, threshold_lo: 0,    threshold_hi: 25   },
  { speed: 2, pct: 33.33, threshold_lo: 25,   threshold_hi: 41.7 },
  { speed: 3, pct: 50,    threshold_lo: 41.7, threshold_hi: 58.3 },
  { speed: 4, pct: 66.67, threshold_lo: 58.3, threshold_hi: 75   },
  { speed: 5, pct: 83.33, threshold_lo: 75,   threshold_hi: 91.7 },
  { speed: 6, pct: 100,   threshold_lo: 91.7, threshold_hi: 100  },
] as const;

/** Max discrete speed level supported by the physical fans. */
export const FAN_SPEED_MAX = 6;

/**
 * Hysteresis band in percentage points.
 * A new command is suppressed if |requested - current| < this value.
 */
export const SPEED_HYSTERESIS_PCT = 4;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Determine ON/OFF from HA fan state.
 *
 * Uses `state` and `is_on` exclusively.
 * `percentage > 0` MUST NOT be used as an on indicator.
 */
export function isFanOn(state: HassState): boolean {
  if (state.state === 'on') return true;
  if (state.state === 'off') return false;
  // Some integrations use boolean `is_on` inside attributes
  if (typeof state.attributes.is_on === 'boolean') return state.attributes.is_on;
  // Unavailable / unknown → treat as off for safety
  return false;
}

/**
 * Resolve the current percentage from HA state.
 *
 * Returns the `percentage` attribute value (may be from memory when off).
 * NEVER uses `last_percentage` as current state.
 * Returns 0 when the value is absent or invalid.
 */
export function fanPercentage(state: HassState): number {
  const raw = state.attributes.percentage;
  if (typeof raw === 'number' && raw >= 0 && raw <= 100) return raw;
  return 0;
}

/**
 * Normalise an arbitrary percentage to the nearest physical speed level
 * percentage (using the 6-speed lookup table).
 *
 * Examples:
 *   32 → 33.33  (level 2)
 *   88 → 83.33  (level 5)
 *  100 → 100    (level 6)
 *    0 → 0      (off, returned as-is)
 */
export function normaliseToPhysicalSpeed(pct: number): number {
  if (pct <= 0) return 0;
  if (pct > 100) return 100;
  for (const level of FAN_SPEED_LEVELS) {
    if (pct >= level.threshold_lo && pct <= level.threshold_hi) {
      return level.pct;
    }
  }
  // Fallback: return unchanged (rounding already happened in caller)
  return Math.round(pct);
}

/**
 * Given a requested percentage (0-100), snap it to the nearest physical level
 * percentage.  Returns 0 when pct === 0 (represents off/minimum in some UIs).
 */
export function snapToPhysicalLevel(pct: number): number {
  if (pct <= 0) return 0;
  // Find the level whose nominal pct is closest
  let closest = FAN_SPEED_LEVELS[0] as (typeof FAN_SPEED_LEVELS)[number];
  let minDelta = Math.abs(pct - closest.pct);
  for (const level of FAN_SPEED_LEVELS) {
    const delta = Math.abs(pct - level.pct);
    if (delta < minDelta) {
      minDelta = delta;
      closest = level;
    }
  }
  return closest.pct;
}

/**
 * Return true if the requested percentage is within the hysteresis band of the
 * current percentage, meaning we should skip re-sending the command to HA.
 */
export function withinHysteresis(requestedPct: number, currentPct: number): boolean {
  return Math.abs(requestedPct - currentPct) < SPEED_HYSTERESIS_PCT;
}

/**
 * Map a HA direction string to a Matter AirflowDirection value.
 *
 * HA reports `forward` or `reverse`; anything else defaults to Forward.
 * NEVER use `last_direction` as the current direction.
 */
export function haDirectionToMatter(direction: string | undefined): FanControl.AirflowDirection {
  if (direction === 'reverse') return FanControl.AirflowDirection.Reverse;
  return FanControl.AirflowDirection.Forward;
}

/**
 * Map a Matter AirflowDirection to the HA direction string.
 */
export function matterDirectionToHa(direction: FanControl.AirflowDirection): 'forward' | 'reverse' {
  return direction === FanControl.AirflowDirection.Reverse ? 'reverse' : 'forward';
}

/**
 * Resolve the current direction from HA state.
 * Only uses `attributes.direction`, NEVER `last_direction`.
 */
export function fanDirection(state: HassState): string | undefined {
  const dir = state.attributes.direction;
  return typeof dir === 'string' ? dir : undefined;
}

/**
 * Determine the appropriate Matter FanMode from HA fan state.
 *
 * - Off when state is off.
 * - On (speed-based) when on and percentage is non-zero.
 * - On (mode 4 = "On") as fallback for on without percentage.
 *
 * Auto mode requires HA to expose a real auto capability; we do NOT invent it.
 */
export function haStateToFanMode(state: HassState): FanControl.FanMode {
  if (!isFanOn(state)) return FanControl.FanMode.Off;
  const pct = fanPercentage(state);
  if (pct <= 0) return FanControl.FanMode.On; // on, no discrete level known
  // Map to Low/Medium/High where possible
  const normalised = normaliseToPhysicalSpeed(pct);
  if (normalised <= 33.34) return FanControl.FanMode.Low;
  if (normalised <= 66.68) return FanControl.FanMode.Medium;
  return FanControl.FanMode.High;
}

/**
 * Determine FanModeSequence for fans with 6 speed levels.
 * OffLowMedHigh maps to our 3-tier Low/Medium/High without Auto.
 */
export const FAN_MODE_SEQUENCE = FanControl.FanModeSequence.OffLowMedHigh;

// ── Support for presets ───────────────────────────────────────────────────────

/**
 * Supported HA preset modes for the bedroom fan.
 * Matter 1.6 / FanControl has `WindSetting` (sleepWind, naturalWind) which maps to
 * `sleep` and `breeze` respectively.  However `MatterbridgeFanControlServer` in
 * 3.10.6 only enables auto+step features.
 *
 * Therefore presets are tracked only in HA; we do NOT advertise them to Matter/HomeKit.
 * This is documented and intentional.
 */
export const FAN_PRESET_TO_WIND: Record<string, string> = {
  sleep: 'sleepWind',
  breeze: 'naturalWind',
};

// ── Public converter interface (backwards-compatible) ─────────────────────────

/**
 * Determine if HA fan exposes direction control (bit 3 in supported_features).
 * 1 = SET_SPEED, 4 = OSCILLATE, 8 = DIRECTION, 32 = PRESET_MODE
 */
export function hasFanDirection(state: HassState): boolean {
  if (typeof state.attributes.supported_features === 'number') {
    return (state.attributes.supported_features & 8) !== 0;
  }
  return typeof state.attributes.direction === 'string';
}

/**
 * Return the physical speed level (1-6) or 0 (Off) based on the percentage.
 */
export function fanSpeed(pct: number): number {
  if (pct <= 0) return 0;
  if (pct > 100) return 6;
  for (const level of FAN_SPEED_LEVELS) {
    if (pct >= level.threshold_lo && pct <= level.threshold_hi) {
      return level.speed;
    }
  }
  return 0;
}

export const fanConverter = {
  /**
   * Convert HA fan state percentage to a Matter percentage (0-100).
   * DOES NOT use last_percentage or percentage>0 as on indicator.
   */
  toPercentage(state: HassState): number {
    return fanPercentage(state);
  },

  /**
   * Map Matter speed percentage back to the nearest physical HA percentage.
   */
  toHaPercentage(percent: number): number {
    return snapToPhysicalLevel(percent);
  },

  /** True only when state/is_on says on. */
  isOn: isFanOn,

  /** Snap arbitrary percent to closest 6-speed level. */
  snapToPhysicalLevel,

  /** Normalise raw HA percent to nearest level name. */
  normaliseToPhysicalSpeed,

  /** Hysteresis check. */
  withinHysteresis,

  /** HA direction → Matter AirflowDirection. */
  haDirectionToMatter,

  /** Matter AirflowDirection → HA direction string. */
  matterDirectionToHa,

  /** Current direction from state (not last_direction). */
  fanDirection,

  /** Determine if HA fan exposes direction control (bit 3 in supported_features). */
  hasFanDirection,

  /** Return the physical speed level (1-6) or 0 (Off) based on the percentage. */
  fanSpeed,

  /** Derive FanMode from HA state. */
  haStateToFanMode,
};

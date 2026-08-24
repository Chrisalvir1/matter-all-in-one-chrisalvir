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

// ── HA Fan Entity Features (Authoritative bitmask from Home Assistant) ─────────
export const FanEntityFeature = {
  SET_SPEED: 1,    // 1 << 0
  OSCILLATE: 2,    // 1 << 1
  DIRECTION: 4,    // 1 << 2 (Bit 4)
  PRESET_MODE: 8,  // 1 << 3 (Bit 8)
  TURN_OFF: 16,    // 1 << 4
  TURN_ON: 32,     // 1 << 5
} as const;

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The three physical fans have 6 discrete speeds (step ≈ 16.667 %).
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
 * Derive speedMax dynamically from HA state attributes.
 * Uses speed_count, speed_list length, or 100 / percentage_step.
 */
export function getFanSpeedCount(state: HassState): number {
  if (typeof state.attributes.speed_count === 'number' && state.attributes.speed_count > 0) {
    return Math.min(100, Math.max(1, Math.round(state.attributes.speed_count)));
  }
  if (Array.isArray(state.attributes.speed_list) && state.attributes.speed_list.length > 0) {
    return Math.min(100, Math.max(1, state.attributes.speed_list.length));
  }
  const step = state.attributes.percentage_step;
  if (typeof step === 'number' && step > 0 && step <= 100) {
    return Math.min(100, Math.max(1, Math.round(100 / step)));
  }
  return FAN_SPEED_MAX;
}

/**
 * Normalise an arbitrary percentage to the nearest physical speed level
 * percentage (using the 6-speed lookup table when speedMax=6, or dynamic calculation).
 *
 * Examples:
 *   32 → 33.33  (level 2)
 *   88 → 83.33  (level 5)
 *  100 → 100    (level 6)
 *    0 → 0      (off, returned as-is)
 */
export function normaliseToPhysicalSpeed(pct: number, speedMax: number = FAN_SPEED_MAX): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return 100;
  if (speedMax === 6) {
    for (const level of FAN_SPEED_LEVELS) {
      if (pct >= level.threshold_lo && pct <= level.threshold_hi) {
        return level.pct;
      }
    }
  }
  const step = 100 / speedMax;
  const level = Math.round(pct / step);
  return Number((Math.max(1, Math.min(speedMax, level)) * step).toFixed(2));
}

/**
 * Given a requested percentage (0-100), snap it to the nearest physical level
 * percentage.  Returns 0 when pct === 0 (represents off/minimum in some UIs).
 */
export function snapToPhysicalLevel(pct: number, speedMax: number = FAN_SPEED_MAX): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return 100;
  if (speedMax === 6) {
    let closest: (typeof FAN_SPEED_LEVELS)[number] = FAN_SPEED_LEVELS[0];
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
  const step = 100 / speedMax;
  const level = Math.round(pct / step);
  return Number((Math.max(1, Math.min(speedMax, level)) * step).toFixed(2));
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
 * Check if the Home Assistant fan entity exposes direction control capability.
 * Uses FanEntityFeature.DIRECTION (4) as the authoritative capability flag.
 */
export function hasFanDirection(state: HassState): boolean {
  const supported = state.attributes.supported_features;
  if (typeof supported === 'number') {
    return (supported & FanEntityFeature.DIRECTION) !== 0;
  }
  return false;
}

/**
 * Check if the Home Assistant fan entity exposes a true Auto capability/preset.
 * Sleep/breeze presets are NOT equivalent to Matter Auto.
 */
export function hasFanAuto(state: HassState): boolean {
  const supported = state.attributes.supported_features;
  if (typeof supported === 'number' && !(supported & FanEntityFeature.PRESET_MODE)) {
    return false;
  }
  const presets = state.attributes.preset_modes;
  if (Array.isArray(presets)) {
    return presets.some((mode) => typeof mode === 'string' && mode.toLowerCase().trim() === 'auto');
  }
  return false;
}

/**
 * Select the conformant FanModeSequence according to the exact enabled features.
 * When Auto is NOT enabled, OffLowMedHigh is required.
 * When Auto IS enabled, OffLowMedHighAuto is required.
 */
export function getFanModeSequence(state: HassState): FanControl.FanModeSequence {
  return hasFanAuto(state)
    ? FanControl.FanModeSequence.OffLowMedHighAuto
    : FanControl.FanModeSequence.OffLowMedHigh;
}

/**
 * Resolve dynamic Matter FanControl features supported by the fan.
 * Auto (AUT) is only included if the HA fan explicitly exposes Auto preset.
 * AirflowDirection (DIR) is only included if HA fan supports direction (bit 4).
 */
export function getFanControlFeatures(state: HassState): any[] {
  const features: any[] = [FanControl.Feature.MultiSpeed, FanControl.Feature.Step];
  if (hasFanDirection(state)) {
    features.push(FanControl.Feature.AirflowDirection);
  }
  if (hasFanAuto(state)) {
    features.push(FanControl.Feature.Auto);
  }
  return features;
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

/** Default sequence for fans without Auto. */
export const FAN_MODE_SEQUENCE = FanControl.FanModeSequence.OffLowMedHigh;

// ── Support for presets ───────────────────────────────────────────────────────

/**
 * Supported HA preset modes for the bedroom fan.
 * Matter 1.6 / FanControl has `WindSetting` (sleepWind, naturalWind) which maps to
 * `sleep` and `breeze` respectively.
 *
 * Presets are tracked only in HA; we do NOT advertise them as Auto.
 */
export const FAN_PRESET_TO_WIND: Record<string, string> = {
  sleep: 'sleepWind',
  breeze: 'naturalWind',
};

// ── Public converter interface (backwards-compatible) ─────────────────────────

/**
 * Return the physical speed level (1..speedMax) or 0 (Off) based on the percentage.
 */
export function fanSpeed(pct: number, speedMax: number = FAN_SPEED_MAX): number {
  if (pct <= 0) return 0;
  if (pct >= 100) return speedMax;
  if (speedMax === 6) {
    for (const level of FAN_SPEED_LEVELS) {
      if (pct >= level.threshold_lo && pct <= level.threshold_hi) {
        return level.speed;
      }
    }
  }
  const speed = Math.round((pct / 100) * speedMax);
  return Math.max(1, Math.min(speedMax, speed));
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
  toHaPercentage(percent: number, speedMax: number = FAN_SPEED_MAX): number {
    return snapToPhysicalLevel(percent, speedMax);
  },

  /** True only when state/is_on says on. */
  isOn: isFanOn,

  /** Snap arbitrary percent to closest speed level. */
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

  /** Determine if HA fan exposes direction control (bit 4 in supported_features). */
  hasFanDirection,

  /** Determine if HA fan exposes Auto preset. */
  hasFanAuto,

  /** Dynamic speed count. */
  getFanSpeedCount,

  /** Dynamic FanModeSequence. */
  getFanModeSequence,

  /** Dynamic FanControl features. */
  getFanControlFeatures,

  /** Return the physical speed level (1..speedMax) or 0 (Off) based on the percentage. */
  fanSpeed,

  /** Derive FanMode from HA state. */
  haStateToFanMode,

  /** HA Fan Entity Feature Constants */
  FanEntityFeature,
};


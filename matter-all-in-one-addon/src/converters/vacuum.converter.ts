/**
 * vacuum.converter.ts
 *
 * Converts Home Assistant `vacuum.*` entities (Tuya, Smart Life, Roborock,
 * iRobot, Dreame, etc.) to the Matter 1.4 RVC (Robotic Vacuum Cleaner) device type.
 *
 * Apple Home recognises this as a real vacuum since iOS 18.4 / Matter 1.2+.
 * The RVC device type requires the following clusters:
 *   - RvcRunMode          (Idle / Cleaning / Mapping)
 *   - RvcCleanMode        (Vacuum / Mop / etc.)
 *   - RvcOperationalState (Stop / Start / Pause / GoHome)
 *   - OnOff               (for simple on/off bridging)
 *
 * HA vacuum states → Matter RVC states:
 *   cleaning  → RvcOperationalState: Running
 *   paused    → RvcOperationalState: Paused
 *   docked    → RvcOperationalState: SeekingCharger + Docked
 *   idle      → RvcOperationalState: Stopped
 *   returning → RvcOperationalState: SeekingCharger
 *   error     → RvcOperationalState: Error
 *
 * @see https://matter-smarthome.de/en/know-how/matter-device-types/
 * @see https://github.com/project-chip/connectedhomeip/blob/master/docs/clusters/RoboticVacuumCleaner.md
 */

import type { HassState } from '../utils/ha-state.js';

// ─── Matter RVC Cluster IDs ────────────────────────────────────────────────

/** RvcOperationalState operational state IDs (Matter 1.4 spec §9.10.5.1) */
export const RvcOperationalStateId = {
  Stopped: 0x00,
  Running: 0x01,
  Paused: 0x02,
  Error: 0x03,
  SeekingCharger: 0x40,
  Charging: 0x41,
  Docked: 0x42,
} as const;

/** RvcRunMode mode tags (Matter 1.4 spec §7.22) */
export const RvcRunModeTag = {
  Idle: 0x4000,
  Cleaning: 0x4001,
  Mapping: 0x4002,
} as const;

/** RvcCleanMode mode tags (Matter 1.4 spec §7.23) */
export const RvcCleanModeTag = {
  DeepClean: 0x4000,
  Vacuum: 0x4001,
  Mop: 0x4002,
} as const;

// ─── Type helpers ─────────────────────────────────────────────────────────

export type RvcOperationalStateValue =
  (typeof RvcOperationalStateId)[keyof typeof RvcOperationalStateId];

/**
 * Possible HA vacuum states.
 * https://www.home-assistant.io/integrations/vacuum/
 */
export type HaVacuumState =
  | 'cleaning'
  | 'docked'
  | 'idle'
  | 'paused'
  | 'returning'
  | 'error'
  | 'unavailable'
  | 'unknown'
  | string;

// ─── State mapping ────────────────────────────────────────────────────────

/**
 * Maps a HA vacuum state string to the closest Matter RvcOperationalState value.
 */
export function haVacuumStateToMatter(haState: HaVacuumState): RvcOperationalStateValue {
  switch (haState.toLowerCase()) {
    case 'cleaning':
      return RvcOperationalStateId.Running;
    case 'paused':
      return RvcOperationalStateId.Paused;
    case 'docked':
      return RvcOperationalStateId.Docked;
    case 'returning':
      return RvcOperationalStateId.SeekingCharger;
    case 'error':
      return RvcOperationalStateId.Error;
    case 'idle':
    default:
      return RvcOperationalStateId.Stopped;
  }
}

/**
 * Returns true when the vacuum is actively cleaning.
 * Used to drive the OnOff cluster for simple on/off bridges.
 */
export function haVacuumIsActive(haState: HaVacuumState): boolean {
  return haState.toLowerCase() === 'cleaning';
}

// ─── HA command mapping ───────────────────────────────────────────────────

/**
 * Maps a Matter RvcOperationalState command to the corresponding
 * HA vacuum service call.
 *
 * Returns `{ service: string; extra?: Record<string, unknown> }` or
 * `null` when there is no matching HA service.
 */
export function matterCommandToHaVacuum(
  command: 'start' | 'stop' | 'pause' | 'resume' | 'goHome',
): { service: string; extra?: Record<string, unknown> } | null {
  switch (command) {
    case 'start':
      return { service: 'vacuum.start' };
    case 'stop':
      return { service: 'vacuum.stop' };
    case 'pause':
      return { service: 'vacuum.pause' };
    case 'resume':
      // HA doesn't have a dedicated resume — start again
      return { service: 'vacuum.start' };
    case 'goHome':
      return { service: 'vacuum.return_to_base' };
    default:
      return null;
  }
}

// ─── Fan speed / suction → Matter fan speed level ─────────────────────────

/**
 * Some Tuya/Smart Life vacuums expose a `fan_speed` attribute.
 * Maps well-known HA fan speed strings to a 0-100 Matter fan speed level.
 *
 * Falls back to `null` when unknown so callers can skip the attribute update.
 */
export function haFanSpeedToMatter(fanSpeed: string | undefined): number | null {
  if (fanSpeed == null) return null;
  switch (fanSpeed.toLowerCase()) {
    case 'quiet':
    case 'min':
    case 'eco':
      return 25;
    case 'standard':
    case 'normal':
    case 'medium':
      return 50;
    case 'strong':
    case 'high':
    case 'turbo':
    case 'boost':
      return 75;
    case 'max':
    case 'max+':
      return 100;
    default: {
      // Try to parse numeric strings ("50", "75", etc.)
      const n = Number(fanSpeed);
      return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
    }
  }
}

// ─── Entity attributes helper ─────────────────────────────────────────────

/**
 * Extracts relevant vacuum attributes from a HA entity state object.
 * Normalises attribute names across Tuya, Roborock, iRobot, Dreame, etc.
 */
export interface VacuumAttributes {
  battery_level: number | null;    // 0-100
  fan_speed: string | undefined;   // "quiet" | "standard" | "strong" | "max" | ...
  fan_speed_list: string[];         // available fan speed levels
  status: string | undefined;      // human-readable status (model-specific)
  error_code: number | null;        // error code from device
}

export function extractVacuumAttributes(entity: HassState): VacuumAttributes {
  const a = entity.attributes ?? {};
  return {
    battery_level:
      typeof a['battery_level'] === 'number' ? a['battery_level'] :
      typeof a['battery'] === 'number' ? a['battery'] : null,
    fan_speed:
      typeof a['fan_speed'] === 'string' ? a['fan_speed'] :
      typeof a['suction'] === 'string' ? a['suction'] : undefined,
    fan_speed_list: Array.isArray(a['fan_speed_list']) ? a['fan_speed_list'] : [],
    status:
      typeof a['status'] === 'string' ? a['status'] : undefined,
    error_code:
      typeof a['error_code'] === 'number' ? a['error_code'] : null,
  };
}

// ─── QR / device selection metadata ──────────────────────────────────────

/**
 * Metadata used by the frontend to display the vacuum in the entity picker
 * and generate its individual Matter QR code.
 */
export interface VacuumMatterMeta {
  /** Matter device type discriminator shown in the UI */
  matterType: 'RoboticVacuumCleaner';
  /** Short human-readable label for the QR code selector */
  displayLabel: string;
  /** HomeKit-compatible: true — Apple Home supports RVC via Matter ≥1.2 */
  homekitCompatible: true;
  /** Vendor-specific hint parsed from the entity's integration manifest */
  vendorHint: 'tuya' | 'smartlife' | 'roborock' | 'irobot' | 'dreame' | 'generic';
}

/**
 * Builds the Matter metadata record for a vacuum entity.
 * The `platform_id` attribute (set by most integrations) is used as a vendor hint.
 */
export function buildVacuumMatterMeta(entity: HassState): VacuumMatterMeta {
  const integrationId =
    (entity.attributes?.['integration'] as string | undefined)?.toLowerCase() ?? '';

  let vendorHint: VacuumMatterMeta['vendorHint'] = 'generic';
  if (integrationId.includes('tuya') || integrationId.includes('smart_life')) {
    vendorHint = 'tuya';
  } else if (integrationId.includes('roborock')) {
    vendorHint = 'roborock';
  } else if (integrationId.includes('irobot') || integrationId.includes('roomba')) {
    vendorHint = 'irobot';
  } else if (integrationId.includes('dreame')) {
    vendorHint = 'dreame';
  }

  return {
    matterType: 'RoboticVacuumCleaner',
    displayLabel: entity.attributes?.['friendly_name'] ?? entity.entity_id,
    homekitCompatible: true,
    vendorHint,
  };
}

// ─── Platform integration hook ────────────────────────────────────────────

/**
 * Determines whether a HA entity should be handled by this converter.
 * Only matches `vacuum.*` domain entities.
 */
export function isVacuumEntity(entity: HassState): boolean {
  return entity.entity_id.startsWith('vacuum.');
}

/**
 * Main converter entry point.
 *
 * Returns the set of Matter attribute updates to apply to the Matterbridge
 * endpoint representing this vacuum.
 *
 * Usage example (inside platform.ts device sync loop):
 *
 * ```ts
 * import { isVacuumEntity, buildVacuumUpdate } from './converters/vacuum.converter.js';
 *
 * if (isVacuumEntity(entity)) {
 *   const update = buildVacuumUpdate(entity);
 *   await endpoint.setAttribute('rvcOperationalState', 'currentPhase', update.operationalState);
 *   if (update.batteryLevel != null) {
 *     await endpoint.setAttribute('powerSource', 'batPercentRemaining', update.batteryLevel * 2);
 *   }
 * }
 * ```
 */
export interface VacuumMatterUpdate {
  /** Maps to RvcOperationalState.operationalState */
  operationalState: RvcOperationalStateValue;
  /** Maps to OnOff.onOff (true while cleaning) */
  onOff: boolean;
  /** Maps to PowerSource.batPercentRemaining (Matter uses 0-200 range) */
  batteryLevel: number | null;
  /** Maps to FanControl.percentSetting (0-100) */
  fanSpeedPercent: number | null;
  /** Full extracted attributes for custom handling */
  attributes: VacuumAttributes;
}

export function buildVacuumUpdate(entity: HassState): VacuumMatterUpdate {
  const attrs = extractVacuumAttributes(entity);
  return {
    operationalState: haVacuumStateToMatter(entity.state),
    onOff: haVacuumIsActive(entity.state),
    batteryLevel: attrs.battery_level,
    fanSpeedPercent: haFanSpeedToMatter(attrs.fan_speed),
    attributes: attrs,
  };
}

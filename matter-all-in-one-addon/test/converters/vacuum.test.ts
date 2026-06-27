/**
 * vacuum.converter.test.ts
 *
 * Unit tests for the HA vacuum → Matter RVC converter.
 * Covers Tuya/Smart Life state strings as well as standard HA vacuum states.
 */

import { describe, it, expect } from 'vitest';
import {
  haVacuumStateToMatter,
  haVacuumIsActive,
  haFanSpeedToMatter,
  matterCommandToHaVacuum,
  extractVacuumAttributes,
  buildVacuumUpdate,
  isVacuumChargingOrDocked,
  buildVacuumMatterMeta,
  isVacuumEntity,
  RvcOperationalStateId,
} from '../../src/converters/vacuum.converter.js';
import type { HassEntity } from '../../src/homeAssistant.js';

// ── helpers ────────────────────────────────────────────────────────────────

function makeEntity(state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: 'vacuum.my_tuya_vacuum',
    state,
    attributes: { friendly_name: 'Mi Aspiradora Tuya', ...attributes },
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
  } as HassEntity;
}

// ── haVacuumStateToMatter ──────────────────────────────────────────────────

describe('haVacuumStateToMatter', () => {
  it('maps cleaning → Running', () => {
    expect(haVacuumStateToMatter('cleaning')).toBe(RvcOperationalStateId.Running);
  });

  it('maps paused → Paused', () => {
    expect(haVacuumStateToMatter('paused')).toBe(RvcOperationalStateId.Paused);
  });

  it('maps docked → Docked', () => {
    expect(haVacuumStateToMatter('docked')).toBe(RvcOperationalStateId.Docked);
  });

  it('maps returning → SeekingCharger', () => {
    expect(haVacuumStateToMatter('returning')).toBe(RvcOperationalStateId.SeekingCharger);
  });

  it('maps error → Error', () => {
    expect(haVacuumStateToMatter('error')).toBe(RvcOperationalStateId.Error);
  });

  it('maps idle → Stopped', () => {
    expect(haVacuumStateToMatter('idle')).toBe(RvcOperationalStateId.Stopped);
  });

  it('falls back unknown state → Stopped', () => {
    expect(haVacuumStateToMatter('some_tuya_weirdness')).toBe(RvcOperationalStateId.Stopped);
  });

  it('is case-insensitive', () => {
    expect(haVacuumStateToMatter('CLEANING')).toBe(RvcOperationalStateId.Running);
  });
});

// ── haVacuumIsActive ───────────────────────────────────────────────────────

describe('haVacuumIsActive', () => {
  it('returns true when cleaning', () => expect(haVacuumIsActive('cleaning')).toBe(true));
  it('returns false when docked',  () => expect(haVacuumIsActive('docked')).toBe(false));
  it('returns false when idle',    () => expect(haVacuumIsActive('idle')).toBe(false));
});

// ── haFanSpeedToMatter ─────────────────────────────────────────────────────

describe('haFanSpeedToMatter', () => {
  it('maps quiet/eco → 25', () => {
    expect(haFanSpeedToMatter('quiet')).toBe(25);
    expect(haFanSpeedToMatter('eco')).toBe(25);
  });

  it('maps standard/normal → 50', () => {
    expect(haFanSpeedToMatter('standard')).toBe(50);
    expect(haFanSpeedToMatter('normal')).toBe(50);
  });

  it('maps strong/turbo → 75', () => {
    expect(haFanSpeedToMatter('strong')).toBe(75);
    expect(haFanSpeedToMatter('turbo')).toBe(75);
  });

  it('maps max → 100', () => {
    expect(haFanSpeedToMatter('max')).toBe(100);
  });

  it('parses numeric strings', () => {
    expect(haFanSpeedToMatter('60')).toBe(60);
  });

  it('clamps numeric strings to 0-100', () => {
    expect(haFanSpeedToMatter('200')).toBe(100);
    expect(haFanSpeedToMatter('-5')).toBe(0);
  });

  it('returns null for undefined', () => {
    expect(haFanSpeedToMatter(undefined)).toBeNull();
  });

  it('returns null for unknown strings', () => {
    expect(haFanSpeedToMatter('ultraboost9000')).toBeNull();
  });
});

// ── matterCommandToHaVacuum ────────────────────────────────────────────────

describe('matterCommandToHaVacuum', () => {
  it('maps start → vacuum.start', () => {
    expect(matterCommandToHaVacuum('start')).toEqual({ service: 'vacuum.start' });
  });

  it('maps stop → vacuum.stop', () => {
    expect(matterCommandToHaVacuum('stop')).toEqual({ service: 'vacuum.stop' });
  });

  it('maps pause → vacuum.pause', () => {
    expect(matterCommandToHaVacuum('pause')).toEqual({ service: 'vacuum.pause' });
  });

  it('maps resume → vacuum.start (HA has no resume)', () => {
    expect(matterCommandToHaVacuum('resume')).toEqual({ service: 'vacuum.start' });
  });

  it('maps goHome → vacuum.return_to_base', () => {
    expect(matterCommandToHaVacuum('goHome')).toEqual({ service: 'vacuum.return_to_base' });
  });
});

// ── extractVacuumAttributes ────────────────────────────────────────────────

describe('extractVacuumAttributes', () => {
  it('extracts battery_level', () => {
    const entity = makeEntity('docked', { battery_level: 85 });
    expect(extractVacuumAttributes(entity).battery_level).toBe(85);
  });

  it('falls back to battery attribute', () => {
    const entity = makeEntity('docked', { battery: 60 });
    expect(extractVacuumAttributes(entity).battery_level).toBe(60);
  });

  it('extracts fan_speed', () => {
    const entity = makeEntity('cleaning', { fan_speed: 'strong' });
    expect(extractVacuumAttributes(entity).fan_speed).toBe('strong');
  });

  it('falls back to suction attribute (Tuya)', () => {
    const entity = makeEntity('cleaning', { suction: 'turbo' });
    expect(extractVacuumAttributes(entity).fan_speed).toBe('turbo');
  });

  it('returns empty fan_speed_list when missing', () => {
    const entity = makeEntity('idle');
    expect(extractVacuumAttributes(entity).fan_speed_list).toEqual([]);
  });

  it('returns null battery_level when missing', () => {
    const entity = makeEntity('idle');
    expect(extractVacuumAttributes(entity).battery_level).toBeNull();
  });
});

// ── buildVacuumUpdate ──────────────────────────────────────────────────────

describe('buildVacuumUpdate', () => {
  it('cleaning entity produces Running + onOff=true', () => {
    const entity = makeEntity('cleaning', { battery_level: 90, fan_speed: 'strong' });
    const update = buildVacuumUpdate(entity);
    expect(update.operationalState).toBe(RvcOperationalStateId.Running);
    expect(update.onOff).toBe(true);
    expect(update.batteryLevel).toBe(90);
    expect(update.fanSpeedPercent).toBe(75);
  });

  it('docked entity produces Docked + onOff=false', () => {
    const entity = makeEntity('docked', { battery_level: 100 });
    const update = buildVacuumUpdate(entity);
    expect(update.operationalState).toBe(RvcOperationalStateId.Docked);
    expect(update.onOff).toBe(false);
    expect(update.batteryLevel).toBe(100);
  });

  it('prefers a Tuya charging signal over a stale cleaning state', () => {
    const entity = makeEntity('cleaning', { raw_dps: { '5': 'charging' } });
    const update = buildVacuumUpdate(entity);
    expect(isVacuumChargingOrDocked(entity)).toBe(true);
    expect(update.operationalState).toBe(RvcOperationalStateId.Charging);
    expect(update.onOff).toBe(false);
  });

  it('recognizes docked status supplied as an integration attribute', () => {
    const entity = makeEntity('cleaning', { status: 'docked' });
    expect(isVacuumChargingOrDocked(entity)).toBe(true);
  });
});

// ── buildVacuumMatterMeta ──────────────────────────────────────────────────

describe('buildVacuumMatterMeta', () => {
  it('identifies Tuya integration', () => {
    const entity = makeEntity('idle', { integration: 'tuya' });
    const meta = buildVacuumMatterMeta(entity);
    expect(meta.vendorHint).toBe('tuya');
    expect(meta.matterType).toBe('RoboticVacuumCleaner');
    expect(meta.homekitCompatible).toBe(true);
  });

  it('identifies Roborock integration', () => {
    const entity = makeEntity('idle', { integration: 'roborock' });
    expect(buildVacuumMatterMeta(entity).vendorHint).toBe('roborock');
  });

  it('falls back to generic for unknown integrations', () => {
    const entity = makeEntity('idle');
    expect(buildVacuumMatterMeta(entity).vendorHint).toBe('generic');
  });
});

// ── isVacuumEntity ─────────────────────────────────────────────────────────

describe('isVacuumEntity', () => {
  it('matches vacuum domain', () => {
    expect(isVacuumEntity(makeEntity('cleaning'))).toBe(true);
  });

  it('does not match other domains', () => {
    const other = { ...makeEntity('on'), entity_id: 'switch.my_robot' };
    expect(isVacuumEntity(other)).toBe(false);
  });
});

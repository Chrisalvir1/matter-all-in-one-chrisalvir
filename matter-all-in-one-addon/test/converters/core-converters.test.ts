import { describe, expect, it } from 'vitest';
import {
  binarySensorConverter,
  climateConverter,
  energyTariffConverter,
  fanConverter,
  lockConverter,
  MatterLockState,
  soilSensorConverter,
} from '../../src/converters/index.js';

const state = (value: string, attributes: Record<string, unknown> = {}) => ({ state: value, attributes }) as any;

describe('core converters', () => {
  it('maps binary sensor states to Matter booleans', () => {
    expect(binarySensorConverter.toBooleanState(state('on'))).toBe(true);
    expect(binarySensorConverter.toContactState(state('off'))).toBe(false);
    expect(binarySensorConverter.toOccupancyState(state('on'))).toBe(true);
  });

  it('converts thermostat temperatures and HVAC modes in both directions', () => {
    expect(climateConverter.toMatterTemperature(21.56)).toBe(2156);
    expect(climateConverter.toMatterTemperature(null)).toBeNull();
    expect(climateConverter.toCelsius(2156)).toBe(21.56);
    expect(climateConverter.toMatterSystemMode('heat_cool')).toBe(1);
    expect(climateConverter.toMatterSystemMode('unsupported')).toBe(0);
    expect(climateConverter.toHaHvacMode(3)).toBe('cool');
    expect(climateConverter.toHaHvacMode(99)).toBe('off');
  });

  it('preserves fan percentages', () => {
    expect(fanConverter.toPercentage(state('on', { percentage: 42 }))).toBe(42);
    expect(fanConverter.toPercentage(state('on'))).toBe(0);
    expect(fanConverter.toHaPercentage(67)).toBe(67);
  });

  it('maps lock states and commands safely', () => {
    expect(lockConverter.toLockState(state('locked'))).toBe(MatterLockState.Locked);
    expect(lockConverter.toLockState(state('unlocked'))).toBe(MatterLockState.Unlocked);
    expect(lockConverter.toLockState(state('jammed'))).toBe(MatterLockState.NotFullyLocked);
    expect(lockConverter.toHaService(MatterLockState.Locked)).toBe('lock');
    expect(lockConverter.toHaService(MatterLockState.Unlocked)).toBe('unlock');
  });

  it('rejects non-numeric tariff and soil readings', () => {
    expect(energyTariffConverter.toTariffValue(state('0.237'))).toBe(0.237);
    expect(energyTariffConverter.toTariffValue(state('unknown'))).toBeNull();
    expect(soilSensorConverter.toMoistureValue(state('45.55'))).toBe(4555);
    expect(soilSensorConverter.toTemperatureValue(state('21.234'))).toBe(2123);
    expect(soilSensorConverter.toMoistureValue(state('unavailable'))).toBeNull();
  });
});

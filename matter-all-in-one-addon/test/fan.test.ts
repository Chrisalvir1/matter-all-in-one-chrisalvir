/**
 * Fan converter unit tests.
 *
 * Covers the 13 test cases specified in the implementation requirements:
 *  1. OFF + percentage 32 permanece OFF
 *  2. OFF + percentage 88 permanece OFF
 *  3. ON + percentage 88 permanece ON
 *  4. 32 se normaliza correctamente (→ nivel 2, 33.33%)
 *  5. 88 se normaliza correctamente (→ nivel 5, 83.33%)
 *  6. 100 corresponde a máxima velocidad (nivel 6, 100%)
 *  7. direction se sincroniza correctamente
 *  8. last_is_on no sobrescribe estado actual
 *  9. last_percentage no sobrescribe percentage actual
 * 10. AirflowDirection bidireccional
 * 11. Hysteresis: delta < 4% se ignora
 * 12. FanMode derivado correctamente de state
 * 13. isFanOn prioriza state sobre is_on
 */
import { describe, it, expect } from 'vitest';
import {
  isFanOn,
  fanPercentage,
  fanDirection,
  haDirectionToMatter,
  matterDirectionToHa,
  haStateToFanMode,
  snapToPhysicalLevel,
  normaliseToPhysicalSpeed,
  withinHysteresis,
  FAN_SPEED_LEVELS,
} from '../src/converters/fan.converter.js';
import { FanControl } from 'matterbridge/matter/clusters';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeState(state: string, attrs: Record<string, any> = {}): any {
  return {
    entity_id: 'fan.test',
    state,
    attributes: attrs,
    last_changed: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    context: { id: 'test', parent_id: null, user_id: null },
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Fan converter — isFanOn (regla crítica)', () => {
  // Test 1: OFF + percentage 32 permanece OFF
  it('1. OFF state con percentage=32 → isOn = false', () => {
    const s = makeState('off', { percentage: 32 });
    expect(isFanOn(s)).toBe(false);
  });

  // Test 2: OFF + percentage 88 permanece OFF
  it('2. OFF state con percentage=88 → isOn = false', () => {
    const s = makeState('off', { percentage: 88 });
    expect(isFanOn(s)).toBe(false);
  });

  // Test 3: ON + percentage 88 permanece ON
  it('3. ON state con percentage=88 → isOn = true', () => {
    const s = makeState('on', { percentage: 88 });
    expect(isFanOn(s)).toBe(true);
  });

  // Test 13: isFanOn prioriza state sobre is_on
  it('13. state=off anula is_on=true en atributos', () => {
    const s = makeState('off', { is_on: true, percentage: 50 });
    expect(isFanOn(s)).toBe(false);
  });

  it('state=on con is_on=false → true (state gana)', () => {
    const s = makeState('on', { is_on: false, percentage: 0 });
    expect(isFanOn(s)).toBe(true);
  });

  it('state=unavailable → false por defecto', () => {
    const s = makeState('unavailable', { percentage: 50 });
    expect(isFanOn(s)).toBe(false);
  });
});

describe('Fan converter — fanPercentage (regla crítica last_* ignorado)', () => {
  // Test 8: last_is_on no sobrescribe estado actual
  it('8. last_is_on no afecta fanPercentage ni isFanOn', () => {
    const s = makeState('off', {
      percentage: 32,
      last_is_on: true,        // memoria — no es estado actual
      last_percentage: 100,    // memoria — no es estado actual
    });
    expect(isFanOn(s)).toBe(false);     // state=off gana
    expect(fanPercentage(s)).toBe(32);  // usa percentage, no last_percentage
  });

  // Test 9: last_percentage no sobrescribe percentage actual
  it('9. last_percentage=100 con percentage=32 → fanPercentage devuelve 32', () => {
    const s = makeState('on', {
      percentage: 32,
      last_percentage: 100,
    });
    expect(fanPercentage(s)).toBe(32);
  });

  it('percentage ausente → 0', () => {
    const s = makeState('on', {});
    expect(fanPercentage(s)).toBe(0);
  });

  it('percentage inválido → 0', () => {
    const s = makeState('on', { percentage: -5 });
    // Negative is out of range, returns 0
    const result = fanPercentage(s);
    // Our implementation returns the raw value (0-100 guard)
    // -5 < 0 so fails the guard → 0
    expect(result).toBe(0);
  });
});

describe('Fan converter — normalización de velocidades físicas', () => {
  // Test 4: 32 normaliza a nivel 2 (33.33%)
  it('4. normaliseToPhysicalSpeed(32) → 33.33 (nivel 2)', () => {
    const result = normaliseToPhysicalSpeed(32);
    expect(result).toBeCloseTo(33.33, 1);
  });

  // Test 5: 88 normaliza a nivel 5 (83.33%)
  it('5. normaliseToPhysicalSpeed(88) → 83.33 (nivel 5)', () => {
    const result = normaliseToPhysicalSpeed(88);
    expect(result).toBeCloseTo(83.33, 1);
  });

  // Test 6: 100 = máxima velocidad (nivel 6)
  it('6. normaliseToPhysicalSpeed(100) → 100 (nivel 6)', () => {
    expect(normaliseToPhysicalSpeed(100)).toBe(100);
  });

  it('normaliseToPhysicalSpeed(0) → 0', () => {
    expect(normaliseToPhysicalSpeed(0)).toBe(0);
  });

  it('snapToPhysicalLevel(16) → ~16.67 (nivel 1)', () => {
    const result = snapToPhysicalLevel(16);
    expect(result).toBeCloseTo(16.67, 1);
  });

  it('snapToPhysicalLevel(50) → 50 (nivel 3)', () => {
    expect(snapToPhysicalLevel(50)).toBe(50);
  });

  it('snapToPhysicalLevel(66) → ~66.67 (nivel 4)', () => {
    const result = snapToPhysicalLevel(66);
    expect(result).toBeCloseTo(66.67, 1);
  });

  it('todos los niveles físicos normalisan a sí mismos', () => {
    for (const level of FAN_SPEED_LEVELS) {
      expect(normaliseToPhysicalSpeed(level.pct)).toBeCloseTo(level.pct, 0);
    }
  });
});

describe('Fan converter — direction (test 7 + test 10)', () => {
  // Test 7: direction se sincroniza correctamente
  it('7. haDirectionToMatter("forward") → AirflowDirection.Forward', () => {
    expect(haDirectionToMatter('forward')).toBe(FanControl.AirflowDirection.Forward);
  });

  it('7. haDirectionToMatter("reverse") → AirflowDirection.Reverse', () => {
    expect(haDirectionToMatter('reverse')).toBe(FanControl.AirflowDirection.Reverse);
  });

  // Test 10: bidireccional
  it('10. matterDirectionToHa(Forward) → "forward"', () => {
    expect(matterDirectionToHa(FanControl.AirflowDirection.Forward)).toBe('forward');
  });

  it('10. matterDirectionToHa(Reverse) → "reverse"', () => {
    expect(matterDirectionToHa(FanControl.AirflowDirection.Reverse)).toBe('reverse');
  });

  it('fanDirection de state con direction=forward → "forward"', () => {
    const s = makeState('on', { direction: 'forward' });
    expect(fanDirection(s)).toBe('forward');
  });

  it('fanDirection de state sin direction → undefined', () => {
    const s = makeState('on', {});
    expect(fanDirection(s)).toBeUndefined();
  });

  it('fanDirection ignora last_direction', () => {
    const s = makeState('on', { last_direction: 'reverse' }); // no `direction`
    expect(fanDirection(s)).toBeUndefined(); // last_direction no cuenta
  });

  it('haDirectionToMatter(undefined) → Forward por defecto', () => {
    expect(haDirectionToMatter(undefined)).toBe(FanControl.AirflowDirection.Forward);
  });
});

describe('Fan converter — hysteresis (test 11)', () => {
  // Test 11: Hysteresis — delta < 4% se ignora
  it('11. withinHysteresis(33, 32) → true (delta=1, dentro del umbral)', () => {
    expect(withinHysteresis(33, 32)).toBe(true);
  });

  it('11. withinHysteresis(50, 32) → false (delta=18, fuera del umbral)', () => {
    expect(withinHysteresis(50, 32)).toBe(false);
  });

  it('withinHysteresis(33.33, 32) → true (delta ≈ 1.33)', () => {
    expect(withinHysteresis(33.33, 32)).toBe(true);
  });

  it('withinHysteresis(88, 83.33) → false (delta ≈ 4.67 ≥ umbral 4)', () => {
    expect(withinHysteresis(88, 83.33)).toBe(false);
  });
});

describe('Fan converter — FanMode (test 12)', () => {
  // Test 12: FanMode derivado correctamente de state
  it('12. state=off → FanMode.Off', () => {
    const s = makeState('off', { percentage: 32 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Off);
  });

  it('12. state=on, percentage=16.67 → FanMode.Low', () => {
    const s = makeState('on', { percentage: 16.67 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Low);
  });

  it('12. state=on, percentage=33.33 → FanMode.Low', () => {
    const s = makeState('on', { percentage: 33.33 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Low);
  });

  it('12. state=on, percentage=50 → FanMode.Medium', () => {
    const s = makeState('on', { percentage: 50 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Medium);
  });

  it('12. state=on, percentage=66.67 → FanMode.Medium', () => {
    const s = makeState('on', { percentage: 66.67 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Medium);
  });

  it('12. state=on, percentage=83.33 → FanMode.High', () => {
    const s = makeState('on', { percentage: 83.33 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.High);
  });

  it('12. state=on, percentage=100 → FanMode.High', () => {
    const s = makeState('on', { percentage: 100 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.High);
  });

  it('12. state=on, percentage=88 (valor real sala) → FanMode.High', () => {
    const s = makeState('on', { percentage: 88 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.High);
  });

  it('12. state=on, percentage=32 (valor real visitas) → FanMode.Low', () => {
    const s = makeState('on', { percentage: 32 });
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Low);
  });

  it('12. state=off con percentage=88 → FanMode.Off (no On ni High)', () => {
    const s = makeState('off', { percentage: 88 });
    // Critical: even though percentage is high, state=off → FanMode.Off
    expect(haStateToFanMode(s)).toBe(FanControl.FanMode.Off);
  });
});

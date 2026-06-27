import { describe, it, expect } from 'vitest';
import { coverConverter } from '../../src/converters/cover.converter.js';

describe('coverConverter', () => {
  it('should convert cover position', () => {
    const state = { state: 'open', attributes: { current_position: 75 } } as any;
    expect(coverConverter.toPosition(state)).toBe(75);
  });

  it('should map HA cover state to closure status', () => {
    const closedState = { state: 'closed', attributes: {} } as any;
    const openState = { state: 'open', attributes: {} } as any;

    expect(coverConverter.toClosureStatus(closedState)).toBe(0);
    expect(coverConverter.toClosureStatus(openState)).toBe(100);
  });
});

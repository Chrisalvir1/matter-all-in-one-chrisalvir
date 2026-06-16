import { describe, it, expect } from 'vitest';
import { cameraConverter } from '../../src/converters/camera.converter.js';

describe('cameraConverter', () => {
  it('should map HA camera recording state to streaming status', () => {
    const recordingState = { state: 'recording', attributes: {} } as any;
    const idleState = { state: 'idle', attributes: {} } as any;

    expect(cameraConverter.toStreamingState(recordingState)).toBe(true);
    expect(cameraConverter.toStreamingState(idleState)).toBe(false);
  });
});

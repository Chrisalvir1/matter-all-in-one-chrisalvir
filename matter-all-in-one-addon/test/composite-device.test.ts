import { describe, expect, it, vi } from 'vitest';
import './mocks/matterbridge.mock.js';
import { CompositeDeviceEntity } from '../src/entities/composite-device.entity.js';

const platform = {
  log: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
  ha: { callService: vi.fn().mockResolvedValue(undefined) },
};


function state(entityId: string, value: string, attributes: Record<string, any> = {}) {
  return { entity_id: entityId, state: value, attributes: { friendly_name: entityId, ...attributes }, last_changed: '', last_updated: '' };
}

describe('CompositeDeviceEntity', () => {
  it('creates one fan-rooted Matter node with a light child endpoint', async () => {
    const composite = new CompositeDeviceEntity(platform, 'fan-device', 'Ventilador Sala', [
      { entityId: 'fan.sala', state: state('fan.sala', 'on', { percentage: 60 }) },
      { entityId: 'light.sala', state: state('light.sala', 'on', { brightness: 128, supported_color_modes: ['brightness'] }) },
    ]);

    const root = await composite.createEndpoint();
    expect(composite.primaryEntityId).toBe('fan.sala');
    expect(composite.endpoints.get('fan.sala')).toBe(root);
    expect(composite.endpoints.get('light.sala')).toBeDefined();
    expect((root as any).children.has('light_sala')).toBe(true);
  });

  it('sends fan and light commands to their own HA services', async () => {
    const composite = new CompositeDeviceEntity(platform, 'fan-device', 'Ventilador Sala', [
      { entityId: 'fan.sala', state: state('fan.sala', 'off') },
      { entityId: 'light.sala', state: state('light.sala', 'off') },
    ]);
    await composite.createEndpoint();
    await (composite.endpoints.get('fan.sala') as any).invokeCommand('on');
    await (composite.endpoints.get('light.sala') as any).invokeCommand('on');
    expect(platform.ha.callService).toHaveBeenCalledWith('fan', 'turn_on', 'fan.sala');
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.sala');
  });
});

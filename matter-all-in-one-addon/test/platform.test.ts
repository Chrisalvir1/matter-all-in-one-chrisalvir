import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import './mocks/matterbridge.mock.js';
import './mocks/ha-api.mock.js';
import { HomeAssistantPlatform } from '../src/platform.js';
import { mockMatterbridge, mockLog } from './mocks/matterbridge.mock.js';

describe('HomeAssistantPlatform', () => {
  let platform: HomeAssistantPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    platform = new HomeAssistantPlatform(
      mockMatterbridge as any,
      mockLog as any,
      {
        name: 'test-platform',
        type: 'dynamic',
        host: 'localhost',
        token: 'fake-token',
      } as any
    );
  });

  afterEach(async () => {
    await platform.onShutdown('test-teardown');
  });

  it('should initialize and connect to Home Assistant', async () => {
    await platform.onStart();
    expect(platform.ha.connected).toBe(true);
  });

  it('should discover and register devices', async () => {
    await platform.onStart();
    // Simulate connection event triggering discovery
    platform.ha.emit('connected', '2026.6.0');

    // Wait for async discovery and registration to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(platform.entities.size).toBeGreaterThan(0);
    expect(platform.entities.has('light.living_room')).toBe(true);
    expect(platform.entities.has('cover.garage_door')).toBe(true);
    expect(platform.entities.has('camera.backyard')).toBe(true);
    expect(platform.entities.has('sensor.garden_moisture')).toBe(true);
  });

  it('should update entities state when a HA event occurs', async () => {
    await platform.onStart();
    platform.ha.emit('connected', '2026.6.0');
    await new Promise(resolve => setTimeout(resolve, 100));

    const lightEntity = platform.entities.get('light.living_room');
    expect(lightEntity).toBeDefined();

    // Trigger state change event
    platform.ha.emit('event', 'device-1', 'light.living_room', null, {
      entity_id: 'light.living_room',
      state: 'off',
      attributes: {
        friendly_name: 'Living Room Light',
        brightness: 0,
      },
      last_changed: 'now',
      last_updated: 'now',
    });

    expect(lightEntity!.state.state).toBe('off');
  });
});

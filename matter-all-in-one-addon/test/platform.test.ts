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
    expect(platform.entities.has('camera.backyard')).toBe(false);
    expect(platform.entities.has('sensor.garden_moisture')).toBe(true);
  });

  it('should expose Home Assistant device registry metadata in the custom devices API', async () => {
    await platform.onStart();
    platform.ha.emit('connected', '2026.6.0');
    await new Promise(resolve => setTimeout(resolve, 100));

    const res = await fetch('http://127.0.0.1:8285/api/custom/devices');
    expect(res.ok).toBe(true);

    const devices = await res.json() as any[];
    const livingRoomLight = devices.find(device => device.entityId === 'light.living_room');

    expect(livingRoomLight).toMatchObject({
      device_id: 'device-light-1',
      device_name: 'Living Room Lamp',
      area_name: 'Living Room',
      entity_registry_id: 'entity-light-1',
      platform: 'mock',
    });
  });

  it('marks fan and light sharing a device_id as one composite before either is activated', async () => {
    await platform.onStart();
    await new Promise(resolve => setTimeout(resolve, 100));

    const res = await fetch('http://127.0.0.1:8285/api/custom/devices');
    const devices = await res.json() as any[];
    const fan = devices.find(device => device.entityId === 'fan.ceiling_fan');
    const light = devices.find(device => device.entityId === 'light.ceiling_fan_light');

    expect(fan).toMatchObject({
      composite: true,
      compositeActive: false,
      compositeDeviceId: 'device-ceiling-fan-1',
      compositePrimaryEntityId: 'fan.ceiling_fan',
      exported: false,
    });
    expect(light).toMatchObject({
      composite: true,
      compositeActive: false,
      compositeDeviceId: 'device-ceiling-fan-1',
      compositePrimaryEntityId: 'fan.ceiling_fan',
      exported: false,
    });
  });

  it('should fail closed for unsafe or incomplete Matter mappings', async () => {
    await platform.onStart();

    const unsafeStates = [
      { entity_id: 'binary_sensor.smoke_alarm', state: 'off', attributes: { device_class: 'smoke' } },
      { entity_id: 'sensor.water_pressure', state: '1013', attributes: { device_class: 'pressure' } },
      { entity_id: 'sensor.energy_price', state: '0.25', attributes: { device_class: 'monetary' } },
      { entity_id: 'camera.backyard', state: 'recording', attributes: {} },
      { entity_id: 'alarm_control_panel.home', state: 'disarmed', attributes: {} },
    ];

    for (const state of unsafeStates) await (platform as any).registerHAEntity(state);

    for (const state of unsafeStates) expect(platform.entities.has(state.entity_id)).toBe(false);
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

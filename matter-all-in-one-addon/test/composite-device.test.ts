import { describe, expect, it, vi } from 'vitest';
import './mocks/matterbridge.mock.js';
import { CompositeDeviceEntity } from '../src/entities/composite-device.entity.js';

const platform = {
  log: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
  },
  ha: { callService: vi.fn().mockResolvedValue(undefined) },
};

function state(entityId: string, value: string, attributes: Record<string, any> = {}) {
  return {
    entity_id: entityId,
    state: value,
    attributes: { friendly_name: entityId, ...attributes },
    last_changed: '',
    last_updated: '',
  };
}

describe('CompositeDeviceEntity', () => {
  it('creates one fan-rooted Matter node with a light child endpoint', async () => {
    const composite = new CompositeDeviceEntity(platform, 'fan-device', 'Ventilador Sala', [
      {
        entityId: 'fan.sala',
        state: state('fan.sala', 'on', { percentage: 60 }),
      },
      {
        entityId: 'light.sala',
        state: state('light.sala', 'on', {
          brightness: 128,
          supported_color_modes: ['brightness'],
        }),
      },
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
    await (composite.endpoints.get('fan.sala') as any).invokeAttributeChange(0x0006, 'onOff', true);
    await (composite.endpoints.get('light.sala') as any).invokeAttributeChange(0x0006, 'onOff', true);
    expect(platform.ha.callService).toHaveBeenCalledWith('fan', 'turn_on', 'fan.sala');
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.sala');
  });

  it('publishes warm/cold fan lights as ColorTemperatureLight and sends modern HA kelvin commands', async () => {
    const composite = new CompositeDeviceEntity(platform, 'bedroom-fan', 'Ventilador Recámara', [
      { entityId: 'fan.bedroom', state: state('fan.bedroom', 'off') },
      {
        entityId: 'light.bedroom_main_light',
        state: state('light.bedroom_main_light', 'on', {
          color_mode: 'color_temp',
          min_color_temp_kelvin: 2200,
          max_color_temp_kelvin: 6500,
        }),
      },
    ]);

    const root = await composite.createEndpoint();
    const light = composite.endpoints.get('light.bedroom_main_light') as any;
    expect(light.deviceTypes[0]).toMatchObject({ code: 0x010c });
    expect(light.clusterServers.size).toBeGreaterThan(2);

    await light.invokeCommand('moveToColorTemperature', {
      colorTemperatureMireds: 250,
    });
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.bedroom_main_light', {
      color_temp_kelvin: 4000,
    });
    expect((root as any).children.has('light_bedroom_main_light')).toBe(true);
  });

  it('creates a lock-rooted Matter node with contact sensor integrated', async () => {
    const composite = new CompositeDeviceEntity(platform, 'switchbot-lock', 'Llavin SwitchBot', [
      {
        entityId: 'lock.llavin_switchbot',
        state: state('lock.llavin_switchbot', 'locked'),
      },
      {
        entityId: 'binary_sensor.llavin_switchbot_contact',
        state: state('binary_sensor.llavin_switchbot_contact', 'off', {
          device_class: 'door',
        }),
      },
    ]);

    const root = await composite.createEndpoint();
    expect(composite.primaryEntityId).toBe('lock.llavin_switchbot');
    expect(composite.endpoints.get('lock.llavin_switchbot')).toBe(root);
    expect(composite.endpoints.get('binary_sensor.llavin_switchbot_contact')).toBeDefined();
    expect((root as any).children.has('binary_sensor_llavin_switchbot_contact')).toBe(true);

    await (composite.endpoints.get('lock.llavin_switchbot') as any).invokeCommand('unlockDoor');
    expect(platform.ha.callService).toHaveBeenCalledWith('lock', 'unlock', 'lock.llavin_switchbot');
  });

  it('reattaches every member when Matterbridge retains a commissioned composite node', async () => {
    const members = [
      {
        entityId: 'fan.sala',
        state: state('fan.sala', 'on', { percentage: 40 }),
      },
      {
        entityId: 'light.sala',
        state: state('light.sala', 'on', { brightness: 100 }),
      },
    ];
    const original = new CompositeDeviceEntity(platform, 'fan-device', 'Ventilador Sala', members);
    const retainedEndpoint = await original.createEndpoint();
    const restored = new CompositeDeviceEntity(platform, 'fan-device', 'Ventilador Sala', members);

    restored.adoptEndpoint(retainedEndpoint);

    expect(restored.endpoints.get('fan.sala')).toBe(retainedEndpoint);
    expect(restored.endpoints.get('light.sala')).toBe((retainedEndpoint as any).children.get('light_sala'));
    await expect(restored.syncInitialState()).resolves.toBeUndefined();
  });

  it('supports speed slider (percentSetting), modes, and direction in composite fan + light accessories', async () => {
    const composite = new CompositeDeviceEntity(platform, 'fan-combo', 'Ventilador con Luz', [
      {
        entityId: 'fan.combo',
        state: state('fan.combo', 'on', { percentage: 50, direction: 'forward' }),
      },
      {
        entityId: 'light.combo',
        state: state('light.combo', 'off', { brightness: 255 }),
      },
    ]);

    const root = await composite.createEndpoint();
    const fanEndpoint = composite.endpoints.get('fan.combo') as any;

    // Simulate dragging HomeKit fan slider to 80%
    await fanEndpoint.invokeAttributeChange(0x0202, 'percentSetting', 80);
    expect(platform.ha.callService).toHaveBeenCalledWith('fan', 'set_percentage', 'fan.combo', { percentage: 80 });

    // Simulate fan mode Low (1) -> 33%
    await fanEndpoint.invokeAttributeChange(0x0202, 'fanMode', 1);
    expect(platform.ha.callService).toHaveBeenCalledWith('fan', 'set_percentage', 'fan.combo', { percentage: 33 });

    // Simulate fan direction reverse
    await fanEndpoint.invokeAttributeChange(0x0202, 'airflowDirection', 1);
    expect(platform.ha.callService).toHaveBeenCalledWith('fan', 'set_direction', 'fan.combo', { direction: 'reverse' });
  });
});

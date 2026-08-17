import { describe, expect, it, vi } from 'vitest';
import './mocks/matterbridge.mock.js';
import { ColorControl, LevelControl } from 'matterbridge/matter/clusters';
import { BaseEntity } from '../src/entities/base.entity.js';
import { MatterDeviceTypes } from '../src/device-registry.js';

const platform = {
  matterbridge: { matterbridgeVersion: '3.10.0' },
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
  ha: {
    callService: vi.fn().mockResolvedValue(undefined),
    hassEntities: new Map([['light.govee_test', { id: 'entity-govee-test', device_id: 'device-govee-test' }]]),
    hassDevices: new Map([['device-govee-test', { serial_number: 'GOVEE-H6076-REAL-SN' }]]),
  },
};

function state(attributes: Record<string, unknown>) {
  return {
    entity_id: 'light.govee_test',
    state: 'on',
    attributes: { friendly_name: 'Govee Test', ...attributes },
    last_changed: '',
    last_updated: '',
  } as any;
}

describe('BaseEntity direct colour lights', () => {
  it('uses the physical HA serial and the bridge manufacturer in Matter Basic Information', async () => {
    const entity = new BaseEntity(platform as any, state({ supported_color_modes: ['brightness'] }), MatterDeviceTypes.dimmableLight);
    const endpoint = await entity.createEndpoint() as any;

    expect(endpoint.serialNumber).toBe('GOVEE-H6076-REAL-SN');
    expect(endpoint.vendorName).toBe('Matter All-in-One Chrisalvir');
  });

  it('publishes ColorControl, mirrors HA hue/saturation, and sends Matter colour commands to HA', async () => {
    const entity = new BaseEntity(platform as any, state({
      brightness: 128,
      color_mode: 'hs',
      hs_color: [120, 50],
      supported_color_modes: ['hs', 'color_temp'],
      min_color_temp_kelvin: 2700,
      max_color_temp_kelvin: 6500,
    }), MatterDeviceTypes.extendedColorLight);

    const endpoint = await entity.createEndpoint() as any;
    expect(endpoint.clusterServers.has(ColorControl.id)).toBe(true);
    expect(endpoint.clusterServers.has(LevelControl.id)).toBe(true);
    await entity.syncInitialState();
    expect(endpoint.attributes.get(`${ColorControl.id}:currentHue`)).toBe(85);
    expect(endpoint.attributes.get(`${ColorControl.id}:currentSaturation`)).toBe(127);

    await endpoint.invokeCommand('moveToHueAndSaturation', { hue: 127, saturation: 254 });
    expect(platform.ha.callService).toHaveBeenLastCalledWith('light', 'turn_on', 'light.govee_test', { hs_color: [180, 100] });

    await endpoint.invokeCommand('moveToColorTemperature', { colorTemperatureMireds: 250 });
    expect(platform.ha.callService).toHaveBeenLastCalledWith('light', 'turn_on', 'light.govee_test', {
      color_temp_kelvin: 4000,
    });
  });

  it('maps Matter XY colour commands to Home Assistant XY coordinates', async () => {
    const entity = new BaseEntity(platform as any, state({
      color_mode: 'xy',
      xy_color: [0.3, 0.4],
      supported_color_modes: ['xy'],
    }), MatterDeviceTypes.extendedColorLight);
    const endpoint = await entity.createEndpoint() as any;

    await endpoint.invokeCommand('moveToColor', { colorX: 32768, colorY: 16384 });
    expect(platform.ha.callService).toHaveBeenLastCalledWith('light', 'turn_on', 'light.govee_test', {
      xy_color: [32768 / 65536, 16384 / 65536],
    });
  });
});

describe('BaseEntity FanControl full features', () => {
  function fanState(attributes: Record<string, unknown> = {}, value = 'on') {
    return {
      entity_id: 'fan.living_room_fan',
      state: value,
      attributes: { friendly_name: 'Living Room Fan', percentage: 50, direction: 'forward', ...attributes },
      last_changed: '',
      last_updated: '',
    } as any;
  }

  it('handles HomeKit fan speed slider (percentSetting) adjustments and turns off when 0%', async () => {
    const entity = new BaseEntity(platform as any, fanState({ percentage: 50 }), MatterDeviceTypes.fan);
    const endpoint = await entity.createEndpoint() as any;

    // Simulate HomeKit sliding speed to 75%
    await endpoint.invokeAttributeChange(0x0202, 'percentSetting', 75);
    expect(platform.ha.callService).toHaveBeenLastCalledWith('fan', 'set_percentage', 'fan.living_room_fan', { percentage: 75 });

    // Simulate HomeKit sliding speed to 0%
    await endpoint.invokeAttributeChange(0x0202, 'percentSetting', 0);
    expect(platform.ha.callService).toHaveBeenLastCalledWith('fan', 'turn_off', 'fan.living_room_fan');
  });

  it('handles HomeKit fan mode and direction changes', async () => {
    const entity = new BaseEntity(platform as any, fanState({ preset_modes: ['auto', 'nature'] }), MatterDeviceTypes.fan);
    const endpoint = await entity.createEndpoint() as any;

    // Simulate fan mode Low (1) -> 33%
    await endpoint.invokeAttributeChange(0x0202, 'fanMode', 1);
    expect(platform.ha.callService).toHaveBeenLastCalledWith('fan', 'set_percentage', 'fan.living_room_fan', { percentage: 33 });

    // Simulate fan mode Auto (5)
    await endpoint.invokeAttributeChange(0x0202, 'fanMode', 5);
    expect(platform.ha.callService).toHaveBeenLastCalledWith('fan', 'set_preset_mode', 'fan.living_room_fan', { preset_mode: 'auto' });

    // Simulate airflow direction Reverse (1)
    await endpoint.invokeAttributeChange(0x0202, 'airflowDirection', 1);
    expect(platform.ha.callService).toHaveBeenLastCalledWith('fan', 'set_direction', 'fan.living_room_fan', { direction: 'reverse' });
  });
});

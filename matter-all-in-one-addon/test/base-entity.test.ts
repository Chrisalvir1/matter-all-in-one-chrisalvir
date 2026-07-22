import { describe, expect, it, vi } from 'vitest';
import './mocks/matterbridge.mock.js';
import { ColorControl, LevelControl } from 'matterbridge/matter/clusters';
import { BaseEntity } from '../src/entities/base.entity.js';
import { MatterDeviceTypes } from '../src/device-registry.js';

const platform = {
  matterbridge: { matterbridgeVersion: '3.10.0' },
  log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
  ha: { callService: vi.fn().mockResolvedValue(undefined) },
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
    expect(platform.ha.callService).toHaveBeenLastCalledWith('light', 'turn_on', 'light.govee_test', { color_temp_kelvin: 4000 });
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
      xy_color: [32768 / 65535, 16384 / 65535],
    });
  });
});

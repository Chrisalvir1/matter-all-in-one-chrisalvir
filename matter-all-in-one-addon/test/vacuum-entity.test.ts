import { describe, expect, it, vi } from 'vitest';
import './mocks/matterbridge.mock.js';
import { VacuumEntity } from '../src/entities/vacuum.entity.js';
import { MatterDeviceTypes } from '../src/device-registry.js';

describe('VacuumEntity Apple Home topology and identity', () => {
  it('publishes one standalone RVC with the requested model and physical HA serial', async () => {
    const entityId = 'vacuum.sala_tv_robotina_rvc';
    const selectId = 'select.robotina_modo_de_limpieza';
    const platform = {
      matterbridge: { matterbridgeVersion: '3.10.2' },
      log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map([
          [entityId, { id: 'vacuum-registry-entity', device_id: 'robotina-device' }],
          [selectId, { id: 'select-registry-entity', device_id: 'robotina-device' }],
        ]),
        hassDevices: new Map([
          ['robotina-device', { serial_number: 'bf4ae2b69ab212b227zupl' }],
        ]),
        hassStates: new Map([
          [selectId, {
            entity_id: selectId,
            state: 'smart',
            attributes: { options: ['smart', 'random', 'wall_follow', 'spiral', 'chargego'] },
          }],
        ]),
      },
    };
    const state = {
      entity_id: entityId,
      state: 'docked',
      attributes: { friendly_name: 'ROBOTINA', battery_level: 100 },
      last_changed: '',
      last_updated: '',
    };

    const vacuum = new VacuumEntity(platform as any, state as any, MatterDeviceTypes.roboticVacuumCleaner);
    const endpoint = await vacuum.createEndpoint() as any;

    expect(endpoint.options.mode).toBe('server');
    expect(endpoint.deviceType).toBe(0x0074);
    expect(endpoint.deviceName).toBe('ROBOTINA');
    expect(endpoint.productName).toBe('Ropvocnic Tuya Vacuum');
    expect(endpoint.serialNumber).toBe('bf4ae2b69ab212b227zupl');
    expect(endpoint.supportedCleanModes).toEqual([
      { label: 'Automático', mode: 1, modeTags: [{ value: 16385 }, { value: 0 }] },
      { label: 'Aleatorio', mode: 2, modeTags: [{ value: 16385 }, { value: 1 }] },
      { label: 'Seguimiento de pared', mode: 3, modeTags: [{ value: 16385 }, { value: 2 }] },
      { label: 'Espiral', mode: 4, modeTags: [{ value: 16385 }, { value: 16384 }] },
    ]);
    expect(endpoint.children.size).toBe(0);

    for (const [mode, option] of [[1, 'smart'], [2, 'random'], [3, 'wall_follow'], [4, 'spiral']] as const) {
      await endpoint.invokeCommand('RvcCleanMode.changeToMode', { request: { newMode: mode } });
      expect(platform.ha.callService).toHaveBeenLastCalledWith(
        'select',
        'select_option',
        selectId,
        { option },
      );
      expect(endpoint.attributes.get('rvcCleanMode:currentMode')).toBe(mode);
    }

    // The reverse path is equally important: a mode selected in Smart Life
    // must update the RVC mode that Apple Home reads.
    (platform.ha.hassStates.get(selectId) as any).state = 'spiral';
    await vacuum.updateState({ ...state, state: 'cleaning' } as any, true);
    expect(endpoint.attributes.get('rvcCleanMode:currentMode')).toBe(4);
  });
});

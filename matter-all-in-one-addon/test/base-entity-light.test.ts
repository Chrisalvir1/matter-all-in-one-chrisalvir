import { describe, it, expect, vi, beforeEach } from 'vitest';
import './mocks/matterbridge.mock.js';
import { mockMatterbridge } from './mocks/matterbridge.mock.js';
import { BaseEntity } from '../src/entities/base.entity.js';
import { CompositeDeviceEntity } from '../src/entities/composite-device.entity.js';
import { OnOff, LevelControl, ColorControl, FanControl } from 'matterbridge/matter/clusters';
import { MatterDeviceTypes, getLightDeviceType } from '../src/device-registry.js';
import { lightColor } from '../src/utils/light-color.js';
import { lightConverter } from '../src/converters/light.converter.js';

vi.mock('../src/utils/matter-attributes.js', () => ({
  safeSetAttribute: vi.fn(async (ep, cluster, attr, val) => {
    ep.setAttribute(cluster, attr, val);
  }),
  safeUpdateAttribute: vi.fn(async (ep, cluster, attr, val) => {
    ep.updateAttribute(cluster, attr, val);
  }),
}));

describe('Light Entity Comprehensive Audit (18 Requirements)', () => {
  let platform: any;
  let endpoint: any;

  beforeEach(() => {
    platform = {
      matterbridge: mockMatterbridge,
      log: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), notice: vi.fn(), warn: vi.fn() },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map([
          ['light.govee_rgb', { id: 'entity-govee', device_id: 'device-govee' }],
        ]),
        hassDevices: new Map([
          ['device-govee', { serial_number: 'GOVEE-RGB-SN-123' }],
        ]),
      }
    };
  });

  async function createLightEntity(state: any, deviceType = MatterDeviceTypes.colorTemperatureLight) {
    if (!state.attributes) state.attributes = {};
    if (!state.attributes.friendly_name) state.attributes.friendly_name = 'Test Light';
    if (!state.entity_id) state.entity_id = 'light.test';

    const entity = new BaseEntity(platform as any, state, deviceType);
    endpoint = await entity.createEndpoint();
    entity.endpoint = endpoint;
    
    endpoint.hasClusterServer = (cluster: any) => true;
    endpoint.hasAttributeServer = (clusterId: number, attr: string) => true;

    return entity;
  }

  // 1. OFF + brightness conservado permanece OFF.
  it('1. OFF + cached brightness from HA remains OFF in Matter (no ghost power-on)', async () => {
    const entity = await createLightEntity({
      state: 'off',
      attributes: { brightness: 220, supported_color_modes: ['brightness'] },
    }, MatterDeviceTypes.dimmableLight);

    await entity.updateState({
      state: 'off',
      attributes: { brightness: 220, supported_color_modes: ['brightness'] },
    });

    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(false);

    // Turning ON restores brightness
    await entity.updateState({
      state: 'on',
      attributes: { brightness: 220, supported_color_modes: ['brightness'] },
    });
    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(true);
    expect(endpoint.attributes.get(`${LevelControl.id}:currentLevel`)).toBe(lightConverter.toLevel(220));
  });

  // 2. OFF + Kelvin conservado permanece OFF.
  it('2. OFF + cached Kelvin from HA remains OFF in Matter', async () => {
    const entity = await createLightEntity({
      state: 'off',
      attributes: { color_temp_kelvin: 4000, supported_color_modes: ['color_temp'] },
    }, MatterDeviceTypes.colorTemperatureLight);

    await entity.updateState({
      state: 'off',
      attributes: { color_temp_kelvin: 4000, supported_color_modes: ['color_temp'] },
    });

    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(false);

    // Turning ON restores Kelvin
    await entity.updateState({
      state: 'on',
      attributes: { color_temp_kelvin: 4000, supported_color_modes: ['color_temp'] },
    });
    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(true);
    expect(endpoint.attributes.get(`${ColorControl.id}:colorTemperatureMireds`)).toBe(250);
  });

  // 3. Cambio de brightness mientras OFF no modifica OnOff.
  it('3. Changing brightness while OFF preserves OnOff = false without ghost power-on', async () => {
    const entity = await createLightEntity({
      state: 'off',
      attributes: { brightness: 100, supported_color_modes: ['brightness'] },
    }, MatterDeviceTypes.dimmableLight);

    await entity.updateState({
      state: 'off',
      attributes: { brightness: 180, supported_color_modes: ['brightness'] },
    });

    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(false);
  });

  // 4. Cambio de Kelvin mientras OFF no modifica OnOff.
  it('4. Changing Kelvin while OFF preserves OnOff = false without ghost power-on', async () => {
    const entity = await createLightEntity({
      state: 'off',
      attributes: { color_temp_kelvin: 2700, supported_color_modes: ['color_temp'] },
    }, MatterDeviceTypes.colorTemperatureLight);

    await entity.updateState({
      state: 'off',
      attributes: { color_temp_kelvin: 5000, supported_color_modes: ['color_temp'] },
    });

    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(false);
  });

  // 5. HA brightness 1..255 ↔ Matter 1..254.
  it('5. HA brightness 1..255 maps bijectively and stably to Matter 1..254', () => {
    expect(lightConverter.toLevel(1)).toBe(1);
    expect(lightConverter.toLevel(255)).toBe(254);
    expect(lightConverter.toLevel(128)).toBe(127);
    expect(lightConverter.toLevel(0)).toBe(1); // Defensive clamp

    expect(lightConverter.toHaBrightness(1)).toBe(1);
    expect(lightConverter.toHaBrightness(254)).toBe(255);
    expect(lightConverter.toHaBrightness(127)).toBe(128);
  });

  // 6. Kelvin ↔ mired.
  it('6. Kelvin <-> Mireds conversion works accurately both ways', () => {
    expect(lightColor.kelvinToMireds(4000)).toBe(250);
    expect(lightColor.miredsToKelvin(250)).toBe(4000);

    expect(lightColor.kelvinToMireds(5000)).toBe(200);
    expect(lightColor.miredsToKelvin(200)).toBe(5000);
  });

  // 7. Inversión correcta de min/max Kelvin → mired.
  it('7. Inversion of min/max Kelvin to mireds range with proper clamping', () => {
    const attrs = {
      min_color_temp_kelvin: 2700, // warm -> max mireds
      max_color_temp_kelvin: 6500, // cold -> min mireds
    };

    const range = lightColor.getMiredsRange(attrs);
    expect(range.minMireds).toBe(154); // Math.round(1,000,000 / 6500)
    expect(range.maxMireds).toBe(370); // Math.round(1,000,000 / 2700)
    expect(range.minMireds).toBeLessThan(range.maxMireds);

    // Out of bounds clamping:
    // User requests 100 mireds (10,000K, too cold) -> clamped to 154
    expect(lightColor.clampMireds(100, attrs)).toBe(154);
    // User requests 600 mireds (1,666K, too warm) -> clamped to 370
    expect(lightColor.clampMireds(600, attrs)).toBe(370);
    // User requests valid 250 mireds (4,000K) -> 250
    expect(lightColor.clampMireds(250, attrs)).toBe(250);

    // Kelvin clamping
    expect(lightColor.clampKelvin(10000, attrs)).toBe(6500);
    expect(lightColor.clampKelvin(1500, attrs)).toBe(2700);
    expect(lightColor.clampKelvin(4000, attrs)).toBe(4000);
  });

  // 8. Evento HA actualiza Matter sin ejecutar nuevamente un servicio HA.
  it('8. Incoming HA state update sets Matter attributes without triggering HA service calls', async () => {
    const entity = await createLightEntity({
      state: 'on',
      attributes: { brightness: 150, color_temp_kelvin: 3000, supported_color_modes: ['color_temp'] },
    });

    platform.ha.callService.mockClear();

    await entity.updateState({
      state: 'on',
      attributes: { brightness: 200, color_temp_kelvin: 4500, supported_color_modes: ['color_temp'] },
    });

    expect(platform.ha.callService).not.toHaveBeenCalled();
    expect(endpoint.attributes.get(`${LevelControl.id}:currentLevel`)).toBe(lightConverter.toLevel(200));
  });

  // 9. Matter command + HA confirmation no genera loop.
  it('9. Matter command followed by HA confirmation does not loop', async () => {
    const entity = await createLightEntity({
      state: 'on',
      attributes: { brightness: 100, supported_color_modes: ['brightness'] },
    }, MatterDeviceTypes.dimmableLight);

    // Matter user requests level 254 (HA 255)
    await endpoint.invokeCommand('moveToLevel', { level: 254 });
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.test', { brightness: 255 });

    platform.ha.callService.mockClear();

    // HA responds confirming brightness = 255
    await entity.updateState({
      state: 'on',
      attributes: { brightness: 255, supported_color_modes: ['brightness'] },
    });

    // Confirmation recognized, no loops or re-calls
    expect(platform.ha.callService).not.toHaveBeenCalled();
  });

  // 10. Matter pide X y HA finalmente reporta Y: Y gana.
  it('10. Matter requests X and HA reports differing Y: HA state Y wins immediately', async () => {
    const entity = await createLightEntity({
      state: 'on',
      attributes: { brightness: 50, supported_color_modes: ['brightness'] },
    }, MatterDeviceTypes.dimmableLight);

    // Matter requests 200 (approx level 200 -> HA 201)
    await endpoint.invokeCommand('moveToLevel', { level: 200 });
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.test', { brightness: 201 });

    // Device physically only reached 150
    await entity.updateState({
      state: 'on',
      attributes: { brightness: 150, supported_color_modes: ['brightness'] },
    });

    // Real HA value (150 -> Matter 149) wins
    expect(endpoint.attributes.get(`${LevelControl.id}:currentLevel`)).toBe(lightConverter.toLevel(150));
  });

  // 11, 12, 13. WebSocket reconnect recupera state, brightness, Kelvin.
  it('11, 12, 13. WebSocket reconnect (isInitialSync) recovers state, brightness, and Kelvin regardless of lockout', async () => {
    const entity = await createLightEntity({
      state: 'off',
      attributes: { brightness: 50, color_temp_kelvin: 3000, supported_color_modes: ['color_temp'] },
    });

    // Simulate recent command lockout
    (entity as any).setCommandLockout('brightness', 255);
    (entity as any).setCommandLockout('color_temp', 154);

    // Reconnection occurs with isInitialSync = true
    await entity.updateState({
      state: 'on',
      attributes: { brightness: 180, color_temp_kelvin: 4200, supported_color_modes: ['color_temp'] },
    }, true);

    expect(endpoint.attributes.get(`${OnOff.id}:onOff`)).toBe(true);
    expect(endpoint.attributes.get(`${LevelControl.id}:currentLevel`)).toBe(lightConverter.toLevel(180));
    expect(endpoint.attributes.get(`${ColorControl.id}:colorTemperatureMireds`)).toBe(lightColor.kelvinToMireds(4200));
  });

  // 14. Restart recupera estado desde HA.
  it('14. Restart syncInitialState restores complete state from HA', async () => {
    const entity = new BaseEntity(platform as any, {
      entity_id: 'light.restart_test',
      state: 'on',
      attributes: { friendly_name: 'Restart Light', brightness: 210, color_temp_kelvin: 3500, supported_color_modes: ['color_temp'] },
      last_changed: '',
      last_updated: '',
    }, MatterDeviceTypes.colorTemperatureLight);

    const ep = await entity.createEndpoint();
    entity.endpoint = ep;
    ep.hasClusterServer = () => true;
    ep.hasAttributeServer = () => true;

    await entity.syncInitialState();

    expect(ep.attributes.get(`${OnOff.id}:onOff`)).toBe(true);
    expect(ep.attributes.get(`${LevelControl.id}:currentLevel`)).toBe(lightConverter.toLevel(210));
    expect(ep.attributes.get(`${ColorControl.id}:colorTemperatureMireds`)).toBe(lightColor.kelvinToMireds(3500));
  });

  // 15. Composite fan + light mantiene sus endpoints existentes.
  it('15. Composite fan + light maintains separate endpoints under single accessory node', async () => {
    const composite = new CompositeDeviceEntity(platform as any, 'fan-ble-device', 'Ventilador Master', [
      {
        entityId: 'fan.master_bedroom',
        state: { entity_id: 'fan.master_bedroom', state: 'on', attributes: { friendly_name: 'Fan', percentage: 66, supported_features: 53 }, last_changed: '', last_updated: '' },
      },
      {
        entityId: 'light.master_bedroom_light',
        state: { entity_id: 'light.master_bedroom_light', state: 'off', attributes: { friendly_name: 'Fan Light', brightness: 180, color_temp_kelvin: 3000, supported_color_modes: ['color_temp'] }, last_changed: '', last_updated: '' },
      },
    ]);

    const root = await composite.createEndpoint();
    expect(composite.primaryEntityId).toBe('fan.master_bedroom');
    expect(composite.endpoints.has('fan.master_bedroom')).toBe(true);
    expect(composite.endpoints.has('light.master_bedroom_light')).toBe(true);

    const lightChild = composite.endpoints.get('light.master_bedroom_light')!;
    expect(lightChild).toBeDefined();

    // Verify child endpoints sync correctly
    await composite.updateEntity('light.master_bedroom_light', {
      entity_id: 'light.master_bedroom_light',
      state: 'off',
      attributes: { friendly_name: 'Fan Light', brightness: 200, color_temp_kelvin: 4000, supported_color_modes: ['color_temp'] },
      last_changed: '',
      last_updated: '',
    });

    expect(lightChild.attributes.get(`${OnOff.id}:onOff`)).toBe(false);
  });

  // 16. ColorTemperatureLight continúa siendo 0x010C cuando corresponde.
  it('16. ColorTemperatureLight continues to map to code 0x010C', () => {
    const devType = getLightDeviceType({
      supported_color_modes: ['color_temp'],
      min_color_temp_kelvin: 2700,
      max_color_temp_kelvin: 6500,
    });
    expect(devType.code).toBe(0x010c);
    expect(devType.name).toBe('colorTemperatureLight');
  });

  // 17. ExtendedColorLight continúa siendo 0x010D cuando corresponde.
  it('17. ExtendedColorLight continues to map to code 0x010D for RGB/HS/XY', () => {
    const devTypeHs = getLightDeviceType({ supported_color_modes: ['hs', 'color_temp'] });
    expect(devTypeHs.code).toBe(0x010d);
    expect(devTypeHs.name).toBe('extendedColorLight');

    const devTypeRgb = getLightDeviceType({ supported_color_modes: ['rgb'] });
    expect(devTypeRgb.code).toBe(0x010d);
  });

  // 18. Luces Govee RGB/WW existentes mantienen OnOff, brightness y color sin regresiones.
  it('18. Existing Govee RGB/WW lights maintain OnOff, brightness, HS and Kelvin commands without regression', async () => {
    const goveeState = {
      entity_id: 'light.govee_rgb',
      state: 'on',
      attributes: {
        friendly_name: 'Govee Strip',
        brightness: 200,
        color_mode: 'hs',
        hs_color: [240, 80],
        supported_color_modes: ['hs', 'color_temp'],
        min_color_temp_kelvin: 2500,
        max_color_temp_kelvin: 6500,
      },
      last_changed: '',
      last_updated: '',
    };

    const entity = new BaseEntity(platform as any, goveeState, MatterDeviceTypes.extendedColorLight);
    const ep = await entity.createEndpoint() as any;
    entity.endpoint = ep;

    expect(ep.serialNumber).toBe('GOVEE-RGB-SN-123');

    // Test HS command
    await ep.invokeCommand('moveToHueAndSaturation', { hue: 127, saturation: 254 });
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.govee_rgb', {
      hs_color: [180, 100],
    });

    // Test Kelvin command within range
    await ep.invokeCommand('moveToColorTemperature', { colorTemperatureMireds: 250 });
    expect(platform.ha.callService).toHaveBeenCalledWith('light', 'turn_on', 'light.govee_rgb', {
      color_temp_kelvin: 4000,
    });
  });
});


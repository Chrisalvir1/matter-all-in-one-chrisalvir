/**
 * Soil Moisture entity representing moisture and temperature soil sensors in Matter 1.5.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { ClusterId } from 'matterbridge/matter/types';
import { BaseEntity } from './base.entity.js';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

export const SoilMoistureMeasurementClusterId = ClusterId(0x0408);
export const TemperatureMeasurementClusterId = ClusterId(0x0402);

export class SoilEntity extends BaseEntity {
  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  protected override getRequiredClusterIds(): ClusterId[] {
    return [SoilMoistureMeasurementClusterId, TemperatureMeasurementClusterId];
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replace('.', '_'),
      mode: 'child',
    });

    const clusters = this.getRequiredClusterIds();
    this.endpoint.addClusterServers(clusters);
    this.endpoint.addRequiredClusterServers();

    this.syncInitialState();

    return this.endpoint;
  }

  public override updateState(newState: HassState) {
    this.state = newState;

    // In HA, moisture measurement is a percentage (0..100) or decimal.
    // Matter Moisture is stored in hundredths of a percent (0..10000).
    const rawMoisture = parseFloat(newState.state);
    if (!isNaN(rawMoisture)) {
      const matterMoisture = Math.round(rawMoisture * 100);
      safeSetAttribute(this.endpoint, SoilMoistureMeasurementClusterId, 'measuredValue', matterMoisture);
    }

    // Map secondary temperature if available in entity attributes
    const rawTemp = newState.attributes.temperature;
    if (rawTemp !== undefined) {
      const matterTemp = Math.round(rawTemp * 100); // Matter temperature is in hundredths of a degree Celsius
      safeSetAttribute(this.endpoint, TemperatureMeasurementClusterId, 'measuredValue', matterTemp);
    }
  }
}

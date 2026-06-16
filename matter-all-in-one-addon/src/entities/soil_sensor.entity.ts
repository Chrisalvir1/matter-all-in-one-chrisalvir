import { BaseEntity } from './base.entity.js';
import { ClusterId } from 'matterbridge/matter/types';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

const RelativeHumidityMeasurementId = 0x0405 as any as ClusterId;
const TemperatureMeasurementId = 0x0402 as any as ClusterId;

export class SoilSensorEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(RelativeHumidityMeasurementId);
    clusters.push(TemperatureMeasurementId);
    return clusters;
  }

  public override updateState(state: HassState): void {
    this.state = state;
    const rawValue = parseFloat(state.state);
    if (isNaN(rawValue)) return;

    const deviceClass = state.attributes.device_class;

    if (deviceClass === 'moisture') {
      // HA uses percentage 0..100, Matter uses hundredths of a percent 0..10000
      const mappedMoisture = Math.round(rawValue * 100);
      safeSetAttribute(this.endpoint, RelativeHumidityMeasurementId, 'measuredValue', mappedMoisture, this.platform.log);
    } else if (deviceClass === 'temperature') {
      // Matter uses hundredths of a degree Celsius
      const mappedTemp = Math.round(rawValue * 100);
      safeSetAttribute(this.endpoint, TemperatureMeasurementId, 'measuredValue', mappedTemp, this.platform.log);
    }
  }
}

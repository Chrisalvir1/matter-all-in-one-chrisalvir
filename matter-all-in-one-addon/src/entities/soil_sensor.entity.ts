import { BaseEntity } from './base.entity.js';
import { SoilMoistureMeasurement, TemperatureMeasurement } from '@matter/main/clusters';
import { Endpoint } from '@matter/main';

export class SoilSensorEntity extends BaseEntity {
  public override async initialize(endpoint: Endpoint): Promise<void> {
    await super.initialize(endpoint);

    if (!endpoint.hasClusterServer(SoilMoistureMeasurement.Cluster)) {
      endpoint.addClusterServer(
        SoilMoistureMeasurement.Cluster.createServer({
          measuredValue: 0, // 0..10000
          minMeasuredValue: 0,
          maxMeasuredValue: 10000,
        })
      );
    }

    if (!endpoint.hasClusterServer(TemperatureMeasurement.Cluster)) {
      endpoint.addClusterServer(
        TemperatureMeasurement.Cluster.createServer({
          measuredValue: 0,
          minMeasuredValue: -27315,
          maxMeasuredValue: 32767,
        })
      );
    }
  }

  public override updateState(state: any): void {
    const rawValue = parseFloat(state.state);
    if (isNaN(rawValue)) return;

    const deviceClass = state.attributes.device_class;

    if (deviceClass === 'moisture') {
      const moistureCluster = this.endpoint?.getClusterServer(SoilMoistureMeasurement.Cluster);
      if (moistureCluster) {
        // HA uses percentage 0..100, Matter uses hundredths of a percent 0..10000
        const mappedMoisture = Math.round(rawValue * 100);
        moistureCluster.setMeasuredValueAttribute(mappedMoisture);
      }
    } else if (deviceClass === 'temperature') {
      const tempCluster = this.endpoint?.getClusterServer(TemperatureMeasurement.Cluster);
      if (tempCluster) {
        // Matter uses hundredths of a degree Celsius
        const mappedTemp = Math.round(rawValue * 100);
        tempCluster.setMeasuredValueAttribute(mappedTemp);
      }
    }
  }
}

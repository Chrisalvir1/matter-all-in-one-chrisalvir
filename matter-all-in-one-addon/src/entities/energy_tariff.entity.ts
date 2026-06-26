import { BaseEntity } from './base.entity.js';
import { ClusterId } from 'matterbridge/matter/types';
import { HassState } from '../utils/ha-state.js';

const ElectricalGridConditionsId = 0x00A0 as any as ClusterId;

export class EnergyTariffEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(ElectricalGridConditionsId);
    return clusters;
  }

  public override async updateState(state: HassState): Promise<void> {
    this.state = state;
    // Map electrical tariff values from HA to Matter
  }
}

import { BaseEntity } from './base.entity.js';
import { ClusterId } from 'matterbridge/matter/types';
import { HassState } from '../utils/ha-state.js';

const CameraAvStreamManagementId = 0x0551 as any as ClusterId;
const WebRtcTransportProviderId = 0x0553 as any as ClusterId;

export class CameraEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(CameraAvStreamManagementId);
    clusters.push(WebRtcTransportProviderId);
    return clusters;
  }

  public override updateState(state: HassState): void {
    this.state = state;
    // Implement state mapping logic from HA camera to Matter Camera clusters
  }
}

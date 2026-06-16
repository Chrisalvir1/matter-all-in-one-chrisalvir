import { BaseEntity } from './base.entity.js';
import { ClosureDimension, BarrierControl } from '@matter/main/clusters';
import { Endpoint } from '@matter/main';

export class ClosureEntity extends BaseEntity {
  public override async initialize(endpoint: Endpoint): Promise<void> {
    await super.initialize(endpoint);

    if (!endpoint.hasClusterServer(ClosureDimension.Cluster)) {
      endpoint.addClusterServer(
        ClosureDimension.Cluster.createServer({
          width: 0,
          height: 0,
        })
      );
    }

    if (!endpoint.hasClusterServer(BarrierControl.Cluster)) {
      endpoint.addClusterServer(
        BarrierControl.Cluster.createServer({
          barrierPosition: 0,
        })
      );
    }
  }

  public override updateState(state: any): void {
    // Map unified cover state to Closure using ClosureDimension and BarrierControl
    const position = state.attributes.current_position || 0;
    // Update the BarrierControl position based on the position
    const barrierCluster = this.endpoint?.getClusterServer(BarrierControl.Cluster);
    if (barrierCluster) {
      barrierCluster.setBarrierPositionAttribute(position);
    }
  }

  public override registerCommandHandlers(endpoint?: Endpoint): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;
    
    // Commands mapping for unified closure device type
    const barrierCluster = targetEndpoint.getClusterServer(BarrierControl.Cluster);
    if (barrierCluster) {
      barrierCluster.addCommandHandler('barrierControlGoToPercent', async ({ percentOpen }) => {
        await this.callHaService('cover', 'set_cover_position', {
          entity_id: this.entityId,
          position: percentOpen,
        });
      });
    }
  }
}

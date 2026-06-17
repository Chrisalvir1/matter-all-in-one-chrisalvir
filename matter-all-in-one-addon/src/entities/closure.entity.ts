import { BaseEntity } from './base.entity.js';
import { ClusterId } from 'matterbridge/matter/types';
import { MatterbridgeEndpoint } from 'matterbridge';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

const ClosureDimensionId = 0x0105 as any as ClusterId;
const WindowCoveringId = 0x0102 as any as ClusterId;

export class ClosureEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(ClosureDimensionId);
    clusters.push(WindowCoveringId);
    return clusters;
  }

  public override updateState(state: HassState): void {
    this.state = state;
    const position = state.attributes.current_position;
    if (position !== undefined && position !== null) {
      // HA: 0 (closed) to 100 (open)
      // Matter: 0 (open) to 100 (closed)
      const liftPercentage = 100 - Math.round(position);
      safeSetAttribute(this.endpoint, WindowCoveringId, 'currentPositionLiftPercentage', liftPercentage, this.platform.log);
    }
  }

  protected override registerCommandHandlers(endpoint?: MatterbridgeEndpoint): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    targetEndpoint.addCommandHandler('goToLiftPercentage', async (payload: any) => {
      // Safely support both liftPercentageValue (Matter 1.3/1.4) and liftPercent100thsValue (Matter 1.5/1.5.1)
      let percent: number | undefined;
      if (payload.liftPercent100thsValue !== undefined) {
        percent = Math.round(payload.liftPercent100thsValue / 100);
      } else if (payload.liftPercentageValue !== undefined) {
        percent = payload.liftPercentageValue;
      }

      if (percent !== undefined) {
        const haPosition = 100 - percent;
        await this.platform.ha.callService('cover', 'set_cover_position', this.entityId, {
          position: haPosition,
        });
      }
    });
  }
}

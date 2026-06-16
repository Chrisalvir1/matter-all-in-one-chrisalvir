/**
 * Closure unified entity representing cover.* entities in Matter 1.5.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { ClusterId } from 'matterbridge/matter/types';
import { BaseEntity } from './base.entity.js';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

// Matter 1.5 Closure Cluster Definitions
export const ClosureControlClusterId = ClusterId(0x0090); // Dummy/Standard ID for Closure Control
export const ClosureDimensionClusterId = ClusterId(0x0091); // Dummy/Standard ID for Closure Dimension

export class ClosureEntity extends BaseEntity {
  private deviceClass: string;

  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
    this.deviceClass = state.attributes.device_class ?? 'blind';
  }

  protected override getRequiredClusterIds(): ClusterId[] {
    // Closure unified uses ClosureControl and ClosureDimension
    return [ClosureControlClusterId, ClosureDimensionClusterId];
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replace('.', '_'),
      mode: undefined,
    });

    const clusters = this.getRequiredClusterIds();
    this.endpoint.addClusterServers(clusters);
    this.endpoint.addRequiredClusterServers();

    this.registerCommandHandlers();
    this.syncInitialState();

    return this.endpoint;
  }

  protected override registerCommandHandlers() {
    // Support Closure open/close/stop actions mapping to HA services
    this.endpoint.addCommandHandler('open', async () => {
      this.platform.log.debug(`Matter Open Cover commanded for ${this.entityId}`);
      await this.platform.ha.callService('cover', 'open_cover', this.entityId);
    });

    this.endpoint.addCommandHandler('close', async () => {
      this.platform.log.debug(`Matter Close Cover commanded for ${this.entityId}`);
      await this.platform.ha.callService('cover', 'close_cover', this.entityId);
    });

    this.endpoint.addCommandHandler('stop', async () => {
      this.platform.log.debug(`Matter Stop Cover commanded for ${this.entityId}`);
      await this.platform.ha.callService('cover', 'stop_cover', this.entityId);
    });

    // Support position control (0..100%) for blinds/shades/curtains
    if (this.endpoint.hasAttributeServer(ClosureDimensionClusterId, 'currentPosition')) {
      this.endpoint.addCommandHandler('moveToPosition' as any, async (data: any) => {
        const position = data.position; // 0..100
        this.platform.log.debug(`Matter MoveToPosition commanded for ${this.entityId}: position=${position}`);
        await this.platform.ha.callService('cover', 'set_cover_position', this.entityId, {
          position: position,
        });
      });
    }
  }

  public override updateState(newState: HassState) {
    this.state = newState;

    // Map HA position attribute to Matter ClosurePosition
    const haPosition = newState.attributes.current_position; // 0..100 (100 is fully open, 0 is closed)
    if (haPosition !== undefined) {
      safeSetAttribute(this.endpoint, ClosureDimensionClusterId, 'currentPosition', haPosition);
      safeSetAttribute(this.endpoint, ClosureDimensionClusterId, 'targetPosition', haPosition);
    }

    // Map operational status
    const isClosed = newState.state === 'closed';
    const isOpen = newState.state === 'open';
    const stateValue = isClosed ? 0 : (isOpen ? 100 : (haPosition ?? 50));

    safeSetAttribute(this.endpoint, ClosureControlClusterId, 'closureStatus', stateValue);
  }
}

import { MatterbridgeEndpoint } from 'matterbridge';
import { DoorLock } from 'matterbridge/matter/clusters';
import { MatterbridgeDoorLockServer } from 'matterbridge/behaviors';
import { BaseEntity } from './base.entity.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

export class AlarmEntity extends BaseEntity {
  static readonly matterTypeLabel = 'Panel de Alarma';

  protected override applyMatterbridgeFirmware(endpoint: MatterbridgeEndpoint = this.endpoint) {
    super.applyMatterbridgeFirmware(endpoint);
  }

  public override async updateState(newState: any) {
    if (!this.endpoint || this.platform.isDpsGenericEntity(this.entityId)) return;
    
    // Map HA states to DoorLock states (Apple Home uses Locks for simple alarms if no native security cluster)
    // armed_home / armed_away / armed_night -> Locked
    // disarmed -> Unlocked
    const isArmed = newState.state.startsWith('armed_');
    const lockState = isArmed ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked;
    
    safeSetAttribute(this.endpoint, DoorLock.Cluster.id, 'lockState', lockState, this.platform.log);
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const endpoint = await super.createEndpoint();
    endpoint.behaviors.require(MatterbridgeDoorLockServer.with());

    // Handle commands from Matter
    endpoint.addCommandHandler('lockDoor', async () => {
      this.platform.log.info(`[${this.entityId}] Comando Matter: Armar (Lock)`);
      try {
        await this.platform.ha.callService('alarm_control_panel', 'alarm_arm_away', this.entityId);
      } catch (e) {
        this.platform.log.error(`[${this.entityId}] Error al armar: ${e}`);
      }
    });

    endpoint.addCommandHandler('unlockDoor', async () => {
      this.platform.log.info(`[${this.entityId}] Comando Matter: Desarmar (Unlock)`);
      try {
        await this.platform.ha.callService('alarm_control_panel', 'alarm_disarm', this.entityId);
      } catch (e) {
        this.platform.log.error(`[${this.entityId}] Error al desarmar: ${e}`);
      }
    });

    return endpoint;
  }
}


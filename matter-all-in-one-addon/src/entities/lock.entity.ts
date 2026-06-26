import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { DoorLock } from 'matterbridge/matter/clusters';
import { BaseEntity } from './base.entity.js';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';
import { ClusterId } from 'matterbridge/matter/types';

export class LockEntity extends BaseEntity {
  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  protected override getRequiredClusterIds(): ClusterId[] {
    return [DoorLock.id];
  }

  protected override async addCustomClusterServers(): Promise<void> {
    const domain = this.entityId.split('.')[0];
    let isLocked = false;
    if (domain === 'alarm_control_panel') {
      isLocked = ['armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'arming'].includes(this.state.state);
    } else {
      isLocked = this.state.state === 'locked' || this.state.state === 'locking';
    }
    
    // Create DoorLock cluster server with standard features
    // We do not enable HomeKey/Aliro/RFID features based on user preference
    this.endpoint.createDefaultDoorLockClusterServer(
      isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked,
      DoorLock.LockType.DeadBolt
    );
  }

  protected override registerCommandHandlers(): void {
    const domain = this.entityId.split('.')[0];
    
    // Lock command handler
    this.endpoint.addCommandHandler('lockDoor', async () => {
      this.platform.log.debug(`Matter LockDoor commanded for ${this.entityId}`);
      if (domain === 'alarm_control_panel') {
        await this.platform.ha.callService('alarm_control_panel', 'alarm_arm_away', this.entityId);
      } else {
        await this.platform.ha.callService('lock', 'lock', this.entityId);
      }
    });

    // Unlock command handler
    this.endpoint.addCommandHandler('unlockDoor', async () => {
      this.platform.log.debug(`Matter UnlockDoor commanded for ${this.entityId}`);
      if (domain === 'alarm_control_panel') {
        await this.platform.ha.callService('alarm_control_panel', 'alarm_disarm', this.entityId);
      } else {
        await this.platform.ha.callService('lock', 'unlock', this.entityId);
      }
    });
  }

  public override async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    this.state = newState;
    
    let isLocked = false;
    const domain = this.entityId.split('.')[0];
    if (domain === 'alarm_control_panel') {
      isLocked = ['armed_home', 'armed_away', 'armed_night', 'armed_vacation', 'arming'].includes(newState.state);
    } else {
      isLocked = newState.state === 'locked' || newState.state === 'locking';
    }
    
    const matterState = isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked;

    if (isInitialSync) {
      await safeSetAttribute(this.endpoint, DoorLock.id, 'lockState', matterState, this.platform.log);
    } else {
      await safeUpdateAttribute(this.endpoint, DoorLock.id, 'lockState', matterState, this.platform.log);
    }
  }
}

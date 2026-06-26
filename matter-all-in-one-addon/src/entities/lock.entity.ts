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
      isLocked = this.state.state === 'locked' || this.state.state === 'locking' || this.state.state === 'armed_away' || this.state.state === 'armed_home';
    }
    
    // Create DoorLock cluster server with mandatory features for Apple HomeKit
    // Apple HomeKit requires ActuatorEnabled and OperatingMode to be set.
    this.endpoint.createDefaultDoorLockClusterServer(
      isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked,
      DoorLock.LockType.DeadBolt
    );

    // Explicitly set the mandatory attributes required by Matter 1.2+ for Apple Home
    await safeSetAttribute(this.endpoint, DoorLock.id, 'actuatorEnabled', true, this.platform.log);
    await safeSetAttribute(this.endpoint, DoorLock.id, 'operatingMode', DoorLock.OperatingMode.Normal, this.platform.log);
    await safeSetAttribute(this.endpoint, DoorLock.id, 'supportedOperatingModes', {
      normal: true,
      vacation: false,
      privacy: false,
      noRemoteLockUnlock: false,
      passage: false
    }, this.platform.log);
  }

  protected override registerCommandHandlers(): void {
    const [domain] = this.entityId.split('.');

    // Lock command handler
    this.endpoint.addCommandHandler('lockDoor', async () => {
      this.platform.log.debug(`Matter LockDoor commanded for ${this.entityId}`);
      if (domain === 'alarm_control_panel') {
        await this.platform.ha.callService(domain, 'alarm_arm_away', this.entityId);
      } else {
        await this.platform.ha.callService(domain, 'lock', this.entityId);
      }
    });

    // Unlock command handler
    this.endpoint.addCommandHandler('unlockDoor', async () => {
      this.platform.log.debug(`Matter UnlockDoor commanded for ${this.entityId}`);
      if (domain === 'alarm_control_panel') {
        await this.platform.ha.callService(domain, 'alarm_disarm', this.entityId);
      } else {
        await this.platform.ha.callService(domain, 'unlock', this.entityId);
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
      isLocked = newState.state === 'locked' || newState.state === 'locking' || newState.state === 'armed_away' || newState.state === 'armed_home';
    }
    const matterState = isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked;

    if (isInitialSync) {
      await safeSetAttribute(this.endpoint, DoorLock.id, 'lockState', matterState, this.platform.log);
    } else {
      await safeUpdateAttribute(this.endpoint, DoorLock.id, 'lockState', matterState, this.platform.log);
    }
  }
}

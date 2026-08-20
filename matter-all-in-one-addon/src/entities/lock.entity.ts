import { DeviceTypeDefinition } from "matterbridge";
import { DoorLock } from "matterbridge/matter/clusters";
import { BaseEntity } from "./base.entity.js";
import { HomeAssistantPlatform } from "../platform.js";
import { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import { ClusterId } from "matterbridge/matter/types";

export class LockEntity extends BaseEntity {
  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  protected override getRequiredClusterIds(): ClusterId[] {
    return [DoorLock.id];
  }

  protected override async addCustomClusterServers(): Promise<void> {
    const isLocked =
      this.state.state === "locked" || this.state.state === "locking";

    // Create DoorLock cluster server with mandatory features for Apple HomeKit
    // Apple HomeKit requires ActuatorEnabled and OperatingMode to be set.
    this.endpoint.createDefaultDoorLockClusterServer(
      isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked,
      DoorLock.LockType.DeadBolt,
    );

    // The helper provides the mandatory attributes. Their final values are
    // applied by updateState(initial=true), after Matterbridge has activated
    // the endpoint; writing here produces an "inactive state" error.
  }

  protected override registerCommandHandlers(): void {
    const [domain] = this.entityId.split(".");

    // Lock command handler
    this.endpoint.addCommandHandler("lockDoor", async () => {
      this.platform.log.debug(`Matter LockDoor commanded for ${this.entityId}`);
      await this.platform.ha.callService(domain, "lock", this.entityId);
    });

    // Unlock command handler
    this.endpoint.addCommandHandler("unlockDoor", async () => {
      this.platform.log.debug(
        `Matter UnlockDoor commanded for ${this.entityId}`,
      );
      await this.platform.ha.callService(domain, "unlock", this.entityId);
    });
  }

  public override async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.state = newState;

    const isLocked =
      newState.state === "locked" || newState.state === "locking";
    const matterState = isLocked
      ? DoorLock.LockState.Locked
      : DoorLock.LockState.Unlocked;

    if (isInitialSync) {
      await safeSetAttribute(
        this.endpoint,
        DoorLock.id,
        "actuatorEnabled",
        true,
        this.platform.log,
      );
      await safeSetAttribute(
        this.endpoint,
        DoorLock.id,
        "operatingMode",
        DoorLock.OperatingMode.Normal,
        this.platform.log,
      );
      await safeSetAttribute(
        this.endpoint,
        DoorLock.id,
        "supportedOperatingModes",
        {
          normal: true,
          vacation: false,
          privacy: false,
          noRemoteLockUnlock: false,
          passage: false,
        },
        this.platform.log,
      );
      await safeSetAttribute(
        this.endpoint,
        DoorLock.id,
        "lockState",
        matterState,
        this.platform.log,
      );
    } else {
      await safeUpdateAttribute(
        this.endpoint,
        DoorLock.id,
        "lockState",
        matterState,
        this.platform.log,
      );
    }
  }
}

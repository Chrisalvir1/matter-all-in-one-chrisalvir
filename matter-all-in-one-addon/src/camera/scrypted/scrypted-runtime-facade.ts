import { adaptScryptedDiscovery, type ScryptedDiscoveryDevice, type ScryptedDiscoveryResult } from "./scrypted-camera-discovery-adapter.js";
import { DEFAULT_SCRYPTED_CAMERA_POLICY, type ScryptedCameraPolicy } from "./scrypted-camera-policy.js";

export type ScryptedRuntimeSnapshot = {
  connected: boolean;
  cameras: ScryptedDiscoveryResult["cameras"];
  policy: ScryptedCameraPolicy;
};

export class ScryptedRuntimeFacade {
  private snapshot: ScryptedRuntimeSnapshot = {
    connected: false,
    cameras: [],
    policy: DEFAULT_SCRYPTED_CAMERA_POLICY,
  };

  setConnectionState(connected: boolean): void {
    this.snapshot = { ...this.snapshot, connected };
  }

  ingestDevices(devices: ScryptedDiscoveryDevice[]): ScryptedRuntimeSnapshot {
    const discovery = adaptScryptedDiscovery(devices);
    this.snapshot = {
      connected: this.snapshot.connected,
      cameras: this.snapshot.policy.discoveryEnabled ? discovery.cameras : [],
      policy: this.snapshot.policy,
    };
    return this.getSnapshot();
  }

  getSnapshot(): ScryptedRuntimeSnapshot {
    return {
      connected: this.snapshot.connected,
      cameras: [...this.snapshot.cameras],
      policy: { ...this.snapshot.policy },
    };
  }
}

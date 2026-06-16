import { BaseEntity } from './base.entity.js';
import { CameraAvStreamManagement, WebRTCTransportProvider } from '@matter/main/clusters';
import { Endpoint } from '@matter/main';

export class CameraEntity extends BaseEntity {
  public override async initialize(endpoint: Endpoint): Promise<void> {
    await super.initialize(endpoint);

    // Add required Matter 1.5 Camera clusters for HomeKit Secure Video compatibility
    if (!endpoint.hasClusterServer(CameraAvStreamManagement.Cluster)) {
      endpoint.addClusterServer(
        CameraAvStreamManagement.Cluster.with(CameraAvStreamManagement.Feature.Video).createServer({
          supportedVideoFormats: [],
          supportedAudioFormats: [],
        })
      );
    }

    if (!endpoint.hasClusterServer(WebRTCTransportProvider.Cluster)) {
      endpoint.addClusterServer(
        WebRTCTransportProvider.Cluster.createServer({
          supportedSdpTypes: [],
        })
      );
    }
  }

  public override updateState(state: any): void {
    // Implement state mapping logic from HA camera to Matter Camera clusters
    // Example: update streaming state if recording
    const isStreaming = state.state === 'recording';
    // Update CameraAvStreamManagement or WebRTCTransportProvider logic here
  }
}

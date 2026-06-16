/**
 * Camera entity representing camera.* entities in Matter 1.5.
 * Features CameraAvStreamManagement and WebRTCTransportProvider clusters
 * with hooks to support RTSP/ONVIF streaming.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { ClusterId } from 'matterbridge/matter/types';
import { BaseEntity } from './base.entity.js';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

export const CameraAvStreamManagementClusterId = ClusterId(0x00b0);
export const WebRTCTransportProviderClusterId = ClusterId(0x00b1);

export class CameraEntity extends BaseEntity {
  private streamUrl: string | null = null;

  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  protected override getRequiredClusterIds(): ClusterId[] {
    return [CameraAvStreamManagementClusterId, WebRTCTransportProviderClusterId];
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replace('.', '_'),
      mode: 'child',
    });

    const clusters = this.getRequiredClusterIds();
    this.endpoint.addClusterServers(clusters);
    this.endpoint.addRequiredClusterServers();

    this.registerCommandHandlers();
    this.syncInitialState();

    // Fetch RTSP/ONVIF stream URL from Home Assistant
    void this.fetchCameraStream();

    return this.endpoint;
  }

  /**
   * Fetch the live stream RTSP source from Home Assistant.
   */
  private async fetchCameraStream() {
    try {
      this.platform.log.debug(`Fetching stream source for camera ${this.entityId}`);
      // Request camera stream using HA WebSocket/REST API
      const result = await this.platform.ha.callService('camera', 'play_stream', this.entityId, {
        format: 'hls',
      });
      if (result && (result as any).response && (result as any).response.url) {
        this.streamUrl = (result as any).response.url;
        this.platform.log.info(`Fetched HLS stream url for ${this.entityId}: ${this.streamUrl}`);
      }
    } catch (err) {
      this.platform.log.warn(`Could not fetch native stream URL for ${this.entityId}: ${err}`);
      // Fallback/construct a standard RTSP link if possible
      this.streamUrl = `rtsp://${this.platform.config.host}:8554/${this.entityId.replace('camera.', '')}`;
    }

    // Set attributes for Stream Management
    safeSetAttribute(
      this.endpoint,
      CameraAvStreamManagementClusterId,
      'videoCodec',
      'H264'
    );
    safeSetAttribute(
      this.endpoint,
      CameraAvStreamManagementClusterId,
      'audioCodec',
      'AAC'
    );
    safeSetAttribute(
      this.endpoint,
      CameraAvStreamManagementClusterId,
      'streamUrl',
      this.streamUrl
    );
  }

  protected override registerCommandHandlers() {
    // Listen for streaming request commands from Apple HomeKit / Matter controller
    this.endpoint.addCommandHandler('startStream', async (data: any) => {
      this.platform.log.info(`Matter controller requested live stream start for ${this.entityId}`);
      // Return WebRTC/RTSP details to the controller
      return {
        status: 0,
        streamUrl: this.streamUrl,
      };
    });

    this.endpoint.addCommandHandler('stopStream', async (data: any) => {
      this.platform.log.info(`Matter controller requested live stream stop for ${this.entityId}`);
      return { status: 0 };
    });
  }

  public override updateState(newState: HassState) {
    this.state = newState;
    // Map motion detection if the camera contains a motion sensor
    const isMotionDetected = newState.state === 'recording' || newState.attributes.motion_detected === true;
    safeSetAttribute(this.endpoint, WebRTCTransportProviderClusterId, 'motionDetected', isMotionDetected);
  }
}

/**
 * CameraEntity — Home Assistant Camera entity with Dual-Track Export:
 *
 * TRACK A (HomeKit / HAP): Dedicated standalone HomeKit Camera accessory with RTP/SRTP live view,
 *                          snapshots, motion sensors, and audio passthrough for Apple Home.
 * TRACK B (Matter 1.5/1.6): Experimental Matter Camera accessory with Camera AV Stream Management (0x0551)
 *                          and WebRTC Transport Provider (0x0553) cluster servers.
 */
import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { MatterbridgeEndpoint } from "matterbridge";
import type { HassState } from "../utils/ha-state.js";
import { detectCameraCapabilities } from "../camera/camera-capabilities.js";
import { CameraSourceResolver } from "../camera/camera-source-resolver.js";
import { CameraSessionManager } from "../camera/matter/camera-session-manager.js";
import { CameraWebRtcAdapter } from "../camera/matter/camera-webrtc-adapter.js";
import { CameraEndpointBuilder } from "../camera/matter/camera-endpoint.builder.js";
import { HomeKitCameraAccessory } from "../camera/homekit/homekit-camera.accessory.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera/camera-types.js";

export const CameraAvStreamManagementId = 0x0551 as any as ClusterId;
export const WebRtcTransportProviderId = 0x0553 as any as ClusterId;

export class CameraEntity extends BaseEntity {
  public static readonly matterTypeLabel = "Camera";

  public capabilities?: CameraCapabilitiesInfo;
  public streamSource?: ResolvedStreamSource;
  public readonly sessionManager = new CameraSessionManager();
  public webrtcAdapter?: CameraWebRtcAdapter;
  public homekitAccessory?: HomeKitCameraAccessory;

  /**
   * Initializes or updates detected capabilities and resolved stream source.
   */
  public async refreshCapabilities(): Promise<{
    capabilities: CameraCapabilitiesInfo;
    streamSource: ResolvedStreamSource;
  }> {
    this.streamSource = await CameraSourceResolver.resolve(
      this.platform,
      this.entityId,
      this.state,
    );
    this.capabilities = detectCameraCapabilities(this.state, this.streamSource);
    this.webrtcAdapter = new CameraWebRtcAdapter(
      this.platform,
      this.entityId,
      this.capabilities,
      this.streamSource,
      this.sessionManager,
    );

    return { capabilities: this.capabilities, streamSource: this.streamSource };
  }

  /**
   * Builds the Matter Camera endpoint using real Camera clusters (0x0551 & 0x0553).
   */
  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    try {
      const { capabilities, streamSource } = await this.refreshCapabilities();

      this.endpoint = await CameraEndpointBuilder.build(
        this.platform,
        this.entityId,
        this.deviceType,
        capabilities,
        streamSource,
        this.sessionManager,
        this.webrtcAdapter!,
        this.state.attributes.friendly_name,
      );

      await this.addCustomClusterServers();
      this.registerCommandHandlers();

      return this.endpoint;
    } catch (err) {
      this.platform?.log?.warn?.(
        `[MatterCamera][${this.entityId}] Track B Matter clusters isolated due to: ${err}. HomeKit Track A remains fully active.`,
      );
      const fallbackEndpoint = new MatterbridgeEndpoint([this.deviceType], {
        id: this.entityId.replaceAll(".", "_"),
        mode: "server",
      });
      fallbackEndpoint.createDefaultBasicInformationClusterServer(
        this.state.attributes.friendly_name || this.entityId,
        this.entityId.replaceAll(".", "_"),
        0xfff1,
        "Home Assistant",
        0x8000,
        "Camera",
      );
      this.endpoint = fallbackEndpoint;
      return this.endpoint;
    }
  }

  /**
   * Sets up or updates the HomeKit standalone accessory for Apple Home live streaming.
   */
  public async setupHomeKitAccessory(
    record: HomeKitCameraStorageRecord,
  ): Promise<HomeKitCameraAccessory> {
    // Entity discovery is periodic. Rebuilding a paired HAP accessory on each
    // pass drops active Live View/HKSV sessions and makes Apple Home reconnect
    // in a loop. An explicit pairing reset remains the only rebuild path.
    if (this.homekitAccessory) return this.homekitAccessory;

    const { capabilities, streamSource } = await this.refreshCapabilities();

    this.homekitAccessory = new HomeKitCameraAccessory(
      this.platform,
      this.entityId,
      record,
      capabilities,
      streamSource,
    );

    return this.homekitAccessory;
  }

  /**
   * Updates HomeKit accessory state, including linked motion sensor detection.
   */
  public updateHomeKitState(state: HassState): void {
    this.state = state;
    if (this.homekitAccessory) {
      const motionDetected = Boolean(
        state.attributes?.motion ||
        state.attributes?.motion_detected ||
        state.attributes?.occupancy,
      );
      this.homekitAccessory.updateMotionState(motionDetected);
    }
  }

  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    const targetEndpoint = endpoint ?? this.endpoint;
    if (!targetEndpoint) return;

    targetEndpoint.addCommandHandler("on", async () => {
      this.setCommandLockout("camera_state", "on");
      this.platform.log.debug(`[${this.entityId}] Matter → HA camera.turn_on`);
      await this.platform.ha.callService("camera", "turn_on", this.entityId);
    });

    targetEndpoint.addCommandHandler("off", async () => {
      this.setCommandLockout("camera_state", "off");
      this.platform.log.debug(`[${this.entityId}] Matter → HA camera.turn_off`);
      await this.platform.ha.callService("camera", "turn_off", this.entityId);
    });
  }

  public override async updateState(
    state: HassState,
    _isInitialSync = false,
  ): Promise<void> {
    this.state = state;
    this.updateHomeKitState(state);

    if (!this.endpoint) return;

    this.capabilities = detectCameraCapabilities(state, this.streamSource);
    this.platform.log.debug(
      `[${this.entityId}] Camera state update: state=${state.state}, liveStream=${this.capabilities.hasLiveStream}, strategy=${this.capabilities.strategy}`,
    );
  }
}

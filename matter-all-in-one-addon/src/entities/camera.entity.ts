/**
 * CameraEntity — exposes a Home Assistant camera as a Matter On/Off accessory.
 *
 * Design note (Matterbridge 3.10.x compatibility):
 *   The native Matter 1.6 Camera device type (0x0510) requires clusters
 *   CameraAvStreamManagement (0x0551) and WebRtcTransportProvider (0x0553).
 *   Matterbridge's addClusterServers() does NOT auto-provision these clusters,
 *   so registering 0x0510 crashes with:
 *     TypeError: Cannot read properties of undefined (reading 'forEach')
 *   in addRequiredClusterServers() → deviceType.requiredServerClusters.forEach().
 *
 *   Until Matterbridge ships full camera cluster support, cameras are published
 *   as an On/Off Plug-in Unit (0x010A) representing camera power / privacy state:
 *     on  → camera active / streaming
 *     off → camera off / privacy mode
 *
 *   DEVICE_REGISTRY maps the `camera` domain to MatterDeviceTypes.cameraOnOff
 *   (alias for onOffPlugInUnit) so BaseEntity.createEndpoint() is NOT used.
 *   Instead, CameraEntity has its own createEndpoint() that correctly sets up
 *   the endpoint with the standard OnOff behavior and no camera-specific clusters.
 */
import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { OnOff } from "matterbridge/matter/clusters";
import { MatterbridgeOnOffServer } from "matterbridge/behaviors";
import { MatterbridgeEndpoint } from "matterbridge";
import { HassState } from "../utils/ha-state.js";
import { cameraConverter } from "../converters/camera.converter.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import {
  MATTER_BRIDGE_VENDOR_ID,
  getMatterSerialNumber,
  getHaDeviceManufacturer,
  getHaDeviceModel,
} from "../utils/matter-device-identity.js";

/** Reserved for future use when Matterbridge supports camera cluster auto-provisioning. */
export const CameraAvStreamManagementId = 0x0551 as any as ClusterId;
export const WebRtcTransportProviderId = 0x0553 as any as ClusterId;

export class CameraEntity extends BaseEntity {
  public static readonly matterTypeLabel = "Camera";

  /**
   * Custom endpoint creation for cameras.
   *
   * The device type is onOffPlugInUnit (via MatterDeviceTypes.cameraOnOff alias).
   * Its requiredServerClusters = [Identify(0x3), Groups(0x4), ScenesManagement(0x62), OnOff(0x6)].
   * addClusterServers() handles all of these — no crash.
   *
   * We do NOT call BaseEntity.createEndpoint() because the base class does not
   * add MatterbridgeOnOffServer for the `camera` domain (only for light/switch/fan/etc.).
   */
  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;
    const uniqueName = rawName.substring(0, 32).trim();

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll(".", "_"),
      mode: "server",
    });

    const manufacturer = getHaDeviceManufacturer(this.platform, this.entityId);
    const model = getHaDeviceModel(this.platform, this.entityId, "Camera");

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = uniqueName;
    this.endpoint.uniqueId = this.entityId.replaceAll(".", "_");
    this.endpoint.serialNumber = getMatterSerialNumber(this.platform, this.entityId);
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    this.endpoint.vendorName = manufacturer;
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = model;

    this.endpoint.createDefaultBasicInformationClusterServer(
      uniqueName,
      this.endpoint.serialNumber,
      MATTER_BRIDGE_VENDOR_ID,
      manufacturer,
      0x8000,
      model,
    );
    this.applyMatterbridgeFirmware();

    // Add OnOff behavior: camera on = streaming/active, off = stopped/privacy.
    // This must be required before addRequiredClusterServers() so the behavior
    // is registered before the cluster server is provisioned.
    this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());

    // addRequiredClusterServers() iterates deviceType.requiredServerClusters.
    // deviceType = onOffPlugInUnit (cameraOnOff) → requiredServerClusters exists,
    // no undefined.forEach() crash.
    this.endpoint.addRequiredClusterServers();

    await this.addCustomClusterServers();
    this.registerCommandHandlers();

    return this.endpoint;
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
    isInitialSync = false,
  ): Promise<void> {
    this.state = state;
    if (!this.endpoint) return;

    const isOn = cameraConverter.isCameraOn(state);
    const update = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    this.platform.log.debug(
      `[${this.entityId}] Camera update: ha_state=${state.state}, matter_on=${isOn}, streaming=${cameraConverter.toStreamingState(state)}`,
    );

    await update(this.endpoint, OnOff.id, "onOff", isOn, this.platform.log);
  }
}

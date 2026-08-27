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

export const CameraAvStreamManagementId = 0x0551 as any as ClusterId;
export const WebRtcTransportProviderId = 0x0553 as any as ClusterId;

export class CameraEntity extends BaseEntity {
  public static readonly matterTypeLabel = "Camera";

  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(CameraAvStreamManagementId);
    clusters.push(WebRtcTransportProviderId);
    return clusters;
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;
    const uniqueName = rawName.substring(0, 32).trim();

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll(".", "_"),
      mode: "server",
    });

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = uniqueName;
    this.endpoint.uniqueId = this.entityId.replaceAll(".", "_");
    this.endpoint.serialNumber = this.getMatterSerialNumber();
    this.endpoint.vendorId = this.endpoint.vendorId || 0xfff1;
    this.endpoint.vendorName =
      this.state.attributes?.manufacturer || "Home Assistant";
    this.endpoint.productId = 0x8000;
    this.endpoint.productName =
      this.state.attributes?.model || this.deviceType.name;

    this.endpoint.createDefaultBasicInformationClusterServer(
      uniqueName,
      this.endpoint.serialNumber,
      this.endpoint.vendorId,
      this.endpoint.vendorName,
      0x8000,
      this.endpoint.productName,
    );
    this.applyMatterbridgeFirmware();

    // Require OnOff behavior for camera streaming / power state control
    this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());

    const clusters = this.getRequiredClusterIds();
    if (clusters.length > 0) {
      this.endpoint.addClusterServers(clusters);
    }
    this.endpoint.addRequiredClusterServers();

    await this.addCustomClusterServers();
    this.registerCommandHandlers();

    return this.endpoint;
  }

  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    targetEndpoint.addCommandHandler("on", async () => {
      this.setCommandLockout("camera_state", "on");
      this.platform.log.debug(`[${this.entityId}] → HA camera turn_on`);
      await this.platform.ha.callService("camera", "turn_on", this.entityId);
    });

    targetEndpoint.addCommandHandler("off", async () => {
      this.setCommandLockout("camera_state", "off");
      this.platform.log.debug(`[${this.entityId}] → HA camera turn_off`);
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
      `[${this.entityId}] Camera update: state=${state.state}, on=${isOn}, streaming=${cameraConverter.toStreamingState(state)}`,
    );

    await update(this.endpoint, OnOff.id, "onOff", isOn, this.platform.log);
  }
}


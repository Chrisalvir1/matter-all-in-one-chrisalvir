/**
 * @description Scrypted Camera Entity for Matter.
 * Represents a Scrypted camera as an independent Matter accessory
 * exposing Motion / Occupancy sensor, Doorbell trigger, and Floodlight / Siren.
 *
 * @file src/scrypted/scrypted.entity.ts
 * @author chrisalvir
 * @license Apache-2.0
 */

import { MatterbridgeEndpoint } from "matterbridge";
import {
  OccupancySensing,
  BooleanState,
  OnOff,
} from "matterbridge/matter/clusters";
import { MatterbridgeOnOffServer } from "matterbridge/behaviors";
import { occupancySensor, onOffPlugInUnit } from "matterbridge";
import { HomeAssistantPlatform } from "../platform.js";
import {
  ScryptedCameraEntry,
  ScryptedClientManager,
} from "./scrypted-client.js";
import { safeSetAttribute } from "../utils/matter-attributes.js";

export class ScryptedCameraEntity {
  public endpoint?: MatterbridgeEndpoint;
  public camera: ScryptedCameraEntry;
  private platform: HomeAssistantPlatform;
  private scryptedClient: ScryptedClientManager;

  constructor(
    platform: HomeAssistantPlatform,
    camera: ScryptedCameraEntry,
    scryptedClient: ScryptedClientManager,
  ) {
    this.platform = platform;
    this.camera = camera;
    this.scryptedClient = scryptedClient;
  }

  public get entityId(): string {
    return `scrypted.${this.camera.id}`;
  }

  public get name(): string {
    return this.camera.name || `Cámara ${this.camera.id}`;
  }

  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const nodeName = `Scrypted - ${this.name}`;
    const sanitizedSerial = `SC-${this.camera.id.replace(/[^a-zA-Z0-9]/g, "").substring(0, 16)}`;

    // Create root endpoint as OccupancySensor
    this.endpoint = new MatterbridgeEndpoint(
      [occupancySensor],
      { id: this.entityId.replaceAll(".", "_"), mode: "server" },
      this.platform.config.debug as boolean,
    );

    this.endpoint.createDefaultIdentifyClusterServer();
    this.endpoint.createDefaultBasicInformationClusterServer(
      nodeName,
      sanitizedSerial,
      0xfff1,
      "Scrypted NVR",
      0x8001,
      "Scrypted Camera",
      1,
      "1.4.24",
      1,
      "1.4.24",
    );

    // Add OccupancySensing cluster for Motion
    this.endpoint.createDefaultOccupancySensingClusterServer(
      this.camera.motionState,
    );

    // If camera has doorbell or light, require OnOff cluster behavior
    if (this.camera.hasLight) {
      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());
    }

    this.endpoint.addRequiredClusterServers();

    this.platform.log.notice(
      `[Scrypted] Created Matter endpoint for Camera: ${this.name} (${this.entityId})`,
    );
    return this.endpoint;
  }

  public async updateState(camera: ScryptedCameraEntry): Promise<void> {
    this.camera = camera;
    if (!this.endpoint) return;

    if (this.endpoint.hasAttributeServer(OccupancySensing.id, "occupancy")) {
      await safeSetAttribute(
        this.endpoint,
        OccupancySensing.id,
        "occupancy",
        { occupied: this.camera.motionState },
        this.platform.log,
      );
    }

    if (
      this.camera.hasLight &&
      this.endpoint.hasAttributeServer(OnOff.id, "onOff")
    ) {
      await safeSetAttribute(
        this.endpoint,
        OnOff.id,
        "onOff",
        this.camera.lightState,
        this.platform.log,
      );
    }
  }
}

/**
 * cooktop.entity.ts
 *
 * Matterbridge entity for Home Assistant cooker/stove top (hobs) devices.
 * Exposes them as a Matter 1.3 Cooktop (device type 0x0078) with an active cooking surface.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import { Cooktop } from "matterbridge/devices";
import { BaseEntity } from "./base.entity.js";
import type { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import {
  getHaDeviceModel,
  MATTER_BRIDGE_VENDOR_ID,
  MATTER_BRIDGE_VENDOR_NAME,
} from "../utils/matter-device-identity.js";

export class CooktopEntity extends BaseEntity {
  declare public endpoint: Cooktop;
  public surface!: any; // reference to the child surface endpoint

  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;

    const uniqueName = rawName.substring(0, 32).trim();

    const v6Id = this.entityId.replaceAll(".", "_") + "_v6";
    const serialNumber = this.getMatterSerialNumber();

    this.endpoint = new Cooktop(uniqueName, serialNumber);

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.uniqueId = v6Id;
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    this.endpoint.vendorName = MATTER_BRIDGE_VENDOR_NAME;
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = getHaDeviceModel(
      this.platform,
      this.entityId,
      "Cooktop",
    );
    this.applyMatterbridgeFirmware();

    // Add a single cooking surface representing the hotplate/burner
    this.surface = this.endpoint.addSurface(
      "Hélices", // Burner name
      [], // tagList
    );

    this.registerCommandHandlers();

    return this.endpoint as unknown as MatterbridgeEndpoint;
  }

  public override adoptEndpoint(endpoint: MatterbridgeEndpoint): void {
    const child =
      endpoint.getChildEndpointById("Hélices") ??
      endpoint.getChildEndpointByOriginalId("Hélices");
    if (!child)
      throw new Error(
        "Retained appliance node is missing its child endpoint; preserving its pairing",
      );
    this.surface = child;
    super.adoptEndpoint(endpoint);
  }

  override async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    if (!this.endpoint || !this.surface) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(
    endpoint: Cooktop,
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      const isCooking =
        state.state === "on" ||
        state.state === "cooking" ||
        state.state === "running";

      // Sync the hotplate surface status (OnOff state)
      await syncFunc(
        this.surface,
        "onOff" as any,
        "onOff",
        isCooking,
        this.platform.log,
      );
    } catch (err) {
      this.platform.log?.warn?.(
        `[CooktopEntity] syncState error for ${this.state.entity_id}: ${err}`,
      );
    }
  }

  protected override registerCommandHandlers(
    _endpoint?: MatterbridgeEndpoint,
  ): void {
    // Keep OffOnly: never enable remote ignition through this bridge.
    this.surface?.addCommandHandler("off", async () => {
      this.assertOnline();
      const domain = this.entityId.split(".")[0];
      if (!["switch", "climate"].includes(domain))
        throw new Error("This cooktop has no HA power control");
      await this.platform.ha.callService(domain, "turn_off", this.entityId);
    });
  }

  static matterTypeLabel = "Cooktop" as const;
}

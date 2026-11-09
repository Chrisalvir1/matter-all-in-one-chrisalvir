/**
 * oven.entity.ts
 *
 * Matterbridge entity for Home Assistant oven/range devices.
 * Exposes them as a Matter 1.3 Oven (device type 0x007B) with a temperature controlled cabinet cavity.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import { Oven } from "matterbridge/devices";
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
import {
  TemperatureControl,
  TemperatureMeasurement,
  OvenCavityOperationalState,
} from "matterbridge/matter/clusters";

export class OvenEntity extends BaseEntity {
  declare public endpoint: Oven;
  public cabinet!: any; // reference to the child cavity endpoint

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

    this.endpoint = new Oven(uniqueName, serialNumber);

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.uniqueId = v6Id;
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    this.endpoint.vendorName = MATTER_BRIDGE_VENDOR_NAME;
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = getHaDeviceModel(
      this.platform,
      this.entityId,
      "Oven",
    );
    this.applyMatterbridgeFirmware();

    // Add a single cavity cabinet to control the oven
    this.cabinet = this.endpoint.addCabinet(
      "Horno", // Cabinet name
      [], // tagList
      1, // defaultMode (Bake = 1)
      [
        { label: "Bake", mode: 1, modeTags: [{ value: 0x0001 }] }, // Bake mode tag
        { label: "Convection", mode: 2, modeTags: [{ value: 0x0002 }] },
      ],
      180 * 100, // targetTemperature: default 180C (18000 hundredths)
      30 * 100, // minTemperature
      250 * 100, // maxTemperature
      5 * 100, // step
      20 * 100, // currentTemperature (default 20C)
      0, // operationalState: Stopped (0)
    );

    this.registerCommandHandlers();

    return this.endpoint as unknown as MatterbridgeEndpoint;
  }

  public override adoptEndpoint(endpoint: MatterbridgeEndpoint): void {
    const child =
      endpoint.getChildEndpointById("Horno") ??
      endpoint.getChildEndpointByOriginalId("Horno");
    if (!child)
      throw new Error(
        "Retained appliance node is missing its child endpoint; preserving its pairing",
      );
    this.cabinet = child;
    super.adoptEndpoint(endpoint);
  }

  override async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    if (!this.endpoint || !this.cabinet) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(
    endpoint: Oven,
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      // Determine operational state (0 = Stopped, 1 = Running)
      const isRunning =
        state.state === "on" ||
        state.state === "cooking" ||
        state.state === "running" ||
        state.state === "heat";

      await syncFunc(
        this.cabinet,
        OvenCavityOperationalState.id,
        "operationalState",
        isRunning ? 1 : 0,
        this.platform.log,
      );

      // Extract temperature attributes from Samsung / HA Oven states
      // Typically: target_temp/temperature and current_temperature/current_temp
      const targetTemp =
        state.attributes.temperature ??
        state.attributes.target_temp ??
        state.attributes.target_temperature;
      const currentTemp =
        state.attributes.current_temperature ?? state.attributes.current_temp;

      if (typeof targetTemp === "number" && targetTemp > 0) {
        await syncFunc(
          this.cabinet,
          TemperatureControl.id,
          "targetTemperature",
          Math.round(targetTemp * 100),
          this.platform.log,
        );
      }

      if (typeof currentTemp === "number" && currentTemp > 0) {
        await syncFunc(
          this.cabinet,
          TemperatureMeasurement.id,
          "measuredValue",
          Math.round(currentTemp * 100),
          this.platform.log,
        );
      }
    } catch (err) {
      this.platform.log?.warn?.(
        `[OvenEntity] syncState error for ${this.state.entity_id}: ${err}`,
      );
    }
  }

  protected override registerCommandHandlers(
    _endpoint?: MatterbridgeEndpoint,
  ): void {
    if (!this.cabinet) return;

    this.cabinet.addCommandHandler(
      "OvenMode.changeToMode",
      async (data: any) => {
        this.assertOnline();
        const mode = (data?.request ?? data)?.newMode;
        const names: Record<number, string[]> = {
          1: ["bake"],
          2: ["convection"],
        };
        const select = this.relatedEntity("select", (s: any) =>
          s.attributes?.options?.some((v: string) =>
            names[mode]?.includes(v.toLowerCase()),
          ),
        );
        if (!select)
          throw new Error("Oven mode is not supported by the HA device");
        const option = select.attributes.options.find((v: string) =>
          names[mode]?.includes(v.toLowerCase()),
        );
        await this.platform.ha.callService(
          "select",
          "select_option",
          select.entity_id,
          { option },
        );
        return { status: 0 };
      },
    );

    this.cabinet.addCommandHandler(
      "TemperatureControl.setTargetTemperature",
      async (data: any) => {
        this.assertOnline();
        const { targetTemperature } = data?.request ?? data;
        if (!Number.isFinite(targetTemperature))
          throw new Error("Invalid oven target temperature");
        const targetC = Math.round(targetTemperature / 100);
        this.platform.log?.info?.(
          `[OvenEntity] setTargetTemperature commanded: ${targetC}C`,
        );

        const [domain] = this.entityId.split(".");
        try {
          if (domain === "climate") {
            await this.platform.ha?.callService(
              "climate",
              "set_temperature",
              this.entityId,
              {
                temperature: targetC,
              },
            );
          } else {
            // Check for a target temperature number helper matching the oven ID
            const related = this.relatedEntity(
              "number",
              (s: any) => s.attributes?.device_class === "temperature",
            );
            if (!related)
              throw new Error(
                "No target temperature control is associated with this oven",
              );
            const numEntityId = related.entity_id;
            const attrs = related.attributes;
            if (
              targetC < Number(attrs.min ?? -Infinity) ||
              targetC > Number(attrs.max ?? Infinity)
            )
              throw new Error("Oven temperature outside device limits");
            if (related) {
              await this.platform.ha?.callService(
                "number",
                "set_value",
                numEntityId,
                {
                  value: targetC,
                },
              );
            }
          }
        } catch (err) {
          this.platform.log?.error?.(
            `[OvenEntity] Failed to set target temperature to HA: ${err}`,
          );
          throw err;
        }
      },
    );
  }

  private relatedEntity(domain: string, predicate: (s: any) => boolean): any {
    const id = this.platform.ha?.hassEntities?.get(this.entityId)?.device_id;
    if (!id) return;
    for (const [entityId, entry] of this.platform.ha?.hassEntities ?? []) {
      const st = this.platform.ha?.hassStates?.get(entityId);
      if (
        entry.device_id === id &&
        entityId.startsWith(domain + ".") &&
        st &&
        predicate(st)
      )
        return st;
    }
  }
  static matterTypeLabel = "Oven" as const;
}

/**
 * climate.entity.ts
 *
 * Matterbridge entity for Home Assistant `climate.*` (Thermostat / Air Conditioner) devices.
 * Configures the standard Matter Thermostat (0x0201) and ThermostatUserInterfaceConfiguration (0x0204)
 * clusters with bidirectional synchronization of temperatures, setpoints, and HVAC system modes.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import { Thermostat } from "matterbridge/matter/clusters";
import { ClusterId } from "matterbridge/matter/types";
import { BaseEntity } from "./base.entity.js";
import type { HassState } from "../utils/ha-state.js";
import { safeUpdateAttribute } from "../utils/matter-attributes.js";
import { climateConverter } from "../converters/climate.converter.js";

export class ClimateEntity extends BaseEntity {
  static readonly matterTypeLabel = "Thermostat";

  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  private syncingFromHa = 0;

  protected override get isUpdatingFromHa(): boolean {
    return this.syncingFromHa > 0 || super.isUpdatingFromHa;
  }

  protected override getRequiredClusterIds(): ClusterId[] {
    return [Thermostat.id];
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    await super.createEndpoint();

    const currentTemp = Number(
      this.state.attributes?.current_temperature ?? 21,
    );
    const targetTemp = Number(
      this.state.attributes?.temperature ??
        this.state.attributes?.target_temp_low ??
        22,
    );
    const minTemp = Number(this.state.attributes?.min_temp ?? 10);
    const maxTemp = Number(this.state.attributes?.max_temp ?? 35);

    this.endpoint.createDefaultThermostatClusterServer(
      currentTemp,
      Number(this.state.attributes?.target_temp_low ?? targetTemp),
      Number(this.state.attributes?.target_temp_high ?? targetTemp),
      0, // minSetpointDeadBand
      minTemp,
      maxTemp,
      minTemp,
      maxTemp,
    );
    this.endpoint.createDefaultThermostatUserInterfaceConfigurationClusterServer();

    this.registerCommandHandlers(this.endpoint);
    return this.endpoint;
  }

  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    const [domain] = this.entityId.split(".");

    if (
      targetEndpoint.hasAttributeServer(
        Thermostat.id,
        "occupiedCoolingSetpoint",
      )
    ) {
      targetEndpoint.subscribeAttribute(
        Thermostat.id,
        "occupiedCoolingSetpoint",
        (newValue: number) => {
          this.platform.log.debug(
            `[${this.entityId}] Matter occupiedCoolingSetpoint changed to ${newValue}`,
          );
          if (this.isUpdatingFromHa) return;
          const celsius = climateConverter.toCelsius(newValue);
          this.setCommandLockout("temperature", celsius);
          void Promise.resolve()
            .then(() =>
              this.callServiceTracked(
                domain,
                "set_temperature",
                climateConverter.targetTemperature(this.state, "cool", celsius),
              ),
            )
            .catch(() => undefined);
        },
      );
    }

    if (
      targetEndpoint.hasAttributeServer(
        Thermostat.id,
        "occupiedHeatingSetpoint",
      )
    ) {
      targetEndpoint.subscribeAttribute(
        Thermostat.id,
        "occupiedHeatingSetpoint",
        (newValue: number) => {
          this.platform.log.debug(
            `[${this.entityId}] Matter occupiedHeatingSetpoint changed to ${newValue}`,
          );
          if (this.isUpdatingFromHa) return;
          const celsius = climateConverter.toCelsius(newValue);
          this.setCommandLockout("temperature", celsius);
          void Promise.resolve()
            .then(() =>
              this.callServiceTracked(
                domain,
                "set_temperature",
                climateConverter.targetTemperature(this.state, "heat", celsius),
              ),
            )
            .catch(() => undefined);
        },
      );
    }

    if (targetEndpoint.hasAttributeServer(Thermostat.id, "systemMode")) {
      targetEndpoint.subscribeAttribute(
        Thermostat.id,
        "systemMode",
        (newValue: number) => {
          this.platform.log.debug(
            `[${this.entityId}] Matter systemMode changed to ${newValue}`,
          );
          if (this.isUpdatingFromHa) return;
          const haMode = climateConverter.toHaHvacMode(newValue);
          this.setCommandLockout("hvac_mode", haMode);
          void Promise.resolve()
            .then(() =>
              this.callServiceTracked(domain, "set_hvac_mode", {
                hvac_mode: climateConverter.supportedMode(
                  haMode,
                  this.state.attributes?.hvac_modes,
                  this.state.state,
                ),
              }),
            )
            .catch(() => undefined);
        },
      );
    }

    targetEndpoint.addCommandHandler(
      "setpointRaiseLower",
      async ({ request }: any) => {
        this.assertOnline();
        const amount = (Number(request?.amount) || 0) / 10;
        const attrs = this.state.attributes;
        const kind =
          request?.mode === 1 ||
          (request?.mode == null && this.state.state === "cool")
            ? "cool"
            : "heat";
        const low = attrs?.target_temp_low;
        const high = attrs?.target_temp_high;
        const shifted = (value: number) => Math.round((value + amount) * 2) / 2;
        if (
          typeof low === "number" &&
          typeof high === "number" &&
          (this.state.state === "heat_cool" || attrs?.temperature == null)
        ) {
          const target =
            request?.mode === 2 || request?.mode == null
              ? {
                  target_temp_low: shifted(low),
                  target_temp_high: shifted(high),
                }
              : climateConverter.targetTemperature(
                  this.state,
                  kind,
                  shifted(kind === "cool" ? high : low),
                );
          await this.callServiceTracked(domain, "set_temperature", target);
          return;
        }
        const nextTemp = shifted(Number(attrs?.temperature ?? 22));
        this.setCommandLockout("temperature", nextTemp);
        await this.callServiceTracked(domain, "set_temperature", {
          temperature: nextTemp,
        });
      },
    );
  }

  public override async syncInitialState(): Promise<void> {
    await this.updateState(this.state, true);
  }

  public override async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    if (!this.endpoint) return;
    this.syncingFromHa++;
    try {
      this.state = newState;
      await this.syncState(this.endpoint, newState, isInitialSync);
    } finally {
      this.syncingFromHa--;
    }
  }

  private async syncState(
    endpoint: MatterbridgeEndpoint,
    state: HassState,
    _isInitialSync = false,
  ): Promise<void> {
    const currentTemp = state.attributes?.current_temperature;
    if (currentTemp !== undefined && currentTemp !== null) {
      const matterTemp = climateConverter.toMatterTemperature(
        Number(currentTemp),
      );
      if (matterTemp !== null) {
        await safeUpdateAttribute(
          endpoint,
          Thermostat.id,
          "localTemperature",
          matterTemp,
          this.platform.log,
        );
      }
    }

    const targetTemp =
      state.state === "heat_cool" ? undefined : state.attributes?.temperature;
    if (targetTemp !== undefined && targetTemp !== null) {
      const matterTarget = climateConverter.toMatterTemperature(
        Number(targetTemp),
      );
      if (matterTarget !== null) {
        await safeUpdateAttribute(
          endpoint,
          Thermostat.id,
          "occupiedCoolingSetpoint",
          matterTarget,
          this.platform.log,
        );
        await safeUpdateAttribute(
          endpoint,
          Thermostat.id,
          "occupiedHeatingSetpoint",
          matterTarget,
          this.platform.log,
        );
      }
    } else {
      if (state.attributes?.target_temp_low !== undefined) {
        const low = climateConverter.toMatterTemperature(
          Number(state.attributes.target_temp_low),
        );
        if (low !== null) {
          await safeUpdateAttribute(
            endpoint,
            Thermostat.id,
            "occupiedHeatingSetpoint",
            low,
            this.platform.log,
          );
        }
      }
      if (state.attributes?.target_temp_high !== undefined) {
        const high = climateConverter.toMatterTemperature(
          Number(state.attributes.target_temp_high),
        );
        if (high !== null) {
          await safeUpdateAttribute(
            endpoint,
            Thermostat.id,
            "occupiedCoolingSetpoint",
            high,
            this.platform.log,
          );
        }
      }
    }

    const mode = state.state;
    const systemMode = climateConverter.toMatterSystemMode(mode);
    await safeUpdateAttribute(
      endpoint,
      Thermostat.id,
      "systemMode",
      systemMode,
      this.platform.log,
    );

    // Synchronize running state if hvac_action is provided
    const action = state.attributes?.hvac_action;
    if (action) {
      const isHeating = action === "heating";
      const isCooling = action === "cooling";
      const isFan = action === "fan";
      await safeUpdateAttribute(
        endpoint,
        Thermostat.id,
        "thermostatRunningState",
        {
          heat: isHeating,
          cool: isCooling,
          fan: isFan,
          heatStage2: false,
          coolStage2: false,
          fanStage2: false,
          fanStage3: false,
        },
        this.platform.log,
      );
    }
  }
}

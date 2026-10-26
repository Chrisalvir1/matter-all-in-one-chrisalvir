import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import { energyTariffConverter } from "../converters/energy_tariff.converter.js";

const PowerTopologyId = 0x009c as any as ClusterId;
const ElectricalPowerMeasurementId = 0x0090 as any as ClusterId;
const ElectricalEnergyMeasurementId = 0x0091 as any as ClusterId;

export class EnergyTariffEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    const deviceClass = this.state.attributes?.device_class;
    clusters.push(PowerTopologyId);
    if (deviceClass === "power" || deviceClass === "voltage") {
      clusters.push(ElectricalPowerMeasurementId);
    }
    if (deviceClass === "energy") {
      clusters.push(ElectricalEnergyMeasurementId);
    }
    return [...new Set(clusters)];
  }

  public override async updateState(
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.state = state;
    const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
    const value = energyTariffConverter.toTariffValue(state);
    if (value === null || !this.endpoint) return;

    const deviceClass = state.attributes?.device_class;
    const unit = String(state.attributes?.unit_of_measurement ?? "").toLowerCase();
    if (deviceClass === "power") {
      const multiplier = unit === "kw" ? 1_000_000 : unit === "mw" ? 1 : 1000;
      const milliWatts = Math.round(value * multiplier);
      await updateFn(
        this.endpoint,
        ElectricalPowerMeasurementId,
        "activePower",
        milliWatts,
        this.platform.log,
      );
    } else if (deviceClass === "voltage") {
      // ElectricalPowerMeasurement voltage is represented in millivolts.
      const milliVolts = Math.round(value * (unit === "mv" ? 1 : 1000));
      await updateFn(
        this.endpoint,
        ElectricalPowerMeasurementId,
        "voltage",
        milliVolts,
        this.platform.log,
      );
    } else if (deviceClass === "energy") {
      const multiplier = unit === "wh" ? 1000 : unit === "mwh" ? 1 : 1_000_000;
      const mWh = Math.round(value * multiplier);
      await updateFn(
        this.endpoint,
        ElectricalEnergyMeasurementId,
        "cumulativeEnergyImported",
        { energy: mWh },
        this.platform.log,
      );
    }
  }
}

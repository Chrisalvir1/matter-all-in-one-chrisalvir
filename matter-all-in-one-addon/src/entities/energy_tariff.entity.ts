import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import { energyTariffConverter } from "../converters/energy_tariff.converter.js";

const ElectricalGridConditionsId = 0x00a0 as any as ClusterId;
const ElectricalPowerMeasurementId = 0x0090 as any as ClusterId;
const ElectricalEnergyMeasurementId = 0x0091 as any as ClusterId;

export class EnergyTariffEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(ElectricalGridConditionsId);
    return clusters;
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
    if (deviceClass === "power") {
      // Active power in milliwatts for Matter ElectricalPowerMeasurement
      const milliWatts = Math.round(value * 1000);
      await updateFn(
        this.endpoint,
        ElectricalPowerMeasurementId,
        "activePower",
        milliWatts,
        this.platform.log,
      );
    } else if (deviceClass === "energy") {
      // Cumulative energy in milliwatt-hours for Matter ElectricalEnergyMeasurement
      const mWh = Math.round(value * 1000000);
      await updateFn(
        this.endpoint,
        ElectricalEnergyMeasurementId,
        "cumulativeEnergyImported",
        mWh,
        this.platform.log,
      );
    }
  }
}

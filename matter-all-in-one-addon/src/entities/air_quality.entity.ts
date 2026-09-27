/**
 * air_quality.entity.ts
 *
 * Matter 1.6.1 + Matterbridge 3.10.11 native Air Quality Sensor entity (device type 0x002c / airQualitySensor).
 * Reports multi-variable air quality in a single unified endpoint:
 * - Air Quality summary enum (0x005B)
 * - CO2 concentration measurement (0x040D)
 * - PM1, PM2.5, PM10 particulate matter (0x042A, 0x042B, 0x042D)
 * - VOC / TVOC volatile organic compounds (0x042F)
 * - Ozone (0x0415) and Radon (0x042E)
 */

import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import { sensorConverter } from "../converters/sensor.converter.js";

export const AirQualityClusterId = 0x005b as any as ClusterId;
export const CarbonDioxideConcentrationMeasurementId = 0x040d as any as ClusterId;
export const Pm1ConcentrationMeasurementId = 0x042a as any as ClusterId;
export const Pm25ConcentrationMeasurementId = 0x042b as any as ClusterId;
export const Pm10ConcentrationMeasurementId = 0x042d as any as ClusterId;
export const TotalVolatileOrganicCompoundsConcentrationMeasurementId = 0x042f as any as ClusterId;
export const OzoneConcentrationMeasurementId = 0x0415 as any as ClusterId;
export const RadonConcentrationMeasurementId = 0x042e as any as ClusterId;

export class AirQualityEntity extends BaseEntity {
  public static readonly matterTypeLabel = "AirQualitySensor";

  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(AirQualityClusterId);
    return clusters;
  }

  public override async updateState(
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.state = state;
    if (!this.endpoint) return;

    const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
    const deviceClass = state.attributes?.device_class;

    if (deviceClass === "aqi" || deviceClass === "air_quality" || !deviceClass) {
      const aqiLevel = sensorConverter.toAirQuality(state);
      if (aqiLevel !== null) {
        await updateFn(
          this.endpoint,
          AirQualityClusterId,
          "airQuality",
          aqiLevel,
          this.platform.log,
        );
      }
    }

    if (deviceClass === "carbon_dioxide" || deviceClass === "co2") {
      const co2 = sensorConverter.toCo2(state);
      if (co2 !== null) {
        await updateFn(
          this.endpoint,
          CarbonDioxideConcentrationMeasurementId,
          "measuredValue",
          co2,
          this.platform.log,
        );
      }
    } else if (deviceClass === "pm1") {
      const pm1 = sensorConverter.toPm1(state);
      if (pm1 !== null) {
        await updateFn(
          this.endpoint,
          Pm1ConcentrationMeasurementId,
          "measuredValue",
          pm1,
          this.platform.log,
        );
      }
    } else if (deviceClass === "pm25") {
      const pm25 = sensorConverter.toPm25(state);
      if (pm25 !== null) {
        await updateFn(
          this.endpoint,
          Pm25ConcentrationMeasurementId,
          "measuredValue",
          pm25,
          this.platform.log,
        );
      }
    } else if (deviceClass === "pm10") {
      const pm10 = sensorConverter.toPm10(state);
      if (pm10 !== null) {
        await updateFn(
          this.endpoint,
          Pm10ConcentrationMeasurementId,
          "measuredValue",
          pm10,
          this.platform.log,
        );
      }
    } else if (
      deviceClass === "volatile_organic_compounds" ||
      deviceClass === "voc" ||
      deviceClass === "tvoc"
    ) {
      const voc = sensorConverter.toVoc(state);
      if (voc !== null) {
        await updateFn(
          this.endpoint,
          TotalVolatileOrganicCompoundsConcentrationMeasurementId,
          "measuredValue",
          voc,
          this.platform.log,
        );
      }
    }
  }
}

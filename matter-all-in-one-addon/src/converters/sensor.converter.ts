/**
 * Converter utility for sensor domain.
 */
import { HassState } from "../utils/ha-state.js";

export const sensorConverter = {
  /**
   * Convert temperature sensor value.
   */
  toTemperature(state: HassState): number | null {
    const val = parseFloat(state.state);
    if (isNaN(val)) return null;
    return Math.round(val * 100); // Matter Temp is in 0.01 C
  },

  /**
   * Convert relative humidity value.
   */
  toHumidity(state: HassState): number | null {
    const val = parseFloat(state.state);
    if (isNaN(val)) return null;
    return Math.round(val * 100); // Matter Humidity is in 0.01 %
  },

  /**
   * Convert light/illuminance value.
   */
  toIlluminance(state: HassState): number | null {
    const val = parseFloat(state.state);
    if (isNaN(val)) return null;
    // Matter Illuminance = 10000 * log10(Lux) + 1
    if (val <= 0) return 1;
    return Math.round(10000 * Math.log10(val) + 1);
  },

  /**
   * Convert CO2 sensor value (PPM).
   */
  toCo2(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : val;
  },

  /**
   * Convert PM1 sensor value (µg/m³).
   */
  toPm1(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : val;
  },

  /**
   * Convert PM2.5 sensor value (µg/m³).
   */
  toPm25(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : val;
  },

  /**
   * Convert PM10 sensor value (µg/m³).
   */
  toPm10(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : val;
  },

  /**
   * Convert VOC / TVOC sensor value (µg/m³ or index).
   */
  toVoc(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : val;
  },

  /**
   * Convert generic air quality or AQI to Matter AirQuality Enum (1..6).
   * 1: Good, 2: Fair, 3: Moderate, 4: Poor, 5: VeryPoor, 6: ExtremelyPoor.
   */
  toAirQuality(state: HassState): number | null {
    const s = state.state.toLowerCase();
    if (s === "good" || s === "buena") return 1;
    if (s === "fair" || s === "aceptable" || s === "moderate" || s === "moderada") return 2;
    if (s === "poor" || s === "mala") return 4;
    if (s === "very_poor" || s === "muy mala") return 5;
    if (s === "hazardous" || s === "peligrosa") return 6;

    const num = parseFloat(state.state);
    if (!isNaN(num)) {
      if (num <= 50) return 1;
      if (num <= 100) return 2;
      if (num <= 150) return 3;
      if (num <= 200) return 4;
      if (num <= 300) return 5;
      return 6;
    }
    return 1;
  },

  /**
   * Convert electrical power (Watts to milliwatts).
   */
  toPower(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : Math.round(val * 1000);
  },

  /**
   * Convert electrical energy (kWh to milliwatt-hours).
   */
  toEnergy(state: HassState): number | null {
    const val = parseFloat(state.state);
    return isNaN(val) ? null : Math.round(val * 1000000);
  },
};

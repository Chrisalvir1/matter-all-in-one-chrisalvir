import { toCelsius, fromCelsius } from "../utils/measurements.js";
/**
 * Converter utility for climate (thermostat) domain.
 */
export const climateConverter = {
  targetTemperature(
    state: { state: string; attributes?: Record<string, unknown> },
    kind: "heat" | "cool",
    value: number,
  ) {
    if (!Number.isFinite(value)) throw new Error("Invalid temperature");
    const attrs = state.attributes;
    value = fromCelsius(value, attrs?.temperature_unit);
    if (state.state === "heat_cool" || attrs?.temperature == null) {
      const low = attrs?.target_temp_low;
      const high = attrs?.target_temp_high;
      if (typeof low === "number" && typeof high === "number") {
        const target_temp_low = kind === "heat" ? value : low;
        const target_temp_high = kind === "cool" ? value : high;
        if (target_temp_low > target_temp_high)
          throw new Error("Heating target exceeds cooling target");
        return { target_temp_low, target_temp_high };
      }
    }
    return { temperature: value };
  },

  supportedMode(mode: string, modes: unknown, preferred?: string): string {
    if (!Array.isArray(modes) || !modes.length) return mode;
    if (mode === "auto") {
      if (preferred === "heat_cool" && modes.includes(preferred))
        return preferred;
      if (!modes.includes("auto") && modes.includes("heat_cool"))
        return "heat_cool";
    }
    if (!modes.includes(mode))
      throw new Error(`Unsupported HVAC mode: ${mode}`);
    return mode;
  },

  /**
   * Convert Celsius temperature to Matter value (hundredths of a degree Celsius).
   */
  toMatterTemperature(
    celsius: number | undefined | null,
    unit?: unknown,
  ): number | null {
    if (celsius === undefined || celsius === null) return null;
    return Number.isFinite(celsius)
      ? Math.round(toCelsius(celsius, unit) * 100)
      : null;
  },

  /**
   * Convert Matter temperature back to Celsius.
   */
  toCelsius(matterValue: number): number {
    return matterValue / 100;
  },

  /**
   * Map HA HVAC modes to Matter SystemMode values.
   */
  toMatterSystemMode(mode: string | null): number {
    switch (mode) {
      case "off":
        return 0; // Off
      case "heat":
        return 4; // Heat
      case "cool":
        return 3; // Cool
      case "auto":
      case "heat_cool":
        return 1; // Auto
      case "fan_only":
        return 7; // FanOnly
      case "dry":
        return 8; // Dry
      default:
        return 0;
    }
  },

  /**
   * Map Matter SystemMode values back to HA HVAC modes.
   */
  toHaHvacMode(systemMode: number): string {
    switch (systemMode) {
      case 0:
        return "off";
      case 4:
        return "heat";
      case 3:
        return "cool";
      case 1:
        return "auto";
      case 7:
        return "fan_only";
      case 8:
        return "dry";
      default:
        return "off";
    }
  },
};

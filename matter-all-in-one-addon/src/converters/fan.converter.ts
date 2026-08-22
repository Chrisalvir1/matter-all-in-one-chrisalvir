/**
 * Converter utility for fan and humidifier domains.
 */
import { HassState } from "../utils/ha-state.js";

export const MatterFanMode = {
  Off: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  On: 4,
  Auto: 5,
  Smart: 6,
} as const;

export const fanConverter = {
  /**
   * Convert percentage attribute (0..100) from HA to Matter fan speed percentage (0..100).
   */
  toPercentage(state: HassState): number {
    return state.attributes.percentage ?? 0;
  },

  /**
   * Map Matter speed percentage back to HA preset/percentage.
   */
  toHaPercentage(percent: number): number {
    return Math.max(0, Math.min(100, Math.round(percent)));
  },

  /**
   * Convert HA fan preset_mode to Matter FanMode enum.
   */
  presetModeToFanMode(presetMode?: string, isOn: boolean = true): number {
    if (!isOn) return MatterFanMode.Off;
    if (!presetMode) return MatterFanMode.On;

    const mode = String(presetMode).toLowerCase().trim();
    if (mode === "auto") return MatterFanMode.Auto;
    // The exported FanControl sequence is Off/Low/Medium/High/Auto. Publish
    // Eco/Smart as Auto instead of an unsupported Smart value (6).
    if (mode === "smart" || mode === "eco") return MatterFanMode.Auto;
    if (
      mode === "low" ||
      mode === "min" ||
      mode === "silent" ||
      mode === "sleep"
    )
      return MatterFanMode.Low;
    if (
      mode === "medium" ||
      mode === "med" ||
      mode === "mid" ||
      mode === "normal"
    )
      return MatterFanMode.Medium;
    if (
      mode === "high" ||
      mode === "max" ||
      mode === "turbo" ||
      mode === "boost"
    )
      return MatterFanMode.High;
    if (mode === "off") return MatterFanMode.Off;

    return MatterFanMode.On;
  },

  /**
   * Map Matter FanMode enum to matching HA preset_mode string.
   */
  fanModeToPresetMode(
    fanMode: number,
    availableModes: string[] = [],
  ): string | undefined {
    const modes = availableModes.map((m) => String(m).toLowerCase());

    const findMatching = (...candidates: string[]) => {
      for (const cand of candidates) {
        const found = availableModes.find((m) => m.toLowerCase() === cand);
        if (found) return found;
      }
      return undefined;
    };

    switch (fanMode) {
      case MatterFanMode.Auto:
        return findMatching("auto") ?? "auto";
      case MatterFanMode.Smart:
        return findMatching("smart", "eco", "auto") ?? "smart";
      case MatterFanMode.Low:
        return findMatching("low", "min", "silent", "sleep") ?? "low";
      case MatterFanMode.Medium:
        return findMatching("medium", "med", "mid", "normal") ?? "medium";
      case MatterFanMode.High:
        return findMatching("high", "max", "turbo", "boost") ?? "high";
      case MatterFanMode.On:
        return (
          findMatching("manual", "normal", "standard", "on") ??
          (availableModes.includes("manual") ? "manual" : undefined)
        );
      case MatterFanMode.Off:
        return findMatching("off");
      default:
        return undefined;
    }
  },

  /**
   * Convert HA humidifier mode to Matter FanMode enum.
   */
  humidifierModeToFanMode(mode?: string, isOn: boolean = true): number {
    if (!isOn) return MatterFanMode.Off;
    if (!mode) return MatterFanMode.On;

    const m = String(mode).toLowerCase().trim();
    if (m === "auto") return MatterFanMode.Auto;
    if (m === "eco" || m === "smart" || m === "baby")
      return MatterFanMode.Smart;
    if (m === "low" || m === "sleep" || m === "intermittent")
      return MatterFanMode.Low;
    if (m === "medium" || m === "normal") return MatterFanMode.Medium;
    if (m === "high" || m === "boost" || m === "continuous")
      return MatterFanMode.High;
    if (m === "off") return MatterFanMode.Off;

    return MatterFanMode.On;
  },

  /**
   * Map Matter FanMode enum to matching HA humidifier mode string.
   */
  fanModeToHumidifierMode(
    fanMode: number,
    availableModes: string[] = [],
  ): string | undefined {
    const findMatching = (...candidates: string[]) => {
      for (const cand of candidates) {
        const found = availableModes.find((m) => m.toLowerCase() === cand);
        if (found) return found;
      }
      return undefined;
    };

    switch (fanMode) {
      case MatterFanMode.Auto:
        return (
          findMatching("auto") ??
          (availableModes.includes("auto") ? "auto" : undefined)
        );
      case MatterFanMode.Smart:
        return (
          findMatching("eco", "smart", "baby", "auto") ??
          (availableModes.length > 0 ? availableModes[0] : undefined)
        );
      case MatterFanMode.Low:
        return findMatching("low", "sleep", "intermittent", "min");
      case MatterFanMode.Medium:
        return findMatching("medium", "normal", "med");
      case MatterFanMode.High:
        return findMatching("high", "continuous", "boost", "max");
      case MatterFanMode.On:
        return findMatching("manual", "continuous", "normal", "standard", "on");
      default:
        return undefined;
    }
  },

  /**
   * Convert target humidity to percentage (0..100) based on bounds.
   */
  humidityToPercentage(
    humidity: number,
    minHum: number = 0,
    maxHum: number = 100,
  ): number {
    if (maxHum <= minHum)
      return Math.max(0, Math.min(100, Math.round(humidity)));
    const percent = Math.round(((humidity - minHum) / (maxHum - minHum)) * 100);
    return Math.max(0, Math.min(100, percent));
  },

  /**
   * Convert percentage (0..100) back to target humidity based on bounds.
   */
  percentageToHumidity(
    percentage: number,
    minHum: number = 0,
    maxHum: number = 100,
  ): number {
    if (maxHum <= minHum)
      return Math.max(0, Math.min(100, Math.round(percentage)));
    const humidity =
      minHum + Math.round((percentage / 100) * (maxHum - minHum));
    return Math.max(minHum, Math.min(maxHum, humidity));
  },

  /**
   * Map percentage to discrete modes if diffuser only supports modes (e.g. low, medium, high).
   */
  percentageToMode(
    percentage: number,
    availableModes: string[] = [],
  ): string | undefined {
    if (!availableModes || availableModes.length === 0) return undefined;

    // Sort or filter known speed modes
    const speedModes = availableModes.filter(
      (m) => !["auto", "off"].includes(m.toLowerCase()),
    );
    if (speedModes.length === 0) return availableModes[0];

    const index = Math.min(
      speedModes.length - 1,
      Math.floor((percentage / 100) * speedModes.length),
    );
    return speedModes[index];
  },
};

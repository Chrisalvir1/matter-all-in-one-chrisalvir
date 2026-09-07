import { describe, expect, it } from "vitest";
import { climateConverter } from "../../src/converters/climate.converter.js";

describe("climateConverter", () => {
  it("converts Celsius to Matter temperature (hundredths of °C)", () => {
    expect(climateConverter.toMatterTemperature(21.5)).toBe(2150);
    expect(climateConverter.toMatterTemperature(0)).toBe(0);
    expect(climateConverter.toMatterTemperature(null)).toBeNull();
    expect(climateConverter.toMatterTemperature(undefined)).toBeNull();
  });

  it("converts Matter temperature back to Celsius", () => {
    expect(climateConverter.toCelsius(2150)).toBe(21.5);
    expect(climateConverter.toCelsius(0)).toBe(0);
  });

  it("maps HA HVAC modes to Matter SystemMode", () => {
    expect(climateConverter.toMatterSystemMode("off")).toBe(0);
    expect(climateConverter.toMatterSystemMode("heat")).toBe(4);
    expect(climateConverter.toMatterSystemMode("cool")).toBe(3);
    expect(climateConverter.toMatterSystemMode("auto")).toBe(1);
    expect(climateConverter.toMatterSystemMode("heat_cool")).toBe(1);
    expect(climateConverter.toMatterSystemMode("unknown")).toBe(0);
  });

  it("maps Matter SystemMode back to HA HVAC modes", () => {
    expect(climateConverter.toHaHvacMode(0)).toBe("off");
    expect(climateConverter.toHaHvacMode(4)).toBe("heat");
    expect(climateConverter.toHaHvacMode(3)).toBe("cool");
    expect(climateConverter.toHaHvacMode(1)).toBe("auto");
    expect(climateConverter.toHaHvacMode(99)).toBe("off");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import "./mocks/matterbridge.mock.js";
import { sensorConverter } from "../src/converters/sensor.converter.js";
import { ValveEntity, ValveConfigurationAndControlId } from "../src/entities/valve.entity.js";
import { AirQualityEntity, AirQualityClusterId, CarbonDioxideConcentrationMeasurementId, Pm25ConcentrationMeasurementId } from "../src/entities/air_quality.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import type { HassState } from "../src/utils/ha-state.js";

describe("Matter 1.6.1 Features and Clusters", () => {
  let mockPlatform: any;

  beforeEach(() => {
    mockPlatform = {
      log: {
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
      ha: {
        callService: vi.fn().mockResolvedValue({}),
      },
    };
  });

  describe("Sensor Converter (Matter 1.6.1 Extended Air Quality & Energy)", () => {
    it("converts CO2, PM, and VOC values", () => {
      const co2State: HassState = {
        entity_id: "sensor.living_room_co2",
        state: "850.5",
        attributes: { device_class: "carbon_dioxide" },
        last_changed: "",
        last_updated: "",
      };
      expect(sensorConverter.toCo2(co2State)).toBe(850.5);

      const pm25State: HassState = {
        entity_id: "sensor.pm25",
        state: "12.3",
        attributes: { device_class: "pm25" },
        last_changed: "",
        last_updated: "",
      };
      expect(sensorConverter.toPm25(pm25State)).toBe(12.3);

      const vocState: HassState = {
        entity_id: "sensor.voc",
        state: "120",
        attributes: { device_class: "volatile_organic_compounds" },
        last_changed: "",
        last_updated: "",
      };
      expect(sensorConverter.toVoc(vocState)).toBe(120);
    });

    it("converts power (W to mW) and energy (kWh to mWh)", () => {
      const powerState: HassState = {
        entity_id: "sensor.plug_power",
        state: "15.5",
        attributes: { device_class: "power" },
        last_changed: "",
        last_updated: "",
      };
      expect(sensorConverter.toPower(powerState)).toBe(15500);

      const energyState: HassState = {
        entity_id: "sensor.plug_energy",
        state: "2.5",
        attributes: { device_class: "energy" },
        last_changed: "",
        last_updated: "",
      };
      expect(sensorConverter.toEnergy(energyState)).toBe(2500000);
    });

    it("converts air quality strings and numbers to Matter AirQuality Enum (1..6)", () => {
      expect(sensorConverter.toAirQuality({ state: "good", attributes: {}, entity_id: "", last_changed: "", last_updated: "" })).toBe(1);
      expect(sensorConverter.toAirQuality({ state: "fair", attributes: {}, entity_id: "", last_changed: "", last_updated: "" })).toBe(2);
      expect(sensorConverter.toAirQuality({ state: "poor", attributes: {}, entity_id: "", last_changed: "", last_updated: "" })).toBe(4);
      expect(sensorConverter.toAirQuality({ state: "45", attributes: {}, entity_id: "", last_changed: "", last_updated: "" })).toBe(1);
      expect(sensorConverter.toAirQuality({ state: "180", attributes: {}, entity_id: "", last_changed: "", last_updated: "" })).toBe(4);
    });
  });

  describe("ValveEntity (Matter 1.6.1 Cluster 0x0081 / waterValve)", () => {
    it("updates valve state and position correctly", async () => {
      const valve = new ValveEntity(
        mockPlatform,
        {
          entity_id: "valve.garden_sprinkler",
          state: "open",
          attributes: { current_position: 75, friendly_name: "Riego Jardín" },
          last_changed: "",
          last_updated: "",
        },
        MatterDeviceTypes.waterValve,
      );

      const endpoint = await valve.createEndpoint();
      expect(endpoint).toBeDefined();

      await valve.updateState({
        entity_id: "valve.garden_sprinkler",
        state: "closed",
        attributes: { current_position: 0 },
        last_changed: "",
        last_updated: "",
      });

      expect(endpoint.getAttribute(ValveConfigurationAndControlId, "currentState")).toBe(0);
      expect(endpoint.getAttribute(ValveConfigurationAndControlId, "currentLevel")).toBe(0);
    });
  });

  describe("AirQualityEntity (Matter 1.6.1 Cluster 0x005B / airQualitySensor)", () => {
    it("updates CO2 and PM2.5 measurements", async () => {
      const aq = new AirQualityEntity(
        mockPlatform,
        {
          entity_id: "sensor.air_quality_co2",
          state: "950",
          attributes: { device_class: "co2", friendly_name: "CO2 Sala" },
          last_changed: "",
          last_updated: "",
        },
        MatterDeviceTypes.airQualitySensor,
      );

      const endpoint = await aq.createEndpoint();
      expect(endpoint).toBeDefined();

      await aq.updateState({
        entity_id: "sensor.air_quality_co2",
        state: "1100",
        attributes: { device_class: "co2" },
        last_changed: "",
        last_updated: "",
      });

      expect(endpoint.getAttribute(CarbonDioxideConcentrationMeasurementId, "measuredValue")).toBe(1100);
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import { getMqttDeviceType, MqttEntity } from "../src/mqtt/mqtt.entity.js";
import {
  MqttClientManager,
  MqttDiscoveryEntry,
  normalizeMqttDiscoveryConfig,
} from "../src/mqtt/mqtt-client.js";
import {
  onOffLight,
  dimmableLight,
  onOffPlugInUnit,
  temperatureSensor,
} from "matterbridge";

describe("MQTT Auto-Discovery and Entity Mapping", () => {
  it("correctly determines Matter device types based on component and device class", () => {
    expect(getMqttDeviceType("light", {})).toEqual(onOffLight);
    expect(getMqttDeviceType("light", { brightness: true })).toEqual(
      dimmableLight,
    );
    expect(getMqttDeviceType("switch", {})).toEqual(onOffPlugInUnit);
    expect(
      getMqttDeviceType("sensor", { device_class: "temperature" }),
    ).toEqual(temperatureSensor);
  });

  it("creates MqttEntity with clean identifiers and metadata", () => {
    const mockLog: any = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      notice: vi.fn(),
    };
    const mockPlatform: any = { log: mockLog, isDpsGenericEntity: () => false };
    const mockMqttManager = new MqttClientManager(mockLog, {
      host: "127.0.0.1",
    });

    const entry: MqttDiscoveryEntry = {
      topic: "homeassistant/light/living_room/light/config",
      component: "light",
      objectId: "living_room_light",
      config: {
        name: "Luz Sala MQTT",
        unique_id: "zigbee2mqtt_0x123456_light",
        state_topic: "zigbee2mqtt/living_room_light",
        command_topic: "zigbee2mqtt/living_room_light/set",
        brightness: true,
        brightness_state_topic: "zigbee2mqtt/living_room_light",
        brightness_command_topic: "zigbee2mqtt/living_room_light/set",
        device: {
          identifiers: ["zigbee2mqtt_0x123456"],
          name: "Luz Sala",
          manufacturer: "Philips",
          model: "Hue White",
        },
      },
    };

    const entity = new MqttEntity(mockPlatform, mockMqttManager, entry);

    expect(entity.entityId).toBe("mqtt.zigbee2mqtt_0x123456_light");
    expect(entity.domain).toBe("light");
    expect(entity.friendlyName).toBe("Luz Sala MQTT");
    expect(entity.manufacturer).toBe("Philips");
    expect(entity.model).toBe("Hue White");
    expect(entity.deviceType).toEqual(dimmableLight);
    expect(entity.stateTopic).toBe("zigbee2mqtt/living_room_light");
    expect(entity.commandTopic).toBe("zigbee2mqtt/living_room_light/set");
  });

  it("handles state updates for plain strings and JSON payloads", () => {
    const mockLog: any = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      notice: vi.fn(),
    };
    const mockPlatform: any = { log: mockLog };
    const mockMqttManager = new MqttClientManager(mockLog, {
      host: "127.0.0.1",
    });

    const entry: MqttDiscoveryEntry = {
      topic: "homeassistant/switch/kitchen_plug/config",
      component: "switch",
      config: {
        name: "Enchufe Cocina",
        unique_id: "plug_123",
        state_topic: "tasmota/plug_123/state",
        command_topic: "tasmota/plug_123/cmnd/power",
      },
    };

    const entity = new MqttEntity(mockPlatform, mockMqttManager, entry);
    expect(entity.getStateString()).toBe("unknown");

    entity.handleStateUpdate("ON");
    expect(entity.getStateString()).toBe("ON");

    entity.handleStateUpdate('{"state":"OFF"}');
    expect(entity.getStateString()).toBe("OFF");
  });

  it("normalizes Home Assistant MQTT discovery abbreviations and base topic prefixes", () => {
    const rawConfig = {
      "~": "zigbee2mqtt/kitchen_sensor",
      stat_t: "~/state",
      cmd_t: "~/set",
      avty_t: "~/availability",
      uniq_id: "0x00158d0001",
      pl_on: "ON",
      pl_off: "OFF",
      dev: {
        ids: ["0x00158d0001"],
        name: "Kitchen Sensor",
        mf: "Xiaomi",
        mdl: "MCCGQ11LM",
      },
    };

    const mockLog: any = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      notice: vi.fn(),
    };
    const mockPlatform: any = { log: mockLog };
    const mockMqttManager = new MqttClientManager(mockLog, {
      host: "127.0.0.1",
    });

    const normalized = normalizeMqttDiscoveryConfig(rawConfig);
    expect(normalized.state_topic).toBe("zigbee2mqtt/kitchen_sensor/state");
    expect(normalized.command_topic).toBe("zigbee2mqtt/kitchen_sensor/set");
    expect(normalized.availability_topic).toBe("zigbee2mqtt/kitchen_sensor/availability");
    expect(normalized.unique_id).toBe("0x00158d0001");
    expect(normalized.device.identifiers).toEqual(["0x00158d0001"]);
    expect(normalized.device.manufacturer).toBe("Xiaomi");
    expect(normalized.device.model).toBe("MCCGQ11LM");

    const entry: MqttDiscoveryEntry = {
      topic: "homeassistant/binary_sensor/kitchen_sensor/contact/config",
      component: "binary_sensor",
      config: normalized,
    };

    const entity = new MqttEntity(mockPlatform, mockMqttManager, entry);
    expect(entity.entityId).toBe("mqtt.0x00158d0001");
    expect(entity.friendlyName).toBe("Kitchen Sensor");
    expect(entity.manufacturer).toBe("Xiaomi");
    expect(entity.model).toBe("MCCGQ11LM");
    expect(entity.stateTopic).toBe("zigbee2mqtt/kitchen_sensor/state");

    // Test JSON state update handling (contact sensor)
    entity.handleStateUpdate(JSON.stringify({ contact: false }));
    expect(entity.getStateString().toLowerCase()).toBe("on");

    entity.handleStateUpdate(JSON.stringify({ contact: true }));
    expect(entity.getStateString().toLowerCase()).toBe("off");

    // Test availability handling
    entity.handleStateUpdate("offline");
    expect(entity.getStateString()).toBe("unavailable");
  });
});

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import {
  OnOff,
  LevelControl,
  DoorLock,
  TemperatureMeasurement,
  RelativeHumidityMeasurement,
  BooleanState,
  OccupancySensing,
  IlluminanceMeasurement,
  PressureMeasurement,
  FanControl,
} from "matterbridge/matter/clusters";
import {
  MatterbridgeOnOffServer,
  MatterbridgeDoorLockServer,
} from "matterbridge/behaviors";
import {
  onOffLight,
  dimmableLight,
  onOffPlugInUnit,
  temperatureSensor,
  humiditySensor,
  contactSensor,
  occupancySensor,
  lightSensor,
  pressureSensor,
  fan,
  doorLock,
  windowCovering,
} from "matterbridge";
import { HomeAssistantPlatform } from "../platform.js";
import { MqttClientManager, MqttDiscoveryEntry } from "./mqtt-client.js";
import { safeSetAttribute } from "../utils/matter-attributes.js";

export function getMqttDeviceType(
  component: string,
  config: any,
): DeviceTypeDefinition {
  const deviceClass = config.device_class || "";

  if (component === "light") {
    if (
      config.brightness ||
      config.brightness_command_topic ||
      config.brightness_state_topic
    ) {
      return dimmableLight;
    }
    return onOffLight;
  }

  if (component === "switch") {
    return onOffPlugInUnit;
  }

  if (component === "fan") {
    return fan;
  }

  if (component === "lock") {
    return doorLock;
  }

  if (component === "cover") {
    return windowCovering;
  }

  if (component === "binary_sensor") {
    if (["door", "window", "garage_door", "opening"].includes(deviceClass)) {
      return contactSensor;
    }
    if (["motion", "occupancy", "presence"].includes(deviceClass)) {
      return occupancySensor;
    }
    return contactSensor;
  }

  if (component === "sensor") {
    if (deviceClass === "temperature") return temperatureSensor;
    if (deviceClass === "humidity") return humiditySensor;
    if (deviceClass === "illuminance") return lightSensor;
    if (deviceClass === "pressure" || deviceClass === "atmospheric_pressure")
      return pressureSensor;
  }

  return onOffPlugInUnit;
}

export class MqttEntity {
  public endpoint!: MatterbridgeEndpoint;
  public entityId: string;
  public domain: string;
  public config: any;
  public deviceType: DeviceTypeDefinition;
  public friendlyName: string;
  public name: string;
  public deviceId: string;
  public deviceName: string;
  public manufacturer: string;
  public model: string;
  public areaName: string | null;
  public stateTopic: string;
  public commandTopic: string;
  public attributes: Record<string, any> = {};
  public currentState: string = "unknown";

  constructor(
    private platform: HomeAssistantPlatform,
    private mqttManager: MqttClientManager,
    private entry: MqttDiscoveryEntry,
  ) {
    this.config = entry.config;
    this.domain = entry.component;

    const device = this.config.device || {};
    const devName = device.name || "";

    // In Home Assistant 2023.8+, if has_entity_name is true, config.name may be null or relative
    let name = this.config.name;
    if (!name && devName) {
      name = devName;
    } else if (name && devName && !name.toLowerCase().includes(devName.toLowerCase())) {
      name = `${devName} ${name}`;
    }
    this.friendlyName = name || entry.objectId || this.config.unique_id || this.domain;
    this.name = this.friendlyName;

    const rawId =
      this.config.unique_id ||
      `${entry.component}_${entry.nodeId ? `${entry.nodeId}_` : ""}${entry.objectId || "device"}`;
    const cleanId = rawId.replace(/[^a-zA-Z0-9_]/g, "_").toLowerCase();
    this.entityId = `mqtt.${cleanId}`;

    this.deviceType = getMqttDeviceType(this.domain, this.config);

    const devId =
      Array.isArray(device.identifiers) && device.identifiers[0]
        ? device.identifiers[0]
        : typeof device.identifiers === "string"
        ? device.identifiers
        : rawId;
    this.deviceId = `mqtt:${devId}`;
    this.deviceName = devName || this.friendlyName;
    this.manufacturer = device.manufacturer || "MQTT";
    this.model = device.model || device.model_id || "MQTT Generic Accessory";
    this.areaName = device.suggested_area || null;

    this.stateTopic = this.config.state_topic || "";
    this.commandTopic = this.config.command_topic || "";

    // Set initial attributes
    this.attributes = {
      friendly_name: this.friendlyName,
      state_topic: this.stateTopic,
      command_topic: this.commandTopic,
      origin: "mqtt",
      ...this.config,
    };
  }

  public getStateString(): string {
    return this.currentState;
  }

  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.friendlyName.substring(0, 32).trim();

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll(".", "_"),
      mode: "server",
    });

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = rawName;
    this.endpoint.uniqueId = this.entityId.replaceAll(".", "_");
    this.endpoint.serialNumber =
      `MQTT-${this.entityId.replace("mqtt.", "")}`.substring(0, 32);
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = this.manufacturer.substring(0, 32);
    this.endpoint.productId = 0x8000;
    this.endpoint.softwareVersion = 1;
    this.endpoint.softwareVersionString = "Matterbridge 1.3.7";

    this.endpoint.createDefaultBasicInformationClusterServer(
      rawName,
      this.endpoint.serialNumber,
      0xfff1,
      this.endpoint.vendorName,
      0x8000,
      this.endpoint.productName,
    );
    this.endpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
      rawName,
      this.endpoint.serialNumber,
      0xfff1,
      this.endpoint.vendorName,
      rawName,
    );

    // Apply behaviors according to domain
    if (
      this.domain === "switch" ||
      this.domain === "light" ||
      this.domain === "fan"
    ) {
      const isLight = this.domain === "light";
      this.endpoint.behaviors.require(
        isLight
          ? MatterbridgeOnOffServer.with(OnOff.Feature.Lighting)
          : MatterbridgeOnOffServer.with(),
      );

      // Matter Command Handlers -> MQTT Publish
      this.endpoint.addCommandHandler("on", async () => {
        if (this.commandTopic) {
          const payload =
            this.config.payload_on !== undefined
              ? String(this.config.payload_on)
              : "ON";
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });

      this.endpoint.addCommandHandler("off", async () => {
        if (this.commandTopic) {
          const payload =
            this.config.payload_off !== undefined
              ? String(this.config.payload_off)
              : "OFF";
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });

      if (
        this.config.brightness_command_topic &&
        this.deviceType === dimmableLight
      ) {
        this.endpoint.addClusterServers([LevelControl.id]);
        this.endpoint.addCommandHandler("moveToLevel", async (data: any) => {
          const level = data?.request?.level ?? data?.level;
          if (typeof level === "number") {
            const scale = this.config.brightness_scale || 255;
            const brightness = Math.round((level / 254) * scale);
            this.mqttManager.publish(
              this.config.brightness_command_topic,
              String(brightness),
            );
          }
        });
      }
    } else if (this.domain === "lock") {
      this.endpoint.behaviors.require(MatterbridgeDoorLockServer.with());

      this.endpoint.addCommandHandler("lockDoor", async () => {
        if (this.commandTopic) {
          const payload = this.config.payload_lock || "LOCK";
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });

      this.endpoint.addCommandHandler("unlockDoor", async () => {
        if (this.commandTopic) {
          const payload = this.config.payload_unlock || "UNLOCK";
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });
    } else if (this.domain === "sensor") {
      if (this.deviceType === temperatureSensor) {
        this.endpoint.createDefaultTemperatureMeasurementClusterServer(2000);
      } else if (this.deviceType === humiditySensor) {
        this.endpoint.createDefaultRelativeHumidityMeasurementClusterServer(
          5000,
        );
      } else if (this.deviceType === lightSensor) {
        this.endpoint.createDefaultIlluminanceMeasurementClusterServer(100);
      } else if (this.deviceType === pressureSensor) {
        this.endpoint.createDefaultPressureMeasurementClusterServer(1013);
      }
    } else if (this.domain === "binary_sensor") {
      if (this.deviceType === contactSensor) {
        this.endpoint.createDefaultBooleanStateClusterServer(true);
      } else if (this.deviceType === occupancySensor) {
        this.endpoint.createDefaultOccupancySensingClusterServer(false);
      }
    }

    this.endpoint.addRequiredClusterServers();

    return this.endpoint;
  }

  public adoptEndpoint(endpoint: MatterbridgeEndpoint) {
    this.endpoint = endpoint;
  }

  public async setReachability(reachable: boolean): Promise<void> {
    const ep = this.endpoint as any;
    if (!ep) return;
    try {
      if (typeof ep.setAttribute === "function") {
        if (ep.hasAttributeServer?.(0x0028, "reachable")) {
          await ep.setAttribute(0x0028, "reachable", reachable, this.platform.log);
        }
        if (ep.hasAttributeServer?.(0x0039, "reachable")) {
          await ep.setAttribute(0x0039, "reachable", reachable, this.platform.log);
        }
      }
      if (typeof ep.updateAttribute === "function") {
        if (ep.hasAttributeServer?.(0x0039, "reachable")) {
          await ep.updateAttribute(0x0039, "reachable", reachable, this.platform.log);
        }
        if (ep.hasAttributeServer?.(0x0028, "reachable")) {
          await ep.updateAttribute(0x0028, "reachable", reachable, this.platform.log);
        }
      }
    } catch {}
  }

  public async setInactiveState(): Promise<void> {
    if (!this.endpoint) return;
    try {
      if (this.endpoint.hasAttributeServer(OnOff.id, "onOff")) {
        safeSetAttribute(
          this.endpoint,
          OnOff.Cluster.id,
          "onOff",
          false,
          this.platform.log,
        );
      }
    } catch {}
  }

  public async syncInitialState(): Promise<void> {
    if (!this.stateTopic) return;
    const lastPayload = this.mqttManager.deviceStates.get(this.stateTopic);
    if (lastPayload) {
      this.handleStateUpdate(lastPayload);
    }
  }

  public handleStateUpdate(payload: string) {
    this.currentState = payload;

    try {
      let parsed: any = null;
      try {
        if (payload.startsWith("{") && payload.endsWith("}")) {
          parsed = JSON.parse(payload);
        }
      } catch {
        /* plain string */
      }

      // Check availability payloads
      const stateStr = payload.trim().toLowerCase();
      if (
        stateStr === "offline" ||
        stateStr === "unavailable" ||
        (this.config.payload_not_available &&
          stateStr === String(this.config.payload_not_available).toLowerCase())
      ) {
        this.currentState = "unavailable";
        void this.setReachability(false);
        void this.setInactiveState();
        return;
      }
      if (
        stateStr === "online" ||
        (this.config.payload_available &&
          stateStr === String(this.config.payload_available).toLowerCase())
      ) {
        void this.setReachability(true);
      }

      if (
        this.domain === "switch" ||
        this.domain === "light" ||
        this.domain === "fan"
      ) {
        let isOn = false;
        if (parsed) {
          const propMatch = this.config.value_template?.match(
            /value_json\.([a-zA-Z0-9_]+)/,
          );
          const propVal = propMatch ? parsed[propMatch[1]] : undefined;
          if (typeof propVal === "boolean") {
            isOn = propVal;
          } else if (typeof propVal === "string") {
            isOn =
              propVal.toUpperCase() ===
              (this.config.payload_on || "ON").toUpperCase();
          } else if (typeof parsed.state === "string") {
            isOn =
              parsed.state.toUpperCase() ===
              (this.config.payload_on || "ON").toUpperCase();
          } else if (typeof parsed.state === "boolean") {
            isOn = parsed.state;
          }
        } else {
          isOn =
            payload.toUpperCase() ===
              (this.config.payload_on || "ON").toUpperCase() ||
            payload === "1" ||
            payload.toLowerCase() === "true";
        }
        this.currentState = isOn
          ? this.config.payload_on || "ON"
          : this.config.payload_off || "OFF";

        if (this.endpoint) {
          safeSetAttribute(
            this.endpoint,
            OnOff.Cluster.id,
            "onOff",
            isOn,
            this.platform.log,
          );

          if (
            parsed &&
            typeof parsed.brightness === "number" &&
            this.endpoint.hasAttributeServer(LevelControl.id, "currentLevel")
          ) {
            const scale = this.config.brightness_scale || 255;
            const level = Math.round((parsed.brightness / scale) * 254);
            safeSetAttribute(
              this.endpoint,
              LevelControl.Cluster.id,
              "currentLevel",
              level,
              this.platform.log,
            );
          }
        }
      } else if (this.domain === "lock") {
        const isLocked =
          payload.toUpperCase() ===
          (this.config.state_locked || "LOCKED").toUpperCase();
        this.currentState = isLocked
          ? this.config.state_locked || "LOCKED"
          : this.config.state_unlocked || "UNLOCKED";

        if (this.endpoint) {
          safeSetAttribute(
            this.endpoint,
            DoorLock.Cluster.id,
            "lockState",
            isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked,
            this.platform.log,
          );
        }
      } else if (this.domain === "binary_sensor") {
        let isOn = false;
        if (parsed) {
          const propMatch = this.config.value_template?.match(
            /value_json\.([a-zA-Z0-9_]+)/,
          );
          const propVal = propMatch ? parsed[propMatch[1]] : undefined;
          if (typeof propVal === "boolean") {
            isOn = propVal;
          } else if (typeof propVal === "string") {
            isOn =
              propVal.toUpperCase() ===
              (this.config.payload_on || "ON").toUpperCase();
          } else if (typeof parsed.contact === "boolean") {
            isOn = !parsed.contact;
          } else if (typeof parsed.occupancy === "boolean") {
            isOn = parsed.occupancy;
          } else if (typeof parsed.presence === "boolean") {
            isOn = parsed.presence;
          } else if (typeof parsed.motion === "boolean") {
            isOn = parsed.motion;
          } else if (typeof parsed.water_leak === "boolean") {
            isOn = parsed.water_leak;
          } else if (typeof parsed.smoke === "boolean") {
            isOn = parsed.smoke;
          } else if (typeof parsed.state === "boolean") {
            isOn = parsed.state;
          } else if (typeof parsed.state === "string") {
            isOn =
              parsed.state.toUpperCase() ===
              (this.config.payload_on || "ON").toUpperCase();
          }
        } else {
          isOn =
            payload.toUpperCase() ===
            (this.config.payload_on || "ON").toUpperCase();
        }

        this.currentState = isOn
          ? this.config.payload_on || "on"
          : this.config.payload_off || "off";

        if (this.endpoint) {
          if (this.deviceType === contactSensor) {
            safeSetAttribute(
              this.endpoint,
              BooleanState.Cluster.id,
              "stateValue",
              !isOn,
              this.platform.log,
            );
          } else if (this.deviceType === occupancySensor) {
            safeSetAttribute(
              this.endpoint,
              OccupancySensing.Cluster.id,
              "occupancy",
              { occupied: isOn },
              this.platform.log,
            );
          }
        }
      } else if (this.domain === "sensor") {
        const propMatch = this.config.value_template?.match(
          /value_json\.([a-zA-Z0-9_]+)/,
        );
        const propVal = propMatch ? parsed?.[propMatch[1]] : undefined;
        const rawVal =
          propVal ??
          parsed?.temperature ??
          parsed?.humidity ??
          parsed?.illuminance ??
          parsed?.illuminance_lux ??
          parsed?.pressure ??
          parsed?.value ??
          payload;
        if (rawVal !== undefined) {
          this.currentState = String(rawVal);
        }
        const val = parseFloat(String(rawVal));
        if (this.endpoint && !isNaN(val)) {
          if (this.deviceType === temperatureSensor) {
            safeSetAttribute(
              this.endpoint,
              TemperatureMeasurement.Cluster.id,
              "measuredValue",
              Math.round(val * 100),
              this.platform.log,
            );
          } else if (this.deviceType === humiditySensor) {
            safeSetAttribute(
              this.endpoint,
              RelativeHumidityMeasurement.Cluster.id,
              "measuredValue",
              Math.round(val * 100),
              this.platform.log,
            );
          }
        }
      }
    } catch (err) {
      this.platform.log.warn(
        `[MQTT] Error parsing state update for ${this.entityId}: ${err}`,
      );
    }
  }
}

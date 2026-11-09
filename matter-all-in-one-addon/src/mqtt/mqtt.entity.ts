import { sensorMeasurement } from "../utils/measurements.js";
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
import { applyMatterFirmware } from "../utils/matter-firmware.js";

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
  private readonly commandBindings = new Map<string, (data: any) => any>();
  private readonly attributeBindings = new Map<
    string,
    { cluster: any; attribute: string; callback: (value: any) => void }
  >();
  private static readonly subscriptions = new WeakMap<
    object,
    Map<string, (value: any) => void>
  >();
  private bindAttribute(
    cluster: any,
    attribute: string,
    callback: (value: any) => void,
  ): void {
    const key = `${cluster}:${attribute}`;
    this.attributeBindings.set(key, { cluster, attribute, callback });
    let handlers = MqttEntity.subscriptions.get(this.endpoint);
    if (!handlers) {
      handlers = new Map();
      MqttEntity.subscriptions.set(this.endpoint, handlers);
    }
    const installed = handlers.has(key);
    handlers.set(key, callback);
    if (!installed) {
      const delegate = handlers;
      this.endpoint.subscribeAttribute(cluster, attribute, (value) => {
        void Promise.resolve()
          .then(() => delegate.get(key)?.(value))
          .catch((error) => {
            this.platform.log.warn(
              `MQTT attribute command failed for ${this.entityId}: ${String(error)}`,
            );
            void this.setReachability(false);
            this.platform.recordEntityCommandFailure?.(
              this.entityId,
              String(error),
            );
          });
      });
    }
  }
  private bindCommand(command: string, callback: (data: any) => any): void {
    this.commandBindings.set(command, callback);
    this.endpoint.addCommandHandler(command as any, callback);
  }
  public entityId: string;
  public discoveryTopic: string;
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
  private available?: boolean;

  constructor(
    private platform: HomeAssistantPlatform,
    private mqttManager: MqttClientManager,
    private entry: MqttDiscoveryEntry,
  ) {
    this.config = entry.config;
    this.discoveryTopic = entry.topic;
    this.domain = entry.component;

    const device = this.config.device || {};
    const devName = device.name || "";

    // In Home Assistant 2023.8+, if has_entity_name is true, config.name may be null or relative
    let name = this.config.name;
    if (!name && devName) {
      name = devName;
    } else if (
      name &&
      devName &&
      !name.toLowerCase().includes(devName.toLowerCase())
    ) {
      name = `${devName} ${name}`;
    }
    this.friendlyName =
      name || entry.objectId || this.config.unique_id || this.domain;
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
    return this.available === false
      ? "unavailable"
      : String(this.currentState ?? "unknown");
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
    applyMatterFirmware(this.endpoint, this.platform);

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
      this.bindCommand("on", async () => {
        this.assertAvailable();
        if (!this.commandTopic)
          throw new Error("MQTT device has no command topic");
        if (this.commandTopic) {
          const payload =
            this.config.payload_on !== undefined
              ? String(this.config.payload_on)
              : "ON";
          await this.mqttManager.publishCommand(
            this.commandTopic,
            this.domain === "light" && this.config.schema === "json"
              ? JSON.stringify({ state: payload })
              : String(payload),
          );
        }
      });

      this.bindCommand("off", async () => {
        this.assertAvailable();
        if (!this.commandTopic)
          throw new Error("MQTT device has no command topic");
        if (this.commandTopic) {
          const payload =
            this.config.payload_off !== undefined
              ? String(this.config.payload_off)
              : "OFF";
          await this.mqttManager.publishCommand(
            this.commandTopic,
            this.domain === "light" && this.config.schema === "json"
              ? JSON.stringify({ state: payload })
              : String(payload),
          );
        }
      });

      if (
        (this.config.brightness_command_topic ||
          (this.config.schema === "json" &&
            this.config.brightness &&
            this.commandTopic)) &&
        this.deviceType === dimmableLight
      ) {
        this.endpoint.addClusterServers([LevelControl.id]);
        const levelCommand = async (data: any, withOnOff = false) => {
          this.assertAvailable();
          const level = data?.request?.level ?? data?.level;
          if (!Number.isFinite(level) || level < 0 || level > 254)
            throw new Error("Invalid brightness");
          const brightness = Math.round(
            (level / 254) * (this.config.brightness_scale || 255),
          );
          if (this.config.schema === "json") {
            await this.mqttManager.publishCommand(
              this.commandTopic,
              JSON.stringify({
                brightness,
                ...(withOnOff ? { state: level === 0 ? "OFF" : "ON" } : {}),
              }),
            );
          } else {
            await this.mqttManager.publishCommand(
              this.config.brightness_command_topic,
              String(brightness),
            );
            if (withOnOff && this.commandTopic)
              await this.mqttManager.publishCommand(
                this.commandTopic,
                String(
                  level === 0
                    ? (this.config.payload_off ?? "OFF")
                    : (this.config.payload_on ?? "ON"),
                ),
              );
          }
        };
        this.bindCommand("moveToLevel", (d) => levelCommand(d));
        this.bindCommand("moveToLevelWithOnOff", (d) => levelCommand(d, true));
      }
    } else if (this.domain === "cover") {
      for (const [cmd, field, fallback] of [
        ["upOrOpen", "payload_open", "OPEN"],
        ["downOrClose", "payload_close", "CLOSE"],
        ["stopMotion", "payload_stop", "STOP"],
      ]) {
        this.bindCommand(cmd as any, async () => {
          this.assertAvailable();
          if (!this.commandTopic) throw new Error("Missing MQTT command topic");
          await this.mqttManager.publishCommand(
            this.commandTopic,
            String(this.config[field] ?? fallback),
          );
        });
      }
      this.bindCommand("goToLiftPercentage", async (data: any) => {
        this.assertAvailable();
        const r = data?.request ?? data;
        const p = r.liftPercent100thsValue / 100;
        if (!Number.isFinite(p) || p < 0 || p > 100)
          throw new Error("Invalid cover position");
        if (!this.config.set_position_topic)
          throw new Error("MQTT cover does not support positioning");
        const closed = Number(this.config.position_closed ?? 0),
          open = Number(this.config.position_open ?? 100);
        await this.mqttManager.publishCommand(
          this.config.set_position_topic,
          String(Math.round(closed + (1 - p / 100) * (open - closed))),
        );
      });
    } else if (this.domain === "lock") {
      this.endpoint.behaviors.require(MatterbridgeDoorLockServer.with());

      this.bindCommand("lockDoor", async () => {
        this.assertAvailable();
        if (!this.commandTopic)
          throw new Error("MQTT device has no command topic");
        if (this.commandTopic) {
          const payload = this.config.payload_lock || "LOCK";
          await this.mqttManager.publishCommand(
            this.commandTopic,
            this.domain === "light" && this.config.schema === "json"
              ? JSON.stringify({ state: payload })
              : String(payload),
          );
        }
      });

      this.bindCommand("unlockDoor", async () => {
        this.assertAvailable();
        if (!this.commandTopic)
          throw new Error("MQTT device has no command topic");
        if (this.commandTopic) {
          const payload = this.config.payload_unlock || "UNLOCK";
          await this.mqttManager.publishCommand(
            this.commandTopic,
            this.domain === "light" && this.config.schema === "json"
              ? JSON.stringify({ state: payload })
              : String(payload),
          );
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

    if (this.domain === "fan" && this.config.percentage_command_topic) {
      this.bindAttribute(FanControl.id, "percentSetting", async (v: number) => {
        this.assertAvailable();
        const low = Number(this.config.speed_range_min ?? 1),
          high = Number(this.config.speed_range_max ?? 100);
        await this.mqttManager.publishCommand(
          this.config.percentage_command_topic,
          String(v === 0 ? 0 : Math.round(low + ((v - 1) / 99) * (high - low))),
        );
      });
    }
    this.endpoint.addRequiredClusterServers();

    return this.endpoint;
  }

  private assertAvailable(): void {
    if (this.available === false) throw new Error("MQTT device unavailable");
  }

  public handleTopicState(topic: string, payload: string): void {
    if (
      topic === this.config.brightness_state_topic &&
      topic !== this.stateTopic
    ) {
      const n = Number(payload);
      if (Number.isFinite(n))
        void safeSetAttribute(
          this.endpoint,
          LevelControl.id,
          "currentLevel",
          Math.max(
            0,
            Math.min(
              254,
              Math.round((n / (this.config.brightness_scale || 255)) * 254),
            ),
          ),
          this.platform.log,
        );
    } else if (
      topic === this.config.position_topic &&
      topic !== this.stateTopic
    ) {
      const n = Number(payload),
        closed = Number(this.config.position_closed ?? 0),
        open = Number(this.config.position_open ?? 100);
      if (Number.isFinite(n) && open !== closed)
        void safeSetAttribute(
          this.endpoint,
          0x0102 as any,
          "currentPositionLiftPercent100ths",
          Math.round((1 - (n - closed) / (open - closed)) * 10000),
          this.platform.log,
        );
    } else if (
      topic === this.config.percentage_state_topic &&
      topic !== this.stateTopic
    ) {
      const n = Number(payload);
      if (Number.isFinite(n))
        void safeSetAttribute(
          this.endpoint,
          FanControl.id,
          "percentCurrent",
          n,
          this.platform.log,
        );
    }
  }

  public adoptEndpoint(endpoint: MatterbridgeEndpoint) {
    this.endpoint = endpoint;
    applyMatterFirmware(endpoint, this.platform);
    for (const binding of this.attributeBindings.values())
      this.bindAttribute(binding.cluster, binding.attribute, binding.callback);
    const handler = (endpoint as any).commandHandler;
    for (const [command, callback] of this.commandBindings) {
      for (const old of [...(handler?.handler ?? [])]) {
        if (old.command === command)
          handler.removeHandler(old.command, old.handler);
      }
      endpoint.addCommandHandler(command as any, callback);
    }
  }

  public async setReachability(reachable: boolean): Promise<void> {
    const ep = this.endpoint as any;
    if (!ep) return;
    try {
      if (typeof ep.setAttribute === "function") {
        if (ep.hasAttributeServer?.(0x0028, "reachable")) {
          await ep.setAttribute(
            0x0028,
            "reachable",
            reachable,
            this.platform.log,
          );
        }
        if (ep.hasAttributeServer?.(0x0039, "reachable")) {
          await ep.setAttribute(
            0x0039,
            "reachable",
            reachable,
            this.platform.log,
          );
        }
      }
      if (typeof ep.updateAttribute === "function") {
        if (ep.hasAttributeServer?.(0x0039, "reachable")) {
          await ep.updateAttribute(
            0x0039,
            "reachable",
            reachable,
            this.platform.log,
          );
        }
        if (ep.hasAttributeServer?.(0x0028, "reachable")) {
          await ep.updateAttribute(
            0x0028,
            "reachable",
            reachable,
            this.platform.log,
          );
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

  public get availabilityTopic(): string | undefined {
    return this.config.availability_topic;
  }

  public handleAvailabilityUpdate(payload: string): boolean {
    const value = payload.trim().toLowerCase();
    const offline = String(
      this.config.payload_not_available ?? "offline",
    ).toLowerCase();
    const online = String(
      this.config.payload_available ?? "online",
    ).toLowerCase();
    if (value === offline || value === "unavailable") {
      this.available = false;
      void this.setReachability(false);
      return true;
    }
    if (value === online) {
      this.available = true;
      void this.setReachability(true);
      return true;
    }
    return false;
  }

  public async syncInitialState(): Promise<void> {
    const lastPayload = this.mqttManager.deviceStates.get(this.stateTopic);
    if (lastPayload !== undefined) this.handleStateUpdate(lastPayload);
    const availability = this.availabilityTopic;
    if (availability && availability !== this.stateTopic) {
      const payload = this.mqttManager.deviceStates.get(availability);
      if (payload !== undefined) this.handleAvailabilityUpdate(payload);
    }
  }

  public handleStateUpdate(payload: any) {
    const rawPayload =
      typeof payload === "string"
        ? payload
        : payload !== null && payload !== undefined
          ? String(payload)
          : "";
    this.currentState = rawPayload;

    try {
      let parsed: any = null;
      try {
        if (rawPayload.startsWith("{") && rawPayload.endsWith("}")) {
          parsed = JSON.parse(rawPayload);
        }
      } catch {
        /* plain string */
      }

      // Check availability payloads
      const stateStr = rawPayload.trim().toLowerCase();
      if (
        stateStr === "offline" ||
        stateStr === "unavailable" ||
        (this.config.payload_not_available &&
          stateStr === String(this.config.payload_not_available).toLowerCase())
      ) {
        this.currentState = "unavailable";
        void this.setReachability(false);
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
          } else if (
            typeof propVal === "string" ||
            typeof propVal === "number"
          ) {
            const normVal = String(propVal).toUpperCase();
            const normOn = String(this.config.payload_on ?? "ON").toUpperCase();
            isOn =
              normVal === normOn ||
              normVal === "1" ||
              normVal === "TRUE" ||
              normVal === "ON";
          } else if (typeof parsed.state === "boolean") {
            isOn = parsed.state;
          } else if (
            typeof parsed.state === "string" ||
            typeof parsed.state === "number"
          ) {
            const normState = String(parsed.state).toUpperCase();
            const normOn = String(this.config.payload_on ?? "ON").toUpperCase();
            isOn =
              normState === normOn ||
              normState === "1" ||
              normState === "TRUE" ||
              normState === "ON";
          }
        } else {
          const normPayload = String(payload).toUpperCase();
          const normOn = String(this.config.payload_on ?? "ON").toUpperCase();
          isOn =
            normPayload === normOn ||
            normPayload === "1" ||
            normPayload === "TRUE" ||
            normPayload === "ON";
        }
        this.currentState = isOn
          ? (this.config.payload_on ?? "ON")
          : (this.config.payload_off ?? "OFF");

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
        const normLocked = String(
          this.config.state_locked ?? "LOCKED",
        ).toUpperCase();
        const normalized = String(payload).toUpperCase();
        const isLocked = normalized === normLocked;
        if (
          !isLocked &&
          normalized !==
            String(this.config.state_unlocked ?? "UNLOCKED").toUpperCase()
        )
          return;
        this.currentState = isLocked
          ? (this.config.state_locked ?? "LOCKED")
          : (this.config.state_unlocked ?? "UNLOCKED");

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
          const normOn = String(this.config.payload_on ?? "ON").toUpperCase();
          if (typeof propVal === "boolean") {
            isOn = propVal;
          } else if (
            typeof propVal === "string" ||
            typeof propVal === "number"
          ) {
            const normVal = String(propVal).toUpperCase();
            isOn =
              normVal === normOn ||
              normVal === "1" ||
              normVal === "TRUE" ||
              normVal === "ON";
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
          } else if (
            typeof parsed.state === "string" ||
            typeof parsed.state === "number"
          ) {
            const normState = String(parsed.state).toUpperCase();
            isOn =
              normState === normOn ||
              normState === "1" ||
              normState === "TRUE" ||
              normState === "ON";
          }
        } else {
          const normPayload = String(payload).toUpperCase();
          const normOn = String(this.config.payload_on ?? "ON").toUpperCase();
          isOn =
            normPayload === normOn ||
            normPayload === "1" ||
            normPayload === "TRUE" ||
            normPayload === "ON";
        }

        this.currentState = isOn
          ? (this.config.payload_on ?? "on")
          : (this.config.payload_off ?? "off");

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

        if (
          typeof (this.platform as any)?.handleMqttBinarySensorState ===
          "function"
        ) {
          (this.platform as any).handleMqttBinarySensorState(
            this.entityId,
            isOn,
            this.friendlyName,
            this.config.device_class,
          );
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
          const measurement = sensorMeasurement({
            state: String(val),
            attributes: this.config,
          });
          if (measurement) {
            void safeSetAttribute(
              this.endpoint,
              measurement.cluster as any,
              "measuredValue",
              measurement.value,
              this.platform.log,
            );
            return;
          }
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

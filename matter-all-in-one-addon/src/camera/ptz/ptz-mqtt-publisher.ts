/**
 * MQTT Publisher and Subscriber for Camera PTZ and Surveillance Zones.
 * Integrates directly with Home Assistant via MQTT Discovery and standardized topics.
 */

import mqtt from "mqtt";
import { PtzZonesManager } from "./ptz-zones-manager.js";
import { CameraPtzInfo, MAX_PTZ_PRESETS } from "./ptz-capabilities.js";

export interface PtzMqttConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  topicPrefix?: string;
  discoveryPrefix?: string;
}

export class PtzMqttPublisher {
  private client: mqtt.MqttClient | null = null;
  private ptzManager: PtzZonesManager;
  private log: any;
  private prefix: string;
  private discoveryPrefix: string;
  private config: PtzMqttConfig;

  constructor(ptzManager: PtzZonesManager, config: PtzMqttConfig, log?: any) {
    this.ptzManager = ptzManager;
    this.config = config;
    this.log = log || console;
    this.prefix = config.topicPrefix || "matter-all-in-one";
    this.discoveryPrefix = config.discoveryPrefix || "homeassistant";

    this.setupEventListeners();
  }

  public connect(): void {
    if (!this.config.host) return;

    const url = `mqtt://${this.config.host}:${this.config.port || 1883}`;
    this.log.info?.(`[PTZ-MQTT] Connecting to MQTT broker at ${url}`);

    this.client = mqtt.connect(url, {
      username: this.config.user || undefined,
      password: this.config.password || undefined,
      reconnectPeriod: 5000,
    });

    this.client.on("connect", () => {
      this.log.notice?.(`[PTZ-MQTT] Connected to MQTT broker for PTZ & Zones`);
      this.subscribeToCommands();
      this.publishAllCameraStates();
    });

    this.client.on("message", (topic, message) => {
      this.handleIncomingMessage(topic, message.toString());
    });

    this.client.on("error", (err) => {
      this.log.error?.(`[PTZ-MQTT] MQTT connection error: ${err.message || err}`);
    });
  }

  private subscribeToCommands(): void {
    if (!this.client) return;
    const commandTopicPattern = `${this.prefix}/camera/+/ptz/command`;
    this.client.subscribe(commandTopicPattern, (err) => {
      if (err) {
        this.log.error?.(`[PTZ-MQTT] Failed to subscribe to ${commandTopicPattern}: ${err}`);
      } else {
        this.log.info?.(`[PTZ-MQTT] Subscribed to commands: ${commandTopicPattern}`);
      }
    });
  }

  private setupEventListeners(): void {
    this.ptzManager.on("zoneUpdated", ({ entityId }) => {
      this.publishCameraState(entityId);
    });

    this.ptzManager.on("zoneActivated", ({ entityId }) => {
      this.publishCameraState(entityId);
    });

    this.ptzManager.on("zoneDeleted", ({ entityId }) => {
      this.publishCameraState(entityId);
    });

    this.ptzManager.on("cameraMoved", ({ entityId }) => {
      this.publishCameraState(entityId);
    });
  }

  public publishCameraState(entityId: string): void {
    if (!this.client || !this.client.connected) return;

    const info = this.ptzManager.getCameraPtzInfo(entityId);
    if (!info) return;

    const safeId = entityId.replace(/\./g, "_");
    const stateTopic = `${this.prefix}/camera/${safeId}/ptz/state`;
    const zonesTopic = `${this.prefix}/camera/${safeId}/ptz/zones`;

    const statePayload = {
      entity_id: entityId,
      name: info.name,
      has_ptz: info.hasPtz,
      ptz_type: info.ptzType,
      current_preset: info.currentPreset ?? 1,
      current_zone_id: info.currentZoneId ?? 1,
      max_presets: info.maxPresets,
      zones_count: info.zones.length,
      timestamp: Date.now(),
    };

    const zonesPayload = {
      entity_id: entityId,
      zones: info.zones,
    };

    this.client.publish(stateTopic, JSON.stringify(statePayload), { retain: true, qos: 1 });
    this.client.publish(zonesTopic, JSON.stringify(zonesPayload), { retain: true, qos: 1 });

    // Also publish Home Assistant discovery configurations for PTZ sensor and zone selector
    this.publishHaDiscovery(entityId, info);
  }

  public publishAllCameraStates(): void {
    const cameras = this.ptzManager.getAllPtzCameras();
    for (const cam of cameras) {
      if (cam.hasPtz) {
        this.publishCameraState(cam.entityId);
      }
    }
  }

  /**
   * Publishes Home Assistant MQTT Discovery topics so HA automatically creates:
   * 1. Sensor for PTZ State
   * 2. Select entity for Surveillance Zones (Presets 1..5)
   * 3. Switch entity for activating DPTZ surveillance mode
   */
  private publishHaDiscovery(entityId: string, info: CameraPtzInfo): void {
    if (!this.client || !this.client.connected) return;

    const safeId = entityId.replace(/\./g, "_");
    const device = {
      identifiers: [`matter_aio_${safeId}`],
      name: `${info.name} PTZ`,
      model: "Matter 1.6.1 PTZ Camera",
      manufacturer: "Matter All-in-One Chrisalvir",
    };

    // 1. PTZ State Sensor
    const sensorConfigTopic = `${this.discoveryPrefix}/sensor/${safeId}_ptz_state/config`;
    const sensorConfig = {
      name: `${info.name} Zona Activa`,
      state_topic: `${this.prefix}/camera/${safeId}/ptz/state`,
      value_template: "{{ value_json.current_zone_id }}",
      unique_id: `${safeId}_ptz_zone_sensor`,
      device,
      icon: "mdi:cctv",
    };
    this.client.publish(sensorConfigTopic, JSON.stringify(sensorConfig), { retain: true });

    // 2. Select entity for Zones
    const selectConfigTopic = `${this.discoveryPrefix}/select/${safeId}_ptz_zone_select/config`;
    const zoneOptions = info.zones.map((z) => `Zona ${z.id}: ${z.name}`);
    const selectConfig = {
      name: `${info.name} Selector de Zona`,
      command_topic: `${this.prefix}/camera/${safeId}/ptz/command`,
      command_template:
        '{"command": "set_zone_active", "zone_id": {{ value.split(":")[0].replace("Zona ", "") | int }}}',
      options: zoneOptions,
      unique_id: `${safeId}_ptz_zone_selector`,
      device,
      icon: "mdi:camera-control",
    };
    this.client.publish(selectConfigTopic, JSON.stringify(selectConfig), { retain: true });

    // 3. Switch entity for DPTZ Mode
    const switchConfigTopic = `${this.discoveryPrefix}/switch/${safeId}_dptz_mode/config`;
    const switchConfig = {
      name: `${info.name} Modo Vigilancia DPTZ`,
      command_topic: `${this.prefix}/camera/${safeId}/ptz/command`,
      state_topic: `${this.prefix}/camera/${safeId}/ptz/state`,
      value_template: "{{ 'ON' if value_json.has_ptz else 'OFF' }}",
      payload_on: '{"command": "set_zone_active", "zone_id": 1}',
      payload_off: '{"command": "move", "direction": "center"}',
      unique_id: `${safeId}_dptz_mode_switch`,
      device,
      icon: "mdi:shield-search",
    };
    this.client.publish(switchConfigTopic, JSON.stringify(switchConfig), { retain: true });
  }

  private async handleIncomingMessage(topic: string, payloadStr: string): Promise<void> {
    try {
      const match = topic.match(new RegExp(`^${this.prefix}/camera/([^/]+)/ptz/command$`));
      if (!match) return;

      const safeId = match[1];
      const entityId = safeId.replace(/_/g, ".");
      const cmd = JSON.parse(payloadStr);

      this.log.info?.(`[PTZ-MQTT] Command received for ${entityId}: ${payloadStr}`);

      switch (cmd.command) {
        case "move_to_preset": {
          const presetId = Number(cmd.preset_id || cmd.preset);
          if (presetId >= 1 && presetId <= MAX_PTZ_PRESETS) {
            await this.ptzManager.setActiveZone(entityId, presetId);
          }
          break;
        }
        case "set_zone_active": {
          const zoneId = Number(cmd.zone_id || cmd.zone);
          if (zoneId >= 1 && zoneId <= MAX_PTZ_PRESETS) {
            await this.ptzManager.setActiveZone(entityId, zoneId);
          }
          break;
        }
        case "move": {
          const dir = cmd.direction;
          if (["up", "down", "left", "right", "zoom_in", "zoom_out", "center"].includes(dir)) {
            await this.ptzManager.moveDirection(entityId, dir, cmd.step || 0.1);
          }
          break;
        }
        case "relative_move": {
          if (cmd.pan !== undefined || cmd.tilt !== undefined || cmd.zoom !== undefined) {
            const step = Math.abs(cmd.pan || cmd.tilt || 0.1);
            let dir: "up" | "down" | "left" | "right" = "right";
            if (cmd.pan > 0) dir = "right";
            else if (cmd.pan < 0) dir = "left";
            else if (cmd.tilt > 0) dir = "up";
            else if (cmd.tilt < 0) dir = "down";
            await this.ptzManager.moveDirection(entityId, dir, step);
          }
          break;
        }
        default:
          this.log.warn?.(`[PTZ-MQTT] Unknown command: ${cmd.command}`);
      }
    } catch (err: any) {
      this.log.error?.(`[PTZ-MQTT] Error handling incoming command on ${topic}: ${err.message || err}`);
    }
  }

  public disconnect(): void {
    if (this.client) {
      this.client.end(true);
      this.client = null;
    }
  }
}

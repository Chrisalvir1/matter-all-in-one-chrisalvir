import mqtt from "mqtt";
import { AnsiLogger } from "matterbridge/logger";

export interface MqttConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
}

export interface MqttDiscoveryEntry {
  topic: string;
  component: string;
  nodeId?: string;
  objectId?: string;
  config: any;
}

export function normalizeMqttDiscoveryConfig(rawConfig: any): any {
  if (!rawConfig || typeof rawConfig !== "object") return rawConfig;
  const config = { ...rawConfig };

  // 1. Expand ~ (base topic prefix in HA discovery)
  const baseTopic = config["~"];
  if (typeof baseTopic === "string") {
    for (const key of Object.keys(config)) {
      if (typeof config[key] === "string" && config[key].startsWith("~")) {
        config[key] = config[key].replace(/^~/, baseTopic);
      }
    }
  }

  // 2. Expand standard Home Assistant MQTT discovery abbreviations
  const abbreviations: Record<string, string> = {
    act_t: "action_topic",
    act_tpl: "action_template",
    atype: "automation_type",
    aux_cmd_t: "aux_command_topic",
    aux_stat_tpl: "aux_state_template",
    aux_stat_t: "aux_state_topic",
    avty_t: "availability_topic",
    avty_tpl: "availability_template",
    away_mode_cmd_t: "away_mode_command_topic",
    away_mode_stat_tpl: "away_mode_state_template",
    away_mode_stat_t: "away_mode_state_topic",
    b_tpl: "blue_template",
    bri_cmd_t: "brightness_command_topic",
    bri_scl: "brightness_scale",
    bri_stat_t: "brightness_state_topic",
    bri_tpl: "brightness_template",
    bri_val_tpl: "brightness_value_template",
    clr_temp_cmd_t: "color_temp_command_topic",
    clr_temp_stat_t: "color_temp_state_topic",
    clr_temp_tpl: "color_temp_template",
    clr_temp_val_tpl: "color_temp_value_template",
    cmd_off_tpl: "command_off_template",
    cmd_on_tpl: "command_on_template",
    cmd_t: "command_topic",
    cmd_tpl: "command_template",
    cod_arm_req: "code_arm_required",
    cod_dis_req: "code_disarm_required",
    curr_temp_t: "current_temperature_topic",
    curr_temp_tpl: "current_temperature_template",
    dev: "device",
    dev_cla: "device_class",
    dock_cmd_t: "dock_command_topic",
    e_val_t: "effect_value_template",
    evt_types: "event_types",
    fan_mode_cmd_t: "fan_mode_command_topic",
    fan_mode_stat_tpl: "fan_mode_state_template",
    fan_mode_stat_t: "fan_mode_state_topic",
    fx_cmd_t: "effect_command_topic",
    fx_list: "effect_list",
    fx_stat_t: "effect_state_topic",
    fx_tpl: "effect_template",
    fx_val_tpl: "effect_value_template",
    g_tpl: "green_template",
    hold_cmd_t: "hold_command_topic",
    hold_stat_tpl: "hold_state_template",
    hold_stat_t: "hold_state_topic",
    hs_cmd_t: "hs_command_topic",
    hs_stat_t: "hs_state_topic",
    ic: "icon",
    init: "initial",
    max: "max",
    min: "min",
    mode_cmd_t: "mode_command_topic",
    mode_stat_tpl: "mode_state_template",
    mode_stat_t: "mode_state_topic",
    modes: "modes",
    name: "name",
    opt: "optimistic",
    osc_cmd_t: "oscillation_command_topic",
    osc_stat_t: "oscillation_state_topic",
    pct_cmd_t: "percentage_command_topic",
    pct_stat_t: "percentage_state_topic",
    pl_arm_away: "payload_arm_away",
    pl_arm_home: "payload_arm_home",
    pl_arm_nite: "payload_arm_night",
    pl_avail: "payload_available",
    pl_cln_sp: "payload_clean_spot",
    pl_cls: "payload_close",
    pl_disarm: "payload_disarm",
    pl_hi_spd: "payload_high_speed",
    pl_lock: "payload_lock",
    pl_loc: "payload_locate",
    pl_med_spd: "payload_medium_speed",
    pl_not_avail: "payload_not_available",
    pl_off: "payload_off",
    pl_on: "payload_on",
    pl_open: "payload_open",
    pl_osc_off: "payload_oscillation_off",
    pl_osc_on: "payload_oscillation_on",
    pl_paus: "payload_pause",
    pl_stop: "payload_stop",
    pl_strt: "payload_start",
    pl_unlk: "payload_unlock",
    pos_clsd: "position_closed",
    pos_open: "position_open",
    pos_t: "position_topic",
    pos_val_tpl: "position_value_template",
    pow_cmd_t: "power_command_topic",
    pow_stat_t: "power_state_topic",
    pr_mode_cmd_t: "preset_mode_command_topic",
    pr_mode_stat_t: "preset_mode_state_topic",
    pr_mode_val_tpl: "preset_mode_value_template",
    r_tpl: "red_template",
    ret: "retain",
    rgb_cmd_t: "rgb_command_topic",
    rgb_stat_t: "rgb_state_topic",
    send_cmd_t: "send_command_topic",
    send_if_off: "send_if_off",
    set_pos_t: "set_position_topic",
    spd_cmd_t: "speed_command_topic",
    spd_stat_t: "speed_state_topic",
    stat_cla: "state_class",
    stat_closing: "state_closing",
    stat_off: "state_off",
    stat_on: "state_on",
    stat_open: "state_open",
    stat_opening: "state_opening",
    stat_stopped: "state_stopped",
    stat_t: "state_topic",
    stat_val_tpl: "state_value_template",
    sug_area: "suggested_area",
    temp_cmd_t: "temperature_command_topic",
    temp_hi_cmd_t: "temperature_high_command_topic",
    temp_hi_stat_t: "temperature_high_state_topic",
    temp_lo_cmd_t: "temperature_low_command_topic",
    temp_lo_stat_t: "temperature_low_state_topic",
    temp_stat_t: "temperature_state_topic",
    temp_unit: "temperature_unit",
    tilt_clsd_val: "tilt_closed_value",
    tilt_cmd_t: "tilt_command_topic",
    tilt_inv_stat: "tilt_invert_state",
    tilt_max: "tilt_max",
    tilt_min: "tilt_min",
    tilt_opnd_val: "tilt_opened_value",
    tilt_opt: "tilt_optimistic",
    tilt_status_t: "tilt_status_topic",
    uniq_id: "unique_id",
    unit_of_meas: "unit_of_measurement",
    val_tpl: "value_template",
    whit_val_cmd_t: "white_value_command_topic",
    xy_cmd_t: "xy_command_topic",
    xy_stat_t: "xy_state_topic",
  };

  for (const [abbr, full] of Object.entries(abbreviations)) {
    if (config[abbr] !== undefined && config[full] === undefined) {
      config[full] = config[abbr];
    }
  }

  // 3. Normalize device object abbreviations
  if (config.device && typeof config.device === "object") {
    const dev = { ...config.device };
    const devAbbr: Record<string, string> = {
      cns: "connections",
      ids: "identifiers",
      name: "name",
      mf: "manufacturer",
      mdl: "model",
      mdl_id: "model_id",
      sw: "sw_version",
      hw: "hw_version",
      sa: "suggested_area",
      cu: "configuration_url",
    };
    for (const [abbr, full] of Object.entries(devAbbr)) {
      if (dev[abbr] !== undefined && dev[full] === undefined) {
        dev[full] = dev[abbr];
      }
    }
    config.device = dev;
  }

  return config;
}

export class MqttClientManager {
  private client: mqtt.MqttClient | null = null;
  private log: AnsiLogger;

  // Mapping of discovery topic -> MqttDiscoveryEntry
  public discoveredDevices = new Map<string, MqttDiscoveryEntry>();
  // Mapping of state topic -> payload string
  public deviceStates = new Map<string, string>();

  private onDeviceDiscoveredCallback?: (entry: MqttDiscoveryEntry) => void;
  private onDeviceRemovedCallback?: (topic: string) => void;
  private onStateChangedCallback?: (topic: string, payload: string) => void;
  private onCameraUiMessageCallback?: (topic: string, payload: string) => void;

  constructor(
    log: AnsiLogger,
    private config: MqttConfig,
  ) {
    this.log = log;
  }

  public onDeviceDiscovered(callback: (entry: MqttDiscoveryEntry) => void) {
    this.onDeviceDiscoveredCallback = callback;
  }

  public onDeviceRemoved(callback: (topic: string) => void) {
    this.onDeviceRemovedCallback = callback;
  }

  public onStateChanged(
    callback: (topic: string, payload: string) => void,
  ) {
    this.onStateChangedCallback = callback;
  }

  public onCameraUiMessage(
    callback: (topic: string, payload: string) => void,
  ) {
    this.onCameraUiMessageCallback = callback;
  }

  public connect() {
    if (!this.config.host) return;

    const url = `mqtt://${this.config.host}:${this.config.port || 1883}`;
    this.log.info(`[MQTT] Connecting to broker at ${url}`);

    this.client = mqtt.connect(url, {
      username: this.config.user || undefined,
      password: this.config.password || undefined,
      reconnectPeriod: 5000,
    });

    this.client.on("connect", () => {
      this.log.notice(`[MQTT] Connected successfully to MQTT broker (${url})`);
      // Subscribe to Home Assistant Auto-Discovery prefixes and multi-broker wildcards
      const discoveryTopics = [
        "homeassistant/#",
        "ha/#",
        "+/+/config",
        "+/+/+/config",
        "+/+/+/+/config",
        "tasmota/discovery/#",
        "zigbee2mqtt/#",
      ];
      this.client?.subscribe(discoveryTopics, (err) => {
        if (err) this.log.error(`[MQTT] Subscription error: ${err}`);
        else
          this.log.info(
            `[MQTT] Subscribed to Auto-Discovery topics (${discoveryTopics.join(", ")})`,
          );
      });

      // Subscribe to Camera.UI native event topics, Omni AI, and Tapo motion topics
      this.client?.subscribe(
        [
          "camera.ui/#",
          "cameraui/#",
          "omni_ai_mac/#",
          "omni_ai/#",
          "tapo/#",
          "tapo_c120/#",
          "tapo-c120/#",
          "+/motion",
          "+/+/motion",
        ],
        (err) => {
          if (err) this.log.error(`[MQTT] Camera / AI topic subscription error: ${err}`);
          else
            this.log.info(
              "[MQTT] Subscribed to camera.ui/#, cameraui/#, omni_ai_mac/#, and tapo topics for camera & AI detection events",
            );
        },
      );
    });

    this.client.on("message", (topic, message) => {
      const payload = message.toString();

      // Auto-Discovery Topics format: homeassistant/<component>/[<node_id>/]<object_id>/config
      // or any topic ending with /config (e.g. zigbee2mqtt/friendly_name/config or ha/switch/x/config)
      const isDiscovery =
        topic.endsWith("/config") ||
        topic.startsWith("homeassistant/") ||
        topic.startsWith("ha/");

      if (isDiscovery && topic.endsWith("/config")) {
        const parts = topic.split("/");
        let component = "switch";
        let nodeId: string | undefined;
        let objectId = "device";

        if (parts.length >= 4) {
          component = parts[1];
          if (parts.length > 4) {
            nodeId = parts[2];
            objectId = parts.slice(3, parts.length - 1).join("_");
          } else {
            objectId = parts[2];
          }
        } else if (parts.length === 3) {
          component = parts[1];
          objectId = parts[1];
        }

        if (!payload || payload.trim() === "") {
          // Empty/retained delete
          this.discoveredDevices.delete(topic);
          this.log.debug(`[MQTT] Removed device config at ${topic}`);
          if (this.onDeviceRemovedCallback) {
            this.onDeviceRemovedCallback(topic);
          }
          return;
        }

        try {
          const rawConfig = JSON.parse(payload);
          const config = normalizeMqttDiscoveryConfig(rawConfig);

          if (config.component && typeof config.component === "string") {
            component = config.component;
          }

          const entry: MqttDiscoveryEntry = {
            topic,
            component,
            nodeId,
            objectId,
            config,
          };

          this.discoveredDevices.set(topic, entry);

          if (config.state_topic) {
            this.client?.subscribe(config.state_topic);
          }
          if (config.availability_topic) {
            this.client?.subscribe(config.availability_topic);
          }
          if (config.json_attributes_topic) {
            this.client?.subscribe(config.json_attributes_topic);
          }

          this.log.info(
            `[MQTT] Discovered ${component}: "${config.name || entry.objectId}" (topic: ${topic})`,
          );
          if (this.onDeviceDiscoveredCallback) {
            this.onDeviceDiscoveredCallback(entry);
          }
        } catch (e) {
          this.log.error(
            `[MQTT] Failed to parse JSON config payload at ${topic}: ${e}`,
          );
        }
      } else {
        // State or availability topic update
        this.deviceStates.set(topic, payload);
        if (
          topic.startsWith("camera.ui/") ||
          topic.startsWith("cameraui/") ||
          topic.startsWith("omni_ai_mac/") ||
          topic.startsWith("omni_ai/") ||
          topic.startsWith("tapo/") ||
          topic.startsWith("tapo_c120/") ||
          topic.startsWith("tapo-c120/") ||
          topic.endsWith("/motion") ||
          topic.endsWith("/movimiento") ||
          topic.includes("motion") ||
          topic === "camera.ui"
        ) {
          if (this.onCameraUiMessageCallback) {
            this.onCameraUiMessageCallback(topic, payload);
          }
        }
        if (this.onStateChangedCallback) {
          this.onStateChangedCallback(topic, payload);
        }
      }
    });

    this.client.on("error", (err) => {
      this.log.error(`[MQTT] Broker connection error: ${err.message || err}`);
    });
  }

  public publish(topic: string, message: string) {
    if (!this.client || !this.client.connected) {
      this.log.warn(
        `[MQTT] Cannot publish to ${topic}, client is not connected`,
      );
      return;
    }
    this.client.publish(topic, message, { qos: 1 }, (err) => {
      if (err) this.log.error(`[MQTT] Publish error on ${topic}: ${err}`);
      else this.log.debug(`[MQTT] Published to ${topic}: ${message}`);
    });
  }

  public disconnect() {
    if (this.client) {
      this.client.end(true);
      this.client = null;
      this.log.info("[MQTT] Disconnected from broker");
    }
  }
}

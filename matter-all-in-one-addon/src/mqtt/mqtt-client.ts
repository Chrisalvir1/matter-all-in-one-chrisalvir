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
      // Subscribe to Home Assistant Auto-Discovery prefix
      this.client?.subscribe("homeassistant/#", (err) => {
        if (err) this.log.error(`[MQTT] Subscription error: ${err}`);
        else
          this.log.info(
            "[MQTT] Subscribed to homeassistant/# for Auto-Discovery",
          );
      });

      // Subscribe to Camera.UI native event topics and Omni AI topics
      this.client?.subscribe(
        ["camera.ui/#", "cameraui/#", "omni_ai_mac/#", "omni_ai/#"],
        (err) => {
          if (err) this.log.error(`[MQTT] Camera / AI topic subscription error: ${err}`);
          else
            this.log.info(
              "[MQTT] Subscribed to camera.ui/#, cameraui/#, and omni_ai_mac/# for camera & AI detection events",
            );
        },
      );
    });

    this.client.on("message", (topic, message) => {
      const payload = message.toString();

      // Auto-Discovery Topics format: homeassistant/<component>/[<node_id>/]<object_id>/config
      if (topic.startsWith("homeassistant/") && topic.endsWith("/config")) {
        const parts = topic.split("/");
        const component = parts[1];

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
          const config = JSON.parse(payload);
          const entry: MqttDiscoveryEntry = {
            topic,
            component,
            nodeId: parts.length > 4 ? parts[2] : undefined,
            objectId: parts.length > 4 ? parts[3] : parts[2],
            config,
          };

          this.discoveredDevices.set(topic, entry);

          if (config.state_topic) {
            this.client?.subscribe(config.state_topic);
          }
          if (config.availability_topic) {
            this.client?.subscribe(config.availability_topic);
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

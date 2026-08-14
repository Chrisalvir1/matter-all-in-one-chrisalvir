import mqtt from 'mqtt';
import { AnsiLogger } from 'matterbridge/logger';

export interface MqttConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
}

export class MqttClientManager {
  private client: mqtt.MqttClient | null = null;
  private log: AnsiLogger;
  
  // Mapping of MQTT topic to discovery payload
  public discoveredDevices = new Map<string, any>();
  // Mapping of MQTT state topics to actual payload string
  public deviceStates = new Map<string, string>();
  
  private onDeviceDiscoveredCallback?: (payload: any) => void;
  private onStateChangedCallback?: (topic: string, state: string) => void;

  constructor(log: AnsiLogger, private config: MqttConfig) {
    this.log = log;
  }

  public onDeviceDiscovered(callback: (payload: any) => void) {
    this.onDeviceDiscoveredCallback = callback;
  }
  
  public onStateChanged(callback: (topic: string, state: string) => void) {
    this.onStateChangedCallback = callback;
  }

  public connect() {
    if (!this.config.host) return;

    const url = `mqtt://${this.config.host}:${this.config.port || 1883}`;
    this.log.info(`[MQTT] Connecting to broker at ${url}`);

    this.client = mqtt.connect(url, {
      username: this.config.user,
      password: this.config.password,
      reconnectPeriod: 5000,
    });

    this.client.on('connect', () => {
      this.log.notice('[MQTT] Connected to MQTT broker');
      // Subscribe to Home Assistant Auto-Discovery prefix
      this.client?.subscribe('homeassistant/#', (err) => {
        if (err) this.log.error(`[MQTT] Subscription error: ${err}`);
        else this.log.info('[MQTT] Subscribed to homeassistant/# for Auto-Discovery');
      });
    });

    this.client.on('message', (topic, message) => {
      const payload = message.toString();
      
      // Auto-Discovery Topics usually follow: homeassistant/component/node_id/object_id/config
      if (topic.startsWith('homeassistant/') && topic.endsWith('/config')) {
        if (!payload) {
          // Empty payload means delete device
          this.discoveredDevices.delete(topic);
          return;
        }
        
        try {
          const config = JSON.parse(payload);
          this.discoveredDevices.set(topic, config);
          
          if (config.state_topic) {
            this.client?.subscribe(config.state_topic);
          }
          
          this.log.debug(`[MQTT] Discovered device at ${topic}`);
          if (this.onDeviceDiscoveredCallback) {
            this.onDeviceDiscoveredCallback(config);
          }
        } catch (e) {
          this.log.error(`[MQTT] Failed to parse config payload at ${topic}: ${e}`);
        }
      } else {
        // Assume state topic update
        this.deviceStates.set(topic, payload);
        if (this.onStateChangedCallback) {
          this.onStateChangedCallback(topic, payload);
        }
      }
    });

    this.client.on('error', (err) => {
      this.log.error(`[MQTT] Broker error: ${err}`);
    });
  }

  public publish(topic: string, message: string) {
    if (!this.client || !this.client.connected) {
      this.log.warn(`[MQTT] Cannot publish to ${topic}, not connected`);
      return;
    }
    this.client.publish(topic, message, { qos: 1 });
  }

  public disconnect() {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.log.info('[MQTT] Disconnected from broker');
    }
  }
}

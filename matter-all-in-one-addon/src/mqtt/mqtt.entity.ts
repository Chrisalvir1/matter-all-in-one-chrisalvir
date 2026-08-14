import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
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
} from 'matterbridge/matter/clusters';
import { MatterbridgeOnOffServer, MatterbridgeDoorLockServer } from 'matterbridge/behaviors';
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
} from 'matterbridge';
import { HomeAssistantPlatform } from '../platform.js';
import { MqttClientManager, MqttDiscoveryEntry } from './mqtt-client.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

export function getMqttDeviceType(component: string, config: any): DeviceTypeDefinition {
  const deviceClass = config.device_class || '';
  
  if (component === 'light') {
    if (config.brightness || config.brightness_command_topic || config.brightness_state_topic) {
      return dimmableLight;
    }
    return onOffLight;
  }
  
  if (component === 'switch') {
    return onOffPlugInUnit;
  }
  
  if (component === 'fan') {
    return fan;
  }
  
  if (component === 'lock') {
    return doorLock;
  }
  
  if (component === 'cover') {
    return windowCovering;
  }
  
  if (component === 'binary_sensor') {
    if (['door', 'window', 'garage_door', 'opening'].includes(deviceClass)) {
      return contactSensor;
    }
    if (['motion', 'occupancy', 'presence'].includes(deviceClass)) {
      return occupancySensor;
    }
    return contactSensor;
  }
  
  if (component === 'sensor') {
    if (deviceClass === 'temperature') return temperatureSensor;
    if (deviceClass === 'humidity') return humiditySensor;
    if (deviceClass === 'illuminance') return lightSensor;
    if (deviceClass === 'pressure' || deviceClass === 'atmospheric_pressure') return pressureSensor;
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
  public deviceId: string;
  public deviceName: string;
  public manufacturer: string;
  public model: string;
  public areaName: string | null;
  public stateTopic: string;
  public commandTopic: string;
  public attributes: Record<string, any> = {};
  public currentState: string = 'unknown';

  constructor(
    private platform: HomeAssistantPlatform,
    private mqttManager: MqttClientManager,
    private entry: MqttDiscoveryEntry
  ) {
    this.config = entry.config;
    this.domain = entry.component;
    
    // Generate clean entityId e.g. mqtt.zigbee2mqtt_living_room_light
    const rawId = this.config.unique_id || `${entry.component}_${entry.objectId || entry.nodeId || 'device'}`;
    const cleanId = rawId.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    this.entityId = `mqtt.${cleanId}`;
    
    this.deviceType = getMqttDeviceType(this.domain, this.config);
    this.friendlyName = this.config.name || entry.objectId || this.entityId;
    
    const device = this.config.device || {};
    this.deviceId = (device.identifiers && device.identifiers[0]) ? `mqtt:${device.identifiers[0]}` : `mqtt:${rawId}`;
    this.deviceName = device.name || this.friendlyName;
    this.manufacturer = device.manufacturer || 'MQTT';
    this.model = device.model || device.model_id || 'MQTT Generic Accessory';
    this.areaName = device.suggested_area || null;
    
    this.stateTopic = this.config.state_topic || '';
    this.commandTopic = this.config.command_topic || '';
    
    // Set initial attributes
    this.attributes = {
      friendly_name: this.friendlyName,
      state_topic: this.stateTopic,
      command_topic: this.commandTopic,
      origin: 'mqtt',
      ...this.config,
    };
  }

  public getStateString(): string {
    return this.currentState;
  }

  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.friendlyName.substring(0, 32).trim();
    
    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll('.', '_'),
      mode: 'server',
    });
    
    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = rawName;
    this.endpoint.uniqueId = this.entityId.replaceAll('.', '_');
    this.endpoint.serialNumber = `MQTT-${this.entityId.replace('mqtt.', '')}`.substring(0, 32);
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = this.manufacturer.substring(0, 32);
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = this.model.substring(0, 32);
    
    this.endpoint.createDefaultBasicInformationClusterServer(
      rawName,
      this.endpoint.serialNumber,
      0xfff1,
      this.endpoint.vendorName,
      0x8000,
      this.endpoint.productName,
    );

    // Apply behaviors according to domain
    if (this.domain === 'switch' || this.domain === 'light' || this.domain === 'fan') {
      const isLight = this.domain === 'light';
      this.endpoint.behaviors.require(isLight ? MatterbridgeOnOffServer.with(OnOff.Feature.Lighting) : MatterbridgeOnOffServer.with());
      
      // Matter Command Handlers -> MQTT Publish
      this.endpoint.addCommandHandler('on', async () => {
        if (this.commandTopic) {
          const payload = this.config.payload_on !== undefined ? String(this.config.payload_on) : 'ON';
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });
      
      this.endpoint.addCommandHandler('off', async () => {
        if (this.commandTopic) {
          const payload = this.config.payload_off !== undefined ? String(this.config.payload_off) : 'OFF';
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });
      
      if (this.config.brightness_command_topic && this.deviceType === dimmableLight) {
        this.endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data?.request?.level ?? data?.level;
          if (typeof level === 'number') {
            const scale = this.config.brightness_scale || 255;
            const brightness = Math.round((level / 254) * scale);
            this.mqttManager.publish(this.config.brightness_command_topic, String(brightness));
          }
        });
      }
    } else if (this.domain === 'lock') {
      this.endpoint.behaviors.require(MatterbridgeDoorLockServer.with());
      
      this.endpoint.addCommandHandler('lockDoor', async () => {
        if (this.commandTopic) {
          const payload = this.config.payload_lock || 'LOCK';
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });
      
      this.endpoint.addCommandHandler('unlockDoor', async () => {
        if (this.commandTopic) {
          const payload = this.config.payload_unlock || 'UNLOCK';
          this.mqttManager.publish(this.commandTopic, payload);
          this.handleStateUpdate(payload);
        }
      });
    }

    return this.endpoint;
  }

  public adoptEndpoint(endpoint: MatterbridgeEndpoint) {
    this.endpoint = endpoint;
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
    if (!this.endpoint) return;

    try {
      // Try to parse JSON payload if state is JSON (e.g. Zigbee2MQTT {"state":"ON", "brightness": 254})
      let parsed: any = null;
      try {
        if (payload.startsWith('{') && payload.endsWith('}')) {
          parsed = JSON.parse(payload);
        }
      } catch {
        /* plain string */
      }

      if (this.domain === 'switch' || this.domain === 'light' || this.domain === 'fan') {
        let isOn = false;
        if (parsed && typeof parsed.state === 'string') {
          isOn = parsed.state.toUpperCase() === (this.config.payload_on || 'ON').toUpperCase();
        } else {
          isOn = payload.toUpperCase() === (this.config.payload_on || 'ON').toUpperCase() || payload === '1' || payload.toLowerCase() === 'true';
        }
        safeSetAttribute(this.endpoint, OnOff.Cluster.id, 'onOff', isOn, this.platform.log);

        if (parsed && typeof parsed.brightness === 'number' && this.endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
          const scale = this.config.brightness_scale || 255;
          const level = Math.round((parsed.brightness / scale) * 254);
          safeSetAttribute(this.endpoint, LevelControl.Cluster.id, 'currentLevel', level, this.platform.log);
        }
      } else if (this.domain === 'lock') {
        const isLocked = payload.toUpperCase() === (this.config.state_locked || 'LOCKED').toUpperCase();
        safeSetAttribute(this.endpoint, DoorLock.Cluster.id, 'lockState', isLocked ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked, this.platform.log);
      } else if (this.domain === 'binary_sensor') {
        const isOn = payload.toUpperCase() === (this.config.payload_on || 'ON').toUpperCase();
        if (this.deviceType === contactSensor) {
          safeSetAttribute(this.endpoint, BooleanState.Cluster.id, 'stateValue', !isOn, this.platform.log);
        } else if (this.deviceType === occupancySensor) {
          safeSetAttribute(this.endpoint, OccupancySensing.Cluster.id, 'occupancy', { occupied: isOn }, this.platform.log);
        }
      } else if (this.domain === 'sensor') {
        const val = parseFloat(parsed?.value ?? parsed?.temperature ?? parsed?.humidity ?? payload);
        if (!isNaN(val)) {
          if (this.deviceType === temperatureSensor) {
            safeSetAttribute(this.endpoint, TemperatureMeasurement.Cluster.id, 'measuredValue', Math.round(val * 100), this.platform.log);
          } else if (this.deviceType === humiditySensor) {
            safeSetAttribute(this.endpoint, RelativeHumidityMeasurement.Cluster.id, 'measuredValue', Math.round(val * 100), this.platform.log);
          }
        }
      }
    } catch (err) {
      this.platform.log.warn(`[MQTT] Error parsing state update for ${this.entityId}: ${err}`);
    }
  }
}

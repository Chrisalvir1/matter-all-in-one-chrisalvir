import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { OnOff, BooleanState, TemperatureMeasurement, RelativeHumidityMeasurement } from 'matterbridge/matter/clusters';
import { MatterbridgeOnOffServer } from 'matterbridge/behaviors';
import { HomeAssistantPlatform } from '../platform.js';
import { MqttClientManager } from './mqtt-client.js';

export class MqttEntity {
  public endpoint: MatterbridgeEndpoint;

  constructor(
    private platform: HomeAssistantPlatform,
    private mqttManager: MqttClientManager,
    private topic: string,
    private config: any,
    private deviceType: DeviceTypeDefinition
  ) {
    const id = config.unique_id || config.name || topic.split('/').pop() || 'mqtt_device';
    this.endpoint = new MatterbridgeEndpoint([deviceType], { id, mode: 'server' });
    this.endpoint.uniqueId = `mqtt:${id}`;
    
    // Vendor and model info
    const device = config.device || {};
    this.endpoint.vendorName = device.manufacturer || 'MQTT Device';
    this.endpoint.productName = device.model || config.name || 'MQTT Accessory';
    this.endpoint.serialNumber = id;
    
    // Apply behaviors based on config
    const component = topic.split('/')[1]; // e.g. homeassistant/light/...
    
    if (component === 'switch' || component === 'light') {
      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());
      
      // Handle commands from Matter
      this.endpoint.addCommandHandler('on', async () => {
        if (this.config.command_topic) {
          const payload = this.config.payload_on || 'ON';
          this.mqttManager.publish(this.config.command_topic, payload);
        }
      });
      
      this.endpoint.addCommandHandler('off', async () => {
        if (this.config.command_topic) {
          const payload = this.config.payload_off || 'OFF';
          this.mqttManager.publish(this.config.command_topic, payload);
        }
      });
    }

    // Subscribe to state updates via the MQTT Manager
    this.mqttManager.onStateChanged((changedTopic, state) => {
      if (changedTopic === this.config.state_topic) {
        this.handleStateChange(state);
      }
    });
  }

  private handleStateChange(state: string) {
    const component = this.topic.split('/')[1];
    
    if (component === 'switch' || component === 'light') {
      const isOn = state === (this.config.state_on || 'ON');
      this.endpoint.setAttribute(OnOff.Cluster.id, 'onOff', isOn, this.platform.log);
    }
  }
}

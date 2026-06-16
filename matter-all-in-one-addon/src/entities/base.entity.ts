/**
 * Base entity class for exposing Home Assistant entities to Matter.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { OnOff, LevelControl, ColorControl } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute } from '../utils/matter-attributes.js';

export class BaseEntity {
  public platform: HomeAssistantPlatform;
  public entityId: string;
  public state: HassState;
  public deviceType: DeviceTypeDefinition;
  public endpoint!: MatterbridgeEndpoint;

  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    this.platform = platform;
    this.entityId = state.entity_id;
    this.state = state;
    this.deviceType = deviceType;
  }

  /**
   * Determine which cluster IDs are needed based on entity domain and capabilities.
   */
  protected getRequiredClusterIds(): ClusterId[] {
    const [domain] = this.entityId.split('.');
    const clusters: ClusterId[] = [];

    if (domain === 'light' || domain === 'switch') {
      clusters.push(OnOff.id);
      if (this.state.attributes.brightness !== undefined) {
        clusters.push(LevelControl.id);
      }
      if (this.state.attributes.color_mode !== undefined) {
        clusters.push(ColorControl.id);
      }
    }

    return clusters;
  }

  /**
   * Create and register the MatterbridgeEndpoint.
   */
  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const name = this.state.attributes.friendly_name ?? this.entityId;

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replace('.', '_'),
      mode: undefined,
    });

    const [domain] = this.entityId.split('.');
    this.endpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
      name.substring(0, 32),
      this.entityId.replace('.', '_').substring(0, 32),
      0xfff1,
      'Home Assistant',
      domain.charAt(0).toUpperCase() + domain.slice(1)
    );

    const clusters = this.getRequiredClusterIds();
    if (clusters.length > 0) {
      this.endpoint.addClusterServers(clusters);
    }
    this.endpoint.addRequiredClusterServers();

    this.registerCommandHandlers();
    this.syncInitialState();

    return this.endpoint;
  }

  /**
   * Setup command handlers from Matter to Home Assistant.
   */
  protected registerCommandHandlers() {
    const [domain] = this.entityId.split('.');

    if (domain === 'light' || domain === 'switch') {
      // On/Off handlers
      this.endpoint.addCommandHandler('on', async () => {
        this.platform.log.debug(`Matter On commanded for ${this.entityId}`);
        await this.platform.ha.callService(domain, 'turn_on', this.entityId);
      });

      this.endpoint.addCommandHandler('off', async () => {
        this.platform.log.debug(`Matter Off commanded for ${this.entityId}`);
        await this.platform.ha.callService(domain, 'turn_off', this.entityId);
      });

      // LevelControl handlers (brightness)
      if (this.endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
        this.endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data.level; // 0..254
          const haBrightness = Math.round((level / 254) * 255);
          this.platform.log.debug(`Matter MoveToLevel commanded for ${this.entityId}: level=${level} -> HA brightness=${haBrightness}`);
          await this.platform.ha.callService(domain, 'turn_on', this.entityId, {
            brightness: haBrightness,
          });
        });

        this.endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
          const level = data.level;
          const haBrightness = Math.round((level / 254) * 255);
          this.platform.log.debug(`Matter MoveToLevelWithOnOff commanded for ${this.entityId}: level=${level} -> HA brightness=${haBrightness}`);
          if (level === 0) {
            await this.platform.ha.callService(domain, 'turn_off', this.entityId);
          } else {
            await this.platform.ha.callService(domain, 'turn_on', this.entityId, {
              brightness: haBrightness,
            });
          }
        });
      }
    }
  }

  /**
   * Set initial attribute values based on current Home Assistant state.
   */
  protected syncInitialState() {
    this.updateState(this.state);
  }

  /**
   * Sync a new Home Assistant state update to the Matter endpoint.
   */
  public updateState(newState: HassState) {
    this.state = newState;
    const [domain] = this.entityId.split('.');

    if (domain === 'light' || domain === 'switch') {
      const isOn = newState.state === 'on';
      safeSetAttribute(this.endpoint, OnOff.id, 'onOff', isOn);

      if (newState.attributes.brightness !== undefined) {
        const level = Math.round((newState.attributes.brightness / 255) * 254);
        safeSetAttribute(this.endpoint, LevelControl.id, 'currentLevel', level);
      }
    }
  }
}

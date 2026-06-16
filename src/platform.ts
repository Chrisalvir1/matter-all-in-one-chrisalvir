/**
 * Core platform class for matter-all-in-one-chrisalvir.
 */
import {
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  PlatformConfig,
  PlatformMatterbridge,
} from 'matterbridge';
import { AnsiLogger, CYAN, db, idn, nf, rs } from 'matterbridge/logger';
import { HomeAssistant } from './homeAssistant.js';
import { HassState } from './utils/ha-state.js';
import { getDeviceTypeForEntity } from './device-registry.js';
import { BaseEntity } from './entities/base.entity.js';
import { ClosureEntity } from './entities/closure.entity.js';
import { CameraEntity } from './entities/camera.entity.js';
import { SoilEntity } from './entities/soil.entity.js';

export interface HomeAssistantPlatformConfig extends PlatformConfig {
  host: string;
  token: string;
  includeEntities?: string[];
  excludeEntities?: string[];
}

export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  public ha!: HomeAssistant;
  public entities = new Map<string, BaseEntity>();
  public matterbridgeDevices = new Map<string, MatterbridgeEndpoint>();

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: HomeAssistantPlatformConfig
  ) {
    super(matterbridge, log, config);
    this.log.info(`Initializing ${CYAN}${this.config.name}${nf} platform...`);

    if (!config.host || !config.token) {
      throw new Error('Host and Token must be configured for Home Assistant connection.');
    }

    // Initialize the Home Assistant connection manager
    this.ha = new HomeAssistant(
      config.host,
      config.token,
      60, // reconnectTimeout
      10, // reconnectRetries
      '', // certificatePath
      true // rejectUnauthorized
    );

    // Register events from HA WebSocket Client
    this.ha.on('connected', (version) => {
      this.log.notice(`Connected to Home Assistant ${version}`);
      void this.discoverAndSync();
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
    });

    this.ha.on('event', (deviceId, entityId, oldState, newState) => {
      if (newState) {
        this.handleEntityStateChange(entityId, newState);
      }
    });
  }

  /**
   * Called when the platform starts.
   */
  override async onStart(reason?: string) {
    this.log.info(`Starting HomeAssistant platform: ${reason ?? ''}`);
    try {
      await this.ha.connect();
    } catch (err) {
      this.log.error(`Failed to connect to Home Assistant: ${err}`);
    }
  }

  /**
   * Called when the platform shuts down.
   */
  override async onShutdown(reason?: string) {
    this.log.warn(`Shutting down platform: ${reason ?? ''}`);
    await this.ha.disconnect();
  }

  /**
   * Discover entities from Home Assistant and sync them to Matter.
   */
  private async discoverAndSync() {
    this.log.info('Fetching data for entity discovery...');
    try {
      await this.ha.fetchData();
      await this.ha.subscribe();

      const states = Array.from(this.ha.hassStates.values());
      this.log.info(`Fetched ${states.length} entity states. Registering matching devices...`);

      for (const hassState of states) {
        await this.registerHAEntity(hassState);
      }
    } catch (err) {
      this.log.error(`Discovery error: ${err}`);
    }
  }

  /**
   * Handle entity discovery and mapping to Matter endpoints.
   */
  private async registerHAEntity(state: HassState) {
    const entityId = state.entity_id;
    const [domain] = entityId.split('.');

    // Filtering rules
    if (this.config.excludeEntities?.includes(entityId)) return;
    if (this.config.includeEntities && !this.config.includeEntities.includes(entityId)) return;

    // Retrieve corresponding Matter Device Type
    const deviceClass = state.attributes.device_class;
    const deviceType = getDeviceTypeForEntity(domain, deviceClass);

    this.log.debug(`Mapping ${entityId} to Matter device type ${deviceType.name} (0x${deviceType.code.toString(16)})`);

    let entityInstance: BaseEntity | null = null;

    // Instantiation based on mapped device type
    if (domain === 'cover' && ['garage_door', 'gate', 'blind', 'shade', 'curtain', 'awning'].includes(deviceClass ?? '')) {
      entityInstance = new ClosureEntity(this, state, deviceType);
    } else if (domain === 'camera') {
      entityInstance = new CameraEntity(this, state, deviceType);
    } else if (domain === 'sensor' && deviceClass === 'moisture') {
      entityInstance = new SoilEntity(this, state, deviceType);
    } else {
      // General base fallback or standard converters will wrap this
      entityInstance = new BaseEntity(this, state, deviceType);
    }

    try {
      const endpoint = await entityInstance.createEndpoint();
      if (endpoint) {
        await this.registerDevice(endpoint);
        this.entities.set(entityId, entityInstance);
        this.matterbridgeDevices.set(entityId, endpoint);
        this.log.info(`Successfully registered device ${idn}${entityId}${rs} as Matter endpoint.`);
      }
    } catch (err) {
      this.log.error(`Failed to register entity ${entityId}: ${err}`);
    }
  }

  /**
   * Real-time state synchronization from HA to Matter.
   */
  private handleEntityStateChange(entityId: string, newState: HassState) {
    const entity = this.entities.get(entityId);
    if (entity) {
      this.log.debug(`Syncing state update for ${entityId} to Matter.`);
      entity.updateState(newState);
    }
  }
}

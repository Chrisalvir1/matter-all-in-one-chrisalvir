/**
 * Core platform class for matter-all-in-one-chrisalvir.
 */
import './utils/log-buffer.js';
import { getLogs, clearLogs } from './utils/log-buffer.js';
import {
  MatterbridgeDynamicPlatform,
  MatterbridgeEndpoint,
  PlatformConfig,
  PlatformMatterbridge,
} from 'matterbridge';
import { AnsiLogger, CYAN, idn, nf, rs } from 'matterbridge/logger';
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { HomeAssistant } from './homeAssistant.js';
import { HassState, isUnavailable } from './utils/ha-state.js';
import { discoverHassUrl, toWsUrl } from './utils/ha-discovery.js';
import { getDeviceTypeForEntity, MatterDeviceTypes } from './device-registry.js';
import { BaseEntity } from './entities/base.entity.js';
import { ClosureEntity } from './entities/closure.entity.js';
import { CameraEntity } from './entities/camera.entity.js';
import { SoilSensorEntity } from './entities/soil_sensor.entity.js';
import { EnergyTariffEntity } from './entities/energy_tariff.entity.js';
import { VacuumEntity } from './entities/vacuum.entity.js';
import { PetFeederEntity } from './entities/pet_feeder.entity.js';
import { HumidifierEntity } from './entities/humidifier.entity.js';
import { OvenEntity } from './entities/oven.entity.js';
import { CooktopEntity } from './entities/cooktop.entity.js';
import { MediaPlayerEntity } from './entities/media-player.entity.js';
import { getDefaultExportProfileId, getExportProfile, getExportProfiles } from './device-profiles.js';


export interface HomeAssistantPlatformConfig extends PlatformConfig {
  host?: string;       // Optional: auto-detected from network/supervisor if not set
  token?: string;      // Optional: not required when running as HA add-on (SUPERVISOR_TOKEN) or with trust-local mode
  includeEntities?: string[];
  excludeEntities?: string[];
}

export class HomeAssistantPlatform extends MatterbridgeDynamicPlatform {
  public ha!: HomeAssistant;
  public entities = new Map<string, BaseEntity>();
  public matterbridgeDevices = new Map<string, MatterbridgeEndpoint>();
  public deviceOverrides: Record<string, string> = {};
  private uiServer?: http.Server;
  private packageVersion?: string;
  /** Raw host from config (may be undefined — triggers network auto-discovery) */
  private _configHost?: string;
  /** Resolved token (may be empty string for trust-local / supervisor mode) */
  private _configToken: string = '';

  /** Set of entity IDs that the user has explicitly requested to export as accessories */
  public exportedDevices: Set<string> = new Set();
  /**
   * HA can emit several state_changed events for the same entity in a single
   * tick.  Coalescing those events keeps Matter attribute transactions from
   * piling up behind slow controller subscriptions.
   */
  private readonly pendingStateUpdates = new Map<string, HassState>();
  private stateUpdateFlushScheduled = false;
  private syncInFlight?: Promise<void>;

  private getHaRegistryInfo(entityId: string) {
    const entityRegistry = (this.ha as any).hassEntities?.get(entityId);
    const deviceId = entityRegistry?.device_id ?? null;
    const deviceRegistry = deviceId ? (this.ha as any).hassDevices?.get(deviceId) : undefined;
    const areaId = entityRegistry?.area_id ?? deviceRegistry?.area_id ?? null;
    const areaRegistry = areaId ? (this.ha as any).hassAreas?.get(areaId) : undefined;
    const deviceName =
      deviceRegistry?.name_by_user ||
      deviceRegistry?.name ||
      entityRegistry?.name ||
      entityRegistry?.original_name ||
      null;

    return {
      device_id: deviceId,
      device_name: deviceName,
      area_id: areaId,
      area_name: areaRegistry?.name ?? null,
      manufacturer: deviceRegistry?.manufacturer ?? null,
      model: deviceRegistry?.model ?? deviceRegistry?.model_id ?? null,
      entity_registry_id: entityRegistry?.id ?? null,
      platform: entityRegistry?.platform ?? null,
    };
  }

  private getPrimaryEntityId(entityId: string): string | undefined {
    const deviceId = this.ha.hassEntities.get(entityId)?.device_id;
    if (!deviceId) return undefined;
    const priority = ['vacuum', 'media_player', 'climate', 'lock', 'cover', 'light', 'switch', 'fan', 'humidifier'];
    const candidates = Array.from(this.entities.values())
      .filter((entity) => this.ha.hassEntities.get(entity.entityId)?.device_id === deviceId)
      .sort((left, right) => priority.indexOf(left.entityId.split('.')[0]) - priority.indexOf(right.entityId.split('.')[0]));
    return candidates.find((entity) => priority.includes(entity.entityId.split('.')[0]))?.entityId;
  }

  private isAuxiliaryEntity(entityId: string): boolean {
    const [domain] = entityId.split('.');
    if (domain !== 'button') return false;
    const primary = this.getPrimaryEntityId(entityId);
    return primary !== undefined && primary !== entityId;
  }

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: HomeAssistantPlatformConfig
  ) {
    super(matterbridge, log, config);
    this.log.info(`Initializing ${CYAN}${this.config.name}${nf} platform...`);

    // ── Token / Auth resolution ─────────────────────────────────────────────
    // Priority: config.token → SUPERVISOR_TOKEN env (HA OS add-on) → empty
    // An empty token works when:
    //   a) Running as HA add-on (supervisor grants access automatically), OR
    //   b) HA has trusted_networks configured for this host's subnet.
    const token = config.token || process.env.SUPERVISOR_TOKEN || '';

    // ── Host resolution: deferred to onStart() for async network scan ───────
    // We need to await discoverHassUrl() which probes the network, so we store
    // the raw config values here and complete the HA instance init in onStart().
    this._configHost = config.host;
    this._configToken = token;

    this.log.info(`Platform initialised — host will be resolved on start.`);
  }

  /** Register event listeners on the HA client instance — call once. */
  private setupHaListeners() {
    this.ha.on('connected', (version) => {
      this.log.notice(`Connected to Home Assistant ${version}`);
      void this.discoverAndSync();
    });

    this.ha.on('disconnected', () => {
      this.log.warn('Disconnected from Home Assistant');
    });

    this.ha.on('error', (err) => {
      this.log.error(`Home Assistant connection error: ${err}`);
    });

    this.ha.on('event', (_deviceId, entityId, _oldState, newState) => {
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
    this.startUiServer();

    // ── Resolve Home Assistant URL ─────────────────────────────────────────
    // If the user didn’t set config.host we run the network discovery:
    //   1. Probe well-known hostnames (homeassistant.local, supervisor...)
    //   2. Scan local LAN subnets for port 8123
    let rawHost = this._configHost;
    if (!rawHost) {
      this.log.info('No host configured — auto-discovering Home Assistant on the network...');
      const discovered = await discoverHassUrl((msg) => this.log.debug(msg));
      if (discovered) {
        rawHost = discovered;
        this.log.notice(`Auto-discovered Home Assistant at ${CYAN}${rawHost}${nf}`);
      } else {
        this.log.error(
          'Could not find Home Assistant on the network. ' +
          'Set the "host" field in the plugin config (e.g. http://192.168.1.100:8123) and restart.'
        );
        return;
      }
    }

    // Normalise to ws:// / wss:// for the WebSocket client
    const wsHost = toWsUrl(rawHost);
    this.log.info(`Connecting to Home Assistant at ${CYAN}${wsHost}${nf} (token: ${this._configToken ? 'provided' : 'none / trust-local'})`);

    // Create the HA client with the resolved URL
    this.ha = new HomeAssistant(
      wsHost,
      this._configToken,
      3,
      0, // Retry forever. HA restarts and DHCP renewals must not require a plugin restart.
      undefined,
      false,
    );

    this.setupHaListeners();
    // ──────────────────────────────────────────────────────────────

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
    if (this.uiServer) {
      this.uiServer.close();
      this.log.info('Custom UI Server stopped.');
    }
    await this.ha?.close();
  }

  /**
   * Discover entities from Home Assistant and sync them to Matter.
   */
  private async discoverAndSync() {
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = this.performDiscoverAndSync().finally(() => {
      this.syncInFlight = undefined;
    });
    return this.syncInFlight;
  }

  private async performDiscoverAndSync() {
    this.log.info('Fetching data for entity discovery...');
    try {
      await this.ha.fetchData();
      // Subscribing to every HA event is extremely noisy (automations,
      // recorder, service calls, etc.) and can starve Matter subscriptions.
      // State changes are the only realtime stream this bridge needs.
      await this.ha.subscribe('state_changed');

      // Load device overrides
      try {
        const raw = await fs.readFile('/data/device-overrides.json', 'utf8');
        this.deviceOverrides = JSON.parse(raw);
        this.log.info(`Loaded ${Object.keys(this.deviceOverrides).length} device overrides.`);
      } catch {
        this.log.info('No device-overrides.json found, starting fresh.');
      }

      // Load exported devices for Accessory Mode
      try {
        const rawExported = await fs.readFile('/data/exported-devices.json', 'utf8');
        const exportedList = JSON.parse(rawExported);
        if (Array.isArray(exportedList)) {
          this.exportedDevices = new Set(exportedList);
        }
        this.log.info(`Loaded ${this.exportedDevices.size} manually exported devices.`);
      } catch {
        this.log.info('No exported-devices.json found. No accessories will be started automatically.');
      }

      const states = Array.from(this.ha.hassStates.values());
      this.log.info(`Fetched ${states.length} entity states. Registering matching devices...`);

      for (const hassState of states) await this.registerHAEntity(hassState);
    } catch (err) {
      this.log.error(`Discovery error: ${err}`);
    }
  }

  /**
   * Handle entity discovery and mapping to Matter endpoints.
   */
  private async registerHAEntity(state: HassState) {
    const entityId = state.entity_id;

    // Idempotency guard: discovery objects are retained for the UI, but an
    // endpoint is only allocated when the user explicitly exports it.
    if (this.entities.has(entityId)) {
      const entity = this.entities.get(entityId)!;
      entity.state = state;
      if (this.exportedDevices.has(entityId)) this.queueStateUpdate(entityId, state);
      return;
    }

    // Skip unavailable / unknown entities
    if (isUnavailable(state)) {
      this.log.debug(`Skipping ${entityId} because it is unavailable/unknown.`);
      return;
    }

    const [domain] = entityId.split('.');

    // Filtering rules: Whitelist
    const allowedDomains = ['light', 'switch', 'cover', 'lock', 'climate', 'fan', 'sensor', 'binary_sensor', 'vacuum', 'alarm_control_panel', 'water_heater', 'button', 'media_player', 'camera', 'humidifier'];
    if (!allowedDomains.includes(domain)) return;

    // Strict device_class whitelist for sensors to avoid exporting system/energy sensors
    const deviceClass = state.attributes.device_class;
    if (domain === 'sensor' && !['temperature', 'humidity', 'illuminance', 'moisture', 'pressure', 'flow', 'monetary'].includes(deviceClass ?? '')) return;
    if (domain === 'binary_sensor' && !['door', 'window', 'opening', 'motion', 'occupancy', 'contact', 'smoke', 'co'].includes(deviceClass ?? '')) return;

    if (this.config.excludeEntities?.includes(entityId)) return;
    if (this.config.includeEntities && !this.config.includeEntities.includes(entityId)) return;

    // Check device override
    const override = this.deviceOverrides[entityId];
    const effectiveProfile = override ?? getDefaultExportProfileId(domain);
    if (override === '_DISABLED_') {
      this.log.debug(`Skipping ${entityId} because it is disabled by override.`);
      return;
    }

    // Retrieve corresponding Matter Device Type
    let deviceType = getDeviceTypeForEntity(domain, deviceClass);
    if (override && (MatterDeviceTypes as any)[override]) {
      deviceType = (MatterDeviceTypes as any)[override];
      this.log.info(`Applying override for ${entityId}: ${deviceType.name}`);
    }

    this.log.debug(`Mapping ${entityId} to Matter device type ${deviceType.name} (0x${deviceType.code.toString(16)})`);

    let entityInstance: BaseEntity;

    // Instantiation based on mapped device type
    if (domain === 'cover' && ['garage_door', 'gate', 'blind', 'shade', 'curtain', 'awning'].includes(deviceClass ?? '')) {
      entityInstance = new ClosureEntity(this, state, deviceType);
    } else if (domain === 'camera') {
      entityInstance = new CameraEntity(this, state, deviceType);
    } else if (domain === 'sensor' && deviceClass === 'moisture') {
      entityInstance = new SoilSensorEntity(this, state, deviceType);
    } else if (domain === 'sensor' && deviceClass === 'monetary') {
      entityInstance = new EnergyTariffEntity(this, state, deviceType);
    } else if (domain === 'vacuum') {
      entityInstance = new VacuumEntity(this, state, deviceType);
    } else if (domain === 'humidifier') {
      entityInstance = new HumidifierEntity(this, state, deviceType);
    } else if (domain === 'media_player' && effectiveProfile === 'basicVideoPlayer') {
      entityInstance = new MediaPlayerEntity(this, state, deviceType);
    } else if (override === 'PetFeeder') {
      entityInstance = new PetFeederEntity(this, state, deviceType);
    } else if (override === 'Oven' || deviceType.name === 'Oven') {
      entityInstance = new OvenEntity(this, state, deviceType);
    } else if (override === 'Cooktop' || deviceType.name === 'Cooktop') {
      entityInstance = new CooktopEntity(this, state, deviceType);
    } else {
      // General base fallback or standard converters will wrap this
      entityInstance = new BaseEntity(this, state, deviceType);
    }

    this.entities.set(entityId, entityInstance);
    if (!this.exportedDevices.has(entityId)) {
      this.log.debug(`Entity ${entityId} is discovered but not exported. Endpoint creation deferred.`);
      return;
    }

    await this.activateEntity(entityId);
  }

  /** Create a bridged endpoint and let Matterbridge own its lifecycle. */
  private async activateEntity(entityId: string): Promise<void> {
    if (this.matterbridgeDevices.has(entityId)) return;
    const entity = this.entities.get(entityId);
    if (!entity) throw new Error(`Entity ${entityId} was not discovered.`);

    try {
      const endpoint = await entity.createEndpoint();
      await this.registerDevice(endpoint);
      this.matterbridgeDevices.set(entityId, endpoint);
      await entity.syncInitialState();
      this.log.notice(`Exported bridged endpoint ${idn}${entityId}${rs}`);
    } catch (err) {
      this.log.error(`Failed to activate entity ${entityId}: ${err}`);
      throw err;
    }
  }

  /**
   * Manually export an entity as an Accessory and save to config.
   */
  public async manualRegister(entityId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.entities.has(entityId)) {
      return { success: false, error: 'Device not found in discovery.' };
    }
    if (this.isAuxiliaryEntity(entityId)) {
      return { success: false, error: 'This is an auxiliary action of the main device and cannot be exported independently.' };
    }
    try {
      this.exportedDevices.add(entityId);
      await this.activateEntity(entityId);
      await this.saveExportedDevices();
      this.log.notice(`Manually exported bridged endpoint for ${entityId}`);
      return { success: true };
    } catch (err) {
      this.exportedDevices.delete(entityId);
      this.log.error(`Failed to manually register ${entityId}: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Manually unregister an Accessory and save to config.
   */
  public async manualUnregister(entityId: string): Promise<{ success: boolean; error?: string }> {
    try {
      this.exportedDevices.delete(entityId);
      const endpoint = this.matterbridgeDevices.get(entityId);
      if (endpoint) {
        await this.unregisterDevice(endpoint);
        this.matterbridgeDevices.delete(entityId);
      }
      await this.saveExportedDevices();
      this.log.notice(`Removed bridged endpoint for ${entityId}`);
      return { success: true };
    } catch (err) {
      this.log.error(`Failed to manually unregister ${entityId}: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  private async saveExportedDevices() {
    try {
      await fs.writeFile('/data/exported-devices.json', JSON.stringify(Array.from(this.exportedDevices)), 'utf8');
    } catch (err) {
      this.log.error(`Failed to save exported-devices.json: ${err}`);
    }
  }

  private async saveDeviceOverrides() {
    await fs.writeFile('/data/device-overrides.json', JSON.stringify(this.deviceOverrides, null, 2), 'utf8');
  }

  public async setDeviceProfile(entityId: string, profileId: string): Promise<{ success: boolean; error?: string }> {
    const entity = this.entities.get(entityId);
    if (!entity) return { success: false, error: 'Device not found in discovery.' };
    const [domain] = entityId.split('.');
    if (!getExportProfile(domain, profileId) || !(MatterDeviceTypes as any)[profileId]) {
      return { success: false, error: 'The selected Matter profile is not valid for this entity.' };
    }
    if (this.isAuxiliaryEntity(entityId)) {
      return { success: false, error: 'Auxiliary actions inherit the profile of their main device.' };
    }

    try {
      const wasExported = this.exportedDevices.has(entityId);
      const state = entity.state;
      if (wasExported) await this.manualUnregister(entityId);
      this.deviceOverrides[entityId] = profileId;
      await this.saveDeviceOverrides();
      this.entities.delete(entityId);
      this.matterbridgeDevices.delete(entityId);
      await this.registerHAEntity(state);
      if (wasExported) await this.manualRegister(entityId);
      return { success: true };
    } catch (error) {
      this.log.error(`Failed to update Matter profile for ${entityId}: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Real-time state synchronization from HA to Matter.
   */
  private handleEntityStateChange(entityId: string, newState: HassState) {
    const entity = this.entities.get(entityId);
    if (!entity) {
      // An entity may become available after HA's initial snapshot.
      void this.registerHAEntity(newState);
      return;
    }
    entity.state = newState;
    if (this.exportedDevices.has(entityId)) this.queueStateUpdate(entityId, newState);
  }

  private queueStateUpdate(entityId: string, state: HassState) {
    this.pendingStateUpdates.set(entityId, state);
    if (this.stateUpdateFlushScheduled) return;
    this.stateUpdateFlushScheduled = true;
    setImmediate(() => void this.flushStateUpdates());
  }

  private async flushStateUpdates() {
    this.stateUpdateFlushScheduled = false;
    const updates = [...this.pendingStateUpdates.entries()];
    this.pendingStateUpdates.clear();
    await Promise.allSettled(
      updates.map(async ([entityId, state]) => {
        const entity = this.entities.get(entityId);
        if (entity && this.exportedDevices.has(entityId)) await entity.updateState(state);
      }),
    );
    if (this.pendingStateUpdates.size && !this.stateUpdateFlushScheduled) {
      this.stateUpdateFlushScheduled = true;
      setImmediate(() => void this.flushStateUpdates());
    }
  }

  /**
   * Start custom HTTP server on port 8285 for Liquid Glass UI.
   */
  private startUiServer() {
    const server = http.createServer(async (req, res) => {
      const urlObj = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);

      // If requested at the base Ingress URL without a trailing slash,
      // redirect to the same URL with a trailing slash.
      // This is crucial so that browser relative links (like "./style.css")
      // resolve correctly under the Ingress path.
      const redirectRegex = /^\/api\/hassio_ingress\/[^/]+$/;
      if (redirectRegex.test(urlObj.pathname)) {
        res.writeHead(301, { Location: `${urlObj.pathname}/` });
        res.end();
        return;
      }

      let pathname = urlObj.pathname;

      // Extract and strip Ingress path prefix if present
      const ingressPath = req.headers['x-ingress-path'];
      if (typeof ingressPath === 'string' && ingressPath && pathname.startsWith(ingressPath)) {
        pathname = pathname.substring(ingressPath.length);
      } else {
        const ingressRegex = /^\/api\/hassio_ingress\/[^/]+/;
        const match = pathname.match(ingressRegex);
        if (match) {
          pathname = pathname.substring(match[0].length);
        }
      }

      if (pathname === '' || pathname === '//') {
        pathname = '/';
      }

      this.log.debug(`[UI Server] ${req.method} ${pathname} (raw: ${urlObj.pathname})`);

      try {
        if (req.method === 'GET' && pathname === '/') {
          const content = await this.readFrontendFile('index.html');
          if (content) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
          return;
        }

        if (req.method === 'GET' && pathname === '/style.css') {
          const content = await this.readFrontendFile('style.css');
          if (content) {
            res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
          return;
        }

        if (req.method === 'GET' && pathname === '/script.js') {
          const content = await this.readFrontendFile('script.js');
          if (content) {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
          return;
        }

        if (req.method === 'GET' && pathname === '/qrcode.min.js') {
          const content = await this.readFrontendFile('qrcode.min.js');
          if (content) {
            res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
            res.end(content);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
          return;
        }

        if (req.method === 'GET' && pathname === '/api/custom/logs') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ logs: getLogs() }));
          return;
        }

        if (req.method === 'POST' && pathname === '/api/custom/logs/clear') {
          clearLogs();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (req.method === 'GET' && pathname === '/api/custom/status') {
          const version = await this.getPackageVersion();
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            status: this.ha.connected ? 'operativo' : 'reconectando',
            version,
            matterbridgeVersion: this.matterbridge.matterbridgeVersion,
            bridgeMode: this.matterbridge.bridgeMode,
            // Pairing is managed by Matterbridge's official frontend.  The
            // plugin deliberately does not scrape private Matterbridge state.
            qrPairingCode: '',
            manualPairingCode: '',
            commissioned: false,
            pairedFabrics: [],
            systemInfo: {
              os: 'Linux',
              nodeVersion: process.version,
              uptime: `${Math.floor(process.uptime())}s`,
              cpu: '—',
              memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB`
            },
            haStatus: this.ha.connected ? 'conectado' : 'desconectado'
          }));
          return;
        }

        if (req.method === 'GET' && pathname === '/api/custom/devices') {
          const result = Array.from(this.entities.values()).map(e => {
            const [domain] = e.entityId.split('.');
            const endpoint = this.matterbridgeDevices.get(e.entityId) as any;

            return {
              entityId: e.entityId, // Frontend expects entityId
              domain: domain,       // Frontend expects domain
              state: e.state.state,
              attributes: e.state.attributes,
              deviceTypeLabel: (e.constructor as any).matterTypeLabel || 'Generic',
              matterType: e.deviceType.name,
              // Registry info
              ...this.getHaRegistryInfo(e.entityId),
              // Accessory status
              exported: this.exportedDevices.has(e.entityId),
              auxiliary: this.isAuxiliaryEntity(e.entityId),
              primaryEntityId: this.getPrimaryEntityId(e.entityId) ?? null,
              profileId: this.deviceOverrides[e.entityId] ?? getDefaultExportProfileId(domain) ?? null,
              profiles: getExportProfiles(domain),
              pairingCode: endpoint?.qrPairingCode ?? null,
              manualPairingCode: endpoint?.manualPairingCode ?? null,
              commissioned: endpoint?.serverNode?.isCommissioned?.() ?? endpoint?.commissioned ?? false,
              fabric: null,
            };
          });
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/register/:entityId
        if (req.method === 'POST' && pathname.startsWith('/api/custom/register/')) {
          const entityId = decodeURIComponent(pathname.substring('/api/custom/register/'.length));
          const result = await this.manualRegister(entityId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }

        // POST /api/custom/unregister/:entityId
        if (req.method === 'POST' && pathname.startsWith('/api/custom/unregister/')) {
          const entityId = decodeURIComponent(pathname.substring('/api/custom/unregister/'.length));
          const result = await this.manualUnregister(entityId);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(result));
          return;
        }

        if (req.method === 'POST' && pathname.startsWith('/api/custom/device-profile/')) {
          const entityId = decodeURIComponent(pathname.substring('/api/custom/device-profile/'.length));
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          await new Promise<void>((resolve) => req.on('end', resolve));
          try {
            const data = JSON.parse(body) as { profileId?: string };
            const result = await this.setDeviceProfile(entityId, data.profileId ?? '');
            res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify(result));
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Invalid request body.' }));
          }
          return;
        }

        if (req.method === 'POST' && pathname === '/api/custom/restart') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: 'Reiniciando el contenedor...' }));
          this.log.warn('[UI Server] Restart requested, exiting process...');
          setTimeout(() => process.exit(0), 1000);
          return;
        }

        if (req.method === 'POST' && pathname === '/api/custom/device-override') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk.toString(); });
          await new Promise<void>((resolve) => req.on('end', resolve));
          try {
            const data = JSON.parse(body);
            const entityId = data.entityId;
            if (!entityId) throw new Error('Missing entityId');

            // Persist overrides to a JSON file in /data
            const overridesPath = '/data/device-overrides.json';
            let overrides: Record<string, string> = {};
            try {
              const raw = await fs.readFile(overridesPath, 'utf8');
              overrides = JSON.parse(raw);
            } catch { /* first time */ }

            if (data.exported === false) {
              overrides[entityId] = '_DISABLED_';
            } else if (data.matterType) {
              overrides[entityId] = data.matterType;
            } else if (data.exported === true) {
              if (overrides[entityId] === '_DISABLED_') {
                delete overrides[entityId];
              }
            }

            await fs.writeFile(overridesPath, JSON.stringify(overrides, null, 2), 'utf8');
            this.deviceOverrides = overrides;
            this.log.info(`[UI] Device override saved for ${entityId}`);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true }));
          } catch (parseErr) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'Invalid request body' }));
          }
          return;
        }

        if (req.method === 'POST' && pathname === '/api/custom/factoryreset') {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, message: 'Restableciendo de fábrica...' }));
          this.log.warn('[UI Server] Factory reset requested, wiping plugin overrides and exiting...');
          setTimeout(async () => {
            try {
              const { rm } = await import('fs/promises');
              await rm('/data/device-overrides.json', { force: true });
              await rm('/data/exported-devices.json', { force: true });
            } catch (err) {
              this.log.error(`Failed to wipe storage: ${err}`);
            }
            process.exit(0);
          }, 1000);
          return;
        }

        res.writeHead(404);
        res.end('Not Found');
      } catch (err) {
        this.log.error(`UI Server error handling request: ${err}`);
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });

    server.listen(8285, '127.0.0.1', () => {
      this.log.notice('Custom Liquid Glass UI Server listening on port 8285');
    });

    this.uiServer = server;
  }

  private async readFrontendFile(filename: string): Promise<string | null> {
    const dir = import.meta.dirname;
    const distPath = path.join(dir, 'frontend', filename);
    const srcPath = path.join(dir, '../src/frontend', filename);
    try {
      return await fs.readFile(distPath, 'utf8');
    } catch {
      try {
        return await fs.readFile(srcPath, 'utf8');
      } catch {
        return null;
      }
    }
  }

  private async getPackageVersion(): Promise<string> {
    if (this.packageVersion) return this.packageVersion;
    const dir = import.meta.dirname;
    const paths = [
      path.join(dir, '../package.json'),
      path.join(dir, 'package.json'),
      path.join(dir, '../../package.json'),
    ];
    for (const p of paths) {
      try {
        const content = await fs.readFile(p, 'utf8');
        const pkg = JSON.parse(content);
        if (pkg.version) {
          this.packageVersion = pkg.version;
          return pkg.version;
        }
      } catch {
        // try next
      }
    }
    return 'unknown';
  }
}

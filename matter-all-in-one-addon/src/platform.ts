/**
 * Core platform class for matter-all-in-one-chrisalvir.
 */
import {
  MatterbridgeAccessoryPlatform,
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


export interface HomeAssistantPlatformConfig extends PlatformConfig {
  host?: string;       // Optional: auto-detected from network/supervisor if not set
  token?: string;      // Optional: not required when running as HA add-on (SUPERVISOR_TOKEN) or with trust-local mode
  includeEntities?: string[];
  excludeEntities?: string[];
}

export class HomeAssistantPlatform extends MatterbridgeAccessoryPlatform {
  public ha!: HomeAssistant;
  public entities = new Map<string, BaseEntity>();
  public matterbridgeDevices = new Map<string, MatterbridgeEndpoint>();
  public deviceOverrides: Record<string, string> = {};
  private uiServer?: http.Server;
  /** Raw host from config (may be undefined — triggers network auto-discovery) */
  private _configHost?: string;
  /** Resolved token (may be empty string for trust-local / supervisor mode) */
  private _configToken: string = '';

  /** Set of entity IDs that the user has explicitly requested to export as accessories */
  public exportedDevices: Set<string> = new Set();

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

  private normalizeMatterQrCode(value: unknown): string {
    const code = typeof value === 'string' ? value.trim() : '';
    return code.startsWith('MT:') ? code : '';
  }

  private normalizeMatterManualCode(value: unknown): string {
    const code = typeof value === 'string' ? value.replace(/[^0-9]/g, '') : '';
    return code.length >= 11 ? code : '';
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
      60,
      10,
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
    await this.ha.close();
  }

  /**
   * Discover entities from Home Assistant and sync them to Matter.
   */
  private async discoverAndSync() {
    this.log.info('Fetching data for entity discovery...');
    try {
      await this.ha.fetchData();
      await this.ha.subscribe();

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

    // Idempotency guard: if already registered, just update state
    if (this.entities.has(entityId)) {
      this.entities.get(entityId)!.updateState(state);
      return;
    }

    // Skip unavailable / unknown entities
    if (isUnavailable(state)) {
      this.log.debug(`Skipping ${entityId} because it is unavailable/unknown.`);
      return;
    }

    const [domain] = entityId.split('.');

    // Filtering rules: Whitelist
    const allowedDomains = ['light', 'switch', 'cover', 'lock', 'climate', 'fan', 'sensor', 'binary_sensor', 'vacuum', 'alarm_control_panel', 'water_heater', 'button', 'media_player', 'camera'];
    if (!allowedDomains.includes(domain)) return;

    // Strict device_class whitelist for sensors to avoid exporting system/energy sensors
    const deviceClass = state.attributes.device_class;
    if (domain === 'sensor' && !['temperature', 'humidity', 'illuminance', 'moisture', 'pressure', 'flow', 'monetary'].includes(deviceClass ?? '')) return;
    if (domain === 'binary_sensor' && !['door', 'window', 'opening', 'motion', 'occupancy', 'contact', 'smoke', 'co'].includes(deviceClass ?? '')) return;

    if (this.config.excludeEntities?.includes(entityId)) return;
    if (this.config.includeEntities && !this.config.includeEntities.includes(entityId)) return;

    // Check device override
    const override = this.deviceOverrides[entityId];
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
    } else if (override === 'PetFeeder') {
      entityInstance = new PetFeederEntity(this, state, deviceType);
    } else {
      // General base fallback or standard converters will wrap this
      entityInstance = new BaseEntity(this, state, deviceType);
    }

    try {
      const endpoint = await entityInstance.createEndpoint();
      if (endpoint) {
        this.entities.set(entityId, entityInstance);
        this.matterbridgeDevices.set(entityId, endpoint);

        if (this.exportedDevices.has(entityId)) {
          this.log.info(`Auto-starting Accessory Server for ${idn}${entityId}${rs}...`);
          this.log.info(`DEBUG ENDPOINT MODE: ${endpoint.mode}`);
          this.log.info(`DEBUG ENDPOINT Properties: type=${endpoint.deviceType}, name=${endpoint.deviceName}, vendor=${endpoint.vendorId}, product=${endpoint.productId}, name=${endpoint.productName}`);
          await this.registerDevice(endpoint);
          await entityInstance.syncInitialState();
        } else {
          this.log.debug(`Entity ${entityId} is discovered but not exported. Skipping Accessory Server creation.`);
        }
      }
    } catch (err) {
      this.log.error(`Failed to register entity ${entityId}: ${err}`);
    }
  }

  /**
   * Manually export an entity as an Accessory and save to config.
   */
  public async manualRegister(entityId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.matterbridgeDevices.has(entityId)) {
      return { success: false, error: 'Device not found in discovery.' };
    }
    try {
      this.exportedDevices.add(entityId);
      await this.saveExportedDevices();
      const endpoint = this.matterbridgeDevices.get(entityId)!;
      // If it's already registered, matterbridge handles it gracefully
      await this.registerDevice(endpoint);
      
      const entity = this.entities.get(entityId);
      if (entity) {
        await entity.syncInitialState();
      }

      this.log.notice(`Manually started Accessory Server for ${entityId}`);
      return { success: true };
    } catch (err) {
      this.log.error(`Failed to manually register ${entityId}: ${err}`);
      return { success: false, error: String(err) };
    }
  }

  /**
   * Manually unregister an Accessory and save to config.
   */
  public async manualUnregister(entityId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.matterbridgeDevices.has(entityId)) {
      return { success: false, error: 'Device not found.' };
    }
    try {
      this.exportedDevices.delete(entityId);
      await this.saveExportedDevices();
      const endpoint = this.matterbridgeDevices.get(entityId)!;
      await this.unregisterDevice(endpoint);
      this.log.notice(`Manually stopped Accessory Server for ${entityId}`);
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

  /**
   * Real-time state synchronization from HA to Matter.
   */
  private handleEntityStateChange(entityId: string, newState: HassState) {
    const entity = this.entities.get(entityId);
    if (entity) {
      entity.state = newState;
      if (this.exportedDevices.has(entityId)) {
        this.log.debug(`Syncing state update for ${entityId} to Matter.`);
        entity.updateState(newState);
      }
    }
  }

  /**
   * Start custom HTTP server on port 8285 for Liquid Glass UI.
   */
  private startUiServer() {
    const server = http.createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

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

        if (req.method === 'GET' && pathname === '/api/custom/status') {
          let qrPairingCode = '';
          let manualPairingCode = '';
          let commissioned = false;
          let pairedFabrics: any[] = [];
          // === ESTRATEGIA DEFINITIVA ===
          // Matterbridge expone un singleton estático: Matterbridge.instance
          // Accedemos a él directamente en memoria usando createRequire para resolver
          // el módulo global instalado en el contenedor.
          try {
            const { createRequire } = await import('node:module');
            // Rutas candidatas del módulo global de matterbridge en el contenedor
            const candidatePaths = [
              '/usr/local/lib/node_modules/matterbridge/node_modules/@matterbridge/core/dist/matterbridge.js',
              '/usr/lib/node_modules/matterbridge/node_modules/@matterbridge/core/dist/matterbridge.js',
              '/root/matterbridge/node_modules/@matterbridge/core/dist/matterbridge.js',
            ];
            let MatterbridgeClass: any = null;
            for (const p of candidatePaths) {
              try {
                const r = createRequire(p);
                const mod = r(p);
                if (mod?.Matterbridge) { MatterbridgeClass = mod.Matterbridge; break; }
              } catch { /* try next */ }
            }
            // Fallback: intentar require normal si el módulo está en la cadena de resolución
            if (!MatterbridgeClass) {
              const r = createRequire(import.meta.url);
              try { MatterbridgeClass = r('@matterbridge/core/dist/matterbridge.js')?.Matterbridge; } catch { /* not found */ }
            }

            const mb = MatterbridgeClass?.instance;
            if (mb?.serverNode?.state?.commissioning?.pairingCodes) {
              const codes = mb.serverNode.state.commissioning.pairingCodes;
              qrPairingCode = this.normalizeMatterQrCode(codes.qrPairingCode);
              manualPairingCode = this.normalizeMatterManualCode(codes.manualPairingCode);
              commissioned = mb.serverNode.state.commissioning.commissioned === true;
              const fabrics = mb.serverNode.state.commissioning.fabrics;
              pairedFabrics = fabrics ? Object.values(fabrics) : [];
            }
          } catch (err) {
            // bridge data not available yet — silently ignore during startup
          }

          const status = commissioned ? 'vinculado' : (qrPairingCode ? 'esperando' : 'iniciando');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            status,
            qrPairingCode,
            manualPairingCode,
            commissioned,
            pairedFabrics,
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
            const endpoint = this.matterbridgeDevices.get(e.entityId);
            const serverNode = (endpoint as any)?.serverNode;
            let pairingCode = null;
            let commissioned = false;
            let fabric = null;
            const [domain] = e.entityId.split('.');

            if (serverNode?.state?.commissioning?.pairingCodes) {
              pairingCode = serverNode.state.commissioning.pairingCodes.qrPairingCode;
            }
            if (serverNode?.state?.commissioning?.commissioned !== undefined) {
              commissioned = serverNode.state.commissioning.commissioned;
              const fabrics = serverNode.state.commissioning.fabrics;
              if (fabrics && Object.keys(fabrics).length > 0) {
                const fabricList = Object.values(fabrics);
                if (fabricList.length > 0) {
                  const f = fabricList[0] as any;
                  fabric = f.label || f.vendorName || `Vendor ${f.vendorId}`;
                }
              }
            }

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
              pairingCode: pairingCode,
              commissioned: commissioned,
              fabric: fabric,
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

        // POST /api/custom/decommission/:entityId
        if (req.method === 'POST' && pathname.startsWith('/api/custom/decommission/')) {
          const entityId = decodeURIComponent(pathname.substring('/api/custom/decommission/'.length));
          const endpoint = this.matterbridgeDevices.get(entityId);
          const serverNode = (endpoint as any)?.serverNode;
          if (serverNode) {
            try {
              this.log.notice(`Decommissioning server node for ${entityId}...`);
              await serverNode.close();
              await serverNode.erase();
              await serverNode.start();
              res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              this.log.error(`Failed to decommission ${entityId}: ${err}`);
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ success: false, error: String(err) }));
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: false, error: 'Server node not found' }));
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
}

/**
 * Core platform class for matter-all-in-one-chrisalvir.
 */
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
  /** Raw host from config (may be undefined — triggers network auto-discovery) */
  private _configHost?: string;
  /** Resolved token (may be empty string for trust-local / supervisor mode) */
  private _configToken: string = '';

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
    } else {
      // General base fallback or standard converters will wrap this
      entityInstance = new BaseEntity(this, state, deviceType);
    }

    try {
      const endpoint = await entityInstance.createEndpoint();
      if (endpoint) {
        // Sync initial state BEFORE registering (endpoint is inactive → setAttribute is correct)
        await entityInstance.syncInitialState();
        this.entities.set(entityId, entityInstance);
        this.matterbridgeDevices.set(entityId, endpoint);
        await this.registerDevice(endpoint);
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

        if (req.method === 'GET' && pathname === '/api/custom/status') {
          let qrPairingCode = '';
          let manualPairingCode = '';
          let commissioned = false;
          let pairedFabrics: any[] = [];
          // Matterbridge 1.7+ protects internal APIs. We first authorize our loopback IP
          // by sending an empty password to /api/login, then fetch /api/settings.
          try {
            // 1. Authorize localhost IP
            await fetch('http://127.0.0.1:8284/api/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ password: '' })
            });

            // 2. Fetch bridge state
            const settingsRes = await fetch('http://127.0.0.1:8284/api/settings');
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json() as any;
              qrPairingCode = this.normalizeMatterQrCode(settingsData.qrPairingCode);
              manualPairingCode = this.normalizeMatterManualCode(settingsData.manualPairingCode);
              commissioned = settingsData.commissioned === true || settingsData.paired === true;
              pairedFabrics = settingsData.pairedFabrics || settingsData.fabricInformations || [];
              // this.log.debug('[UI Server] Got bridge data from /api/settings');
            } else {
              throw new Error(`Unexpected response from /api/settings: ${settingsRes.status}`);
            }
          } catch (err) {
            // Fallback to disk if the API is entirely offline (during startup)
            try {
              const mbJsonPath = '/root/.matterbridge/matterbridge.json';
              const fs = await import('node:fs/promises');
              const mbRaw = await fs.readFile(mbJsonPath, 'utf8');
              const mbData = JSON.parse(mbRaw);
              qrPairingCode = this.normalizeMatterQrCode(mbData.qrPairingCode || mbData.qrcode);
              manualPairingCode = this.normalizeMatterManualCode(mbData.manualPairingCode || mbData.manualCode);
              commissioned = mbData.commissioned === true;
              pairedFabrics = mbData.pairedFabrics || mbData.fabricInformations || [];
            } catch (fsErr) {
              // bridge data not available yet
            }
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
          const deviceList: any[] = [];
          const allowedDomains = ['light', 'switch', 'cover', 'lock', 'climate', 'fan', 'sensor', 'binary_sensor', 'vacuum', 'alarm_control_panel', 'water_heater', 'button', 'media_player', 'camera'];

          for (const haState of this.ha.hassStates.values()) {
            const entityId = haState.entity_id;
            const [domain] = entityId.split('.');

            if (!allowedDomains.includes(domain)) continue;

            const deviceClass = haState.attributes.device_class;
            if (domain === 'sensor' && !['temperature', 'humidity', 'illuminance', 'moisture', 'pressure', 'flow', 'monetary'].includes(deviceClass ?? '')) continue;
            if (domain === 'binary_sensor' && !['door', 'window', 'opening', 'motion', 'occupancy', 'contact', 'smoke', 'co'].includes(deviceClass ?? '')) continue;

            if (this.config.excludeEntities?.includes(entityId)) continue;
            if (this.config.includeEntities && !this.config.includeEntities.includes(entityId)) continue;

            const override = this.deviceOverrides[entityId];
            const exported = override !== '_DISABLED_';

            let matterType = getDeviceTypeForEntity(domain, deviceClass).name;
            if (override && override !== '_DISABLED_') {
              if ((MatterDeviceTypes as any)[override]) {
                matterType = (MatterDeviceTypes as any)[override].name;
              } else {
                matterType = override;
              }
            }

            const registryInfo = this.getHaRegistryInfo(entityId);

            deviceList.push({
              entityId,
              friendlyName: haState.attributes.friendly_name || entityId,
              domain,
              deviceClass,
              matterType,
              state: haState.state || 'desconocido',
              exported,
              ...registryInfo,
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(deviceList));
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

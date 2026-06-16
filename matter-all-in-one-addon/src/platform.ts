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
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
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
  private uiServer?: http.Server;

  constructor(
    matterbridge: PlatformMatterbridge,
    log: AnsiLogger,
    override config: HomeAssistantPlatformConfig
  ) {
    super(matterbridge, log, config);
    this.log.info(`Initializing ${CYAN}${this.config.name}${nf} platform...`);

    // Automatic detection of Host and Token for Home Assistant OS / Supervisor environments
    const host = config.host || process.env.HA_URL || 'http://supervisor/core';
    const token = config.token || process.env.SUPERVISOR_TOKEN || '';

    this.log.info(`Connecting to Home Assistant at ${host}`);

    // Initialize the Home Assistant connection manager
    this.ha = new HomeAssistant(
      host,
      token,
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
    this.startUiServer();
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

  /**
   * Start custom HTTP server on port 8283 for Liquid Glass UI.
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
      const pathname = urlObj.pathname;

      this.log.debug(`[UI Server] ${req.method} ${pathname}`);

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
          try {
            const bridgeRes = await fetch('http://localhost:8284/api/bridge');
            const bridgeData = await bridgeRes.json() as any;

            const systemRes = await fetch('http://localhost:8284/api/system-info');
            const systemData = await systemRes.json() as any;

            const status = bridgeData.commissioned ? 'vinculado' : 'esperando';
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              status,
              qrPairingCode: bridgeData.qrPairingCode || '',
              manualPairingCode: bridgeData.manualPairingCode || '',
              commissioned: bridgeData.commissioned || false,
              pairedFabrics: bridgeData.pairedFabrics || [],
              systemInfo: {
                os: systemData.os || 'Linux',
                nodeVersion: systemData.nodeVersion || '',
                uptime: systemData.uptime || '',
                cpu: systemData.cpu || '0.00 %',
                memory: systemData.memory || ''
              },
              haStatus: this.ha.connected ? 'conectado' : 'desconectado'
            }));
          } catch (err) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              status: 'iniciando',
              qrPairingCode: '',
              manualPairingCode: '',
              commissioned: false,
              pairedFabrics: [],
              systemInfo: {
                os: 'Linux',
                nodeVersion: '',
                uptime: '0s',
                cpu: '0.00 %',
                memory: '0.00 GB'
              },
              haStatus: this.ha.connected ? 'conectado' : 'desconectado'
            }));
          }
          return;
        }

        if (req.method === 'GET' && pathname === '/api/custom/devices') {
          const deviceList: any[] = [];
          for (const [entityId, entity] of this.entities.entries()) {
            const haState = this.ha.hassStates.get(entityId);
            deviceList.push({
              entityId,
              friendlyName: haState?.attributes.friendly_name || entityId,
              domain: entityId.split('.')[0],
              matterType: entity.deviceType.name,
              state: haState?.state || 'desconocido',
              status: 'activo'
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
            const { entityId, matterType } = JSON.parse(body);
            if (!entityId || !matterType) throw new Error('Missing fields');
            // Persist overrides to a JSON file in /data
            const overridesPath = '/data/device-overrides.json';
            let overrides: Record<string, string> = {};
            try {
              const raw = await fs.readFile(overridesPath, 'utf8');
              overrides = JSON.parse(raw);
            } catch { /* first time */ }
            overrides[entityId] = matterType;
            await fs.writeFile(overridesPath, JSON.stringify(overrides, null, 2), 'utf8');
            this.log.info(`[UI] Device override saved: ${entityId} → ${matterType}`);
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
          this.log.warn('[UI Server] Factory reset requested, wiping storage and exiting...');
          setTimeout(async () => {
            try {
              const { rm } = await import('fs/promises');
              await rm('/root/.matterbridge', { recursive: true, force: true });
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

    server.listen(8283, '0.0.0.0', () => {
      this.log.notice('Custom Liquid Glass UI Server listening on port 8283');
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


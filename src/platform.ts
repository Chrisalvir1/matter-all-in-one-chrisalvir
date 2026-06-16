/**
 * MatterAllInOnePlatform
 * Core platform class para matter-all-in-one-chrisalvir
 *
 * Conexión AUTOMÁTICA a HA:
 * - Sin token manual requerido
 * - Auto-descubre la IP de HA (Supervisor API → mDNS → subnet scan)
 * - Carga todos los dispositivos de HA automáticamente
 * - Sincronización de estado en tiempo real via WebSocket
 */

import { Matterbridge, MatterbridgeAccessoryPlatform, MatterbridgeDevice, PlatformConfig } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { DeviceRegistry } from './device-registry.js';
import { homekitSupportedDeviceTypes } from './homekit.compat.js';
import { HassWebSocket } from './utils/ha-websocket.js';
import { LightConverter } from './converters/light.converter.js';
import { CoverConverter } from './converters/cover.converter.js';
import { SensorConverter } from './converters/sensor.converter.js';
import { ClimateConverter } from './converters/climate.converter.js';
import { LockConverter } from './converters/lock.converter.js';
import { CameraConverter } from './converters/camera.converter.js';
import { SoilSensorConverter } from './converters/soil_sensor.converter.js';

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  domain: string;
}

export class MatterAllInOnePlatform extends MatterbridgeAccessoryPlatform {
  private deviceRegistry: DeviceRegistry;
  private haEntities: Map<string, HassEntity> = new Map();
  private hassWs: HassWebSocket;
  private registeredDevices: Map<string, MatterbridgeDevice> = new Map();

  constructor(matterbridge: Matterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
    this.deviceRegistry = new DeviceRegistry(log);

    // Inicializa el WebSocket con auto-discovery
    // Si el usuario puso una IP manual en config, se usa como hint
    // Si NO, se auto-descubre via Supervisor API o mDNS (sin token manual)
    this.hassWs = new HassWebSocket(log, {
      host: config['host'] as string | undefined,
      token: config['token'] as string | undefined, // opcional, no requerido
    });

    // Escuchar cambios de estado en tiempo real
    this.hassWs.on('connected', () => {
      this.log.info('Platform: conectado a HA, cargando dispositivos...');
      this.loadAllDevices();
    });

    this.hassWs.on('state_changed', (entityId: string, newState: HassEntity) => {
      this.onHassStateChange(entityId, newState);
    });

    this.log.info('Matter All-in-One (Chrisalvir): plataforma inicializada');
    this.log.info('Modo: auto-discovery, sin token manual requerido');
  }

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`Iniciando: ${reason ?? 'arranque'}`);
    // Conexión automática — descubre HA sin configuración manual
    await this.hassWs.connect();
  }

  override async onConfigure(): Promise<void> {
    this.log.info('Platform: configurada correctamente');
  }

  override async onShutdown(reason?: string): Promise<void> {
    this.log.info(`Apagando: ${reason ?? ''}`);
    this.hassWs.disconnect();
  }

  /**
   * Carga TODAS las entidades de HA y las registra como dispositivos Matter.
   * Sin filtros — registra todo lo que HA tenga disponible.
   */
  private async loadAllDevices(): Promise<void> {
    try {
      const states = await this.hassWs.getAllStates();
      this.log.info(`Platform: ${states.length} entidades encontradas en HA`);

      let registered = 0;
      let skipped = 0;

      for (const state of states) {
        const entity = {
          ...state,
          domain: state.entity_id.split('.')[0],
        } as HassEntity;

        this.haEntities.set(entity.entity_id, entity);

        const device = await this.createDeviceFromEntity(entity);
        if (device) {
          await this.registerDevice(device);
          this.registeredDevices.set(entity.entity_id, device);
          registered++;
        } else {
          skipped++;
        }
      }

      this.log.info(`Platform: ${registered} dispositivos registrados en Matter, ${skipped} omitidos`);
    } catch (err) {
      this.log.error(`Platform: error cargando dispositivos: ${err}`);
    }
  }

  /**
   * Sincroniza cambios de estado de HA → atributos Matter en tiempo real.
   */
  private onHassStateChange(entityId: string, newState: HassEntity): void {
    const device = this.registeredDevices.get(entityId);
    if (!device) return;

    // Actualizar el estado del cluster correspondiente
    const domain = entityId.split('.')[0];
    try {
      switch (domain) {
        case 'light': {
          const isOn = newState.state === 'on';
          device.getClusterServer('OnOff' as never)?.setOnOffAttribute(isOn);
          break;
        }
        case 'lock': {
          const locked = newState.state === 'locked';
          device.getClusterServer('DoorLock' as never)?.setLockStateAttribute(locked ? 1 : 2);
          break;
        }
        default:
          break;
      }
    } catch (err) {
      this.log.debug(`Platform: no se pudo sincronizar estado de ${entityId}: ${err}`);
    }

    this.haEntities.set(entityId, newState);
  }

  private async createDeviceFromEntity(entity: HassEntity): Promise<MatterbridgeDevice | null> {
    const { domain, attributes } = entity;
    const deviceClass = attributes['device_class'] as string | undefined;

    switch (domain) {
      case 'light':
        return LightConverter.toMatterDevice(entity, this.log);
      case 'cover':
        return CoverConverter.toMatterDevice(entity, this.log);
      case 'sensor':
        if (deviceClass === 'moisture') {
          return SoilSensorConverter.toMatterDevice(entity, this.log);
        }
        return SensorConverter.toMatterDevice(entity, this.log);
      case 'binary_sensor':
        return SensorConverter.toMatterDevice(entity, this.log);
      case 'climate':
        return ClimateConverter.toMatterDevice(entity, this.log);
      case 'lock':
        return LockConverter.toMatterDevice(entity, this.log);
      case 'camera':
        if (homekitSupportedDeviceTypes.camera) {
          return CameraConverter.toMatterDevice(entity, this.log);
        }
        return null;
      default:
        return null;
    }
  }
}

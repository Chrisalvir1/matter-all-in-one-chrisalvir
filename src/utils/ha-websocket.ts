/**
 * ha-websocket.ts
 * WebSocket client para Home Assistant.
 * Se conecta automáticamente usando ha-discovery (sin token manual).
 * Maneja reconexión automática y auto-descubrimiento de entidades.
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { AnsiLogger } from 'matterbridge/logger';
import { discoverHassConnection, HassConnection } from './ha-discovery.js';
import { HassEntity } from '../platform.js';

export type HassStateChangeCallback = (entityId: string, newState: HassEntity, oldState?: HassEntity) => void;

export class HassWebSocket extends EventEmitter {
  private ws: WebSocket | null = null;
  private connection: HassConnection | null = null;
  private msgId = 1;
  private pendingMessages = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isAuthenticated = false;
  private log: AnsiLogger;
  private manualConfig?: { host?: string; token?: string };

  constructor(log: AnsiLogger, manualConfig?: { host?: string; token?: string }) {
    super();
    this.log = log;
    this.manualConfig = manualConfig;
  }

  /**
   * Conecta a HA de forma automática.
   * Auto-descubre la IP y obtiene el token sin intervención del usuario.
   */
  async connect(): Promise<void> {
    this.log.info('HassWebSocket: iniciando auto-discovery de Home Assistant...');

    try {
      this.connection = await discoverHassConnection(this.manualConfig);
      this.log.info(`HassWebSocket: HA encontrado via [${this.connection.source}] en ${this.connection.url}`);
    } catch (err) {
      this.log.error(`HassWebSocket: no se pudo descubrir HA: ${err}`);
      this.scheduleReconnect();
      return;
    }

    await this.openWebSocket();
  }

  private openWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.connection) return reject(new Error('No connection info'));

      this.log.info(`HassWebSocket: conectando a ${this.connection.wsUrl}`);
      this.ws = new WebSocket(this.connection.wsUrl);

      this.ws.on('open', () => {
        this.log.info('HassWebSocket: WebSocket abierto, autenticando...');
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(JSON.parse(data.toString()), resolve);
      });

      this.ws.on('error', (err) => {
        this.log.error(`HassWebSocket: error de conexión: ${err.message}`);
        this.scheduleReconnect();
        reject(err);
      });

      this.ws.on('close', () => {
        this.log.warn('HassWebSocket: conexión cerrada, reconectando...');
        this.isAuthenticated = false;
        this.scheduleReconnect();
      });
    });
  }

  private handleMessage(msg: Record<string, unknown>, onAuthResolve?: (v: void) => void): void {
    const type = msg['type'] as string;

    if (type === 'auth_required') {
      // HA pide autenticación — enviamos el token obtenido automáticamente
      this.ws?.send(JSON.stringify({
        type: 'auth',
        access_token: this.connection!.token,
      }));
      return;
    }

    if (type === 'auth_ok') {
      this.isAuthenticated = true;
      this.log.info(`HassWebSocket: autenticado correctamente (HA ${msg['ha_version'] ?? 'desconocido'})`);
      this.emit('connected', this.connection);
      onAuthResolve?.();
      // Suscribirse a cambios de estado inmediatamente
      this.subscribeStateChanges();
      return;
    }

    if (type === 'auth_invalid') {
      this.log.error('HassWebSocket: token inválido. Reintentando discovery...');
      this.connection = null;
      this.scheduleReconnect();
      return;
    }

    if (type === 'result') {
      const id = msg['id'] as number;
      const pending = this.pendingMessages.get(id);
      if (pending) {
        this.pendingMessages.delete(id);
        if (msg['success']) {
          pending.resolve(msg['result']);
        } else {
          pending.reject(msg['error']);
        }
      }
      return;
    }

    if (type === 'event') {
      const event = msg['event'] as Record<string, unknown>;
      if (event?.['event_type'] === 'state_changed') {
        const data = event['data'] as Record<string, unknown>;
        const entityId = data['entity_id'] as string;
        const newState = data['new_state'] as HassEntity;
        const oldState = data['old_state'] as HassEntity | undefined;
        this.emit('state_changed', entityId, newState, oldState);
      }
    }
  }

  /**
   * Obtiene todas las entidades de HA de una vez.
   * Auto-discovery completo sin filtros — todas las entidades disponibles.
   */
  async getAllStates(): Promise<HassEntity[]> {
    const result = await this.sendMessage({ type: 'get_states' });
    return result as HassEntity[];
  }

  /**
   * Suscribirse a todos los cambios de estado en tiempo real.
   */
  private subscribeStateChanges(): void {
    this.sendMessage({
      type: 'subscribe_events',
      event_type: 'state_changed',
    }).catch((err) => {
      this.log.error(`HassWebSocket: error suscribiendo a eventos: ${err}`);
    });
    this.log.info('HassWebSocket: suscrito a state_changed en tiempo real');
  }

  /**
   * Llama un servicio de HA (ej: light.turn_on, cover.open_cover)
   */
  async callService(domain: string, service: string, data: Record<string, unknown>): Promise<void> {
    await this.sendMessage({
      type: 'call_service',
      domain,
      service,
      service_data: data,
    });
  }

  private sendMessage(msg: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || !this.isAuthenticated) {
        return reject(new Error('WebSocket no está autenticado'));
      }
      const id = this.msgId++;
      this.pendingMessages.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ ...msg, id }));
    });
  }

  private scheduleReconnect(delayMs = 10000): void {
    if (this.reconnectTimer) return;
    this.log.info(`HassWebSocket: reintentando en ${delayMs / 1000}s...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      await this.connect();
    }, delayMs);
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.isAuthenticated = false;
  }
}

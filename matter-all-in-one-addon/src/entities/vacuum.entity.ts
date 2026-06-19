/**
 * vacuum.entity.ts
 *
 * Matterbridge entity for Home Assistant `vacuum.*` devices.
 * Exposes them as a standard Switch (OnOffPlugInUnit) for maximum compatibility
 * with Apple HomeKit (which rejects standard RVCs if Home Hubs aren't fully updated).
 *
 * On = vacuum.start
 * Off = vacuum.return_to_base
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { OnOffServer } from 'matterbridge/matter/behaviors';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export class VacuumEntity extends BaseEntity {
  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  // ─── Custom cluster initialisation ────────────────────────────────────

  protected override async addCustomClusterServers(): Promise<void> {
    try {
      this.endpoint.createDefaultIdentifyClusterServer();
      
      const isCleaning = ['cleaning', 'return_to_base', 'error'].includes(this.state.state);

      this.endpoint.behaviors.require(OnOffServer, {
        onOff: isCleaning,
      });

    } catch (err) {
      this.platform.log?.warn?.(`[VacuumEntity] addCustomClusterServers error for ${this.entityId}: ${err}`);
    }
  }

  // ─── State sync (HA → Matter) ─────────────────────────────────────────

  override async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    if (!this.endpoint) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(endpoint: MatterbridgeEndpoint, state: HassState, isInitialSync = false): Promise<void> {
    const isCleaning = ['cleaning', 'return_to_base', 'error'].includes(state.state);
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      syncFunc(
        endpoint,
        'onOff' as any,
        'onOff',
        isCleaning,
        this.platform.log,
      );
    } catch (err) {
      this.platform.log?.warn?.(`[VacuumEntity] syncState error for ${this.state.entity_id}: ${err}`);
    }
  }

  // ─── Command handlers (Matter → HA) ───────────────────────────────────

  protected override registerCommandHandlers(endpoint?: MatterbridgeEndpoint): void {
    if (!endpoint) endpoint = this.endpoint;

    endpoint.addCommandHandler('on', async () => {
      this.platform.log?.info?.(`[VacuumEntity] Matter On commanded for ${this.state.entity_id} (Starting vacuum)`);
      await this.callHaService('vacuum.start');
    });

    endpoint.addCommandHandler('off', async () => {
      this.platform.log?.info?.(`[VacuumEntity] Matter Off commanded for ${this.state.entity_id} (Returning to base)`);
      await this.callHaService('vacuum.return_to_base');
    });
  }

  private async callHaService(service: string): Promise<void> {
    try {
      const [domain, action] = service.split('.');
      await this.platform.ha?.callService(domain, action, this.state.entity_id);
    } catch (err) {
      this.platform.log?.error?.(`[VacuumEntity] Failed to call ${service}: ${err}`);
    }
  }

  static matterTypeLabel = 'OnOffPlugInUnit' as const;
}


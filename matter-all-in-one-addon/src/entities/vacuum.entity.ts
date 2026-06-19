/**
 * vacuum.entity.ts
 *
 * Matterbridge entity for Home Assistant `vacuum.*` devices.
 * Exposes them as Matter 1.4 RVC (Robotic Vacuum Cleaner) — device type 0x0074.
 *
 * Apple Home recognises this natively starting in iOS 18.4 and shows:
 *   • Start / Pause / Stop / Return to Base controls
 *   • Battery level
 *   • Current cleaning status
 *   • Error state
 *
 * RvcRunMode required modes (Matter spec §7.2):
 *   - At least one mode tagged Idle  (0x4000 = 16384)
 *   - At least one mode tagged Cleaning (0x4001 = 16385)
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { RvcRunModeServer, RvcOperationalStateServer } from 'matterbridge/matter/behaviors';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import {
  buildVacuumUpdate,
  buildVacuumMatterMeta,
  RvcOperationalStateId,
} from '../converters/vacuum.converter.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export { buildVacuumMatterMeta };

// ─── RVC Mode tag constants (Matter spec §7.2.7.1) ────────────────────────
const RVC_RUN_MODE_TAG_IDLE     = 0x4000;
const RVC_RUN_MODE_TAG_CLEANING = 0x4001;

// Mode IDs used as currentMode values
const RUN_MODE_ID_IDLE     = 1;
const RUN_MODE_ID_CLEANING = 2;

import { RoboticVacuumCleaner } from '@matterbridge/core/devices';

export class VacuumEntity extends BaseEntity {
  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  /**
   * Override createEndpoint to use the core RoboticVacuumCleaner class from Matterbridge.
   * This guarantees 100% compliance with Apple HomeKit by including the powerSource
   * device type and all RVC optional clusters (ServiceArea, RvcCleanMode, etc) which
   * Apple HomeKit implicitly expects for room-by-room cleaning support.
   */
  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;
    const entityPart = this.entityId.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const displayName = rawName.length > 24
      ? rawName.substring(0, 24).trim() + ' ' + entityPart
      : rawName + (rawName.length < 28 ? ' ' + entityPart : '');
    const uniqueName = displayName.substring(0, 32).trim();
    const serialNumber = this.entityId.replaceAll('.', '_').substring(0, 32);

    this.platform.log?.debug(`[VacuumEntity] Instantiating native RoboticVacuumCleaner for ${this.entityId}`);

    // Create the native Matterbridge RVC class which sets up RvcRunMode, RvcCleanMode,
    // RvcOperationalState, ServiceArea, and PowerSource automatically with all Apple compliance.
    this.endpoint = new RoboticVacuumCleaner(
      uniqueName,
      serialNumber,
      'server',
      RUN_MODE_ID_IDLE, // currentRunMode
      undefined, // supportedRunModes (uses defaults)
      1, // currentCleanMode (Vacuum)
      undefined, // supportedCleanModes (uses defaults)
    );

    // Overwrite some basic info to identify as Home Assistant
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = 'Home Assistant';
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = 'Vacuum';

    // BaseEntity command handler registration and state sync
    this.registerCommandHandlers();

    return this.endpoint;
  }

  // ─── Custom cluster initialisation ────────────────────────────────────

  protected override async addCustomClusterServers(): Promise<void> {
    // No-op: The native RoboticVacuumCleaner class handles its own cluster creation in its constructor.
    return;
  }

  // ─── State sync (HA → Matter) ─────────────────────────────────────────

  override async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    if (!this.endpoint) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(endpoint: MatterbridgeEndpoint, state: HassState, isInitialSync = false): Promise<void> {
    const update = buildVacuumUpdate(state as any);
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      syncFunc(
        endpoint,
        'rvcOperationalState' as any,
        'operationalState',
        update.operationalState,
        this.platform.log,
      );

      const runMode = update.onOff ? RUN_MODE_ID_CLEANING : RUN_MODE_ID_IDLE;
      syncFunc(
        endpoint,
        'rvcRunMode' as any,
        'currentMode',
        runMode,
        this.platform.log,
      );

      if (update.batteryLevel !== null) {
        syncFunc(
          endpoint,
          'powerSource' as any,
          'batPercentRemaining',
          Math.round(update.batteryLevel * 2),
          this.platform.log,
        );
      }
    } catch (err) {
      this.platform.log?.warn?.(`[VacuumEntity] syncState error for ${this.state.entity_id}: ${err}`);
    }
  }

  // ─── Command handlers (Matter → HA) ───────────────────────────────────

  protected override registerCommandHandlers(endpoint?: MatterbridgeEndpoint): void {
    if (!endpoint) endpoint = this.endpoint;

    // Matterbridge interceptors for RoboticVacuumCleaner class
    endpoint.addCommandHandler('RvcRunMode.changeToMode', async (data: any) => {
      this.platform.log?.info?.(`[VacuumEntity] changeToMode commanded: ${JSON.stringify(data)}`);
      const { request } = data;
      if (request?.newMode === RUN_MODE_ID_CLEANING) {
        await this.callHaService('vacuum.start');
      } else if (request?.newMode === RUN_MODE_ID_IDLE) {
        await this.callHaService('vacuum.return_to_base');
      }
    });

    endpoint.addCommandHandler('RvcOperationalState.resume', async () => {
      await this.callHaService('vacuum.start');
    });

    endpoint.addCommandHandler('RvcOperationalState.pause', async () => {
      await this.callHaService('vacuum.pause');
    });

    endpoint.addCommandHandler('RvcOperationalState.goHome', async () => {
      await this.callHaService('vacuum.return_to_base');
    });
    
    endpoint.addCommandHandler('goHome', async () => {
      await this.callHaService('vacuum.return_to_base');
    });
  }

  private async callHaService(service: string): Promise<void> {
    try {
      const [domain, action] = service.split('.');
      await this.platform.ha?.callService(domain, action, this.state.entity_id);
      this.platform.log?.info?.(`[VacuumEntity] Called ${service} on ${this.state.entity_id}`);
    } catch (err) {
      this.platform.log?.error?.(`[VacuumEntity] Failed to call ${service}: ${err}`);
    }
  }

  static matterTypeLabel = 'RoboticVacuumCleaner' as const;
}

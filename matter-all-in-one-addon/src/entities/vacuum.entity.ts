/**
 * vacuum.entity.ts
 *
 * Matterbridge entity for Home Assistant `vacuum.*` devices.
 * Exposes them as Matter 1.2 RVC (Robotic Vacuum Cleaner) — device type 0x0074.
 *
 * Uses the official RoboticVacuumCleaner from @matterbridge/core/devices for 100%
 * Apple HomeKit compliance on iOS 18.4 - iOS 26/27.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { RoboticVacuumCleaner } from 'matterbridge/devices';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import {
  buildVacuumUpdate,
  buildVacuumMatterMeta,
} from '../converters/vacuum.converter.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export { buildVacuumMatterMeta };

// Mode IDs used as currentMode values
const RUN_MODE_ID_IDLE     = 1;
const RUN_MODE_ID_CLEANING = 2;

export class VacuumEntity extends BaseEntity {
  public declare endpoint: RoboticVacuumCleaner;

  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;

    const entityPart = this.entityId.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const displayName = rawName.length > 24
      ? rawName.substring(0, 24).trim() + ' ' + entityPart
      : rawName + (rawName.length < 28 ? ' ' + entityPart : '');
    const uniqueName = displayName.substring(0, 32).trim();

    // V2 Suffix to force a completely new device pairing and QR Code in Matterbridge UI!
    const v2Id = this.entityId.replaceAll('.', '_') + '_v2';
    const serialNumber = v2Id + '_sn';

    // The official RoboticVacuumCleaner will auto-add:
    // - PowerSource (with valid defaults, 5900mV etc)
    // - ServiceArea (with default Map)
    // - RvcRunMode (with correct tags)
    // - RvcCleanMode (Vacuum, Mop, DeepClean)
    // - RvcOperationalState (with valid error states and complete behaviors)
    this.endpoint = new RoboticVacuumCleaner(
      uniqueName,
      serialNumber, // serial with _v2 and _sn
      'server',
      RUN_MODE_ID_IDLE, // currentRunMode
      undefined, // supportedRunModes
      1, // currentCleanMode
      undefined, // supportedCleanModes
      null, // currentPhase
      null, // phaseList
      0, // operationalState (Stopped)
    );

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.uniqueId = v2Id;
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = 'Home Assistant';
    this.endpoint.productId = 0x8000;
    const [domain] = this.entityId.split('.');
    this.endpoint.productName = domain.charAt(0).toUpperCase() + domain.slice(1);

    this.registerCommandHandlers();

    return this.endpoint as unknown as MatterbridgeEndpoint;
  }

  // ─── State sync (HA → Matter) ─────────────────────────────────────────

  override async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    if (!this.endpoint) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(endpoint: RoboticVacuumCleaner, state: HassState, isInitialSync = false): Promise<void> {
    const update = buildVacuumUpdate(state as any);
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      syncFunc(
        endpoint as any,
        'rvcOperationalState' as any,
        'operationalState',
        update.operationalState,
        this.platform.log,
      );

      const runMode = update.onOff ? RUN_MODE_ID_CLEANING : RUN_MODE_ID_IDLE;
      syncFunc(
        endpoint as any,
        'rvcRunMode' as any,
        'currentMode',
        runMode,
        this.platform.log,
      );

      if (update.batteryLevel !== null) {
        syncFunc(
          endpoint as any,
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
    if (!endpoint) endpoint = this.endpoint as unknown as MatterbridgeEndpoint;

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

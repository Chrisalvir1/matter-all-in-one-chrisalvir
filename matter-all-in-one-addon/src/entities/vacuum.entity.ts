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

    // V6 Suffix to force a completely new device pairing and QR Code in Matterbridge UI!
    const v6Id = this.entityId.replaceAll('.', '_') + '_v6';
    const serialNumber = v6Id + '_sn';

    const supportedRunModes = [
      { label: 'Idle', mode: 1, modeTags: [{ value: 16384 }] },      // 0x4000 = 16384 (Idle)
      { label: 'Cleaning', mode: 2, modeTags: [{ value: 16385 }] }  // 0x4001 = 16385 (Cleaning)
    ];

    const operationalStateList = [
      { operationalStateId: 0 }, // Stopped
      { operationalStateId: 1 }, // Running
      { operationalStateId: 2 }, // Paused
      { operationalStateId: 3 }, // Error
      { operationalStateId: 64 }, // SeekingCharger
      { operationalStateId: 65 }, // Charging
      { operationalStateId: 66 }  // Docked
    ];

    // The official RoboticVacuumCleaner will auto-add:
    // - PowerSource (with valid defaults, 5900mV etc)
    // - ServiceArea (configured empty here to disable room selection/infinite loading)
    // - RvcRunMode (with correct tags)
    // - RvcCleanMode (Only Vacuum mode, removing Mop/DeepClean since A1 has no mop)
    // - RvcOperationalState (with valid error states and complete behaviors)
    this.endpoint = new RoboticVacuumCleaner(
      uniqueName,
      serialNumber, // serial with _v6 and _sn
      'server',
      RUN_MODE_ID_IDLE, // currentRunMode
      supportedRunModes, // supportedRunModes
      1, // currentCleanMode
      [
        { label: 'Vacuum', mode: 1, modeTags: [{ value: 16385 }] } // Only expose Vacuum mode (0x4001 = 16385)
      ], // supportedCleanModes
      null, // currentPhase
      null, // phaseList
      0, // operationalState (Stopped)
      operationalStateList, // operationalStateList
      [], // supportedAreas (empty array disables service areas in UI)
      [], // selectedAreas
      null, // currentArea
      [], // supportedMaps
    );

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.uniqueId = v6Id;
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = 'ROPVACNIC by Chrisalvir';
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = 'ROPVACNIC A1';

    // Override Basic Information attributes for premium branding in HomeKit
    safeSetAttribute(
      this.endpoint as any,
      'basicInformation' as any,
      'vendorName',
      'ROPVACNIC by Chrisalvir',
      this.platform.log,
    );
    safeSetAttribute(
      this.endpoint as any,
      'basicInformation' as any,
      'productName',
      'ROPVACNIC A1',
      this.platform.log,
    );
    safeSetAttribute(
      this.endpoint as any,
      'basicInformation' as any,
      'softwareVersionString',
      'V2.5.2 (MCU V1.4.0)',
      this.platform.log,
    );

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

        // Sync battery charge state (lightning bolt in HomeKit)
        // In HA, state "docked" means it is at the base charging. 
        // We can also check raw_dps["5"] === "charging" (Tuya charging status dps)
        const rawDps = state.attributes?.raw_dps;
        const isCharging = state.state === 'docked' || 
                           (rawDps && (rawDps['5'] === 'charging' || rawDps['5'] === 'charge' || rawDps['3'] === 'charging'));
        
        syncFunc(
          endpoint as any,
          'powerSource' as any,
          'batChargeState',
          isCharging ? 1 : 2, // 1 = IsCharging, 2 = IsNotCharging (Matter spec §11.1.5.5)
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

    endpoint.addCommandHandler('RvcCleanMode.changeToMode', async (data: any) => {
      this.platform.log?.info?.(`[VacuumEntity] RvcCleanMode.changeToMode commanded: ${JSON.stringify(data)}`);
    });

    endpoint.addCommandHandler('RvcOperationalState.resume', async () => {
      await this.callHaService('vacuum.start');
    });

    endpoint.addCommandHandler('RvcOperationalState.pause', async () => {
      const features = this.state.attributes.supported_features ?? 0;
      const SUPPORT_PAUSE = 4;
      if (!(features & SUPPORT_PAUSE)) {
        this.platform.log?.info?.(`[VacuumEntity] pause command received but not supported, falling back to vacuum.stop`);
        await this.callHaService('vacuum.stop');
      } else {
        await this.callHaService('vacuum.pause');
      }
    });

    endpoint.addCommandHandler('RvcOperationalState.goHome', async () => {
      await this.callHaService('vacuum.return_to_base');
    });
    
    endpoint.addCommandHandler('goHome', async () => {
      await this.callHaService('vacuum.return_to_base');
    });

    endpoint.addCommandHandler('identify', async () => {
      this.platform.log?.info?.(`[VacuumEntity] identify (Play sound to locate) commanded`);
      await this.callHaService('vacuum.locate');
    });
  }

  private async callHaService(service: string): Promise<void> {
    try {
      let domain = 'vacuum';
      let action = 'start';
      let entityId = this.state.entity_id;
      let serviceData: Record<string, any> = {};

      if (service === 'vacuum.return_to_base') {
        const objectId = this.state.entity_id.split('.')[1];
        const btnEntityId = `button.${objectId}_volver_a_base`;
        const selectEntityId = `select.${objectId}_modo`;
        
        const hasBtn = this.platform.ha?.hassStates?.has(btnEntityId);
        const hasSelect = this.platform.ha?.hassStates?.has(selectEntityId);

        if (hasBtn) {
          domain = 'button';
          action = 'press';
          entityId = btnEntityId;
          this.platform.log?.info?.(`[VacuumEntity] Redirecting return_to_base to button.press on ${btnEntityId}`);
        } else if (hasSelect) {
          domain = 'select';
          action = 'select_option';
          entityId = selectEntityId;
          serviceData = { option: 'chargego' };
          this.platform.log?.info?.(`[VacuumEntity] Redirecting return_to_base to select.select_option on ${selectEntityId} with option chargego`);
        } else {
          [domain, action] = service.split('.');
        }
      } else {
        [domain, action] = service.split('.');
      }

      await this.platform.ha?.callService(domain, action, entityId, serviceData);
      this.platform.log?.info?.(`[VacuumEntity] Called ${domain}.${action} on ${entityId} with ${JSON.stringify(serviceData)}`);
    } catch (err) {
      this.platform.log?.error?.(`[VacuumEntity] Failed to call ${service}: ${err}`);
    }
  }

  static matterTypeLabel = 'RoboticVacuumCleaner' as const;
}

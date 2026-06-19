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

// Mode IDs used as currentMode values (Apple HomeKit prefers non-zero IDs for modes)
const RUN_MODE_ID_IDLE     = 1;
const RUN_MODE_ID_CLEANING = 2;

// We need to implement our own RvcRunModeServer to handle the changeToMode command
export class CustomRvcRunModeServer extends RvcRunModeServer {
  override async changeToMode(request: any) {
    const { newMode } = request;
    // We will emit an event or command that the VacuumEntity can catch,
    // or we can handle it directly if we have a reference. 
    // Matterbridge intercepts these via commandHandler.
    return { status: 0, statusText: 'OK' }; // Success status
  }
}

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
      
      // ── RvcRunMode cluster ──────────────────────────────────────────
      this.endpoint.behaviors.require(CustomRvcRunModeServer, {
        supportedModes: [
          {
            label: 'Idle',
            mode: RUN_MODE_ID_IDLE,
            modeTags: [{ value: RVC_RUN_MODE_TAG_IDLE }],
          },
          {
            label: 'Cleaning',
            mode: RUN_MODE_ID_CLEANING,
            modeTags: [{ value: RVC_RUN_MODE_TAG_CLEANING }],
          },
        ],
        currentMode: RUN_MODE_ID_IDLE,
      });

      // ── RvcOperationalState cluster ─────────────────────────────────
      this.endpoint.behaviors.require(RvcOperationalStateServer, {
        operationalStateList: [
          { operationalStateId: 0x00, operationalStateLabel: 'Stopped' },
          { operationalStateId: 0x01, operationalStateLabel: 'Running' },
          { operationalStateId: 0x02, operationalStateLabel: 'Paused'  },
          { operationalStateId: 0x03, operationalStateLabel: 'Error'   },
          { operationalStateId: 0x40, operationalStateLabel: 'SeekingCharger' },
          { operationalStateId: 0x41, operationalStateLabel: 'Charging' },
          { operationalStateId: 0x42, operationalStateLabel: 'Docked'  },
        ],
        operationalState: 0x00, // Stopped
        operationalError: { errorStateId: 0x00 }, // NoError
      });

      // ── PowerSource — rechargeable battery ─────────────────────────
      const attrs = this.state.attributes as any;
      const batteryPct = attrs?.battery_level ?? attrs?.battery ?? null;
      const batPercentRemaining = batteryPct !== null ? Math.round(batteryPct * 2) : 200;
      this.endpoint.createDefaultPowerSourceRechargeableBatteryClusterServer(
        batPercentRemaining,
      );

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

    // We must handle the standard RvcRunMode command
    endpoint.addCommandHandler('RvcRunMode.changeToMode', async (data: any) => {
      this.platform.log?.info?.(`[VacuumEntity] changeToMode commanded: ${JSON.stringify(data)}`);
      const { request } = data;
      if (request?.newMode === RUN_MODE_ID_CLEANING) {
        await this.callHaService('vacuum.start');
      } else if (request?.newMode === RUN_MODE_ID_IDLE) {
        await this.callHaService('vacuum.return_to_base');
      }
    });

    // RvcOperationalState commands
    endpoint.addCommandHandler('RvcOperationalState.resume', async () => {
      await this.callHaService('vacuum.start');
    });

    endpoint.addCommandHandler('RvcOperationalState.pause', async () => {
      await this.callHaService('vacuum.pause');
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

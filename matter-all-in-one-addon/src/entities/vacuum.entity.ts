/**
 * vacuum.entity.ts
 *
 * Matterbridge entity for Home Assistant `vacuum.*` devices.
 * Exposes them as Matter 1.4 RVC (Robotic Vacuum Cleaner) — device type 0x0074.
 *
 * Apple Home recognises this since iOS 18.4 and shows:
 *   • Start / Pause / Stop / Return to Base controls
 *   • Battery level
 *   • Current cleaning status
 *   • Error state
 *
 * Compatible with any vacuum supported by HA:
 *   Tuya, Smart Life, Roborock, iRobot, Dreame, Ecovacs, Xiaomi, etc.
 *
 * RvcRunMode required modes (Matter spec §7.2):
 *   - At least one mode tagged Idle  (0x4000 = 16384)
 *   - At least one mode tagged Cleaning (0x4001 = 16385)
 *
 * RvcOperationalState required states (Matter spec §9.10):
 *   - Must expose at minimum: Stopped(0), Running(1), Paused(2), Error(3)
 *   - RVC extended: SeekingCharger(64), Charging(65), Docked(66)
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
import { safeUpdateAttribute } from '../utils/matter-attributes.js';

// Re-export so platform.ts can import from one place
export { buildVacuumMatterMeta };

// ─── RVC Mode tag constants (Matter spec §7.2.7.1) ────────────────────────
const RVC_RUN_MODE_TAG_IDLE     = 0x4000; // 16384
const RVC_RUN_MODE_TAG_CLEANING = 0x4001; // 16385

// Mode IDs used as currentMode values
const RUN_MODE_ID_IDLE     = 0;
const RUN_MODE_ID_CLEANING = 1;

export class VacuumEntity extends BaseEntity {
  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  // ─── Custom cluster initialisation ────────────────────────────────────

  /**
   * Override addCustomClusterServers to inject RvcRunMode and
   * RvcOperationalState clusters with proper initial state tables.
   * This MUST happen before addRequiredClusterServers() runs.
   */
  protected override async addCustomClusterServers(): Promise<void> {
    try {
      // ── RvcRunMode cluster ──────────────────────────────────────────
      // Matter spec mandates at least one Idle and one Cleaning mode entry.
      this.endpoint.createDefaultIdentifyClusterServer();
      this.endpoint.behaviors.require(RvcRunModeServer, {
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
      // Must expose Stopped, Running, Paused, Error + RVC extended states.
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

  override async updateState(newState: HassState, _isInitialSync = false): Promise<void> {
    if (!this.endpoint) return;
    await this.syncState(this.endpoint, newState);
    this.state = newState;
  }

  private async syncState(endpoint: MatterbridgeEndpoint, state: HassState): Promise<void> {
    const update = buildVacuumUpdate(state as any);

    try {
      // RvcOperationalState.operationalState
      safeUpdateAttribute(
        endpoint,
        'rvcOperationalState' as any,
        'operationalState',
        update.operationalState,
        this.platform.log,
      );

      // RvcRunMode.currentMode — Idle(0) or Cleaning(1)
      const runMode = update.onOff ? RUN_MODE_ID_CLEANING : RUN_MODE_ID_IDLE;
      safeUpdateAttribute(
        endpoint,
        'rvcRunMode' as any,
        'currentMode',
        runMode,
        this.platform.log,
      );

      // Battery — Matter PowerSource uses 0-200 range (batPercentRemaining)
      if (update.batteryLevel !== null) {
        safeUpdateAttribute(
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

    // RvcOperationalState commands (used by Apple Home RVC UI)
    endpoint.addCommandHandler('RvcOperationalState.resume', async () => {
      await this.callHaService('vacuum.start');
    });

    endpoint.addCommandHandler('RvcOperationalState.pause', async () => {
      await this.callHaService('vacuum.pause');
    });

    endpoint.addCommandHandler('goHome', async () => {
      await this.callHaService('vacuum.return_to_base');
    });

    // Legacy / fallback command names
    endpoint.addCommandHandler('start', async () => {
      await this.callHaService('vacuum.start');
    });

    endpoint.addCommandHandler('stop', async () => {
      await this.callHaService('vacuum.stop');
    });

    endpoint.addCommandHandler('pause', async () => {
      await this.callHaService('vacuum.pause');
    });

    endpoint.addCommandHandler('resume', async () => {
      await this.callHaService('vacuum.start');
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

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
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { AnsiLogger } from 'matterbridge/logger';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import {
  buildVacuumUpdate,
  buildVacuumMatterMeta,
  matterCommandToHaVacuum,
  RvcOperationalStateId,
} from '../converters/vacuum.converter.js';
import type { HomeAssistantPlatformConfig } from '../platform.js';

// Re-export so platform.ts can import from one place
export { buildVacuumMatterMeta };

export class VacuumEntity extends BaseEntity {
  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  // ─── Endpoint creation ─────────────────────────────────────────────

  override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const endpoint = await super.createEndpoint();

    // Apply initial state
    await this.syncState(endpoint, this.state);

    // Register RVC command handlers
    this.registerCommandHandlers(endpoint);

    return endpoint;
  }

  // ─── State sync (HA → Matter) ─────────────────────────────────────────

  override async updateState(newState: HassState): Promise<void> {
    const endpoint = this.platform.matterbridgeDevices?.get(this.state.entity_id);
    if (!endpoint) return;
    await this.syncState(endpoint, newState);
    this.state = newState;
  }

  private async syncState(endpoint: MatterbridgeEndpoint, state: HassState): Promise<void> {
    const update = buildVacuumUpdate(state as any);

    try {
      // OnOff — true while cleaning
      await endpoint.setAttribute('onOff', 'onOff', update.onOff, this.platform.log);

      // RvcOperationalState.operationalState
      await endpoint.setAttribute(
        'rvcOperationalState',
        'operationalState',
        update.operationalState,
        this.platform.log,
      );

      // Battery — Matter PowerSource uses 0-200 range (batPercentRemaining)
      if (update.batteryLevel !== null) {
        await endpoint.setAttribute(
          'powerSource',
          'batPercentRemaining',
          Math.round(update.batteryLevel * 2),
          this.platform.log,
        );
      }

      // Fan / suction speed via FanControl.percentSetting (0-100)
      if (update.fanSpeedPercent !== null) {
        await endpoint.setAttribute(
          'fanControl',
          'percentSetting',
          update.fanSpeedPercent,
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
    // start — issued by Apple Home when user taps ▶ "Clean"
    endpoint.addCommandHandler('start', async () => {
      await this.callHaService('vacuum.start');
    });

    // stop — issued when user taps ⏹ "Stop"
    endpoint.addCommandHandler('stop', async () => {
      await this.callHaService('vacuum.stop');
    });

    // pause — issued when user taps ⏸ "Pause"
    endpoint.addCommandHandler('pause', async () => {
      await this.callHaService('vacuum.pause');
    });

    // goHome / returnToBase — issued when user taps 🏠 "Return to Base"
    endpoint.addCommandHandler('goHome', async () => {
      await this.callHaService('vacuum.return_to_base');
    });

    // resume (same as start in HA)
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

  // ─── QR picker metadata ───────────────────────────────────────────────

  /**
   * Returns the Matter type label shown in the QR entity picker.
   * The frontend uses `matterType` to group/filter entities and
   * to render the correct device icon.
   */
  static matterTypeLabel = 'RoboticVacuumCleaner' as const;
}

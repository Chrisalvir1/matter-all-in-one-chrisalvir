/**
 * pet_feeder.entity.ts
 *
 * Matterbridge entity for Home Assistant pet feeder devices (Tuya, Smart Life, etc.)
 *
 * Matter 1.5 does NOT define a native "PetFeeder" device type.
 * The closest semantic match available that HomeKit accepts is `onOffPlugInUnit`
 * (a controllable outlet/plug), which Apple Home exposes as an on/off switch.
 *
 * When the user presses "Feed" (turns ON) from Apple Home:
 *   → We call `button.press` on the HA button entity (or `switch.turn_on` if switch domain)
 *   → The Tuya/Smartlife integration sends the feed command to the feeder hardware
 *
 * Apple Home DOES NOT have a native "PetFeeder" category via Matter.
 * The Aqara C1 feeder uses HAP (HomeKit Accessory Protocol) directly, bypassing Matter.
 * Over Matter, the best achievable UX is a named switch called e.g. "Alimentador Michi".
 *
 * Compatible HA domains: `button`, `switch`
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import { safeUpdateAttribute } from '../utils/matter-attributes.js';

export class PetFeederEntity extends BaseEntity {
  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  // ─── State sync (HA → Matter) ─────────────────────────────────────────

  override async updateState(newState: HassState, _isInitialSync = false): Promise<void> {
    if (!this.endpoint) return;
    const isOn = newState.state === 'on';
    safeUpdateAttribute(this.endpoint, 'onOff' as any, 'onOff', isOn, this.platform.log);
    this.state = newState;
  }

  // ─── Command handlers (Matter → HA) ───────────────────────────────────

  protected override registerCommandHandlers(endpoint?: MatterbridgeEndpoint): void {
    if (!endpoint) endpoint = this.endpoint;
    const [domain] = this.entityId.split('.');

    endpoint.addCommandHandler('on', async () => {
      try {
        if (domain === 'button') {
          await this.platform.ha?.callService('button', 'press', this.entityId);
        } else {
          await this.platform.ha?.callService('switch', 'turn_on', this.entityId);
        }
        this.platform.log?.info?.(`[PetFeederEntity] Feed triggered on ${this.entityId}`);
      } catch (err) {
        this.platform.log?.error?.(`[PetFeederEntity] Failed to trigger feed: ${err}`);
      }
    });

    endpoint.addCommandHandler('off', async () => {
      try {
        if (domain === 'switch') {
          await this.platform.ha?.callService('switch', 'turn_off', this.entityId);
        }
        this.platform.log?.info?.(`[PetFeederEntity] Off command on ${this.entityId}`);
      } catch (err) {
        this.platform.log?.error?.(`[PetFeederEntity] Failed off command: ${err}`);
      }
    });
  }

  static matterTypeLabel = 'PetFeeder' as const;
}

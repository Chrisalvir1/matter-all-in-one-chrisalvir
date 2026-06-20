/**
 * humidifier.entity.ts
 *
 * Matterbridge entity for Home Assistant `humidifier.*` devices.
 * Exposes them as either a simple Switch (OnOffPlugInUnit) or a Fan (Fan) to control target humidity.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { OnOff, FanControl } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export class HumidifierEntity extends BaseEntity {
  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    super(platform, state, deviceType);
  }

  /**
   * Determine which clusters are needed based on the selected Matter device type.
   */
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters: ClusterId[] = [];
    
    // Always include OnOff for power state
    clusters.push(OnOff.id);
    
    // If mapped as a Fan, add FanControl cluster
    if (this.deviceType.name === 'Fan') {
      clusters.push(FanControl.id);
    }
    
    return clusters;
  }

  /**
   * Register command and attribute change handlers.
   */
  protected override registerCommandHandlers(endpoint?: MatterbridgeEndpoint): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    const [domain] = this.entityId.split('.');

    // On/Off commands
    targetEndpoint.addCommandHandler('on', async () => {
      this.platform.log.debug(`Matter On commanded for ${this.entityId}`);
      await this.platform.ha.callService(domain, 'turn_on', this.entityId);
    });

    targetEndpoint.addCommandHandler('off', async () => {
      this.platform.log.debug(`Matter Off commanded for ${this.entityId}`);
      await this.platform.ha.callService(domain, 'turn_off', this.entityId);
    });

    // Writable attributes mapping: percentSetting for target humidity
    if (targetEndpoint.hasAttributeServer(FanControl.id, 'percentSetting')) {
      targetEndpoint.subscribeAttribute(
        FanControl.id,
        'percentSetting',
        async (newValue: number) => {
          this.platform.log.debug(`Matter percentSetting changed for ${this.entityId} to ${newValue}`);

          const minHum = this.state.attributes.min_humidity ?? 40;
          const maxHum = this.state.attributes.max_humidity ?? 80;
          const currentTarget = this.state.attributes.humidity ?? minHum;
          const isOn = this.state.state === 'on';

          // Map current HA target humidity to expected percentage setting
          let expectedPercent = 0;
          if (isOn) {
            expectedPercent = Math.round(((currentTarget - minHum) / (maxHum - minHum)) * 100);
            expectedPercent = Math.min(100, Math.max(1, expectedPercent));
          }

          // Avoid feedback loop if change originated from HA sync
          if (newValue === expectedPercent) {
            return;
          }

          if (newValue === 0) {
            this.platform.log.debug(`Speed set to 0. Turning off ${this.entityId}...`);
            await this.platform.ha.callService(domain, 'turn_off', this.entityId);
          } else {
            // Turn on if it is currently off
            if (!isOn) {
              this.platform.log.debug(`Turning on ${this.entityId} first...`);
              await this.platform.ha.callService(domain, 'turn_on', this.entityId);
            }

            // Map speed percentage back to target humidity range
            const targetHumidity = minHum + Math.round((newValue / 100) * (maxHum - minHum));
            this.platform.log.debug(`Setting target humidity of ${this.entityId} to ${targetHumidity}%`);
            await this.platform.ha.callService(domain, 'set_humidity', this.entityId, {
              humidity: targetHumidity,
            });
          }
        }
      );
    }
  }

  /**
   * Synchronize Home Assistant state changes to Matter attributes.
   */
  public override updateState(newState: HassState, isInitialSync = false): void {
    this.state = newState;
    if (!this.endpoint) return;

    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
    const isOn = newState.state === 'on';

    // Update OnOff
    syncFunc(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);

    // Update FanControl attributes
    if (this.endpoint.hasAttributeServer(FanControl.id, 'percentSetting')) {
      const minHum = newState.attributes.min_humidity ?? 40;
      const maxHum = newState.attributes.max_humidity ?? 80;
      const currentTarget = newState.attributes.humidity ?? minHum;

      let percent = 0;
      if (isOn) {
        percent = Math.round(((currentTarget - minHum) / (maxHum - minHum)) * 100);
        percent = Math.min(100, Math.max(1, percent));
      }

      syncFunc(this.endpoint, FanControl.id, 'percentSetting', percent, this.platform.log);
      syncFunc(this.endpoint, FanControl.id, 'percentCurrent', percent, this.platform.log);
    }
  }
}

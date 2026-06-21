/**
 * cooktop.entity.ts
 *
 * Matterbridge entity for Home Assistant cooker/stove top (hobs) devices.
 * Exposes them as a Matter 1.3 Cooktop (device type 0x0078) with an active cooking surface.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from 'matterbridge';
import { Cooktop } from 'matterbridge/devices';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export class CooktopEntity extends BaseEntity {
  public declare endpoint: Cooktop;
  public surface!: any; // reference to the child surface endpoint

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
    const uniqueName = (displayName.substring(0, 28) + ' v6').trim();

    const v6Id = this.entityId.replaceAll('.', '_') + '_v6';
    const serialNumber = v6Id + '_sn';

    this.endpoint = new Cooktop(uniqueName, serialNumber);

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.uniqueId = v6Id;
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = 'Samsung by Chrisalvir';
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = 'Samsung Cooktop';

    // Add a single cooking surface representing the hotplate/burner
    this.surface = this.endpoint.addSurface(
      'Hélices', // Burner name
      [], // tagList
    );

    this.registerCommandHandlers();

    return this.endpoint as unknown as MatterbridgeEndpoint;
  }

  override async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    if (!this.endpoint || !this.surface) return;
    await this.syncState(this.endpoint, newState, isInitialSync);
    this.state = newState;
  }

  private async syncState(endpoint: Cooktop, state: HassState, isInitialSync = false): Promise<void> {
    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    try {
      const isCooking = state.state === 'on' || state.state === 'cooking' || state.state === 'running';

      // Sync the hotplate surface status (OnOff state)
      await syncFunc(
        this.surface,
        'onOff' as any,
        'onOff',
        isCooking,
        this.platform.log,
      );
    } catch (err) {
      this.platform.log?.warn?.(`[CooktopEntity] syncState error for ${this.state.entity_id}: ${err}`);
    }
  }

  protected override registerCommandHandlers(_endpoint?: MatterbridgeEndpoint): void {
    // Cooktops are OffOnly in Matter for safety, no write command handlers needed
  }

  static matterTypeLabel = 'Cooktop' as const;
}

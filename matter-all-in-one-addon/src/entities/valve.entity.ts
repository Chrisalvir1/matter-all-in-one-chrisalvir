/**
 * valve.entity.ts
 *
 * Matter 1.6.1 + Matterbridge 3.10.11 native Water Valve entity (device type 0x0042 / waterValve).
 * Exposes Home Assistant `valve.*` devices with ValveConfigurationAndControl (0x0081) cluster,
 * supporting open/close commands, position percentage, and duration countdown timer.
 */

import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { MatterbridgeEndpoint, waterValve } from "matterbridge";
import { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";

export const ValveConfigurationAndControlId = 0x0081 as any as ClusterId;

export class ValveEntity extends BaseEntity {
  public static readonly matterTypeLabel = "WaterValve";

  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    clusters.push(ValveConfigurationAndControlId);
    return clusters;
  }

  public override async updateState(
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.state = state;
    if (!this.endpoint) return;

    const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
    const isOpen = state.state === "open" || state.state === "opening";
    const valveState = isOpen ? 1 : 0; // 0 = Closed, 1 = Open

    await updateFn(
      this.endpoint,
      ValveConfigurationAndControlId,
      "currentState",
      valveState,
      this.platform.log,
    );

    const position = state.attributes?.current_position;
    if (position !== undefined && position !== null) {
      const level = Math.max(0, Math.min(100, Math.round(Number(position))));
      await updateFn(
        this.endpoint,
        ValveConfigurationAndControlId,
        "currentLevel",
        level,
        this.platform.log,
      );
    }
  }

  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    targetEndpoint.addCommandHandler("open", async (data: any) => {
      const position = data?.request?.targetLevel;
      if (position !== undefined && position !== null) {
        await this.platform.ha?.callService(
          "valve",
          "set_valve_position",
          this.entityId,
          { position: Number(position) },
        );
      } else {
        await this.platform.ha?.callService(
          "valve",
          "open_valve",
          this.entityId,
        );
      }
    });

    targetEndpoint.addCommandHandler("close", async () => {
      await this.platform.ha?.callService(
        "valve",
        "close_valve",
        this.entityId,
      );
    });
  }
}

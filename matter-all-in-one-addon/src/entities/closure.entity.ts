import { BaseEntity } from "./base.entity.js";
import { ClusterId } from "matterbridge/matter/types";
import { MatterbridgeEndpoint } from "matterbridge";
import { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";

const ClosureDimensionId = 0x0105 as any as ClusterId;
const WindowCoveringId = 0x0102 as any as ClusterId;

export class ClosureEntity extends BaseEntity {
  protected override getRequiredClusterIds(): ClusterId[] {
    const clusters = super.getRequiredClusterIds();
    if (this.deviceType.code === 0x000d) {
      clusters.push(ClosureDimensionId);
    }
    clusters.push(WindowCoveringId);
    return clusters;
  }

  public override async updateState(
    state: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.state = state;
    const position = state.attributes.current_position;
    if (position !== undefined && position !== null) {
      // HA: 0 (closed) to 100 (open)
      // Matter: 0 (open) to 100 (closed)
      const liftPercentage =
        100 - Math.max(0, Math.min(100, Math.round(position)));
      const update = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
      await update(
        this.endpoint,
        WindowCoveringId,
        "currentPositionLiftPercent100ths",
        liftPercentage * 100,
        this.platform.log,
      );
      if (isInitialSync) {
        await safeSetAttribute(
          this.endpoint,
          WindowCoveringId,
          "currentPositionLiftPercentage",
          liftPercentage,
          this.platform.log,
        );
      } else {
        await safeUpdateAttribute(
          this.endpoint,
          WindowCoveringId,
          "currentPositionLiftPercentage",
          liftPercentage,
          this.platform.log,
        );
      }
    }
  }

  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    for (const [command, service] of Object.entries({
      upOrOpen: "open_cover",
      downOrClose: "close_cover",
      stopMotion: "stop_cover",
    })) {
      targetEndpoint.addCommandHandler(command as any, async () => {
        this.assertOnline();
        await this.platform.ha.callService("cover", service, this.entityId);
      });
    }
    targetEndpoint.addCommandHandler(
      "goToTiltPercentage" as any,
      async (data: any) => {
        this.assertOnline();
        const request = data?.request ?? data;
        const value = request.tiltPercent100thsValue;
        if (!Number.isFinite(value) || value < 0 || value > 10000)
          throw new Error("Invalid tilt");
        await this.platform.ha.callService(
          "cover",
          "set_cover_tilt_position",
          this.entityId,
          { tilt_position: 100 - Math.round(value / 100) },
        );
      },
    );
    targetEndpoint.addCommandHandler(
      "goToLiftPercentage",
      async (payload: any) => {
        this.assertOnline();
        // Safely support both liftPercentageValue (Matter 1.3/1.4) and liftPercent100thsValue (Matter 1.5/1.5.1)
        payload = payload?.request ?? payload;
        let percent: number | undefined;
        if (payload.liftPercent100thsValue !== undefined) {
          percent = Math.round(payload.liftPercent100thsValue / 100);
        } else if (payload.liftPercentageValue !== undefined) {
          percent = payload.liftPercentageValue;
        }

        if (percent !== undefined) {
          if (!Number.isFinite(percent) || percent < 0 || percent > 100)
            throw new Error("Invalid cover position");
          const haPosition = 100 - percent;
          await this.platform.ha.callService(
            "cover",
            "set_cover_position",
            this.entityId,
            {
              position: haPosition,
            },
          );
        }
      },
    );
  }
}

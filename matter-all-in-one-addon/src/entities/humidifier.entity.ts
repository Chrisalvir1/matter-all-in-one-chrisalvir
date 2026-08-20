/**
 * humidifier.entity.ts
 *
 * Matterbridge entity for Home Assistant `humidifier.*` devices.
 * Exposes them as either a simple Switch (OnOffPlugInUnit) or a Fan (Fan) to control target humidity.
 */

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import { OnOff, FanControl } from "matterbridge/matter/clusters";
import { ClusterId } from "matterbridge/matter/types";
import { BaseEntity } from "./base.entity.js";
import type { HassState } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";

export class HumidifierEntity extends BaseEntity {
  static readonly matterTypeLabel = "Humidifier";

  constructor(
    platform: any,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    super(platform, state, deviceType);
  }

  /**
   * Determine which clusters are needed based on the selected Matter device type.
   * OnOff and FanControl are already installed by BaseEntity behaviors.
   */
  protected override getRequiredClusterIds(): ClusterId[] {
    return [];
  }

  /**
   * Register command and attribute change handlers.
   */
  protected override registerCommandHandlers(
    endpoint?: MatterbridgeEndpoint,
  ): void {
    const targetEndpoint = endpoint || this.endpoint;
    if (!targetEndpoint) return;

    const [domain] = this.entityId.split(".");

    const turnOn = () => {
      this.platform.log.debug(`Matter On commanded for ${this.entityId}`);
      this.setCommandLockout("onOff", true);
      void this.platform.ha
        .callService(domain, "turn_on", this.entityId)
        .catch((err: any) => {
          this.platform.log.warn(
            `[${this.entityId}] Error turning on humidifier: ${err?.message ?? err}`,
          );
        });
    };

    const turnOff = () => {
      this.platform.log.debug(`Matter Off commanded for ${this.entityId}`);
      this.setCommandLockout("onOff", false);
      void this.platform.ha
        .callService(domain, "turn_off", this.entityId)
        .catch((err: any) => {
          this.platform.log.warn(
            `[${this.entityId}] Error turning off humidifier: ${err?.message ?? err}`,
          );
        });
    };

    const toggle = () => {
      if (this.state.state === "on") {
        turnOff();
      } else {
        turnOn();
      }
    };

    targetEndpoint.addCommandHandler("on", turnOn);
    targetEndpoint.addCommandHandler("off", turnOff);
    targetEndpoint.addCommandHandler("toggle", toggle);

    // Writable attributes mapping: percentSetting for target humidity / mist level
    if (targetEndpoint.hasAttributeServer(FanControl.id, "percentSetting")) {
      targetEndpoint.subscribeAttribute(
        FanControl.id,
        "percentSetting",
        (newValue: number) => {
          this.platform.log.debug(
            `Matter percentSetting changed for ${this.entityId} to ${newValue}`,
          );
          if (this.isUpdatingFromHa) return;
          this.setCommandLockout("percentage", newValue);

          const minHum = this.state.attributes.min_humidity ?? 40;
          const maxHum = this.state.attributes.max_humidity ?? 80;
          const availableModes: string[] =
            this.state.attributes.available_modes ?? [];

          if (newValue === 0) {
            this.setCommandLockout("onOff", false);
            this.callServiceDebounced(domain, "turn_off", undefined, 40);
          } else {
            this.setCommandLockout("onOff", true);
            // Try discrete mode if available
            if (availableModes.length > 0) {
              let targetMode: string | undefined;
              if (newValue > 66)
                targetMode = availableModes.find((m) => /high|alto|3/i.test(m));
              else if (newValue > 33)
                targetMode = availableModes.find((m) => /med|medio|2/i.test(m));
              else
                targetMode = availableModes.find((m) => /low|bajo|1/i.test(m));

              if (!targetMode) {
                targetMode = availableModes.find((m) => !/auto/i.test(m));
              }

              if (targetMode) {
                this.callServiceDebounced(
                  domain,
                  "set_mode",
                  { mode: targetMode },
                  40,
                );
                return;
              }
            }

            // Map speed percentage back to target humidity range
            if (
              this.state.attributes.min_humidity !== undefined ||
              this.state.attributes.max_humidity !== undefined ||
              typeof this.state.attributes.humidity === "number"
            ) {
              const targetHumidity =
                minHum + Math.round((newValue / 100) * (maxHum - minHum));
              this.callServiceDebounced(
                domain,
                "set_humidity",
                { humidity: targetHumidity },
                40,
              );
            } else {
              this.callServiceDebounced(domain, "turn_on", undefined, 40);
            }
          }
        },
      );

      targetEndpoint.subscribeAttribute(
        FanControl.id,
        "fanMode",
        (newMode: number) => {
          if (typeof newMode !== "number") return;
          if (this.isUpdatingFromHa) return;
          const availableModes: string[] =
            this.state.attributes.available_modes ?? [];

          if (newMode === 0) {
            this.setCommandLockout("percentage", 0);
            this.setCommandLockout("onOff", false);
            this.callServiceDebounced(domain, "turn_off", undefined, 40);
          } else if (newMode === 5) {
            // Auto mode
            this.setCommandLockout("onOff", true);
            const autoMode =
              availableModes.find((m) => /auto/i.test(m)) ?? "auto";
            this.callServiceDebounced(
              domain,
              "set_mode",
              { mode: autoMode },
              40,
            );
          } else {
            // Manual mode
            this.setCommandLockout("onOff", true);
            const manualMode =
              availableModes.find((m) => !/auto/i.test(m)) ?? "manual";
            this.callServiceDebounced(
              domain,
              "set_mode",
              { mode: manualMode },
              40,
            );
          }
        },
      );
    }
  }

  /**
   * Synchronize Home Assistant state changes to Matter attributes.
   */
  public override async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.state = newState;
    if (!this.endpoint) return;

    const syncFunc = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
    const isOn = newState.state === "on";

    // Update OnOff
    await syncFunc(this.endpoint, OnOff.id, "onOff", isOn, this.platform.log);

    // Update FanControl attributes
    if (this.endpoint.hasAttributeServer(FanControl.id, "percentSetting")) {
      const minHum = newState.attributes.min_humidity ?? 40;
      const maxHum = newState.attributes.max_humidity ?? 80;
      const currentTarget = newState.attributes.humidity;
      const mode = (newState.attributes.mode || "").toLowerCase();

      let percent = 0;
      if (isOn) {
        if (typeof currentTarget === "number" && maxHum > minHum) {
          percent = Math.round(
            ((currentTarget - minHum) / (maxHum - minHum)) * 100,
          );
        } else if (
          mode.includes("high") ||
          mode.includes("alto") ||
          mode === "3"
        ) {
          percent = 100;
        } else if (
          mode.includes("med") ||
          mode.includes("medio") ||
          mode === "2"
        ) {
          percent = 66;
        } else if (
          mode.includes("low") ||
          mode.includes("bajo") ||
          mode === "1"
        ) {
          percent = 33;
        } else {
          percent = 50;
        }
        percent = Math.min(100, Math.max(1, percent));
      }

      await syncFunc(
        this.endpoint,
        FanControl.id,
        "percentSetting",
        percent,
        this.platform.log,
      );
      await syncFunc(
        this.endpoint,
        FanControl.id,
        "percentCurrent",
        percent,
        this.platform.log,
      );
      const fanMode = isOn
        ? mode.includes("auto")
          ? 5
          : percent > 66
            ? 3
            : percent > 33
              ? 2
              : 1
        : 0;
      await syncFunc(
        this.endpoint,
        FanControl.id,
        "fanMode",
        fanMode,
        this.platform.log,
      );
    }
  }
}

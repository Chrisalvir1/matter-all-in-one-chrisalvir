/**
 * Base entity class for exposing Home Assistant entities to Matter.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from "matterbridge";
import {
  OnOff,
  LevelControl,
  ColorControl,
  FanControl,
  OccupancySensing,
  BooleanState,
  TemperatureMeasurement,
  RelativeHumidityMeasurement,
} from "matterbridge/matter/clusters";
import { ClusterId } from "matterbridge/matter/types";
import {
  MatterbridgeOnOffServer,
  MatterbridgeFanControlServer,
} from "matterbridge/behaviors";
import {
  BasicInformationServer,
  BridgedDeviceBasicInformationServer,
} from "matterbridge/matter/behaviors";
import { HomeAssistantPlatform } from "../platform.js";
import { HassState, isUnavailable } from "../utils/ha-state.js";
import {
  safeSetAttribute,
  safeUpdateAttribute,
} from "../utils/matter-attributes.js";
import { hasColorTemperatureCapability } from "../device-registry.js";
import {
  getMatterSerialNumber,
  getHaDeviceModel,
  getHaDeviceManufacturer,
  MATTER_BRIDGE_VENDOR_ID,
} from "../utils/matter-device-identity.js";
import { lightColor } from "../utils/light-color.js";
import {
  isFanOn,
  fanPercentage,
  fanDirection,
  haDirectionToMatter,
  matterDirectionToHa,
  haStateToFanMode,
  snapToPhysicalLevel,
  withinHysteresis,
  FAN_MODE_SEQUENCE,
  hasFanDirection,
  hasFanSpeed,
  hasFanAuto,
  getFanSpeedCount,
  getFanModeSequence,
  getFanControlFeatures,
  fanSpeed,
  FAN_SPEED_MAX,
} from "../converters/fan.converter.js";
import { lightConverter } from "../converters/light.converter.js";
import { applyMatterFirmware } from "../utils/matter-firmware.js";

export class BaseEntity {
  public platform: HomeAssistantPlatform;
  public entityId: string;
  public state: HassState;

  private binarySensorLatchTimeout?: NodeJS.Timeout;
  private lastCommands = new Map<string, { value: any; timestamp: number }>();
  public deviceType: DeviceTypeDefinition;

  private isDifferent(attribute: string, requested: any, actual: any): boolean {
    if (attribute === "hs_color") {
      if (!requested || !actual) return true;
      return (
        Math.abs(requested[0] - actual[0]) > 3 ||
        Math.abs(requested[1] - actual[1]) > 2
      );
    }
    if (attribute === "xy_color") {
      if (!requested || !actual) return true;
      return (
        Math.abs(requested[0] - actual[0]) > 0.01 ||
        Math.abs(requested[1] - actual[1]) > 0.01
      );
    }
    if (attribute === "brightness") {
      return Math.abs(requested - actual) > 5;
    }
    if (attribute === "fan_percentage") {
      return !withinHysteresis(requested, actual);
    }
    if (attribute === "color_temp") {
      return Math.abs(requested - actual) > 10;
    }
    return requested !== actual;
  }

  private shouldIgnoreStateUpdate(
    attribute: string,
    haValue: any,
    windowMs = 3000,
  ): boolean {
    const key = `${this.entityId}:${attribute}`;
    const last = this.lastCommands.get(key);
    if (!last) return false;

    const elapsed = Date.now() - last.timestamp;
    if (elapsed > windowMs) {
      this.lastCommands.delete(key);
      return false;
    }

    if (this.isDifferent(attribute, last.value, haValue)) {
      this.platform.log.debug(
        `[${this.entityId}] Reconciling HA feedback for ${attribute} (req=${JSON.stringify(last.value)}, got=${JSON.stringify(haValue)})`,
      );
      this.lastCommands.delete(key);
      return false; // Force reconciliation
    }

    return true; // Ignore, within window and matches
  }

  protected setCommandLockout(attribute: string, value: any) {
    this.lastCommands.set(`${this.entityId}:${attribute}`, {
      value,
      timestamp: Date.now(),
    });
  }

  private haUpdateDepth = 0;
  private lastSyncedFan = { on: false, pct: 0 };

  /** True while HA-originated changes are being written into this endpoint. */
  protected get isUpdatingFromHa(): boolean {
    return this.haUpdateDepth > 0;
  }

  private hasColorControl(
    endpoint: MatterbridgeEndpoint = this.endpoint,
  ): boolean {
    const hasClusterServer = (endpoint as any).hasClusterServer;
    if (typeof hasClusterServer === "function") {
      return hasClusterServer.call(endpoint, ColorControl);
    }
    const hasAttributeServer = (endpoint as any).hasAttributeServer;
    return (
      typeof hasAttributeServer === "function" &&
      hasAttributeServer.call(endpoint, ColorControl.id, "colorMode")
    );
  }

  protected getMatterSerialNumber(): string {
    return getMatterSerialNumber(this.platform, this.entityId);
  }

  public endpoint!: MatterbridgeEndpoint;

  protected applyMatterbridgeFirmware(
    endpoint: MatterbridgeEndpoint = this.endpoint,
  ): void {
    applyMatterFirmware(endpoint, this.platform);
  }

  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition,
  ) {
    this.platform = platform;
    this.entityId = state.entity_id;
    this.state = state;
    this.deviceType = deviceType;
  }

  protected getRequiredClusterIds(): ClusterId[] {
    const [domain] = this.entityId.split(".");
    const clusters: ClusterId[] = [];

    if (
      domain === "light" ||
      domain === "switch" ||
      domain === "media_player" ||
      domain === "vacuum"
    ) {
      const supportedModes: string[] =
        this.state.attributes.supported_color_modes ?? [];
      const hasBrightness =
        supportedModes.includes("brightness") ||
        this.state.attributes.brightness !== undefined;
      const isOnOffProfile =
        this.deviceType.code === 0x0100 || this.deviceType.code === 0x010a;
      const realColorModes = ["hs", "xy", "rgb", "rgbw", "rgbww", "color_temp"];
      const hasColorCapability =
        supportedModes.some((m) => realColorModes.includes(m)) ||
        hasColorTemperatureCapability(this.state.attributes);
      const isColorProfile =
        this.deviceType.code === 0x010c || this.deviceType.code === 0x010d;

      if ((hasBrightness || hasColorCapability) && !isOnOffProfile) {
        clusters.push(LevelControl.id);
      }
      if (hasColorCapability && isColorProfile) {
        clusters.push(ColorControl.id);
      }
    }

    return clusters;
  }

  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const hassEntry = (this.platform.ha as any)?.hassEntities?.get(this.entityId);
    const rawName =
      this.state?.attributes?.friendly_name ||
      hassEntry?.name ||
      hassEntry?.original_name ||
      this.entityId;
    let uniqueName = rawName.substring(0, 32).trim();

    // If another device with this exact deviceName already exists in Matterbridge,
    // disambiguate to prevent Matterbridge from rejecting registration.
    const existingNamedDevice = this.platform.getDeviceByName?.(uniqueName);
    if (
      existingNamedDevice &&
      existingNamedDevice.uniqueId !== this.entityId.replaceAll(".", "_")
    ) {
      const suffix = this.entityId.split(".").pop()?.replace(/.*_/, "") || "";
      const disambiguated = suffix ? `${uniqueName} ${suffix}` : `${uniqueName} (${this.entityId.split(".").pop()})`;
      uniqueName = disambiguated.substring(0, 32).trim();
    }

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll(".", "_"),
      mode: "server",
    });

    const [domain] = this.entityId.split(".");

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = uniqueName;
    this.endpoint.uniqueId = this.entityId.replaceAll(".", "_");
    this.endpoint.serialNumber = this.getMatterSerialNumber();
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    this.endpoint.vendorName = getHaDeviceManufacturer(
      this.platform,
      this.entityId,
    );
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = getHaDeviceModel(
      this.platform,
      this.entityId,
      this.deviceType.name,
    );

    this.endpoint.createDefaultBasicInformationClusterServer(
      uniqueName,
      this.endpoint.serialNumber,
      MATTER_BRIDGE_VENDOR_ID,
      this.endpoint.vendorName,
      0x8000,
      this.endpoint.productName,
    );
    this.applyMatterbridgeFirmware();

    const isFanProfile =
      this.deviceType.code === 0x002b ||
      this.deviceType.name.toLowerCase() === "fan";
    const hasDirectionSupport = hasFanDirection(this.state);
    const hasSpeedSupport = hasFanSpeed(this.state);

    if (domain === "fan" && isFanProfile) {
      const on = isFanOn(this.state);
      const pct = fanPercentage(this.state);
      const speedMax = getFanSpeedCount(this.state);
      const speed = fanSpeed(pct, speedMax);
      const fanMode = haStateToFanMode(this.state);
      const fanFeatures = getFanControlFeatures(this.state);
      const fanModeSequence = getFanModeSequence(this.state);

      this.platform.log.debug(
        `[${this.entityId}] Fan init: state=${this.state.state}, on=${on}, pct=${pct}, speed=${speed}/${speedMax}, sequence=${fanModeSequence}, speedSupport=${hasSpeedSupport}, dir=${this.state.attributes.direction ?? "N/A"}`,
      );

      if (hasSpeedSupport) {
        const fanClusterBehavior = MatterbridgeFanControlServer.with(
          ...fanFeatures,
        );
        const fanStateConfig: any = {
          fanMode,
          fanModeSequence,
          percentSetting: pct,
          percentCurrent: pct,
          speedMax,
          speedSetting: speed,
          speedCurrent: speed,
        };

        if (hasDirectionSupport) {
          fanStateConfig.airflowDirection = haDirectionToMatter(
            fanDirection(this.state),
          );
        }

        this.endpoint.behaviors.require(fanClusterBehavior, fanStateConfig);
      } else {
        // Pure On/Off fan (e.g. smart switch configured as fan) — use default FanControl server without MultiSpeed
        this.endpoint.createDefaultFanControlClusterServer(
          fanMode,
          FAN_MODE_SEQUENCE,
        );
      }

      // Dual compatibility: ensure standard OnOff server is present for controllers that send On/Off
      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with(), {
        onOff: on,
      });
    } else if (
      domain === "light" ||
      domain === "switch" ||
      domain === "media_player" ||
      domain === "vacuum" ||
      domain === "fan"
    ) {
      const isLighting =
        domain === "light" ||
        this.deviceType.name.toLowerCase().includes("light");
      this.endpoint.behaviors.require(
        isLighting
          ? MatterbridgeOnOffServer.with(OnOff.Feature.Lighting)
          : MatterbridgeOnOffServer.with(),
      );
    }

    const clusters = this.getRequiredClusterIds();
    if (clusters.length > 0) {
      this.endpoint.addClusterServers(clusters);
    }
    this.endpoint.addRequiredClusterServers();

    await this.addCustomClusterServers();

    this.registerCommandHandlers();

    return this.endpoint;
  }

  public adoptEndpoint(endpoint: MatterbridgeEndpoint): void {
    this.endpoint = endpoint;
    if (
      endpoint.commandHandler &&
      (endpoint.commandHandler as any).handler?.length === 0
    ) {
      this.registerCommandHandlers(endpoint);
    }
  }

  protected addCustomClusterServers(): void | Promise<void> {
    return;
  }

  protected serviceDebounceTimers = new Map<string, NodeJS.Timeout>();

  protected cancelDebouncedService(service: string) {
    const key = `${this.entityId}:${service}`;
    const pending = this.serviceDebounceTimers.get(key);
    if (pending) {
      clearTimeout(pending);
      this.serviceDebounceTimers.delete(key);
    }
  }

  protected assertOnline(): void {
    if (isUnavailable(this.state)) {
      this.platform.log?.debug?.(
        `[${this.entityId}] Device is currently reported unavailable/offline in Home Assistant. Forwarding command to trigger device wake/reconnect...`,
      );
    }
  }

  protected callServiceDebounced(
    domain: string,
    service: string,
    data?: Record<string, any>,
    delayMs = 60,
  ) {
    if (service === "turn_on") {
      this.cancelDebouncedService("turn_off");
    } else if (service === "turn_off") {
      this.cancelDebouncedService("turn_on");
    }
    const key = `${this.entityId}:${service}`;
    const existing = this.serviceDebounceTimers.get(key);
    if (existing) clearTimeout(existing);

    if (delayMs <= 0) {
      this.serviceDebounceTimers.delete(key);
      void this.callServiceTracked(domain, service, data);
      return;
    }

    const timer = setTimeout(() => {
      this.serviceDebounceTimers.delete(key);
      void this.callServiceTracked(domain, service, data);
    }, delayMs);
    this.serviceDebounceTimers.set(key, timer);
  }

  /** Keep BLE/service failures observable instead of creating unhandled promises. */
  private callServiceTracked(
    domain: string,
    service: string,
    data?: Record<string, any>,
  ): Promise<void> {
    const request = data === undefined
      ? this.platform.ha.callService(domain, service, this.entityId)
      : this.platform.ha.callService(domain, service, this.entityId, data);
    return request
      .then(() => undefined)
      .catch((error) => {
        this.platform.log?.warn?.(
          `[${this.entityId}] Home Assistant ${domain}.${service} failed (BLE/fan included): ${String(error)}`,
        );
      });
  }

  public get isSoftwareUpdateBoot(): boolean {
    return Boolean(
      (this.platform as any)?.matterbridge?.isSoftwareUpdateBoot ||
      (this.platform as any)?.isSoftwareUpdateBoot ||
      process.env.MATTER_UPDATE_BOOT === "true",
    );
  }

  protected async callHaServiceWithRetry(
    domain: string,
    service: string,
    data?: Record<string, any>,
    maxRetries = 2,
  ): Promise<void> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (data !== undefined) {
          await this.platform.ha.callService(domain, service, this.entityId, data);
        } else {
          await this.platform.ha.callService(domain, service, this.entityId);
        }
        return;
      } catch (err: any) {
        if (attempt === maxRetries) {
          this.platform.log.warn(
            `[${this.entityId}] HA Service ${domain}.${service} failed after ${attempt} attempts: ${err?.message ?? err}`,
          );
        } else {
          this.platform.log.debug(
            `[${this.entityId}] Retrying ${domain}.${service} (attempt ${attempt + 1}/${maxRetries}) due to: ${err?.message ?? err}`,
          );
          await new Promise((r) => setTimeout(r, 600));
        }
      }
    }
  }

  private lastFanCommandTime = 0;
  private lastFanCommandPct?: number;

  protected async callFanSpeed(percentage: number): Promise<void> {
    const nextPct = Math.max(0, Math.min(100, Number(percentage.toFixed(2))));
    const now = Date.now();
    // Drop rapid duplicate fan speed commands within 150ms to protect BLE bus
    if (
      this.lastFanCommandPct !== undefined &&
      Math.abs(this.lastFanCommandPct - nextPct) < 0.5 &&
      now - this.lastFanCommandTime < 150
    ) {
      this.platform.log.debug(
        `[${this.entityId}] Dropping duplicate fan speed command ${nextPct}% within ${now - this.lastFanCommandTime}ms`,
      );
      return;
    }
    this.lastFanCommandTime = now;
    this.lastFanCommandPct = nextPct;

    if (nextPct === 0) {
      this.setCommandLockout("fan_state", false);
      this.setCommandLockout("onOff", false);
      this.setCommandLockout("fan_percentage", 0);
      await this.callHaServiceWithRetry("fan", "turn_off");
      return;
    }

    this.setCommandLockout("fan_state", true);
    this.setCommandLockout("onOff", true);
    this.setCommandLockout("fan_percentage", nextPct);

    await this.callHaServiceWithRetry("fan", "set_percentage", { percentage: nextPct });
  }



  protected isFanCommandLocked(
    isOn: boolean,
    pct?: number,
    windowMs = 4000,
  ): boolean {
    const now = Date.now();

    // 1. Check on/off state lockout
    const stateKey = `${this.entityId}:fan_state`;
    const lastStateCmd = this.lastCommands.get(stateKey);
    if (lastStateCmd) {
      const elapsed = now - lastStateCmd.timestamp;
      if (elapsed > windowMs) {
        this.lastCommands.delete(stateKey);
      } else {
        const expectedOn =
          lastStateCmd.value === true ||
          lastStateCmd.value === "on" ||
          lastStateCmd.value === 1;
        if (isOn !== expectedOn) {
          // HA still reports the old state while BLE device is connecting/acknowledging.
          return true;
        } else {
          // HA confirmed the requested on/off state! Release lockout.
          this.lastCommands.delete(stateKey);
        }
      }
    }

    // 2. Check percentage/speed lockout
    if (pct !== undefined) {
      const pctKey = `${this.entityId}:fan_percentage`;
      const lastPctCmd = this.lastCommands.get(pctKey);
      if (lastPctCmd) {
        const elapsed = now - lastPctCmd.timestamp;
        if (elapsed > windowMs) {
          this.lastCommands.delete(pctKey);
        } else {
          const expectedPct = Number(lastPctCmd.value);
          if (!withinHysteresis(expectedPct, pct)) {
            // HA still reports stale percentage while BLE is transitioning.
            return true;
          } else {
            // HA confirmed the requested percentage! Release lockout.
            this.lastCommands.delete(pctKey);
          }
        }
      }
    }

    return false;
  }

  protected isOnOffCommandLocked(
    isOn: boolean,
    windowMs = 4000,
  ): boolean {
    const now = Date.now();
    const stateKey = `${this.entityId}:onOff`;
    const lastCmd = this.lastCommands.get(stateKey);
    if (!lastCmd) return false;

    const elapsed = now - lastCmd.timestamp;
    if (elapsed > windowMs) {
      this.lastCommands.delete(stateKey);
      return false;
    }

    const expectedOn = Boolean(lastCmd.value);
    if (isOn !== expectedOn) {
      return true;
    } else {
      this.lastCommands.delete(stateKey);
      return false;
    }
  }

  protected registerCommandHandlers(_endpoint?: MatterbridgeEndpoint) {
    const [domain] = this.entityId.split(".");

    if (
      domain === "light" ||
      domain === "switch" ||
      domain === "fan" ||
      domain === "media_player" ||
      domain === "vacuum"
    ) {
      this.endpoint.addCommandHandler("on", async () => {
        this.assertOnline();
        if (domain === "vacuum")
          await this.platform.ha.callService(domain, "start", this.entityId);
        else if (domain === "light") {
          this.setCommandLockout("onOff", true);
          this.cancelDebouncedService("turn_off");
          this.callServiceDebounced(domain, "turn_on", undefined, 0);
        } else if (domain === "fan") {
          this.setCommandLockout("fan_state", true);
          this.setCommandLockout("onOff", true);
          if (Date.now() - this.lastFanCommandTime < 150) return;
          await this.callHaServiceWithRetry(domain, "turn_on");
        } else
          await this.platform.ha.callService(domain, "turn_on", this.entityId);
      });

      this.endpoint.addCommandHandler("off", async () => {
        this.assertOnline();
        if (domain === "vacuum")
          await this.platform.ha.callService(
            domain,
            "return_to_base",
            this.entityId,
          );
        else if (domain === "light") {
          this.setCommandLockout("onOff", false);
          this.cancelDebouncedService("turn_on");
          this.callServiceDebounced(domain, "turn_off", undefined, 0);
          if (this.endpoint.hasAttributeServer(OnOff.id, "onOff")) {
            void safeUpdateAttribute(this.endpoint, OnOff.id, "onOff", false, this.platform.log);
          }
        } else if (domain === "fan") {
          this.lastFanCommandTime = Date.now();
          this.lastFanCommandPct = 0;
          this.setCommandLockout("fan_state", false);
          this.setCommandLockout("onOff", false);
          this.setCommandLockout("fan_percentage", 0);
          await this.callHaServiceWithRetry(domain, "turn_off");
        } else
          await this.platform.ha.callService(domain, "turn_off", this.entityId);
      });



      if (
        domain === "fan" &&
        hasFanSpeed(this.state) &&
        this.endpoint.hasAttributeServer(FanControl.id, "percentCurrent")
      ) {
        // ── Fan speed (step) handler ─────────────────────────────────────────
        this.endpoint.addCommandHandler(
          "FanControl.step",
          async (data: any) => {
            this.assertOnline();
            if (this.isUpdatingFromHa) return;
            const direction = data?.request?.direction ?? data?.direction;
            const current = isFanOn(this.state) ? fanPercentage(this.state) : 0;
            const speedMax = getFanSpeedCount(this.state);
            const stepSize = Math.max(1, Math.round(100 / speedMax));
            const delta =
              direction === FanControl.StepDirection.Increase ? stepSize : -stepSize;
            const next = snapToPhysicalLevel(
              Math.max(0, Math.min(100, current + delta)),
              speedMax,
            );
            this.platform.log.debug(
              `[${this.entityId}] FanControl.step: dir=${direction}, current=${current}%, next=${next}%`,
            );
            await this.callFanSpeed(next);
          },
        );

        // ── Fan percentage handler ───────────────────────────────────────────
        this.endpoint.subscribeAttribute(
          FanControl.id,
          "percentSetting",
          async (newValue: any) => {
            if (this.isUpdatingFromHa) return;
            if (typeof newValue !== "number" || isNaN(newValue)) return;
            const speedMax = getFanSpeedCount(this.state);
            const next = snapToPhysicalLevel(newValue, speedMax);
            this.platform.log.debug(
              `[${this.entityId}] FanControl.percentSetting changed: ${newValue}% -> snapped ${next}%`,
            );
            await this.callFanSpeed(next);
          },
        );

        // ── Fan discrete speed setting handler ───────────────────────────────
        if (this.endpoint.hasAttributeServer(FanControl.id, "speedSetting")) {
          this.endpoint.subscribeAttribute(
            FanControl.id,
            "speedSetting",
            async (newSpeed: any) => {
              if (this.isUpdatingFromHa) return;
              if (typeof newSpeed !== "number" || isNaN(newSpeed)) return;
              const speedMax = getFanSpeedCount(this.state);
              this.platform.log.debug(
                `[${this.entityId}] FanControl.speedSetting changed: ${newSpeed} (max=${speedMax})`,
              );
              if (newSpeed === 0) {
                await this.callFanSpeed(0);
              } else {
                const targetSpeed = Math.max(1, Math.min(speedMax, Math.round(newSpeed)));
                const step = 100 / speedMax;
                const nextPct = snapToPhysicalLevel(Math.round(targetSpeed * step), speedMax);
                await this.callFanSpeed(nextPct);
              }
            },
          );
        }

        // ── Fan mode handler (Off, Low, Med, High, On, Auto) ─────────────────
        if (this.endpoint.hasAttributeServer(FanControl.id, "fanMode")) {
          this.endpoint.subscribeAttribute(
            FanControl.id,
            "fanMode",
            async (newMode: any) => {
              if (this.isUpdatingFromHa) return;
              if (typeof newMode !== "number" || isNaN(newMode)) return;
              this.platform.log.debug(
                `[${this.entityId}] FanControl.fanMode changed: ${newMode}`,
              );

              const speedMax = getFanSpeedCount(this.state);
              if (newMode === FanControl.FanMode.Off) {
                await this.callFanSpeed(0);
              } else if (newMode === FanControl.FanMode.Low) {
                const targetPct = snapToPhysicalLevel(Math.round(100 / speedMax), speedMax);
                await this.callFanSpeed(targetPct);
              } else if (newMode === FanControl.FanMode.Medium) {
                const targetPct = snapToPhysicalLevel(50, speedMax);
                await this.callFanSpeed(targetPct);
              } else if (newMode === FanControl.FanMode.High) {
                await this.callFanSpeed(100);
              } else if (newMode === FanControl.FanMode.On) {
                this.setCommandLockout("fan_state", true);
                this.setCommandLockout("onOff", true);
                await this.callHaServiceWithRetry("fan", "turn_on");
              } else if (newMode === FanControl.FanMode.Auto && hasFanAuto(this.state)) {
                this.setCommandLockout("fan_state", true);
                await this.callHaServiceWithRetry("fan", "set_preset_mode", {
                  preset_mode: "auto",
                });
              }
            },
          );
        }
      }

      // ── Fan direction handler ────────────────────────────────────────────
      if (
        domain === "fan" &&
        this.endpoint.hasAttributeServer(FanControl.id, "airflowDirection")
      ) {
        this.endpoint.addCommandHandler(
          "FanControl.changeDirection" as any,
          async (data: any) => {
            this.assertOnline();
            const mattDir: FanControl.AirflowDirection =
              data?.request?.airflowDirection ??
              data?.airflowDirection ??
              FanControl.AirflowDirection.Forward;
            const haDir = matterDirectionToHa(mattDir);
            this.setCommandLockout("fan_direction", haDir);
            this.platform.log.debug(
              `[${this.entityId}] FanControl direction → HA: ${haDir}`,
            );
            await this.platform.ha.callService(
              "fan",
              "set_direction",
              this.entityId,
              { direction: haDir },
            );
          },
        );
      }

      if (this.endpoint.hasAttributeServer(LevelControl.id, "currentLevel")) {
        this.endpoint.addCommandHandler("moveToLevel", async (data: any) => {
          this.assertOnline();
          const level = data?.request?.level ?? data?.level;
          if (typeof level === "number") {
            const haBrightness = lightConverter.toHaBrightness(level);
            this.setCommandLockout("brightness", haBrightness);
            this.callServiceDebounced(
              domain,
              "turn_on",
              { brightness: haBrightness },
              0,
            );
          }
        });

        this.endpoint.addCommandHandler(
          "moveToLevelWithOnOff",
          async (data: any) => {
            this.assertOnline();
            const level = data?.request?.level ?? data?.level;
            if (typeof level === "number") {
              if (level === 0) {
                this.setCommandLockout("onOff", false);
                this.cancelDebouncedService("turn_on");
                this.callServiceDebounced(domain, "turn_off", undefined, 0);
              } else if (level === 1) {
                // Apple Home dimming to off sends level 1 before off. Debounce by 60ms so off can cancel it.
                this.setCommandLockout("brightness", 1);
                this.callServiceDebounced(
                  domain,
                  "turn_on",
                  { brightness: 1 },
                  60,
                );
              } else {
                const haBrightness = lightConverter.toHaBrightness(level);
                this.setCommandLockout("brightness", haBrightness);
                this.callServiceDebounced(
                  domain,
                  "turn_on",
                  { brightness: haBrightness },
                  0,
                );
              }
            }
          },
        );
      }

      if (domain === "light" && this.hasColorControl(this.endpoint)) {
        const sendColor = async (payload: any) => {
          this.assertOnline();
          if (payload.hs_color)
            this.setCommandLockout("hs_color", payload.hs_color);
          if (payload.xy_color)
            this.setCommandLockout("xy_color", payload.xy_color);
          if (payload.color_temp)
            this.setCommandLockout("color_temp", payload.color_temp);
          await this.platform.ha.callService(
            "light",
            "turn_on",
            this.entityId,
            payload,
          );
        };

        const currentHs = () => lightColor.getHsColor(this.state) ?? [0, 100];

        this.endpoint.addCommandHandler(
          "moveToHueAndSaturation",
          async (data: any) => {
            const req = data?.request ?? data;
            if (
              typeof req?.hue === "number" &&
              typeof req?.saturation === "number"
            ) {
              const hs: [number, number] = [
                lightColor.matterHueToHa(req.hue),
                lightColor.matterSatToHa(req.saturation),
              ];
              const payload = lightColor.buildColorPayload(
                this.state.attributes.supported_color_modes ?? [],
                this.state.attributes.color_mode,
                { hs },
              );
              await sendColor(payload);
            }
          },
        );

        this.endpoint.addCommandHandler("moveToHue", async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.hue === "number") {
            const [, sat] = currentHs();
            const hs: [number, number] = [
              lightColor.matterHueToHa(req.hue),
              sat,
            ];
            const payload = lightColor.buildColorPayload(
              this.state.attributes.supported_color_modes ?? [],
              this.state.attributes.color_mode,
              { hs },
            );
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler("stepHue", async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === "number") {
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1; // 1 = down, 0 = up per cluster spec usually, wait 3.10.4 spec 1 is down
            const newHue = lightColor.normalizeHue(
              hue + sign * lightColor.matterHueToHa(req.stepSize),
            );
            const hs: [number, number] = [newHue, sat];
            const payload = lightColor.buildColorPayload(
              this.state.attributes.supported_color_modes ?? [],
              this.state.attributes.color_mode,
              { hs },
            );
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler(
          "enhancedMoveToHue",
          async (data: any) => {
            const req = data?.request ?? data;
            if (typeof req?.enhancedHue === "number") {
              const [, sat] = currentHs();
              const hs: [number, number] = [
                lightColor.matterEnhancedHueToHa(req.enhancedHue),
                sat,
              ];
              const payload = lightColor.buildColorPayload(
                this.state.attributes.supported_color_modes ?? [],
                this.state.attributes.color_mode,
                { hs },
              );
              await sendColor(payload);
            }
          },
        );

        this.endpoint.addCommandHandler(
          "enhancedMoveHue",
          async (data: any) => {
            // Handled same as moveHue if direction provided, usually controller doesn't send move without stop
          },
        );

        this.endpoint.addCommandHandler(
          "enhancedStepHue",
          async (data: any) => {
            const req = data?.request ?? data;
            if (typeof req?.stepSize === "number") {
              const [hue, sat] = currentHs();
              const sign = req.stepMode === 1 ? -1 : 1;
              const newHue = lightColor.normalizeHue(
                hue + sign * lightColor.matterEnhancedHueToHa(req.stepSize),
              );
              const hs: [number, number] = [newHue, sat];
              const payload = lightColor.buildColorPayload(
                this.state.attributes.supported_color_modes ?? [],
                this.state.attributes.color_mode,
                { hs },
              );
              await sendColor(payload);
            }
          },
        );

        this.endpoint.addCommandHandler(
          "moveToSaturation",
          async (data: any) => {
            const req = data?.request ?? data;
            if (typeof req?.saturation === "number") {
              const [hue] = currentHs();
              const hs: [number, number] = [
                hue,
                lightColor.matterSatToHa(req.saturation),
              ];
              const payload = lightColor.buildColorPayload(
                this.state.attributes.supported_color_modes ?? [],
                this.state.attributes.color_mode,
                { hs },
              );
              await sendColor(payload);
            }
          },
        );

        this.endpoint.addCommandHandler("stepSaturation", async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === "number") {
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1;
            const newSat = Math.max(
              0,
              Math.min(
                100,
                sat + sign * lightColor.matterSatToHa(req.stepSize),
              ),
            );
            const hs: [number, number] = [hue, newSat];
            const payload = lightColor.buildColorPayload(
              this.state.attributes.supported_color_modes ?? [],
              this.state.attributes.color_mode,
              { hs },
            );
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler("moveToColor", async (data: any) => {
          const req = data?.request ?? data;
          if (
            typeof req?.colorX === "number" &&
            typeof req?.colorY === "number"
          ) {
            const xy = lightColor.matterXyToHa(req.colorX, req.colorY);
            const payload = lightColor.buildColorPayload(
              this.state.attributes.supported_color_modes ?? [],
              this.state.attributes.color_mode,
              { xy },
            );
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler(
          "moveToColorTemperature",
          async (data: any) => {
            const req = data?.request ?? data;
            if (
              typeof req?.colorTemperatureMireds === "number" &&
              req.colorTemperatureMireds > 0
            ) {
              const rawMireds = req.colorTemperatureMireds;
              const mireds = lightColor.clampMireds(
                rawMireds,
                this.state.attributes,
              );
              const payload = lightColor.buildColorPayload(
                this.state.attributes.supported_color_modes ?? [],
                this.state.attributes.color_mode,
                { mireds },
              );
              const usesKelvin =
                this.state.attributes.color_temp_kelvin !== undefined ||
                this.state.attributes.min_color_temp_kelvin !== undefined ||
                this.state.attributes.max_color_temp_kelvin !== undefined;
              if (usesKelvin) {
                const kelvin = lightColor.clampKelvin(
                  lightColor.miredsToKelvin(mireds),
                  this.state.attributes,
                );
                this.setCommandLockout("color_temp", mireds);
                await this.platform.ha.callService(
                  "light",
                  "turn_on",
                  this.entityId,
                  { color_temp_kelvin: kelvin },
                );
              } else {
                await sendColor(payload);
              }
            }
          },
        );
      }
    }
  }

  public async syncInitialState(): Promise<void> {
    await this.updateState(this.state, true);
    if (isUnavailable(this.state)) {
      await this.setInactiveState();
      await this.setReachability(false);
    }
  }

  /**
   * Force a full attribute push from last-known HA state to the Matter endpoint,
   * bypassing command lockouts. Called when a Matter controller subscribes or
   * reconnects (e.g., Apple Home app reopened) to ensure the controller always
   * reads the real device state and not stale cached values.
   */
  public async forceSyncStateToMatter(): Promise<void> {
    if (!this.endpoint || isUnavailable(this.state)) return;
    try {
      // Use isInitialSync=true to bypass command lockouts and always push
      await this.updateState(this.state, true);
      this.platform.log?.debug?.(
        `[${this.entityId}] forceSyncStateToMatter: full attribute push completed`,
      );
    } catch (err) {
      this.platform.log?.debug?.(
        `[${this.entityId}] forceSyncStateToMatter error: ${err}`,
      );
    }
  }

  public async setInactiveState(): Promise<void> {
    if (!this.endpoint) return;
    this.haUpdateDepth++;
    try {
      const [domain] = this.entityId.split(".");
      // For lights, switches, media players, vacuums: update onOff to false
      if (
        domain === "light" ||
        domain === "switch" ||
        domain === "media_player" ||
        domain === "vacuum"
      ) {
        if (this.endpoint.hasAttributeServer(OnOff.id, "onOff")) {
          await safeUpdateAttribute(
            this.endpoint,
            OnOff.id,
            "onOff",
            false,
            this.platform.log,
          );
        }
        this.platform.log?.debug?.(
          `[${this.entityId}] Applied inactive Matter state (onOff=false) due to HA unavailable/offline status`,
        );
      }
      // For fans: DO NOT force onOff=false or fanMode=Off when temporarily unavailable!
      // BLE fans sleep their radio and HA marks them unavailable intermittently.
      // Setting onOff=false or fanMode=Off deletes the fan's physical speed state and
      // triggers spurious turn_off command callbacks that turn off the physical fan.
      // The setReachability(false) call already accurately marks the accessory unavailable.
    } catch (err) {
      this.platform.log?.debug?.(
        `[${this.entityId}] Could not set inactive state on Matter endpoint: ${err}`,
      );
    } finally {
      this.haUpdateDepth--;
    }
  }


  private clampLevel(rawLevel: number, isInitialSync = false): number {
    if (isInitialSync) return Math.min(254, Math.max(1, rawLevel));
    try {
      const minLevel =
        (this.endpoint as any).getAttribute?.(LevelControl.id, "minLevel") ?? 1;
      const maxLevel =
        (this.endpoint as any).getAttribute?.(LevelControl.id, "maxLevel") ??
        254;
      const lo = Math.max(1, minLevel as number);
      const hi = Math.min(254, maxLevel as number);
      return Math.min(hi, Math.max(lo, rawLevel));
    } catch {
      return Math.min(254, Math.max(1, rawLevel));
    }
  }

  public async setReachability(reachable: boolean): Promise<void> {
    const ep = this.endpoint as any;
    if (!ep) return;
    try {
      // 1. ServerNode reachability (individual accessory in mode: 'server')
      const serverNode = ep.serverNode;
      if (serverNode && typeof serverNode.setStateOf === "function") {
        await serverNode.setStateOf(BasicInformationServer, { reachable });
      }

      // 2. Bridged / child endpoint reachability
      if (typeof ep.setStateOf === "function") {
        try {
          await ep.setStateOf(BridgedDeviceBasicInformationServer, { reachable });
        } catch {}
      }

      // 3. Update reachable attribute on cluster servers if present
      if (typeof ep.setAttribute === "function") {
        if (ep.hasAttributeServer?.(0x0028, "reachable")) {
          await ep.setAttribute(0x0028, "reachable", reachable, this.platform.log);
        }
        if (ep.hasAttributeServer?.(0x0039, "reachable")) {
          await ep.setAttribute(0x0039, "reachable", reachable, this.platform.log);
        }
      }

      // 4. Actively emit Matter subscription updates to controllers (Apple Home)
      if (typeof ep.updateAttribute === "function") {
        if (ep.hasAttributeServer?.(0x0039, "reachable")) {
          await ep.updateAttribute(0x0039, "reachable", reachable, this.platform.log);
        }
        if (ep.hasAttributeServer?.(0x0028, "reachable")) {
          await ep.updateAttribute(0x0028, "reachable", reachable, this.platform.log);
        }
      }
      this.platform.log?.debug?.(
        `[${this.entityId}] Updated Matter reachability to ${reachable}`,
      );
    } catch (err) {
      this.platform.log?.debug?.(
        `[${this.entityId}] Could not update reachability to ${reachable}: ${err}`,
      );
    }
  }

  public async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.haUpdateDepth++;
    try {
      const wasUnavailable = isUnavailable(this.state);
      const nowUnavailable = isUnavailable(newState);
      this.state = newState;
      if (!this.endpoint) return;

      if (nowUnavailable !== wasUnavailable || isInitialSync) {
        await this.setReachability(!nowUnavailable);
        if (nowUnavailable) {
          await this.setInactiveState();
          return;
        }
      }

      if (isInitialSync && this.isSoftwareUpdateBoot) {
        this.platform.log.notice(
          `[${this.entityId}] Software update boot detected (isSoftwareUpdateBoot=true). Preserving state without triggering reboot side-effects.`,
        );
      }

      const [domain] = this.entityId.split(".");
      const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

      if (
        domain === "light" ||
        domain === "switch" ||
        domain === "fan" ||
        domain === "media_player" ||
        domain === "vacuum"
      ) {
        const isOn =
          domain === "vacuum"
            ? newState.state === "cleaning"
            : domain === "fan"
              ? isFanOn(newState)
              : newState.state === "on";

        const beforeLevel = this.endpoint?.hasAttributeServer?.(
          LevelControl.id,
          "currentLevel",
        )
          ? this.endpoint.getAttribute(LevelControl.id, "currentLevel")
          : undefined;
        const beforeOnOff = this.endpoint?.hasAttributeServer?.(
          OnOff.id,
          "onOff",
        )
          ? this.endpoint.getAttribute(OnOff.id, "onOff")
          : undefined;
        if ((domain === "light" || domain === "switch") && !isInitialSync && this.isOnOffCommandLocked(isOn)) {
          this.platform.log.debug(
            `[${this.entityId}] Ignoring stale HA ${domain} onOff state update during command lockout window (HA: on=${isOn})`,
          );
          return;
        }

        if (domain === "light" && isOn) {
          if (newState.attributes.brightness !== undefined) {
            if (
              !isInitialSync &&
              this.shouldIgnoreStateUpdate(
                "brightness",
                newState.attributes.brightness,
              )
            ) {
              this.platform.log.debug(
                `[${this.entityId}] Ignoring HA brightness state update due to recent command lockout`,
              );
            } else {
              const raw = lightConverter.toLevel(
                newState.attributes.brightness,
              );
              const level = this.clampLevel(raw, isInitialSync);
              await updateFn(
                this.endpoint,
                LevelControl.id,
                "currentLevel",
                level,
                this.platform.log,
              );
            }
          }

          if (this.hasColorControl()) {
            const attrs = newState.attributes as any;
            const colorMode = attrs.color_mode;

            const range = lightColor.getMiredsRange(attrs);
            await updateFn(
              this.endpoint,
              ColorControl.id,
              "colorTempPhysicalMinMireds",
              range.minMireds,
              this.platform.log,
            );
            await updateFn(
              this.endpoint,
              ColorControl.id,
              "colorTempPhysicalMaxMireds",
              range.maxMireds,
              this.platform.log,
            );
            await updateFn(
              this.endpoint,
              ColorControl.id,
              "coupleColorTempMinMireds",
              range.minMireds,
              this.platform.log,
            );
            await updateFn(
              this.endpoint,
              ColorControl.id,
              "coupleColorTempMaxMireds",
              range.maxMireds,
              this.platform.log,
            );

            const minPhys =
              (this.endpoint as any).state?.colorControl
                ?.colorTempPhysicalMinMireds ?? range.minMireds;
            const maxPhys =
              (this.endpoint as any).state?.colorControl
                ?.colorTempPhysicalMaxMireds ?? range.maxMireds;
            const rawMireds =
              attrs.color_temp ??
              (attrs.color_temp_kelvin
                ? lightColor.kelvinToMireds(attrs.color_temp_kelvin)
                : undefined);
            const mireds =
              rawMireds !== undefined
                ? lightColor.clampMireds(rawMireds, attrs, {
                    minMireds: minPhys,
                    maxMireds: maxPhys,
                  })
                : undefined;
            const xy =
              Array.isArray(attrs.xy_color) && attrs.xy_color.length >= 2
                ? attrs.xy_color
                : undefined;
            const hs = lightColor.getHsColor(newState);

            if (
              mireds !== undefined &&
              (colorMode === "color_temp" || (!hs && !xy))
            ) {
              if (
                !isInitialSync &&
                this.shouldIgnoreStateUpdate("color_temp", mireds)
              ) {
                this.platform.log.debug(
                  `[${this.entityId}] Ignoring HA color_temp state update due to recent command lockout`,
                );
              } else {
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "colorTemperatureMireds",
                  mireds,
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "colorMode",
                  ColorControl.ColorMode.ColorTemperatureMireds,
                  this.platform.log,
                );
              }
            } else if (xy && (colorMode === "xy" || !hs)) {
              if (
                !isInitialSync &&
                this.shouldIgnoreStateUpdate("xy_color", xy)
              ) {
                this.platform.log.debug(
                  `[${this.entityId}] Ignoring HA xy_color state update due to recent command lockout`,
                );
              } else {
                const matterXy = lightColor.haXyToMatter(xy[0], xy[1]);
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "currentX",
                  matterXy[0],
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "currentY",
                  matterXy[1],
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "colorMode",
                  ColorControl.ColorMode.CurrentXAndCurrentY,
                  this.platform.log,
                );
              }
            } else if (hs) {
              if (
                !isInitialSync &&
                this.shouldIgnoreStateUpdate("hs_color", hs)
              ) {
                this.platform.log.debug(
                  `[${this.entityId}] Ignoring HA hs_color state update due to recent command lockout`,
                );
              } else {
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "currentHue",
                  lightColor.haHueToMatter(hs[0]),
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "enhancedCurrentHue",
                  lightColor.haHueToMatterEnhanced(hs[0]),
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "currentSaturation",
                  lightColor.haSatToMatter(hs[1]),
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  ColorControl.id,
                  "colorMode",
                  ColorControl.ColorMode.CurrentHueAndCurrentSaturation,
                  this.platform.log,
                );
                if (
                  this.endpoint.hasAttributeServer(
                    ColorControl.id,
                    "enhancedColorMode",
                  )
                ) {
                  await updateFn(
                    this.endpoint,
                    ColorControl.id,
                    "enhancedColorMode",
                    ColorControl.EnhancedColorMode
                      .EnhancedCurrentHueAndCurrentSaturation,
                    this.platform.log,
                  );
                }
              }
            }
          }
        }

        // ── Matter 1.6.1 / MatterBridge 3.10.11: StartUp Attributes ─────────
        if (isInitialSync) {
          const attrs = newState.attributes as any;
          const powerOnBehavior =
            attrs.power_on_behavior ?? attrs.startup_behavior ?? attrs.start_up_on_off;
          if (
            powerOnBehavior !== undefined &&
            this.endpoint.hasAttributeServer?.(OnOff.id, "startUpOnOff")
          ) {
            let startUpOnOff: number | null = null;
            if (powerOnBehavior === "on" || powerOnBehavior === 1) startUpOnOff = 1;
            else if (powerOnBehavior === "off" || powerOnBehavior === 0) startUpOnOff = 0;
            else if (powerOnBehavior === "toggle" || powerOnBehavior === 2) startUpOnOff = 2;
            await safeSetAttribute(
              this.endpoint,
              OnOff.id,
              "startUpOnOff",
              startUpOnOff,
              this.platform.log,
            );
          }

          const startUpLevel = attrs.start_up_current_level ?? attrs.startup_level;
          if (
            startUpLevel !== undefined &&
            this.endpoint.hasAttributeServer?.(LevelControl.id, "startUpCurrentLevel")
          ) {
            const level =
              typeof startUpLevel === "number"
                ? Math.max(1, Math.min(254, Math.round((startUpLevel * 254) / 255)))
                : null;
            await safeSetAttribute(
              this.endpoint,
              LevelControl.id,
              "startUpCurrentLevel",
              level,
              this.platform.log,
            );
          }

          const startUpColorTemp =
            attrs.start_up_color_temp ?? attrs.start_up_color_temperature_mireds;
          if (
            startUpColorTemp !== undefined &&
            this.endpoint.hasAttributeServer?.(ColorControl.id, "startUpColorTemperatureMireds")
          ) {
            const mireds =
              typeof startUpColorTemp === "number" ? Math.round(startUpColorTemp) : null;
            await safeSetAttribute(
              this.endpoint,
              ColorControl.id,
              "startUpColorTemperatureMireds",
              mireds,
              this.platform.log,
            );
          }
        }

        if (domain === "fan") {
          const speedSupported = hasFanSpeed(newState);
          const speedMax = getFanSpeedCount(newState);
          const pct = isOn ? fanPercentage(newState) : 0;
          const speed = isOn ? fanSpeed(pct, speedMax) : 0;

          if (
            !isInitialSync &&
            this.isFanCommandLocked(isOn, speedSupported ? pct : undefined)
          ) {
            this.platform.log.debug(
              `[${this.entityId}] Ignoring stale HA fan state update during command lockout window (HA: on=${isOn}, pct=${pct})`,
            );
            return;
          }

          if (this.endpoint.hasAttributeServer(OnOff.id, "onOff")) {
            await updateFn(
              this.endpoint,
              OnOff.id,
              "onOff",
              isOn,
              this.platform.log,
            );
          }

          if (this.endpoint.hasAttributeServer(FanControl.id, "fanMode")) {
            const newFanMode = haStateToFanMode(newState);
            this.lastSyncedFan = { on: isOn, pct };

            this.platform.log.debug(
              `[${this.entityId}] Fan state update: state=${newState.state}, on=${isOn}, pct=${pct}, speed=${speed}/${speedMax}, fanMode=${newFanMode}, speedSupported=${speedSupported}`,
            );

            if (
              speedSupported &&
              this.endpoint.hasAttributeServer(FanControl.id, "percentCurrent")
            ) {
              await updateFn(
                this.endpoint,
                FanControl.id,
                "percentSetting",
                pct,
                this.platform.log,
              );
              await updateFn(
                this.endpoint,
                FanControl.id,
                "percentCurrent",
                pct,
                this.platform.log,
              );

              if (
                this.endpoint.hasAttributeServer(FanControl.id, "speedCurrent")
              ) {
                await updateFn(
                  this.endpoint,
                  FanControl.id,
                  "speedSetting",
                  speed,
                  this.platform.log,
                );
                await updateFn(
                  this.endpoint,
                  FanControl.id,
                  "speedCurrent",
                  speed,
                  this.platform.log,
                );
              }
            }

            // FanMode update
            await updateFn(
              this.endpoint,
              FanControl.id,
              "fanMode",
              newFanMode,
              this.platform.log,
            );

            // AirflowDirection update (only when HA exposes direction)
            if (
              this.endpoint.hasAttributeServer(FanControl.id, "airflowDirection")
            ) {
              const dir = fanDirection(newState);
              if (dir !== undefined) {
                const matterDir = haDirectionToMatter(dir);
                await updateFn(
                  this.endpoint,
                  FanControl.id,
                  "airflowDirection",
                  matterDir,
                  this.platform.log,
                );
                this.platform.log.debug(
                  `[${this.entityId}] Fan direction synced: HA=${dir} → Matter=${matterDir}`,
                );
              }
            }
          }
          return;
        }

        await updateFn(
          this.endpoint,
          OnOff.id,
          "onOff",
          isOn,
          this.platform.log,
        );

        if (domain === "light") {
          const afterLevel = this.endpoint?.hasAttributeServer?.(
            LevelControl.id,
            "currentLevel",
          )
            ? this.endpoint.getAttribute(LevelControl.id, "currentLevel")
            : undefined;
          const afterOnOff = this.endpoint?.hasAttributeServer?.(
            OnOff.id,
            "onOff",
          )
            ? this.endpoint.getAttribute(OnOff.id, "onOff")
            : undefined;
          this.platform.log.debug(
            `[LIGHT TRACE][${this.entityId}] HA state: ${newState.state} | HA brightness: ${newState.attributes.brightness ?? "undefined"} | ` +
              `Matter CurrentLevel before: ${beforeLevel} -> after: ${afterLevel} | ` +
              `Matter OnOff before: ${beforeOnOff} -> after: ${afterOnOff} | ` +
              `source: ${isInitialSync ? "initialSync" : "haEvent"} | transaction/handler: updateState`,
          );
        }
      } else if (domain === "binary_sensor") {
        const active = ["on", "open", "detected", "true"].includes(
          newState.state.toLowerCase(),
        );

        const updateMatter = async (isActive: boolean) => {
          if (!this.endpoint) return;
          if (
            this.endpoint.hasAttributeServer(OccupancySensing.id, "occupancy")
          ) {
            await updateFn(
              this.endpoint,
              OccupancySensing.id,
              "occupancy",
              { occupied: isActive },
              this.platform.log,
            );
          } else if (
            this.endpoint.hasAttributeServer(BooleanState.id, "stateValue")
          ) {
            await updateFn(
              this.endpoint,
              BooleanState.id,
              "stateValue",
              isActive,
              this.platform.log,
            );
          }
        };

        if (active) {
          if (this.binarySensorLatchTimeout) {
            clearTimeout(this.binarySensorLatchTimeout);
            this.binarySensorLatchTimeout = undefined;
          }
          await updateMatter(true);
        } else {
          if (isInitialSync) {
            await updateMatter(false);
          } else {
            if (!this.binarySensorLatchTimeout) {
              this.binarySensorLatchTimeout = setTimeout(async () => {
                this.binarySensorLatchTimeout = undefined;
                await updateMatter(false);
              }, 3000);
            }
          }
        }
      } else if (domain === "sensor") {
        const numeric = parseFloat(newState.state);
        if (!isNaN(numeric) && this.endpoint) {
          if (
            this.endpoint.hasAttributeServer(
              TemperatureMeasurement.id,
              "measuredValue",
            )
          ) {
            await updateFn(
              this.endpoint,
              TemperatureMeasurement.id,
              "measuredValue",
              Math.round(numeric * 100),
              this.platform.log,
            );
          } else if (
            this.endpoint.hasAttributeServer(
              RelativeHumidityMeasurement.id,
              "measuredValue",
            )
          ) {
            await updateFn(
              this.endpoint,
              RelativeHumidityMeasurement.id,
              "measuredValue",
              Math.round(numeric * 100),
              this.platform.log,
            );
          }
        }
      }
    } finally {
      this.haUpdateDepth--;
    }
  }
}

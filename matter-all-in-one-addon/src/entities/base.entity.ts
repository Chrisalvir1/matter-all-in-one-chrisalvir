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
  Thermostat,
} from "matterbridge/matter/clusters";
import { ClusterId } from "matterbridge/matter/types";
import {
  MatterbridgeOnOffServer,
  MatterbridgeFanControlServer,
  MatterbridgeThermostatServer,
} from "matterbridge/behaviors";
import { HomeAssistantPlatform } from "../platform.js";
import { HassState } from "../utils/ha-state.js";
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
  hasFanOscillation,
  isFanOscillating,
  haStateToRockSetting,
  rockSettingToHa,
  getFanSpeedCount,
  getFanModeSequence,
  getFanControlFeatures,
  fanSpeed,
  FAN_SPEED_MAX,
} from "../converters/fan.converter.js";
import { lightConverter } from "../converters/light.converter.js";
import { climateConverter } from "../converters/climate.converter.js";

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
    const version = String(
      (this.platform as any).matterbridge?.matterbridgeVersion ??
        "Matterbridge",
    );
    const [major = 0, minor = 0, patch = 0] = version
      .split(/[-+.]/)
      .map((part) => Number.parseInt(part, 10) || 0);
    endpoint.softwareVersion = Math.min(
      0xffffffff,
      major * 1_000_000 + minor * 1_000 + patch,
    );
    endpoint.softwareVersionString = version.startsWith("Matterbridge")
      ? version
      : `Matterbridge ${version}`;
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

  public hasAttr(clusterId: any, attribute: string): boolean {
    return Boolean((this.endpoint as any)?.hasAttributeServer?.(clusterId, attribute));
  }

  public getCompanionTemperature(): number | null {
    if (typeof this.state?.attributes?.current_temperature === "number") {
      return this.state.attributes.current_temperature;
    }
    const deviceId = (this.platform?.ha as any)?.hassEntities?.get?.(this.entityId)?.device_id;
    const ents = (this.platform as any)?.entities;
    if (deviceId && ents) {
      const entries = typeof ents.entries === "function" ? ents.entries() : Object.entries(ents);
      for (const [eId, ent] of entries) {
        if (eId !== this.entityId && (this.platform.ha as any)?.hassEntities?.get?.(eId)?.device_id === deviceId) {
          if (
            eId.startsWith("sensor.") &&
            (eId.includes("temp") || (ent as any)?.state?.attributes?.device_class === "temperature")
          ) {
            const val = parseFloat((ent as any)?.state?.state);
            if (!isNaN(val)) {
              const unit = (ent as any)?.state?.attributes?.unit_of_measurement;
              if (unit === "°F" || unit === "F" || val > 45) {
                return (val - 32) * (5 / 9);
              }
              return val;
            }
          }
        }
      }
    }
    return null;
  }

  public getCompanionEntity(domainPrefix: string, nameKeyword?: string): BaseEntity | null {
    const deviceId = (this.platform?.ha as any)?.hassEntities?.get?.(this.entityId)?.device_id;
    const ents = (this.platform as any)?.entities;
    if (deviceId && ents) {
      const entries = typeof ents.entries === "function" ? ents.entries() : Object.entries(ents);
      for (const [eId, ent] of entries) {
        if (eId !== this.entityId && (this.platform.ha as any)?.hassEntities?.get?.(eId)?.device_id === deviceId) {
          if (eId.startsWith(domainPrefix)) {
            if (!nameKeyword || eId.toLowerCase().includes(nameKeyword.toLowerCase())) {
              return ent as BaseEntity;
            }
          }
        }
      }
    }
    return null;
  }

  public async executeSafeFanCommand(pct: number, mode?: "Low" | "Medium" | "High" | "Off" | "Auto") {
    const deviceId = (this.platform?.ha as any)?.hassEntities?.get?.(this.entityId)?.device_id;
    const [domain] = this.entityId.split(".");

    if (pct <= 0 || mode === "Off") {
      this.setCommandLockout("fan_state", "off");
      this.setCommandLockout("onOff", false);
      await this.platform.ha.callService(domain === "fan" ? "fan" : "switch", "turn_off", this.entityId);
      return;
    }

    this.setCommandLockout("fan_state", "on");
    this.setCommandLockout("onOff", true);
    this.setCommandLockout("fan_percentage", pct);

    // If native fan domain entity:
    if (domain === "fan") {
      await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: pct });
      return;
    }

    // For switch-based fan (e.g. Govee H7133 switch.ventilador_playroom):
    const gearLevel = pct <= 33 ? "1" : pct <= 66 ? "2" : "3";
    const gearRegex =
      gearLevel === "1"
        ? /^(1|low|bajo|gear 1|gear_1)$/i
        : gearLevel === "2"
        ? /^(2|medium|med|medio|gear 2|gear_2)$/i
        : /^(3|high|alto|gear 3|gear_3)$/i;

    let gearEntityId: string | undefined;
    let gearMatchedOption: string | undefined;
    let modeEntityId: string | undefined;
    let modeMatchedOption: string | undefined;
    let autoStopEntityId: string | undefined;

    if (deviceId) {
      const states = (this.platform?.ha as any)?.hassStates;
      if (states && typeof states.entries === "function") {
        for (const [eId, s] of states.entries()) {
          if ((this.platform?.ha as any)?.hassEntities?.get?.(eId)?.device_id === deviceId) {
            if (eId.startsWith("select.")) {
              if (/gear|engranaje|speed|velocidad|potencia/i.test(eId)) {
                gearEntityId = eId;
                const options: string[] = s?.attributes?.options || [];
                gearMatchedOption = options.find((opt: string) => gearRegex.test(opt));
              } else if (/mode|modo/i.test(eId)) {
                modeEntityId = eId;
                const options: string[] = s?.attributes?.options || [];
                modeMatchedOption = options.find((opt: string) => /fan|ventilador/i.test(opt));
              }
            } else if (eId.startsWith("switch.") && eId.includes("auto_stop")) {
              autoStopEntityId = eId;
            }
          }
        }
      }
    }

    // Ensure main switch is on
    if (this.state.state !== "on") {
      await this.platform.ha.callService("switch", "turn_on", this.entityId);
    }

    // Ensure mode is Fan
    if (modeEntityId && modeMatchedOption) {
      await this.platform.ha.callService("select", "select_option", modeEntityId, {
        option: modeMatchedOption,
      }).catch(() => {});
    }

    // Ensure auto_stop is off
    if (autoStopEntityId) {
      await this.platform.ha.callService("switch", "turn_off", autoStopEntityId).catch(() => {});
    }

    // Select gear option ONLY if device does NOT have a dedicated Fan mode
    // (on hybrid heaters like Govee H7133, gear/engranaje sets PTC heater wattage, which turns on heat/auto!)
    if (gearEntityId && gearMatchedOption && !modeMatchedOption) {
      await this.platform.ha.callService("select", "select_option", gearEntityId, {
        option: gearMatchedOption,
      }).catch(() => {});
    }

    // Reinforce Fan mode after 200ms to guarantee firmware never flips to heat
    setTimeout(async () => {
      if (modeEntityId && modeMatchedOption) {
        await this.platform.ha.callService("select", "select_option", modeEntityId, {
          option: modeMatchedOption,
        }).catch(() => {});
      }
      if (autoStopEntityId) {
        await this.platform.ha.callService("switch", "turn_off", autoStopEntityId).catch(() => {});
      }
    }, 200);
  }

  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;
    const uniqueName = rawName.substring(0, 32).trim();

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
      domain === "fan" ||
      this.deviceType.code === 0x002b ||
      this.deviceType.name.toLowerCase() === "fan";

    const isThermostatProfile =
      domain === "climate" ||
      this.deviceType.name.toLowerCase() === "thermostat" ||
      this.deviceType.code === 0x0301;

    const hasDirectionSupport = hasFanDirection(this.state);
    const hasSpeedSupport = hasFanSpeed(this.state);
    const hasOscillationSupport = hasFanOscillation(this.state);

    if (isFanProfile && !isThermostatProfile) {
      const on = isFanOn(this.state);
      const pct = fanPercentage(this.state) || (on ? 100 : 0);
      const speedMax = getFanSpeedCount(this.state) || 3;
      const speed = fanSpeed(pct, speedMax);
      const fanMode = haStateToFanMode(this.state);
      const fanFeatures = getFanControlFeatures(this.state);
      const fanModeSequence = getFanModeSequence(this.state);

      this.platform.log.debug(
        `[${this.entityId}] Fan init: state=${this.state.state}, on=${on}, pct=${pct}, speed=${speed}/${speedMax}, sequence=${fanModeSequence}, speedSupport=${hasSpeedSupport}, oscillationSupport=${hasOscillationSupport}, dir=${this.state.attributes.direction ?? "N/A"}`,
      );

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

      if (hasOscillationSupport) {
        fanStateConfig.rockSupport = { rockLeftRight: true };
        fanStateConfig.rockSetting = haStateToRockSetting(this.state);
      }

      this.endpoint.behaviors.require(fanClusterBehavior, fanStateConfig);
      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());

      // If ambient temperature is reported on this fan entity or companion sensor
      const compTemp = this.getCompanionTemperature();
      if (typeof this.state.attributes.current_temperature === "number") {
        this.endpoint.createDefaultTemperatureMeasurementClusterServer(
          Math.round(this.state.attributes.current_temperature * 100),
        );
      } else if (compTemp !== null) {
        this.endpoint.createDefaultTemperatureMeasurementClusterServer(
          Math.round(compTemp * 100),
        );
      }
    } else if (isThermostatProfile) {
      const thermostatFeatures: any[] = [
        Thermostat.Feature.Heating,
        Thermostat.Feature.Cooling,
        Thermostat.Feature.AutoMode,
      ];

      const thermostatServer = MatterbridgeThermostatServer.with(
        ...thermostatFeatures,
      );
      const compTemp = this.getCompanionTemperature();
      const currentTemp =
        typeof this.state.attributes.current_temperature === "number"
          ? Math.round(this.state.attributes.current_temperature * 100)
          : compTemp !== null
          ? Math.round(compTemp * 100)
          : 2200;
      const targetTemp =
        typeof this.state.attributes.temperature === "number"
          ? Math.round(this.state.attributes.temperature * 100)
          : currentTemp;
      const minTemp = Math.round(
        (this.state.attributes.min_temp ?? 10) * 100,
      );
      const maxTemp = Math.round(
        (this.state.attributes.max_temp ?? 32) * 100,
      );
      const systemMode =
        domain === "climate"
          ? climateConverter.toMatterSystemMode(this.state.state)
          : this.state.state === "on"
          ? 4 // Heat
          : 0; // Off

      this.endpoint.behaviors.require(thermostatServer, {
        localTemperature: currentTemp,
        occupiedHeatingSetpoint: targetTemp,
        minHeatSetpointLimit: minTemp,
        maxHeatSetpointLimit: maxTemp,
        absMinHeatSetpointLimit: minTemp,
        absMaxHeatSetpointLimit: maxTemp,
        systemMode,
      });
      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());
    } else if (
      domain === "light" ||
      domain === "switch" ||
      domain === "media_player" ||
      domain === "vacuum"
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
      if (data !== undefined) {
        void this.platform.ha.callService(domain, service, this.entityId, data);
      } else {
        void this.platform.ha.callService(domain, service, this.entityId);
      }
      return;
    }

    const timer = setTimeout(() => {
      this.serviceDebounceTimers.delete(key);
      if (data !== undefined) {
        void this.platform.ha.callService(domain, service, this.entityId, data);
      } else {
        void this.platform.ha.callService(domain, service, this.entityId);
      }
    }, delayMs);
    this.serviceDebounceTimers.set(key, timer);
  }

  protected registerCommandHandlers(_endpoint?: MatterbridgeEndpoint) {
    const [domain] = this.entityId.split(".");

    const isFanProfile =
      domain === "fan" ||
      this.deviceType.code === 0x002b ||
      this.deviceType.name.toLowerCase() === "fan";
    const isThermostatProfile =
      domain === "climate" ||
      this.deviceType.name.toLowerCase() === "thermostat" ||
      this.deviceType.code === 0x0301;

    if (
      domain === "light" ||
      domain === "switch" ||
      domain === "fan" ||
      domain === "media_player" ||
      domain === "vacuum" ||
      isFanProfile ||
      isThermostatProfile
    ) {
      this.endpoint.addCommandHandler("on", async () => {
        if (domain === "vacuum")
          await this.platform.ha.callService(domain, "start", this.entityId);
        else if (domain === "light") {
          this.setCommandLockout("onOff", true);
          this.cancelDebouncedService("turn_off");
          this.callServiceDebounced(domain, "turn_on", undefined, 0);
        } else if (domain === "fan") {
          this.setCommandLockout("onOff", true);
          this.setCommandLockout("fan_state", "on");
          const curPct = fanPercentage(this.state);
          const defaultPct = curPct > 0 ? curPct : 50;
          if (hasFanSpeed(this.state)) {
            await this.platform.ha.callService("fan", "turn_on", this.entityId, {
              percentage: defaultPct,
            });
          } else {
            await this.platform.ha.callService(domain, "turn_on", this.entityId);
          }
        } else if (isFanProfile) {
          this.setCommandLockout("onOff", true);
          this.setCommandLockout("fan_state", "on");
          await this.executeSafeFanCommand(100);
        } else if (isThermostatProfile) {
          this.setCommandLockout("onOff", true);
          await this.platform.ha.callService(domain, "turn_on", this.entityId);
        } else
          await this.platform.ha.callService(domain, "turn_on", this.entityId);
      });

      this.endpoint.addCommandHandler("off", async () => {
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
        } else if (domain === "fan") {
          this.setCommandLockout("onOff", false);
          this.setCommandLockout("fan_state", "off");
          await this.platform.ha.callService(domain, "turn_off", this.entityId);
        } else if (isFanProfile) {
          this.setCommandLockout("onOff", false);
          this.setCommandLockout("fan_state", "off");
          await this.executeSafeFanCommand(0, "Off");
        } else if (isThermostatProfile) {
          this.setCommandLockout("onOff", false);
          await this.platform.ha.callService(domain, "turn_off", this.entityId);
        } else
          await this.platform.ha.callService(domain, "turn_off", this.entityId);
      });

      if (
        isFanProfile &&
        this.hasAttr(FanControl.id, "percentCurrent")
      ) {
        // ── Fan speed (percentage) handler ───────────────────────────────────
        this.endpoint.addCommandHandler(
          "FanControl.step",
          async (data: any) => {
            if (this.isUpdatingFromHa) return;
            const direction = data?.request?.direction ?? data?.direction;
            const current = fanPercentage(this.state) || (this.state.state === "on" ? 100 : 0);
            const speedMax = getFanSpeedCount(this.state) || 3;
            const delta =
              direction === FanControl.StepDirection.Increase ? 10 : -10;
            const next = snapToPhysicalLevel(
              Math.max(0, Math.min(100, current + delta)),
              speedMax,
            );
            this.platform.log.debug(
              `[${this.entityId}] FanControl.step: dir=${direction}, current=${current}%, next=${next}%`,
            );
            if (domain === "fan") {
              if (next === 0) {
                this.setCommandLockout("fan_state", "off");
                this.setCommandLockout("onOff", false);
                await this.platform.ha.callService("fan", "turn_off", this.entityId);
              } else {
                this.setCommandLockout("fan_percentage", next);
                this.setCommandLockout("fan_state", "on");
                this.setCommandLockout("onOff", true);
                await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: next });
              }
            } else {
              await this.executeSafeFanCommand(next);
            }
          },
        );

        this.endpoint.subscribeAttribute(
          FanControl.id,
          "percentSetting",
          async (newValue: any) => {
            if (this.isUpdatingFromHa) return;
            if (typeof newValue === "number") {
              const speedMax = getFanSpeedCount(this.state) || 3;
              const next = snapToPhysicalLevel(newValue, speedMax);
              this.platform.log.debug(
                `[${this.entityId}] FanControl.percentSetting changed: ${newValue}% -> snapped ${next}%`,
              );
              if (domain === "fan") {
                if (next === 0) {
                  this.setCommandLockout("fan_state", "off");
                  this.setCommandLockout("onOff", false);
                  await this.platform.ha.callService("fan", "turn_off", this.entityId);
                } else {
                  this.setCommandLockout("fan_percentage", next);
                  this.setCommandLockout("fan_state", "on");
                  this.setCommandLockout("onOff", true);
                  await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: next });
                }
              } else {
                await this.executeSafeFanCommand(next);
              }
            }
          },
        );

        if (this.hasAttr(FanControl.id, "speedSetting")) {
          this.endpoint.subscribeAttribute(
            FanControl.id,
            "speedSetting",
            async (newValue: any) => {
              if (this.isUpdatingFromHa) return;
              if (typeof newValue === "number") {
                const speedMax = getFanSpeedCount(this.state) || 3;
                const pct = newValue === 0 ? 0 : (newValue / speedMax) * 100;
                const next = snapToPhysicalLevel(pct, speedMax);
                this.platform.log.debug(
                  `[${this.entityId}] FanControl.speedSetting changed: ${newValue} -> pct ${next}%`,
                );
                if (domain === "fan") {
                  if (next === 0) {
                    this.setCommandLockout("fan_state", "off");
                    this.setCommandLockout("onOff", false);
                    await this.platform.ha.callService("fan", "turn_off", this.entityId);
                  } else {
                    this.setCommandLockout("fan_percentage", next);
                    this.setCommandLockout("fan_state", "on");
                    this.setCommandLockout("onOff", true);
                    await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: next });
                  }
                } else {
                  await this.executeSafeFanCommand(next);
                }
              }
            },
          );
        }

        if (this.hasAttr(FanControl.id, "fanMode")) {
          this.endpoint.subscribeAttribute(
            FanControl.id,
            "fanMode",
            async (newMode: any) => {
              if (typeof newMode === "number") {
                this.platform.log.debug(
                  `[${this.entityId}] FanControl.fanMode changed: ${newMode}`,
                );
                if (domain === "fan") {
                  if (newMode === FanControl.FanMode.Off) {
                    this.setCommandLockout("fan_state", "off");
                    this.setCommandLockout("onOff", false);
                    await this.platform.ha.callService("fan", "turn_off", this.entityId);
                  } else if (newMode === FanControl.FanMode.Auto) {
                    this.setCommandLockout("fan_state", "on");
                    this.setCommandLockout("onOff", true);
                    if (hasFanAuto(this.state)) {
                      await this.platform.ha.callService("fan", "set_preset_mode", this.entityId, { preset_mode: "auto" });
                    } else {
                      await this.platform.ha.callService("fan", "turn_on", this.entityId);
                    }
                  } else if (newMode === FanControl.FanMode.Low) {
                    this.setCommandLockout("fan_state", "on");
                    this.setCommandLockout("onOff", true);
                    await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: 33.33 });
                  } else if (newMode === FanControl.FanMode.Medium) {
                    this.setCommandLockout("fan_state", "on");
                    this.setCommandLockout("onOff", true);
                    await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: 66.67 });
                  } else if (newMode === FanControl.FanMode.High || newMode === FanControl.FanMode.On) {
                    this.setCommandLockout("fan_state", "on");
                    this.setCommandLockout("onOff", true);
                    await this.platform.ha.callService("fan", "turn_on", this.entityId, { percentage: 100 });
                  }
                } else {
                  // Switch-based fan (Govee Plan A)
                  if (newMode === FanControl.FanMode.Off) {
                    await this.executeSafeFanCommand(0, "Off");
                  } else if (newMode === FanControl.FanMode.Low) {
                    await this.executeSafeFanCommand(33, "Low");
                  } else if (newMode === FanControl.FanMode.Medium) {
                    await this.executeSafeFanCommand(66, "Medium");
                  } else if (newMode === FanControl.FanMode.High || newMode === FanControl.FanMode.On) {
                    await this.executeSafeFanCommand(100, "High");
                  } else if (newMode === FanControl.FanMode.Auto) {
                    await this.executeSafeFanCommand(100, "Auto");
                  }
                }
              }
            },
          );
        }
      }

      // ── Fan direction handler ────────────────────────────────────────────
      if (
        domain === "fan" &&
        this.hasAttr(FanControl.id, "airflowDirection")
      ) {
        this.endpoint.addCommandHandler(
          "FanControl.changeDirection" as any,
          async (data: any) => {
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

      // ── Fan rocking / oscillation handler ────────────────────────────────
      if (
        (domain === "fan" || isFanProfile) &&
        this.hasAttr(FanControl.id, "rockSetting")
      ) {
        this.endpoint.subscribeAttribute(
          FanControl.id,
          "rockSetting",
          async (newSetting: any) => {
            if (this.isUpdatingFromHa) return;
            const isOscillating = rockSettingToHa(newSetting);
            this.setCommandLockout("fan_oscillating", isOscillating);
            this.platform.log.debug(
              `[${this.entityId}] FanControl rockSetting → HA oscillating: ${isOscillating}`,
            );
            if (domain === "fan") {
              try {
                await this.platform.ha.callService(
                  "fan",
                  "oscillate",
                  this.entityId,
                  { oscillating: isOscillating },
                );
                return;
              } catch (err: any) {
                this.platform.log.debug(
                  `[${this.entityId}] fan.oscillate failed, attempting companion switch fallback: ${err}`,
                );
              }
            }

            // Companion oscillation switch fallback for hybrid / switch fans
            const devId =
              this.platform.ha?.hassEntities?.get(this.entityId)?.device_id;
            const ents = (this.platform as any)?.entities;
            if (devId && ents) {
              const entries = typeof ents.entries === "function" ? ents.entries() : Object.entries(ents);
              for (const [sId] of entries) {
                if (
                  sId !== this.entityId &&
                  sId.startsWith("switch.") &&
                  /oscil|swing|sweep|shake|giro|rotar|pan|deflector/i.test(sId) &&
                  this.platform.ha?.hassEntities?.get(sId)?.device_id === devId
                ) {
                  await this.platform.ha.callService(
                    "switch",
                    isOscillating ? "turn_on" : "turn_off",
                    sId,
                  );
                }
              }
            }
          },
        );
      }

      if (this.hasAttr(LevelControl.id, "currentLevel")) {
        this.endpoint.addCommandHandler("moveToLevel", async (data: any) => {
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

    // ── Climate / Thermostat handlers ───────────────────────────────────
    if (isThermostatProfile) {
      if (
        this.hasAttr(
          Thermostat.id,
          "occupiedHeatingSetpoint",
        )
      ) {
        this.endpoint.subscribeAttribute(
          Thermostat.id,
          "occupiedHeatingSetpoint",
          async (newVal: any) => {
            if (this.isUpdatingFromHa) return;
            if (typeof newVal === "number") {
              const targetC = climateConverter.toCelsius(newVal);
              this.platform.log.debug(
                `[${this.entityId}] Thermostat setpoint changed: ${newVal} -> ${targetC}°C`,
              );
              this.setCommandLockout("temperature", targetC);
              if (domain === "climate") {
                await this.platform.ha.callService(
                  "climate",
                  "set_temperature",
                  this.entityId,
                  { temperature: targetC },
                );
              } else {
                // Switch-based thermostat (Plan B)
                const compTemp = this.getCompanionTemperature();
                const currentC = compTemp ?? 22;
                const mainFan = this.getCompanionEntity("switch.", "ventilador");
                if (targetC > currentC) {
                  await this.platform.ha.callService("switch", "turn_on", this.entityId);
                  if (mainFan && mainFan.state?.state === "off") {
                    await this.platform.ha.callService("switch", "turn_on", mainFan.entityId);
                  }
                } else {
                  await this.platform.ha.callService("switch", "turn_off", this.entityId);
                }
              }
            }
          },
        );
      }

      if (this.hasAttr(Thermostat.id, "systemMode")) {
        this.endpoint.subscribeAttribute(
          Thermostat.id,
          "systemMode",
          async (newMode: any) => {
            if (this.isUpdatingFromHa) return;
            if (typeof newMode === "number") {
              if (domain === "climate") {
                const hvacMode = climateConverter.toHaHvacMode(newMode);
                this.platform.log.debug(
                  `[${this.entityId}] Thermostat systemMode changed: ${newMode} -> ${hvacMode}`,
                );
                this.setCommandLockout("climate_state", hvacMode);
                await this.platform.ha.callService(
                  "climate",
                  "set_hvac_mode",
                  this.entityId,
                  { hvac_mode: hvacMode },
                );
              } else {
                // Switch-based thermostat (Plan B)
                const mainFan = this.getCompanionEntity("switch.", "ventilador");
                if (newMode === 0) {
                  // Off: turn off heating and main fan
                  await this.platform.ha.callService("switch", "turn_off", this.entityId);
                  if (mainFan) {
                    await this.platform.ha.callService("switch", "turn_off", mainFan.entityId);
                  }
                } else if (newMode === 3) {
                  // Cool / Ventilation (Fan without heating)
                  await this.platform.ha.callService("switch", "turn_off", this.entityId);
                  if (mainFan) {
                    if (typeof (mainFan as any).executeSafeFanCommand === "function") {
                      await (mainFan as any).executeSafeFanCommand(100);
                    } else {
                      await this.platform.ha.callService("switch", "turn_on", mainFan.entityId);
                    }
                  }
                } else if (newMode === 4) {
                  // Heat
                  await this.platform.ha.callService("switch", "turn_on", this.entityId);
                  if (mainFan && mainFan.state?.state === "off") {
                    await this.platform.ha.callService("switch", "turn_on", mainFan.entityId);
                  }
                } else if (newMode === 1) {
                  // Auto
                  const setpoint = this.endpoint.getAttribute(Thermostat.id, "occupiedHeatingSetpoint") ?? 2200;
                  const targetC = setpoint / 100;
                  const compTemp = this.getCompanionTemperature();
                  const currentC = compTemp ?? 22;
                  if (targetC > currentC) {
                    await this.platform.ha.callService("switch", "turn_on", this.entityId);
                    if (mainFan && mainFan.state?.state === "off") {
                      await this.platform.ha.callService("switch", "turn_on", mainFan.entityId);
                    }
                  } else {
                    await this.platform.ha.callService("switch", "turn_off", this.entityId);
                  }
                }
              }
            }
          },
        );
      }
    }
  }

  public async syncInitialState(): Promise<void> {
    await this.updateState(this.state, true);
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

  public async updateState(
    newState: HassState,
    isInitialSync = false,
  ): Promise<void> {
    this.haUpdateDepth++;
    try {
      this.state = newState;
      if (!this.endpoint) return;

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
                  this.hasAttr(
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

        await updateFn(
          this.endpoint,
          OnOff.id,
          "onOff",
          isOn,
          this.platform.log,
        );

        if (domain === "light") {
          const afterLevel = this.hasAttr(
            LevelControl.id,
            "currentLevel",
          )
            ? this.endpoint.getAttribute(LevelControl.id, "currentLevel")
            : undefined;
          const afterOnOff = this.hasAttr(
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

        if (
          this.hasAttr(FanControl.id, "fanMode")
        ) {
          const speedSupported = hasFanSpeed(newState) || this.hasAttr(FanControl.id, "percentCurrent");
          const speedMax = getFanSpeedCount(newState) || 3;
          const pct = isOn ? (fanPercentage(newState) || 100) : 0;
          const speed = isOn ? (fanSpeed(pct, speedMax) || 1) : 0;
          const newFanMode = haStateToFanMode(newState);

          this.platform.log.debug(
            `[${this.entityId}] Fan state update: state=${newState.state}, on=${isOn}, pct=${pct}, speed=${speed}, fanMode=${newFanMode}, speedSupported=${speedSupported}, direction=${newState.attributes.direction ?? "N/A"}, oscillating=${newState.attributes.oscillating ?? "N/A"}, preset=${newState.attributes.preset_mode ?? "N/A"}`,
          );

          if (
            speedSupported &&
            this.hasAttr(FanControl.id, "percentCurrent")
          ) {
            // Percentage / speed update with hysteresis and lockout
            if (
              !isInitialSync &&
              this.shouldIgnoreStateUpdate("fan_percentage", pct)
            ) {
              this.platform.log.debug(
                `[${this.entityId}] Ignoring HA fan_percentage update due to command lockout (pct=${pct})`,
              );
            } else {
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
                this.hasAttr(FanControl.id, "speedCurrent")
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
            this.hasAttr(FanControl.id, "airflowDirection")
          ) {
            const dir = fanDirection(newState);
            if (dir !== undefined) {
              if (
                !isInitialSync &&
                this.shouldIgnoreStateUpdate("fan_direction", dir)
              ) {
                this.platform.log.debug(
                  `[${this.entityId}] Ignoring HA direction update due to command lockout (dir=${dir})`,
                );
              } else {
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

          // Rocking (Oscillation) update
          if (this.hasAttr(FanControl.id, "rockSetting")) {
            const isOscillating = isFanOscillating(newState);
            if (
              !isInitialSync &&
              this.shouldIgnoreStateUpdate("fan_oscillating", isOscillating)
            ) {
              this.platform.log.debug(
                `[${this.entityId}] Ignoring HA oscillating update due to command lockout (oscillating=${isOscillating})`,
              );
            } else {
              const rockSetting = haStateToRockSetting(newState);
              await updateFn(
                this.endpoint,
                FanControl.id,
                "rockSetting",
                rockSetting,
                this.platform.log,
              );
              this.platform.log.debug(
                `[${this.entityId}] Fan rocking synced: HA=${isOscillating} → Matter=${JSON.stringify(rockSetting)}`,
              );
            }
          }

          // Ambient temperature on fan endpoint
          if (
            typeof newState.attributes.current_temperature === "number" &&
            this.hasAttr(
              TemperatureMeasurement.id,
              "measuredValue",
            )
          ) {
            await updateFn(
              this.endpoint,
              TemperatureMeasurement.id,
              "measuredValue",
              Math.round(newState.attributes.current_temperature * 100),
              this.platform.log,
            );
          }
        }
      } else if (
        domain === "climate" ||
        this.hasAttr(Thermostat.id, "systemMode") ||
        this.hasAttr(Thermostat.id, "localTemperature")
      ) {
        const compTemp = this.getCompanionTemperature();
        const currentTemp =
          typeof newState.attributes.current_temperature === "number"
            ? newState.attributes.current_temperature
            : compTemp;

        if (
          this.hasAttr(Thermostat.id, "localTemperature") &&
          typeof currentTemp === "number"
        ) {
          await updateFn(
            this.endpoint,
            Thermostat.id,
            "localTemperature",
            Math.round(currentTemp * 100),
            this.platform.log,
          );
        }

        if (
          this.hasAttr(
            Thermostat.id,
            "occupiedHeatingSetpoint",
          ) &&
          typeof newState.attributes.temperature === "number"
        ) {
          if (
            !isInitialSync &&
            this.shouldIgnoreStateUpdate(
              "temperature",
              newState.attributes.temperature,
            )
          ) {
            this.platform.log.debug(
              `[${this.entityId}] Ignoring HA climate target temp update due to command lockout`,
            );
          } else {
            await updateFn(
              this.endpoint,
              Thermostat.id,
              "occupiedHeatingSetpoint",
              Math.round(newState.attributes.temperature * 100),
              this.platform.log,
            );
          }
        }

        if (this.hasAttr(Thermostat.id, "systemMode")) {
          if (
            !isInitialSync &&
            this.shouldIgnoreStateUpdate("climate_state", newState.state)
          ) {
            this.platform.log.debug(
              `[${this.entityId}] Ignoring HA climate state update due to command lockout`,
            );
          } else {
            const systemMode =
              domain === "climate"
                ? climateConverter.toMatterSystemMode(newState.state)
                : newState.state === "on"
                ? 4 // Heat
                : 0; // Off
            await updateFn(
              this.endpoint,
              Thermostat.id,
              "systemMode",
              systemMode,
              this.platform.log,
            );
          }
        }
      } else if (domain === "binary_sensor") {
        const active = ["on", "open", "detected", "true"].includes(
          newState.state.toLowerCase(),
        );

        const updateMatter = async (isActive: boolean) => {
          if (!this.endpoint) return;
          if (
            this.hasAttr(OccupancySensing.id, "occupancy")
          ) {
            await updateFn(
              this.endpoint,
              OccupancySensing.id,
              "occupancy",
              { occupied: isActive },
              this.platform.log,
            );
          } else if (
            this.hasAttr(BooleanState.id, "stateValue")
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
            this.hasAttr(
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
            this.hasAttr(
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

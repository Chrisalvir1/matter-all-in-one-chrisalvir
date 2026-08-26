/**
 * Base entity class for exposing Home Assistant entities to Matter.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { OnOff, LevelControl, ColorControl, FanControl, OccupancySensing, BooleanState, TemperatureMeasurement, RelativeHumidityMeasurement } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { MatterbridgeOnOffServer, MatterbridgeFanControlServer } from 'matterbridge/behaviors';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';
import { hasColorTemperatureCapability } from '../device-registry.js';
import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID } from '../utils/matter-device-identity.js';
import { lightColor } from '../utils/light-color.js';
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
} from '../converters/fan.converter.js';
import { lightConverter } from '../converters/light.converter.js';

export class BaseEntity {
  public platform: HomeAssistantPlatform;
  public entityId: string;
  public state: HassState;

  private binarySensorLatchTimeout?: NodeJS.Timeout;
  private lastCommands = new Map<string, { value: any; timestamp: number }>();
  public deviceType: DeviceTypeDefinition;

  private isDifferent(attribute: string, requested: any, actual: any): boolean {
    if (attribute === 'hs_color') {
      if (!requested || !actual) return true;
      return Math.abs(requested[0] - actual[0]) > 3 || Math.abs(requested[1] - actual[1]) > 2;
    }
    if (attribute === 'xy_color') {
      if (!requested || !actual) return true;
      return Math.abs(requested[0] - actual[0]) > 0.01 || Math.abs(requested[1] - actual[1]) > 0.01;
    }
    if (attribute === 'brightness') {
      return Math.abs(requested - actual) > 5;
    }
    if (attribute === 'fan_percentage') {
      return !withinHysteresis(requested, actual);
    }
    if (attribute === 'color_temp') {
      return Math.abs(requested - actual) > 10;
    }
    return requested !== actual;
  }

  private shouldIgnoreStateUpdate(attribute: string, haValue: any, windowMs = 3000): boolean {
    const key = `${this.entityId}:${attribute}`;
    const last = this.lastCommands.get(key);
    if (!last) return false;

    const elapsed = Date.now() - last.timestamp;
    if (elapsed > windowMs) {
      this.lastCommands.delete(key);
      return false;
    }

    if (this.isDifferent(attribute, last.value, haValue)) {
      this.platform.log.debug(`[${this.entityId}] Reconciling HA feedback for ${attribute} (req=${JSON.stringify(last.value)}, got=${JSON.stringify(haValue)})`);
      this.lastCommands.delete(key);
      return false; // Force reconciliation
    }

    return true; // Ignore, within window and matches
  }

  protected setCommandLockout(attribute: string, value: any) {
    this.lastCommands.set(`${this.entityId}:${attribute}`, { value, timestamp: Date.now() });
  }

  private haUpdateDepth = 0;

  /** True while HA-originated changes are being written into this endpoint. */
  protected get isUpdatingFromHa(): boolean {
    return this.haUpdateDepth > 0;
  }

  private serviceDebounceTimers = new Map<string, NodeJS.Timeout>();

  protected callServiceDebounced(
    domain: string,
    service: string,
    data?: Record<string, any>,
    delayMs = 40,
  ) {
    const key = `${this.entityId}:${domain}.${service}`;
    const existing = this.serviceDebounceTimers.get(key);
    if (existing) clearTimeout(existing);

    this.serviceDebounceTimers.set(
      key,
      setTimeout(() => {
        this.serviceDebounceTimers.delete(key);
        const promise =
          data !== undefined
            ? this.platform.ha.callService(domain, service, this.entityId, data)
            : this.platform.ha.callService(domain, service, this.entityId);
        promise.catch((err: any) => {
          this.platform.log.warn(
            `[${this.entityId}] Error calling ${domain}.${service}: ${err?.message ?? err}`,
          );
        });
      }, delayMs),
    );
  }

  private hasColorControl(endpoint: MatterbridgeEndpoint = this.endpoint): boolean {
    const hasClusterServer = (endpoint as any).hasClusterServer;
    if (typeof hasClusterServer === 'function') {
      return hasClusterServer.call(endpoint, ColorControl);
    }
    const hasAttributeServer = (endpoint as any).hasAttributeServer;
    return typeof hasAttributeServer === 'function' && hasAttributeServer.call(endpoint, ColorControl.id, 'colorMode');
  }

  protected getMatterSerialNumber(): string {
    return getMatterSerialNumber(this.platform, this.entityId);
  }

  public endpoint!: MatterbridgeEndpoint;

  protected applyMatterbridgeFirmware(endpoint: MatterbridgeEndpoint = this.endpoint): void {
    const version = String((this.platform as any).matterbridge?.matterbridgeVersion ?? 'Matterbridge');
    const [major = 0, minor = 0, patch = 0] = version.split(/[-+.]/).map((part) => Number.parseInt(part, 10) || 0);
    endpoint.softwareVersion = Math.min(0xffffffff, major * 1_000_000 + minor * 1_000 + patch);
    endpoint.softwareVersionString = version.startsWith('Matterbridge') ? version : `Matterbridge ${version}`;
  }

  constructor(platform: HomeAssistantPlatform, state: HassState, deviceType: DeviceTypeDefinition) {
    this.platform = platform;
    this.entityId = state.entity_id;
    this.state = state;
    this.deviceType = deviceType;
  }

  protected getRequiredClusterIds(): ClusterId[] {
    const [domain] = this.entityId.split('.');
    const clusters: ClusterId[] = [];

    if (domain === 'light' || domain === 'switch' || domain === 'media_player' || domain === 'vacuum') {
      const supportedModes: string[] = this.state.attributes.supported_color_modes ?? [];
      const hasBrightness = supportedModes.includes('brightness') || this.state.attributes.brightness !== undefined;
      const isOnOffProfile = this.deviceType.code === 0x0100 || this.deviceType.code === 0x010a; 
      const realColorModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp'];
      const hasColorCapability =
        supportedModes.some((m) => realColorModes.includes(m)) ||
        hasColorTemperatureCapability(this.state.attributes);
      const isColorProfile = this.deviceType.code === 0x010c || this.deviceType.code === 0x010d; 
      
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
    const rawName = this.state.attributes.friendly_name ?? this.entityId;
    const uniqueName = rawName.substring(0, 32).trim();

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll('.', '_'),
      mode: 'server',
    });

    const [domain] = this.entityId.split('.');

    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = uniqueName;
    this.endpoint.uniqueId = this.entityId.replaceAll('.', '_');
    this.endpoint.serialNumber = this.getMatterSerialNumber();
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    this.endpoint.vendorName = getHaDeviceManufacturer(this.platform, this.entityId);
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = getHaDeviceModel(this.platform, this.entityId, this.deviceType.name);

    this.endpoint.createDefaultBasicInformationClusterServer(
      uniqueName,
      this.endpoint.serialNumber,
      MATTER_BRIDGE_VENDOR_ID,
      this.endpoint.vendorName,
      0x8000,
      this.endpoint.productName,
    );
    this.applyMatterbridgeFirmware();

    const isFanProfile = this.deviceType.code === 0x002b || this.deviceType.name.toLowerCase() === 'fan';
    const hasDirectionSupport = hasFanDirection(this.state);
    const hasSpeedSupport = hasFanSpeed(this.state);

    if (domain === 'fan' && isFanProfile) {
      const on = isFanOn(this.state);
      const pct = fanPercentage(this.state);
      const speedMax = getFanSpeedCount(this.state);
      const speed = fanSpeed(pct, speedMax);
      const fanMode = haStateToFanMode(this.state);
      const fanFeatures = getFanControlFeatures(this.state);
      const fanModeSequence = getFanModeSequence(this.state);

      this.platform.log.debug(
        `[${this.entityId}] Fan init: state=${this.state.state}, on=${on}, pct=${pct}, speed=${speed}/${speedMax}, sequence=${fanModeSequence}, speedSupport=${hasSpeedSupport}, dir=${this.state.attributes.direction ?? 'N/A'}`,
      );

      if (hasSpeedSupport) {
        const fanClusterBehavior = MatterbridgeFanControlServer.with(...fanFeatures);
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
          fanStateConfig.airflowDirection = haDirectionToMatter(fanDirection(this.state));
        }

        this.endpoint.behaviors.require(fanClusterBehavior, fanStateConfig);
      } else {
        // Pure On/Off fan (e.g. smart switch configured as fan) — use default FanControl server without MultiSpeed
        this.endpoint.createDefaultFanControlClusterServer(
          fanMode,
          FAN_MODE_SEQUENCE,
        );
      }

      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());
    } else if (domain === 'light' || domain === 'switch' || domain === 'media_player' || domain === 'vacuum' || domain === 'fan') {
      const isLighting = domain === 'light' || this.deviceType.name.toLowerCase().includes('light');
      this.endpoint.behaviors.require(isLighting ? MatterbridgeOnOffServer.with(OnOff.Feature.Lighting) : MatterbridgeOnOffServer.with());
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
    if (endpoint.commandHandler && (endpoint.commandHandler as any).handler?.length === 0) {
      this.registerCommandHandlers(endpoint);
    }
  }

  protected addCustomClusterServers(): void | Promise<void> {
    return;
  }

  protected registerCommandHandlers(_endpoint?: MatterbridgeEndpoint) {
    const [domain] = this.entityId.split('.');

    if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum') {
      this.endpoint.addCommandHandler('on', async () => {
        if (domain === 'vacuum') await this.platform.ha.callService(domain, 'start', this.entityId);
        else await this.platform.ha.callService(domain, 'turn_on', this.entityId);
      });

      this.endpoint.addCommandHandler('off', async () => {
        if (domain === 'vacuum') await this.platform.ha.callService(domain, 'return_to_base', this.entityId);
        else await this.platform.ha.callService(domain, 'turn_off', this.entityId);
      });

      if (domain === 'fan' && hasFanSpeed(this.state) && this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
        // ── Fan speed (percentage) handler ───────────────────────────────────
        this.endpoint.addCommandHandler('FanControl.step', async (data: any) => {
          if (this.isUpdatingFromHa) return;
          if (!hasFanSpeed(this.state)) return;
          const direction = data?.request?.direction ?? data?.direction;
          // Read current % from HA state, NOT from last_percentage
          const current = fanPercentage(this.state);
          const speedMax = getFanSpeedCount(this.state);
          const delta = direction === FanControl.StepDirection.Increase ? 10 : -10;
          const next = snapToPhysicalLevel(Math.max(0, Math.min(100, current + delta)), speedMax);
          this.platform.log.debug(
            `[${this.entityId}] FanControl.step: dir=${direction}, current=${current}%, next=${next}%`,
          );
          if (next === 0) {
            this.setCommandLockout('fan_state', 'off');
            await this.platform.ha.callService('fan', 'turn_off', this.entityId);
          } else {
            this.setCommandLockout('fan_percentage', next);
            await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: next });
          }
        });

        this.endpoint.subscribeAttribute(FanControl.id, 'percentSetting', async (newValue: any) => {
          if (this.isUpdatingFromHa) return;
          if (!hasFanSpeed(this.state)) return;
          if (typeof newValue === 'number') {
            const speedMax = getFanSpeedCount(this.state);
            const next = snapToPhysicalLevel(newValue, speedMax);
            this.platform.log.debug(`[${this.entityId}] FanControl.percentSetting changed: ${newValue}% -> snapped ${next}%`);
            if (next === 0) {
              this.setCommandLockout('fan_state', 'off');
              await this.platform.ha.callService('fan', 'turn_off', this.entityId);
            } else {
              this.setCommandLockout('fan_percentage', next);
              await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: next });
            }
          }
        });

        if (this.endpoint.hasAttributeServer(FanControl.id, 'speedSetting')) {
          this.endpoint.subscribeAttribute(FanControl.id, 'speedSetting', async (newValue: any) => {
            if (this.isUpdatingFromHa) return;
            if (!hasFanSpeed(this.state)) return;
            if (typeof newValue === 'number') {
              const speedMax = getFanSpeedCount(this.state);
              const pct = newValue === 0 ? 0 : (newValue / speedMax) * 100;
              const next = snapToPhysicalLevel(pct, speedMax);
              this.platform.log.debug(`[${this.entityId}] FanControl.speedSetting changed: ${newValue} -> pct ${next}%`);
              if (next === 0) {
                this.setCommandLockout('fan_state', 'off');
                await this.platform.ha.callService('fan', 'turn_off', this.entityId);
              } else {
                this.setCommandLockout('fan_percentage', next);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: next });
              }
            }
          });
        }

        if (this.endpoint.hasAttributeServer(FanControl.id, 'fanMode')) {
          this.endpoint.subscribeAttribute(FanControl.id, 'fanMode', async (newMode: any) => {
            if (typeof newMode === 'number') {
              this.platform.log.debug(`[${this.entityId}] FanControl.fanMode changed: ${newMode}`);
              if (newMode === FanControl.FanMode.Off) {
                this.setCommandLockout('fan_state', 'off');
                await this.platform.ha.callService('fan', 'turn_off', this.entityId);
              } else if (newMode === FanControl.FanMode.Auto) {
                if (hasFanAuto(this.state)) {
                  await this.platform.ha.callService('fan', 'set_preset_mode', this.entityId, { preset_mode: 'auto' });
                } else {
                  await this.platform.ha.callService('fan', 'turn_on', this.entityId);
                }
              } else if (newMode === FanControl.FanMode.Low) {
                const speedMax = getFanSpeedCount(this.state);
                const pct = snapToPhysicalLevel(33.33, speedMax);
                this.setCommandLockout('fan_percentage', pct);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: pct });
              } else if (newMode === FanControl.FanMode.Medium) {
                const speedMax = getFanSpeedCount(this.state);
                const pct = snapToPhysicalLevel(66.67, speedMax);
                this.setCommandLockout('fan_percentage', pct);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: pct });
              } else if (newMode === FanControl.FanMode.High) {
                const speedMax = getFanSpeedCount(this.state);
                const pct = snapToPhysicalLevel(100, speedMax);
                this.setCommandLockout('fan_percentage', pct);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: pct });
              } else if (newMode === FanControl.FanMode.On) {
                await this.platform.ha.callService('fan', 'turn_on', this.entityId);
              }
            }
          });
        }
      }

      // ── Fan direction handler ────────────────────────────────────────────
      if (domain === 'fan' && this.endpoint.hasAttributeServer(FanControl.id, 'airflowDirection')) {
        this.endpoint.addCommandHandler('FanControl.changeDirection' as any, async (data: any) => {
          const mattDir: FanControl.AirflowDirection = data?.request?.airflowDirection ?? data?.airflowDirection ?? FanControl.AirflowDirection.Forward;
          const haDir = matterDirectionToHa(mattDir);
          this.platform.log.debug(`[${this.entityId}] FanControl direction → HA: ${haDir}`);
          this.setCommandLockout('fan_direction', haDir);
          await this.platform.ha.callService('fan', 'set_direction', this.entityId, { direction: haDir });
        });
      }

      if (this.endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
        this.endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data?.request?.level ?? data?.level;
          if (typeof level === 'number') {
            const haBrightness = lightConverter.toHaBrightness(level);
            this.setCommandLockout('brightness', haBrightness);
            await this.platform.ha.callService(domain, 'turn_on', this.entityId, { brightness: haBrightness });
          }
        });

        this.endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
          const level = data?.request?.level ?? data?.level;
          if (typeof level === 'number') {
            if (level === 0) {
              await this.platform.ha.callService(domain, 'turn_off', this.entityId);
            } else {
              const haBrightness = lightConverter.toHaBrightness(level);
              this.setCommandLockout('brightness', haBrightness);
              await this.platform.ha.callService(domain, 'turn_on', this.entityId, { brightness: haBrightness });
            }
          }
        });
      }

      if (domain === 'light' && this.hasColorControl(this.endpoint)) {
        const sendColor = async (payload: any) => {
          if (payload.hs_color) this.setCommandLockout('hs_color', payload.hs_color);
          if (payload.xy_color) this.setCommandLockout('xy_color', payload.xy_color);
          if (payload.color_temp) this.setCommandLockout('color_temp', payload.color_temp);
          await this.platform.ha.callService('light', 'turn_on', this.entityId, payload);
        };

        const currentHs = () => lightColor.getHsColor(this.state) ?? [0, 100];

        this.endpoint.addCommandHandler('moveToHueAndSaturation', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.hue === 'number' && typeof req?.saturation === 'number') {
            const hs: [number, number] = [lightColor.matterHueToHa(req.hue), lightColor.matterSatToHa(req.saturation)];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('moveToHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.hue === 'number') {
            const [, sat] = currentHs();
            const hs: [number, number] = [lightColor.matterHueToHa(req.hue), sat];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('stepHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === 'number') {
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1; // 1 = down, 0 = up per cluster spec usually, wait 3.10.4 spec 1 is down
            const newHue = lightColor.normalizeHue(hue + (sign * lightColor.matterHueToHa(req.stepSize)));
            const hs: [number, number] = [newHue, sat];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('enhancedMoveToHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.enhancedHue === 'number') {
            const [, sat] = currentHs();
            const hs: [number, number] = [lightColor.matterEnhancedHueToHa(req.enhancedHue), sat];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('enhancedMoveHue', async (data: any) => {
          // Handled same as moveHue if direction provided, usually controller doesn't send move without stop
        });

        this.endpoint.addCommandHandler('enhancedStepHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === 'number') {
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1;
            const newHue = lightColor.normalizeHue(hue + (sign * lightColor.matterEnhancedHueToHa(req.stepSize)));
            const hs: [number, number] = [newHue, sat];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('moveToSaturation', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.saturation === 'number') {
            const [hue] = currentHs();
            const hs: [number, number] = [hue, lightColor.matterSatToHa(req.saturation)];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });
        
        this.endpoint.addCommandHandler('stepSaturation', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === 'number') {
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1;
            const newSat = Math.max(0, Math.min(100, sat + (sign * lightColor.matterSatToHa(req.stepSize))));
            const hs: [number, number] = [hue, newSat];
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('moveToColor', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.colorX === 'number' && typeof req?.colorY === 'number') {
            const xy = lightColor.matterXyToHa(req.colorX, req.colorY);
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { xy });
            await sendColor(payload);
          }
        });

        this.endpoint.addCommandHandler('moveToColorTemperature', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.colorTemperatureMireds === 'number' && req.colorTemperatureMireds > 0) {
            const rawMireds = req.colorTemperatureMireds;
            const mireds = lightColor.clampMireds(rawMireds, this.state.attributes);
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { mireds });
            const usesKelvin = this.state.attributes.color_temp_kelvin !== undefined || this.state.attributes.min_color_temp_kelvin !== undefined || this.state.attributes.max_color_temp_kelvin !== undefined;
            if (usesKelvin) {
              const kelvin = lightColor.clampKelvin(lightColor.miredsToKelvin(mireds), this.state.attributes);
              this.setCommandLockout('color_temp', mireds);
              await this.platform.ha.callService('light', 'turn_on', this.entityId, { color_temp_kelvin: kelvin });
            } else {
              await sendColor(payload);
            }
          }
        });
      }
    }
  }

  public async syncInitialState(): Promise<void> {
    await this.updateState(this.state, true);
  }

  private clampLevel(rawLevel: number, isInitialSync = false): number {
    if (isInitialSync) return Math.min(254, Math.max(1, rawLevel));
    try {
      const minLevel = (this.endpoint as any).getAttribute?.(LevelControl.id, 'minLevel') ?? 1;
      const maxLevel = (this.endpoint as any).getAttribute?.(LevelControl.id, 'maxLevel') ?? 254;
      const lo = Math.max(1, minLevel as number);
      const hi = Math.min(254, maxLevel as number);
      return Math.min(hi, Math.max(lo, rawLevel));
    } catch {
      return Math.min(254, Math.max(1, rawLevel));
    }
  }

  public async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    this.haUpdateDepth++;
    try {
      this.state = newState;
      if (!this.endpoint) return;

      const [domain] = this.entityId.split('.');
      const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum') {
      const isOn = domain === 'vacuum'
        ? newState.state === 'cleaning'
        : domain === 'fan'
          ? isFanOn(newState)
          : newState.state === 'on';

      const beforeLevel = this.endpoint?.hasAttributeServer?.(LevelControl.id, 'currentLevel')
        ? this.endpoint.getAttribute(LevelControl.id, 'currentLevel')
        : undefined;
      const beforeOnOff = this.endpoint?.hasAttributeServer?.(OnOff.id, 'onOff')
        ? this.endpoint.getAttribute(OnOff.id, 'onOff')
        : undefined;

      if (domain === 'light' && isOn) {
        if (newState.attributes.brightness !== undefined) {
          if (!isInitialSync && this.shouldIgnoreStateUpdate('brightness', newState.attributes.brightness)) {
            this.platform.log.debug(`[${this.entityId}] Ignoring HA brightness state update due to recent command lockout`);
          } else {
            const raw = lightConverter.toLevel(newState.attributes.brightness);
            const level = this.clampLevel(raw, isInitialSync);
            await updateFn(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
          }
        }

        if (this.hasColorControl()) {
          const attrs = newState.attributes as any;
          const colorMode = attrs.color_mode;
          
          const range = lightColor.getMiredsRange(attrs);
          await updateFn(this.endpoint, ColorControl.id, 'colorTempPhysicalMinMireds', range.minMireds, this.platform.log);
          await updateFn(this.endpoint, ColorControl.id, 'colorTempPhysicalMaxMireds', range.maxMireds, this.platform.log);
          await updateFn(this.endpoint, ColorControl.id, 'coupleColorTempMinMireds', range.minMireds, this.platform.log);
          await updateFn(this.endpoint, ColorControl.id, 'coupleColorTempMaxMireds', range.maxMireds, this.platform.log);

          const minPhys = (this.endpoint as any).state?.colorControl?.colorTempPhysicalMinMireds ?? range.minMireds;
          const maxPhys = (this.endpoint as any).state?.colorControl?.colorTempPhysicalMaxMireds ?? range.maxMireds;
          const rawMireds = attrs.color_temp ?? (attrs.color_temp_kelvin ? lightColor.kelvinToMireds(attrs.color_temp_kelvin) : undefined);
          const mireds = rawMireds !== undefined ? lightColor.clampMireds(rawMireds, attrs, { minMireds: minPhys, maxMireds: maxPhys }) : undefined;
          const xy = Array.isArray(attrs.xy_color) && attrs.xy_color.length >= 2 ? attrs.xy_color : undefined;
          const hs = lightColor.getHsColor(newState);

          if (mireds !== undefined && (colorMode === 'color_temp' || (!hs && !xy))) {
            if (!isInitialSync && this.shouldIgnoreStateUpdate('color_temp', mireds)) {
              this.platform.log.debug(`[${this.entityId}] Ignoring HA color_temp state update due to recent command lockout`);
            } else {
              await updateFn(this.endpoint, ColorControl.id, 'colorTemperatureMireds', mireds, this.platform.log);
              await updateFn(this.endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds, this.platform.log);
            }
          } else if (xy && (colorMode === 'xy' || (!hs))) {
            if (!isInitialSync && this.shouldIgnoreStateUpdate('xy_color', xy)) {
              this.platform.log.debug(`[${this.entityId}] Ignoring HA xy_color state update due to recent command lockout`);
            } else {
              const matterXy = lightColor.haXyToMatter(xy[0], xy[1]);
              await updateFn(this.endpoint, ColorControl.id, 'currentX', matterXy[0], this.platform.log);
              await updateFn(this.endpoint, ColorControl.id, 'currentY', matterXy[1], this.platform.log);
              await updateFn(this.endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentXAndCurrentY, this.platform.log);
            }
          } else if (hs) {
            if (!isInitialSync && this.shouldIgnoreStateUpdate('hs_color', hs)) {
              this.platform.log.debug(`[${this.entityId}] Ignoring HA hs_color state update due to recent command lockout`);
            } else {
              await updateFn(this.endpoint, ColorControl.id, 'currentHue', lightColor.haHueToMatter(hs[0]), this.platform.log);
              await updateFn(this.endpoint, ColorControl.id, 'enhancedCurrentHue', lightColor.haHueToMatterEnhanced(hs[0]), this.platform.log);
              await updateFn(this.endpoint, ColorControl.id, 'currentSaturation', lightColor.haSatToMatter(hs[1]), this.platform.log);
              await updateFn(this.endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation, this.platform.log);
              if (this.endpoint.hasAttributeServer(ColorControl.id, 'enhancedColorMode')) {
                 await updateFn(this.endpoint, ColorControl.id, 'enhancedColorMode', ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation, this.platform.log);
              }
            }
          }
        }
      }

      await updateFn(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);

      if (domain === 'light') {
        const afterLevel = this.endpoint?.hasAttributeServer?.(LevelControl.id, 'currentLevel')
          ? this.endpoint.getAttribute(LevelControl.id, 'currentLevel')
          : undefined;
        const afterOnOff = this.endpoint?.hasAttributeServer?.(OnOff.id, 'onOff')
          ? this.endpoint.getAttribute(OnOff.id, 'onOff')
          : undefined;
        this.platform.log.debug(
          `[LIGHT TRACE][${this.entityId}] HA state: ${newState.state} | HA brightness: ${newState.attributes.brightness ?? 'undefined'} | ` +
          `Matter CurrentLevel before: ${beforeLevel} -> after: ${afterLevel} | ` +
          `Matter OnOff before: ${beforeOnOff} -> after: ${afterOnOff} | ` +
          `source: ${isInitialSync ? 'initialSync' : 'haEvent'} | transaction/handler: updateState`
        );
      }

      if (domain === 'fan' && this.endpoint.hasAttributeServer(FanControl.id, 'fanMode')) {
        const speedSupported = hasFanSpeed(newState);
        const speedMax = getFanSpeedCount(newState);
        const pct = isOn ? fanPercentage(newState) : 0;
        const speed = isOn ? fanSpeed(pct, speedMax) : 0;
        const newFanMode = haStateToFanMode(newState);

        this.platform.log.debug(
          `[${this.entityId}] Fan state update: state=${newState.state}, on=${isOn}, pct=${pct}, speed=${speed}, fanMode=${newFanMode}, speedSupported=${speedSupported}, direction=${newState.attributes.direction ?? 'N/A'}, oscillating=${newState.attributes.oscillating ?? 'N/A'}, preset=${newState.attributes.preset_mode ?? 'N/A'}`,
        );

        if (speedSupported && this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
          // Percentage / speed update with hysteresis and lockout
          if (!isInitialSync && this.shouldIgnoreStateUpdate('fan_percentage', pct)) {
            this.platform.log.debug(`[${this.entityId}] Ignoring HA fan_percentage update due to command lockout (pct=${pct})`);
          } else {
            await updateFn(this.endpoint, FanControl.id, 'percentSetting', pct, this.platform.log);
            await updateFn(this.endpoint, FanControl.id, 'percentCurrent', pct, this.platform.log);
            
            if (this.endpoint.hasAttributeServer(FanControl.id, 'speedCurrent')) {
              await updateFn(this.endpoint, FanControl.id, 'speedSetting', speed, this.platform.log);
              await updateFn(this.endpoint, FanControl.id, 'speedCurrent', speed, this.platform.log);
            }
          }
        }

        // FanMode update
        await updateFn(this.endpoint, FanControl.id, 'fanMode', newFanMode, this.platform.log);

        // AirflowDirection update (only when HA exposes direction)
        if (this.endpoint.hasAttributeServer(FanControl.id, 'airflowDirection')) {
          const dir = fanDirection(newState);
          if (dir !== undefined) {
            if (!isInitialSync && this.shouldIgnoreStateUpdate('fan_direction', dir)) {
              this.platform.log.debug(`[${this.entityId}] Ignoring HA direction update due to command lockout (dir=${dir})`);
            } else {
              const matterDir = haDirectionToMatter(dir);
              await updateFn(this.endpoint, FanControl.id, 'airflowDirection', matterDir, this.platform.log);
              this.platform.log.debug(`[${this.entityId}] Fan direction synced: HA=${dir} → Matter=${matterDir}`);
            }
          }
        }
      }
    } else if (domain === 'binary_sensor') {
      const active = ['on', 'open', 'detected', 'true'].includes(newState.state.toLowerCase());

      const updateMatter = async (isActive: boolean) => {
        if (!this.endpoint) return;
        if (this.endpoint.hasAttributeServer(OccupancySensing.id, 'occupancy')) {
          await updateFn(this.endpoint, OccupancySensing.id, 'occupancy', { occupied: isActive }, this.platform.log);
        } else if (this.endpoint.hasAttributeServer(BooleanState.id, 'stateValue')) {
          await updateFn(this.endpoint, BooleanState.id, 'stateValue', isActive, this.platform.log);
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
    } else if (domain === 'sensor') {
      const numeric = parseFloat(newState.state);
      if (!isNaN(numeric) && this.endpoint) {
        if (this.endpoint.hasAttributeServer(TemperatureMeasurement.id, 'measuredValue')) {
          await updateFn(this.endpoint, TemperatureMeasurement.id, 'measuredValue', Math.round(numeric * 100), this.platform.log);
        } else if (this.endpoint.hasAttributeServer(RelativeHumidityMeasurement.id, 'measuredValue')) {
          await updateFn(this.endpoint, RelativeHumidityMeasurement.id, 'measuredValue', Math.round(numeric * 100), this.platform.log);
        }
      }
    }
  } finally {
    this.haUpdateDepth--;
  }
}
}

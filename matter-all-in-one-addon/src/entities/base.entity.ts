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
import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';
import { lightColor } from '../utils/light-color.js';

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
    if (attribute === 'percentage') {
      return Math.abs(requested - actual) > 2;
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

  private setCommandLockout(attribute: string, value: any) {
    this.lastCommands.set(`${this.entityId}:${attribute}`, { value, timestamp: Date.now() });
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

    if ((domain === 'fan' || domain === 'humidifier') && isFanProfile) {
      const on = this.state.state === 'on';
      let percentage = 0;
      let fanMode = 0;
      let hasDirection = false;
      let dir = 0;

      if (domain === 'humidifier') {
        const minHum = this.state.attributes.min_humidity ?? 40;
        const maxHum = this.state.attributes.max_humidity ?? 80;
        const currentTarget = this.state.attributes.humidity;
        const mode = (this.state.attributes.mode || '').toLowerCase();
        if (on) {
          if (typeof currentTarget === 'number' && maxHum > minHum) {
            percentage = Math.round(((currentTarget - minHum) / (maxHum - minHum)) * 100);
          } else if (mode.includes('high') || mode.includes('alto') || mode === '3') {
            percentage = 100;
          } else if (mode.includes('med') || mode.includes('medio') || mode === '2') {
            percentage = 66;
          } else if (mode.includes('low') || mode.includes('bajo') || mode === '1') {
            percentage = 33;
          } else {
            percentage = 50;
          }
          percentage = Math.min(100, Math.max(1, percentage));
        }
        fanMode = on ? (mode.includes('auto') ? 5 : (percentage > 66 ? 3 : percentage > 33 ? 2 : 1)) : 0;
      } else {
        percentage = typeof this.state.attributes.percentage === 'number' ? this.state.attributes.percentage : on ? 100 : 0;
        fanMode = on ? (percentage > 66 ? 3 : percentage > 33 ? 2 : 1) : 0;
        hasDirection = this.state.attributes.direction !== undefined || (Number(this.state.attributes.supported_features || 0) & 4) !== 0;
        dir = this.state.attributes.direction === 'reverse' ? 1 : 0;
      }

      const features = [FanControl.Feature.Auto, FanControl.Feature.Step];
      if (hasDirection) features.push(FanControl.Feature.AirflowDirection);

      this.endpoint.behaviors.require(MatterbridgeFanControlServer.with(...features), {
        fanMode,
        fanModeSequence: FanControl.FanModeSequence.OffLowMedHighAuto,
        percentSetting: percentage,
        percentCurrent: percentage,
        airflowDirection: dir,
      });
      this.endpoint.behaviors.require(MatterbridgeOnOffServer.with());
    } else if (domain === 'light' || domain === 'switch' || domain === 'media_player' || domain === 'vacuum' || domain === 'fan') {
      const isLighting = domain === 'light';
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

    if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum' || domain === 'humidifier') {
      this.endpoint.subscribeAttribute(OnOff.id, 'onOff', async (newValue: boolean) => {
        if (typeof newValue !== 'boolean') return;
        
        // Handle Vacuum special mapping
        if (domain === 'vacuum') {
          if (newValue) {
            await this.platform.ha.callService(domain, 'start', this.entityId).catch((err) => {
              this.platform.log.warn(`[${this.entityId}] Error starting vacuum: ${err?.message ?? err}`);
            });
          } else {
            await this.platform.ha.callService(domain, 'return_to_base', this.entityId).catch((err) => {
              this.platform.log.warn(`[${this.entityId}] Error returning vacuum: ${err?.message ?? err}`);
            });
          }
          return;
        }

        // Handle standard on/off for Fan, Light, Switch, Humidifier, Media Player
        this.setCommandLockout('onOff', newValue);
        
        // If it's a fan turning off, also optimistically reset fanMode to 0
        if (domain === 'fan' && !newValue && this.endpoint.hasAttributeServer(FanControl.id, 'fanMode')) {
          await safeUpdateAttribute(this.endpoint, FanControl.id, 'fanMode', 0, this.platform.log);
        }

        await this.platform.ha.callService(domain, newValue ? 'turn_on' : 'turn_off', this.entityId).catch((err) => {
          this.platform.log.warn(`[${this.entityId}] Error turning ${newValue ? 'on' : 'off'} ${domain}: ${err?.message ?? err}`);
        });
      });

      if (domain === 'fan') {
        if (this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent') || this.endpoint.hasAttributeServer(FanControl.id, 'percentSetting')) {
          this.endpoint.addCommandHandler('FanControl.step', async (data: any) => {
            const direction = data?.request?.direction ?? data?.direction;
            const current = typeof this.state.attributes.percentage === 'number' ? this.state.attributes.percentage : 0;
            const percentage = direction === 0 ? Math.min(100, current + 10) : Math.max(0, current - 10);
            this.setCommandLockout('percentage', percentage);
            await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentCurrent', percentage, this.platform.log);
            await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentSetting', percentage, this.platform.log);
            await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage }).catch((err) => {
              this.platform.log.warn(`[${this.entityId}] Error stepping fan percentage: ${err?.message ?? err}`);
            });
          });

          this.endpoint.subscribeAttribute(
            FanControl.id,
            'percentSetting',
            async (newValue: number | null) => {
              if (typeof newValue !== 'number') return;
              const current = typeof this.state.attributes.percentage === 'number' ? this.state.attributes.percentage : (this.state.state === 'on' ? 100 : 0);
              if (Math.abs(current - newValue) <= 1 && (newValue === 0 ? this.state.state === 'off' : this.state.state === 'on')) {
                return;
              }
              if (this.shouldIgnoreStateUpdate('percentage', newValue)) return;
              this.setCommandLockout('percentage', newValue);

              // Optimistic local update so HomeKit slider doesn't bounce/freeze
              await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentCurrent', newValue, this.platform.log);
              await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', newValue > 0, this.platform.log);
              const fanMode = newValue === 0 ? 0 : (newValue > 66 ? 3 : newValue > 33 ? 2 : 1);
              await safeUpdateAttribute(this.endpoint, FanControl.id, 'fanMode', fanMode, this.platform.log);

              if (newValue === 0) {
                await this.platform.ha.callService('fan', 'turn_off', this.entityId).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error turning off fan: ${err?.message ?? err}`);
                });
              } else {
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: newValue }).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error setting fan percentage: ${err?.message ?? err}`);
                });
              }
            }
          );

          this.endpoint.subscribeAttribute(
            FanControl.id,
            'fanMode',
            async (newMode: number) => {
              if (typeof newMode !== 'number') return;
              if (newMode === 0) {
                this.setCommandLockout('percentage', 0);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentCurrent', 0, this.platform.log);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentSetting', 0, this.platform.log);
                await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', false, this.platform.log);
                await this.platform.ha.callService('fan', 'turn_off', this.entityId).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error turning off fan: ${err?.message ?? err}`);
                });
              } else if (newMode === 4) { // On
                await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', true, this.platform.log);
                await this.platform.ha.callService('fan', 'turn_on', this.entityId).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error turning on fan: ${err?.message ?? err}`);
                });
              } else if (newMode === 1) { // Low
                this.setCommandLockout('percentage', 33);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentCurrent', 33, this.platform.log);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentSetting', 33, this.platform.log);
                await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', true, this.platform.log);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: 33 }).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error setting fan low: ${err?.message ?? err}`);
                });
              } else if (newMode === 2) { // Medium
                this.setCommandLockout('percentage', 66);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentCurrent', 66, this.platform.log);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentSetting', 66, this.platform.log);
                await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', true, this.platform.log);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: 66 }).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error setting fan med: ${err?.message ?? err}`);
                });
              } else if (newMode === 3) { // High
                this.setCommandLockout('percentage', 100);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentCurrent', 100, this.platform.log);
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'percentSetting', 100, this.platform.log);
                await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', true, this.platform.log);
                await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage: 100 }).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error setting fan high: ${err?.message ?? err}`);
                });
              } else if (newMode === 5) { // Auto
                await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', true, this.platform.log);
                const presets: string[] = this.state.attributes.preset_modes ?? [];
                if (presets.includes('auto')) {
                  await this.platform.ha.callService('fan', 'set_preset_mode', this.entityId, { preset_mode: 'auto' }).catch((err) => {
                    this.platform.log.warn(`[${this.entityId}] Error setting fan auto preset: ${err?.message ?? err}`);
                  });
                } else {
                  await this.platform.ha.callService('fan', 'turn_on', this.entityId).catch((err) => {
                    this.platform.log.warn(`[${this.entityId}] Error turning on fan: ${err?.message ?? err}`);
                  });
                }
              }
            }
          );

          if (this.endpoint.hasAttributeServer(FanControl.id, 'airflowDirection')) {
            this.endpoint.subscribeAttribute(
              FanControl.id,
              'airflowDirection',
              async (newDir: number) => {
                if (typeof newDir !== 'number') return;
                const direction = newDir === 1 ? 'reverse' : 'forward';
                await safeUpdateAttribute(this.endpoint, FanControl.id, 'airflowDirection', newDir, this.platform.log);
                await this.platform.ha.callService('fan', 'set_direction', this.entityId, { direction }).catch((err) => {
                  this.platform.log.warn(`[${this.entityId}] Error setting fan direction: ${err?.message ?? err}`);
                });
              }
            );
          }
        }
      }

      if (this.endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
        this.endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data?.request?.level ?? data?.level;
          if (typeof level === 'number') {
            const haBrightness = Math.round((level / 254) * 255);
            this.setCommandLockout('brightness', haBrightness);
            await safeUpdateAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
            await this.platform.ha.callService(domain, 'turn_on', this.entityId, { brightness: haBrightness }).catch((err) => {
              this.platform.log.warn(`[${this.entityId}] Error setting brightness: ${err?.message ?? err}`);
            });
          }
        });

        this.endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
          const level = data?.request?.level ?? data?.level;
          if (typeof level === 'number') {
            if (level === 0) {
              await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', false, this.platform.log);
              await this.platform.ha.callService(domain, 'turn_off', this.entityId).catch((err) => {
                this.platform.log.warn(`[${this.entityId}] Error turning off: ${err?.message ?? err}`);
              });
            } else {
              const haBrightness = Math.round((level / 254) * 255);
              this.setCommandLockout('brightness', haBrightness);
              await safeUpdateAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
              await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', true, this.platform.log);
              await this.platform.ha.callService(domain, 'turn_on', this.entityId, { brightness: haBrightness }).catch((err) => {
                this.platform.log.warn(`[${this.entityId}] Error setting brightness: ${err?.message ?? err}`);
              });
            }
          }
        });
      }

      if (domain === 'light' && this.hasColorControl(this.endpoint)) {
        const sendColor = async (payload: any) => {
          if (payload.hs_color) this.setCommandLockout('hs_color', payload.hs_color);
          if (payload.xy_color) this.setCommandLockout('xy_color', payload.xy_color);
          if (payload.color_temp) this.setCommandLockout('color_temp', payload.color_temp);
          await this.platform.ha.callService('light', 'turn_on', this.entityId, payload).catch((err) => {
            this.platform.log.warn(`[${this.entityId}] Error setting light color: ${err?.message ?? err}`);
          });
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
            const sign = req.stepMode === 1 ? -1 : 1;
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
          // Handled same as moveHue if direction provided
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
            const mireds = req.colorTemperatureMireds;
            const payload = lightColor.buildColorPayload(this.state.attributes.supported_color_modes ?? [], this.state.attributes.color_mode, { mireds });
            const usesKelvin = this.state.attributes.color_temp_kelvin !== undefined || this.state.attributes.min_color_temp_kelvin !== undefined || this.state.attributes.max_color_temp_kelvin !== undefined;
            if (usesKelvin) {
              this.setCommandLockout('color_temp', mireds);
              await this.platform.ha.callService('light', 'turn_on', this.entityId, { color_temp_kelvin: lightColor.miredsToKelvin(mireds) }).catch((err) => {
                this.platform.log.warn(`[${this.entityId}] Error setting color temp: ${err?.message ?? err}`);
              });
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
    this.state = newState;
    if (!this.endpoint) return;

    const [domain] = this.entityId.split('.');
    const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;

    if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum') {
      const isOn = domain === 'vacuum' ? newState.state === 'cleaning' : newState.state === 'on';

      await updateFn(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);

      if (newState.attributes.brightness !== undefined) {
        if (!isInitialSync && this.shouldIgnoreStateUpdate('brightness', newState.attributes.brightness)) {
          this.platform.log.debug(`[${this.entityId}] Ignoring HA brightness state update due to recent command lockout`);
        } else {
          const raw = Math.round((newState.attributes.brightness / 255) * 254);
          const level = this.clampLevel(Math.max(1, raw), isInitialSync);
          await updateFn(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
        }
      }

      if (domain === 'light' && this.hasColorControl()) {
        const attrs = newState.attributes as any;
        const colorMode = attrs.color_mode;
        
        const mireds = attrs.color_temp ?? (attrs.color_temp_kelvin ? lightColor.kelvinToMireds(attrs.color_temp_kelvin) : undefined);
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

      if (domain === 'fan' && this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
        const percentage = typeof newState.attributes.percentage === 'number' ? newState.attributes.percentage : isOn ? 100 : 0;
        if (!isInitialSync && this.shouldIgnoreStateUpdate('percentage', percentage)) {
          this.platform.log.debug(`[${this.entityId}] Ignoring HA fan percentage update due to recent command lockout`);
        } else {
          await updateFn(this.endpoint, FanControl.id, 'percentCurrent', percentage, this.platform.log);
          await updateFn(this.endpoint, FanControl.id, 'percentSetting', percentage, this.platform.log);
          const fanMode = isOn ? (percentage > 66 ? 3 : percentage > 33 ? 2 : percentage > 0 ? 1 : 4) : 0;
          await updateFn(this.endpoint, FanControl.id, 'fanMode', fanMode, this.platform.log);
          if (this.endpoint.hasAttributeServer(FanControl.id, 'airflowDirection') && newState.attributes.direction) {
            const dir = newState.attributes.direction === 'reverse' ? 1 : 0;
            await updateFn(this.endpoint, FanControl.id, 'airflowDirection', dir, this.platform.log);
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
  }
}

/**
 * One Matter ServerNode containing multiple endpoints that belong to the same
 * Home Assistant device registry entry.  The root endpoint is the primary
 * capability (lock, fan, or configured entity); remaining compatible entities are child
 * endpoints and therefore share its QR code and fabrics.
 *
 * v1.2.11 — Critical fix: child endpoint clusters (LevelControl, ColorControl)
 * are now declared upfront in addChildDeviceTypeWithClusterServer() instead of
 * being added post-hoc with addClusterServers().  Matter controllers (Apple Home,
 * Google Home) read the Descriptor cluster at commissioning time to discover
 * endpoint capabilities; clusters added after endpoint creation are not visible.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { BooleanState, ColorControl, FanControl, LevelControl, OccupancySensing, RelativeHumidityMeasurement, TemperatureMeasurement, OnOff, DoorLock } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { MatterbridgeOnOffServer } from 'matterbridge/behaviors';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';
import type { HassState } from '../utils/ha-state.js';
import { getDeviceTypeForEntity, hasColorTemperatureCapability } from '../device-registry.js';
import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';
import { lightColor } from '../utils/light-color.js';

type CompositePlatform = {
  log: any;
  ha: {
    callService(domain: string, service: string, entityId: string, data?: Record<string, any>): Promise<unknown>;
  };
};

export interface CompositeMember {
  entityId: string;
  state: HassState;
  deviceType?: DeviceTypeDefinition;
}

function endpointId(entityId: string): string {
  return entityId.replaceAll('.', '_');
}

function isOn(state: HassState): boolean {
  return state.state === 'on';
}

function isFanProfile(deviceType: DeviceTypeDefinition): boolean {
  return deviceType.code === 0x002b || deviceType.name.toLowerCase() === 'fan';
}

function lightClusterIds(state: HassState, deviceType: DeviceTypeDefinition): ClusterId[] {
  const clusters: ClusterId[] = [OnOff.id];
  const modes: string[] = state.attributes.supported_color_modes ?? [];
  const hasBrightness = modes.includes('brightness') || state.attributes.brightness !== undefined;
  const hasColorTemp = hasColorTemperatureCapability(state.attributes);
  const hasRgb = modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m));

  const isOnOffProfile = deviceType.code === 0x0100 || deviceType.code === 0x010a; 
  const isColorProfile = deviceType.code === 0x010c || deviceType.code === 0x010d; 

  if ((hasBrightness || hasColorTemp || hasRgb) && !isOnOffProfile) clusters.push(LevelControl.id);
  if ((hasColorTemp || hasRgb) && isColorProfile) clusters.push(ColorControl.id);
  return clusters;
}

function toMatterLevel(brightness: number): number {
  return Math.max(1, Math.min(254, Math.round((brightness / 255) * 254)));
}

export class CompositeDeviceEntity {
  public endpoint!: MatterbridgeEndpoint;
  public readonly endpoints = new Map<string, MatterbridgeEndpoint>();
  public readonly states = new Map<string, HassState>();
  private lastCommands = new Map<string, { value: any; timestamp: number }>();

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
    if (attribute === 'color_temp') {
      return Math.abs(requested - actual) > 10;
    }
    return requested !== actual;
  }

  private shouldIgnoreStateUpdate(entityId: string, attribute: string, haValue: any, windowMs = 3000): boolean {
    const key = `${entityId}:${attribute}`;
    const last = this.lastCommands.get(key);
    if (!last) return false;
    const elapsed = Date.now() - last.timestamp;
    if (elapsed > windowMs) {
      this.lastCommands.delete(key);
      return false;
    }
    
    if (this.isDifferent(attribute, last.value, haValue)) {
      this.platform.log.debug(`[${entityId}] Reconciling HA feedback for ${attribute} (req=${JSON.stringify(last.value)}, got=${JSON.stringify(haValue)})`);
      this.lastCommands.delete(key);
      return false; 
    }
    return true;
  }
  
  private setCommandLockout(entityId: string, attribute: string, value: any) {
    this.lastCommands.set(`${entityId}:${attribute}`, { value, timestamp: Date.now() });
  }

  constructor(
    public readonly platform: CompositePlatform,
    public readonly deviceId: string,
    public readonly name: string,
    public readonly members: CompositeMember[],
    private readonly primaryEntityIdOverride?: string,
  ) {
    members.forEach((member) => this.states.set(member.entityId, member.state));
  }

  get primaryEntityId(): string {
    if (this.primaryEntityIdOverride && this.members.some((m) => m.entityId === this.primaryEntityIdOverride)) {
      return this.primaryEntityIdOverride;
    }
    return this.members.find((m) => m.entityId.startsWith('lock.'))?.entityId ?? this.members.find((m) => m.entityId.startsWith('fan.'))?.entityId ?? this.members[0].entityId;
  }

  async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const primary = this.members.find((m) => m.entityId === this.primaryEntityId)!;
    const primaryType = this.typeFor(primary);

    this.platform.log.notice('[Composite] group_by_device_id=true');
    this.platform.log.notice(`[Composite] Found HA device_id: ${this.deviceId}`);
    this.platform.log.notice(`[Composite] Composite candidate: ${this.members.map((m) => m.entityId).join(' + ')}`);
    this.platform.log.notice(`[Composite] Primary entity: ${primary.entityId}`);
    this.platform.log.notice(`[Composite] Creating ServerNode composite accessory: ${this.name}`);
    this.platform.log.notice(`[Composite] Endpoint 1 (root): ${primaryType.name} → ${primary.entityId}`);

    this.endpoint = new MatterbridgeEndpoint([primaryType], {
      id: `device_${this.deviceId}`,
      mode: 'server',
    });
    this.configureRootIdentity(this.endpoint, primaryType, primary.entityId);
    await this.addRootClusters(this.endpoint, primary);
    this.addCommandHandlers(this.endpoint, primary);
    this.endpoints.set(primary.entityId, this.endpoint);

    let endpointIndex = 2;
    for (const member of this.members) {
      if (member.entityId === primary.entityId) continue;

      const [domain] = member.entityId.split('.');
      const memberType = this.typeFor(member);
      const clusterIds = this.computeClusterIds(member);

      if (domain === 'light') {
        this.logLightCapabilities(member, memberType, clusterIds, primary.entityId);
      } else {
        this.platform.log.notice(`[Composite] Integrated endpoint: ${member.entityId} (${memberType.name})`);
      }
      this.platform.log.notice(`[Composite] Endpoint ${endpointIndex}: ${memberType.name} → ${member.entityId}`);
      endpointIndex++;

      const child = this.endpoint.addChildDeviceTypeWithClusterServer(endpointId(member.entityId), memberType, clusterIds);
      
      if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum') {
        const isLighting = domain === 'light';
        child.behaviors.require(isLighting ? MatterbridgeOnOffServer.with(OnOff.Feature.Lighting) : MatterbridgeOnOffServer.with());
      }
      
      this.addCommandHandlers(child, member);
      this.endpoints.set(member.entityId, child);
    }

    this.platform.log.notice(`[Composite] QR generated for composite node: ${this.name}`);
    this.platform.log.notice(`[Composite] Descriptor endpoints: [${this.members.map((m) => `${m.entityId}`).join(', ')}]`);
    return this.endpoint;
  }

  adoptEndpoint(endpoint: MatterbridgeEndpoint): void {
    this.endpoint = endpoint;
    this.endpoints.clear();
    for (const member of this.members) {
      const memberEndpoint =
        member.entityId === this.primaryEntityId ? endpoint : (endpoint.getChildEndpointById(endpointId(member.entityId)) ?? endpoint.getChildEndpointByOriginalId(endpointId(member.entityId)));
      if (!memberEndpoint) {
        this.platform.log.warn(`[Composite] Retained node is missing endpoint ${member.entityId}; preserving the node without fabric reset.`);
        continue;
      }
      this.endpoints.set(member.entityId, memberEndpoint);
      if (memberEndpoint.commandHandler && (memberEndpoint.commandHandler as any).handler?.length === 0) {
        this.addCommandHandlers(memberEndpoint, member);
      }
    }
  }

  async syncInitialState(): Promise<void> {
    await Promise.all(this.members.map((m) => this.updateEntity(m.entityId, m.state, true)));
  }

  async updateEntity(entityId: string, state: HassState, initial = false): Promise<void> {
    this.states.set(entityId, state);
    const endpoint = this.endpoints.get(entityId);
    if (!endpoint) return;
    const [domain] = entityId.split('.');
    const update = initial ? safeSetAttribute : safeUpdateAttribute;

    if (domain === 'fan') {
      const on = isOn(state);
      await update(endpoint, OnOff.id, 'onOff', on, this.platform.log);
      if (!endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) return;
      const percentage = typeof state.attributes.percentage === 'number' ? state.attributes.percentage : on ? 100 : 0;
      await update(endpoint, FanControl.id, 'percentCurrent', percentage, this.platform.log);
      await update(endpoint, FanControl.id, 'percentSetting', percentage, this.platform.log);
      await update(endpoint, FanControl.id, 'fanMode', on ? 1 : 0, this.platform.log);
      return;
    }

    if (domain === 'lock') {
      const matterState = this.toLockState(state);
      await update(endpoint, DoorLock.id, 'lockState', matterState, this.platform.log);
      return;
    }

    if (domain === 'light' || domain === 'switch') {
      await update(endpoint, OnOff.id, 'onOff', isOn(state), this.platform.log);

      if (domain === 'light') {
        if (typeof state.attributes.brightness === 'number') {
          if (!initial && this.shouldIgnoreStateUpdate(entityId, 'brightness', state.attributes.brightness)) {
            this.platform.log.debug(`[${entityId}] Ignoring HA brightness state update due to recent command lockout`);
          } else {
            await update(endpoint, LevelControl.id, 'currentLevel', toMatterLevel(state.attributes.brightness), this.platform.log);
          }
        }

        const attrs = state.attributes as any;
        const colorMode = attrs.color_mode;
        const mireds = attrs.color_temp ?? (attrs.color_temp_kelvin ? lightColor.kelvinToMireds(attrs.color_temp_kelvin) : undefined);
        const xy = Array.isArray(attrs.xy_color) && attrs.xy_color.length >= 2 ? attrs.xy_color : undefined;
        const hs = lightColor.getHsColor(state);

        if (mireds !== undefined && (colorMode === 'color_temp' || (!hs && !xy))) {
          if (!initial && this.shouldIgnoreStateUpdate(entityId, 'color_temp', mireds)) {
            this.platform.log.debug(`[${entityId}] Ignoring HA color_temp state update due to recent command lockout`);
          } else {
            await update(endpoint, ColorControl.id, 'colorTemperatureMireds', mireds, this.platform.log);
            await update(endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds, this.platform.log);
          }
        } else if (xy && (colorMode === 'xy' || (!hs))) {
          if (!initial && this.shouldIgnoreStateUpdate(entityId, 'xy_color', xy)) {
            this.platform.log.debug(`[${entityId}] Ignoring HA xy_color state update due to recent command lockout`);
          } else {
            const matterXy = lightColor.haXyToMatter(xy[0], xy[1]);
            await update(endpoint, ColorControl.id, 'currentX', matterXy[0], this.platform.log);
            await update(endpoint, ColorControl.id, 'currentY', matterXy[1], this.platform.log);
            await update(endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentXAndCurrentY, this.platform.log);
          }
        } else if (hs) {
          if (!initial && this.shouldIgnoreStateUpdate(entityId, 'hs_color', hs)) {
            this.platform.log.debug(`[${entityId}] Ignoring HA hs_color state update due to recent command lockout`);
          } else {
            await update(endpoint, ColorControl.id, 'currentHue', lightColor.haHueToMatter(hs[0]), this.platform.log);
            await update(endpoint, ColorControl.id, 'enhancedCurrentHue', lightColor.haHueToMatterEnhanced(hs[0]), this.platform.log);
            await update(endpoint, ColorControl.id, 'currentSaturation', lightColor.haSatToMatter(hs[1]), this.platform.log);
            await update(endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation, this.platform.log);
            if (endpoint.hasAttributeServer(ColorControl.id, 'enhancedColorMode')) {
               await update(endpoint, ColorControl.id, 'enhancedColorMode', ColorControl.EnhancedColorMode.EnhancedCurrentHueAndCurrentSaturation, this.platform.log);
            }
          }
        }
      }
      return;
    }

    const deviceClass = state.attributes.device_class;
    if (domain === 'sensor') {
      const numeric = Number(state.state);
      if (!Number.isFinite(numeric)) return;
      if (deviceClass === 'temperature') {
        await update(endpoint, TemperatureMeasurement.id, 'measuredValue', Math.round(numeric * 100), this.platform.log);
      } else if (deviceClass === 'humidity') {
        await update(endpoint, RelativeHumidityMeasurement.id, 'measuredValue', Math.round(numeric * 100), this.platform.log);
      }
      return;
    }

    if (domain === 'binary_sensor') {
      const active = ['on', 'open', 'detected', 'true'].includes(state.state.toLowerCase());
      if (deviceClass === 'motion' || deviceClass === 'occupancy') {
        await update(endpoint, OccupancySensing.id, 'occupancy', { occupied: active }, this.platform.log);
      } else {
        await update(endpoint, BooleanState.id, 'stateValue', active, this.platform.log);
      }
    }
  }

  private typeFor(member: CompositeMember): DeviceTypeDefinition {
    const [domain] = member.entityId.split('.');
    return member.deviceType ?? getDeviceTypeForEntity(domain, member.state.attributes.device_class, member.state.attributes);
  }

  private computeClusterIds(member: CompositeMember): ClusterId[] {
    const [domain] = member.entityId.split('.');
    if (domain === 'light') return lightClusterIds(member.state, this.typeFor(member));
    if (domain === 'switch') return []; 
    if (domain === 'fan') {
      return isFanProfile(this.typeFor(member)) ? [FanControl.id] : [];
    }
    if (domain === 'lock') return [DoorLock.id];
    if (domain === 'sensor') {
      const deviceClass = member.state.attributes.device_class;
      if (deviceClass === 'temperature') return [TemperatureMeasurement.id];
      if (deviceClass === 'humidity') return [RelativeHumidityMeasurement.id];
    }
    if (domain === 'binary_sensor') {
      const deviceClass = member.state.attributes.device_class;
      if (deviceClass === 'motion' || deviceClass === 'occupancy') return [OccupancySensing.id];
      return [BooleanState.id];
    }
    return [];
  }

  private configureRootIdentity(endpoint: MatterbridgeEndpoint, type: DeviceTypeDefinition, primaryEntityId: string) {
    const nodeName = this.name.substring(0, 32).trim();
    endpoint.deviceType = type.code;
    endpoint.deviceName = nodeName;
    endpoint.uniqueId = `device_${this.deviceId}`.substring(0, 32);
    endpoint.serialNumber = getMatterSerialNumber(this.platform, primaryEntityId);
    endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    endpoint.vendorName = getHaDeviceManufacturer(this.platform, primaryEntityId);
    endpoint.productId = 0x8000;
    endpoint.productName = getHaDeviceModel(this.platform, primaryEntityId, type.name);
    const version = String((this.platform as any).matterbridge?.matterbridgeVersion ?? 'Matterbridge');
    const [major = 0, minor = 0, patch = 0] = version.split(/[-+.]/).map((part) => Number.parseInt(part, 10) || 0);
    endpoint.softwareVersion = Math.min(0xffffffff, major * 1_000_000 + minor * 1_000 + patch);
    endpoint.softwareVersionString = version.startsWith('Matterbridge') ? version : `Matterbridge ${version}`;
    endpoint.createDefaultBasicInformationClusterServer(
      nodeName,
      endpoint.serialNumber,
      endpoint.vendorId,
      endpoint.vendorName,
      endpoint.productId,
      endpoint.productName,
      endpoint.softwareVersion,
      endpoint.softwareVersionString,
    );
  }

  private async addRootClusters(endpoint: MatterbridgeEndpoint, member: CompositeMember) {
    const [domain] = member.entityId.split('.');
    
    if (domain === 'fan') {
      if (!isFanProfile(this.typeFor(member))) {
        endpoint.behaviors.require(MatterbridgeOnOffServer.with());
        endpoint.addRequiredClusterServers();
        return;
      }
      const on = isOn(member.state);
      const percentage = typeof member.state.attributes.percentage === 'number' ? member.state.attributes.percentage : on ? 100 : 0;
      endpoint.createDefaultFanControlClusterServer(on ? 1 : 0, undefined, percentage, percentage);
      endpoint.behaviors.require(MatterbridgeOnOffServer.with());
      endpoint.addRequiredClusterServers();
      return;
    }

    if (domain === 'lock') {
      const matterState = this.toLockState(member.state);
      endpoint.createDefaultDoorLockClusterServer(matterState, DoorLock.LockType.DeadBolt);
      endpoint.addRequiredClusterServers();
      await safeSetAttribute(endpoint, DoorLock.id, 'actuatorEnabled', true, this.platform.log);
      await safeSetAttribute(endpoint, DoorLock.id, 'operatingMode', DoorLock.OperatingMode.Normal, this.platform.log);
      await safeSetAttribute(
        endpoint,
        DoorLock.id,
        'supportedOperatingModes',
        {
          normal: true,
          vacation: false,
          privacy: false,
          noRemoteLockUnlock: false,
          passage: false,
        },
        this.platform.log,
      );
      return;
    }

    if (domain === 'light' || domain === 'switch') {
      const isLighting = domain === 'light';
      endpoint.behaviors.require(isLighting ? MatterbridgeOnOffServer.with(OnOff.Feature.Lighting) : MatterbridgeOnOffServer.with());
    }
  }

  private addCommandHandlers(endpoint: MatterbridgeEndpoint, member: CompositeMember) {
    const [domain] = member.entityId.split('.');
    const entityId = member.entityId;

    if (domain === 'fan') {
      endpoint.addCommandHandler('on', async () => {
        await this.platform.ha.callService('fan', 'turn_on', entityId);
      });
      endpoint.addCommandHandler('off', async () => {
        await this.platform.ha.callService('fan', 'turn_off', entityId);
      });
      if (endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
        endpoint.addCommandHandler('FanControl.step', async (data: any) => {
          const direction = data?.request?.direction ?? data?.direction;
          const current = this.states.get(entityId)?.attributes.percentage ?? 50;
          const next = direction === 0 ? Math.min(100, current + 10) : Math.max(0, current - 10);
          await this.platform.ha.callService('fan', 'set_percentage', entityId, { percentage: next });
        });
      }
      return;
    }

    if (domain === 'lock') {
      endpoint.addCommandHandler('lockDoor', async () => {
        await this.platform.ha.callService('lock', 'lock', entityId);
      });
      endpoint.addCommandHandler('unlockDoor', async () => {
        await this.platform.ha.callService('lock', 'unlock', entityId);
      });
      return;
    }

    if (domain === 'light') {
      const sendColor = async (payload: any) => {
        if (payload.hs_color) this.setCommandLockout(entityId, 'hs_color', payload.hs_color);
        if (payload.xy_color) this.setCommandLockout(entityId, 'xy_color', payload.xy_color);
        if (payload.color_temp) this.setCommandLockout(entityId, 'color_temp', payload.color_temp);
        await this.platform.ha.callService('light', 'turn_on', entityId, payload);
      };

      const currentHs = () => lightColor.getHsColor(this.states.get(entityId)!) ?? [0, 100];
      
      endpoint.addCommandHandler('on', async () => {
        await this.platform.ha.callService('light', 'turn_on', entityId);
      });
      endpoint.addCommandHandler('off', async () => {
        await this.platform.ha.callService('light', 'turn_off', entityId);
      });

      if (endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
        endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data?.level ?? data?.request?.level;
          if (typeof level === 'number') {
            const haBrightness = Math.round((level / 254) * 255);
            this.setCommandLockout(entityId, 'brightness', haBrightness);
            await this.platform.ha.callService('light', 'turn_on', entityId, { brightness: haBrightness });
          }
        });
        endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
          const level = data?.level ?? data?.request?.level;
          if (typeof level === 'number') {
            if (level === 0) {
              await this.platform.ha.callService('light', 'turn_off', entityId);
            } else {
              const haBrightness = Math.round((level / 254) * 255);
              this.setCommandLockout(entityId, 'brightness', haBrightness);
              await this.platform.ha.callService('light', 'turn_on', entityId, { brightness: haBrightness });
            }
          }
        });
      }

      if (endpoint.hasAttributeServer(ColorControl.id, 'colorMode')) {
        endpoint.addCommandHandler('moveToColorTemperature', async (data: any) => {
          const mireds = data?.colorTemperatureMireds ?? data?.request?.colorTemperatureMireds;
          if (typeof mireds === 'number' && mireds > 0) {
            const state = this.states.get(entityId)!;
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { mireds });
            // Add kelvin support based on existing logic
            const usesKelvin = state.attributes.color_temp_kelvin !== undefined || state.attributes.min_color_temp_kelvin !== undefined || state.attributes.max_color_temp_kelvin !== undefined;
            if (usesKelvin) {
              this.setCommandLockout(entityId, 'color_temp', mireds);
              await this.platform.ha.callService('light', 'turn_on', entityId, { color_temp_kelvin: lightColor.miredsToKelvin(mireds) });
            } else {
              await sendColor(payload);
            }
          }
        });

        endpoint.addCommandHandler('moveToHueAndSaturation', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.hue === 'number' && typeof req?.saturation === 'number') {
            const state = this.states.get(entityId)!;
            const hs: [number, number] = [lightColor.matterHueToHa(req.hue), lightColor.matterSatToHa(req.saturation)];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        endpoint.addCommandHandler('moveToHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.hue === 'number') {
            const state = this.states.get(entityId)!;
            const [, sat] = currentHs();
            const hs: [number, number] = [lightColor.matterHueToHa(req.hue), sat];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });
        
        endpoint.addCommandHandler('stepHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === 'number') {
            const state = this.states.get(entityId)!;
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1;
            const newHue = lightColor.normalizeHue(hue + (sign * lightColor.matterHueToHa(req.stepSize)));
            const hs: [number, number] = [newHue, sat];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        endpoint.addCommandHandler('enhancedMoveToHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.enhancedHue === 'number') {
            const state = this.states.get(entityId)!;
            const [, sat] = currentHs();
            const hs: [number, number] = [lightColor.matterEnhancedHueToHa(req.enhancedHue), sat];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });
        
        endpoint.addCommandHandler('enhancedStepHue', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === 'number') {
            const state = this.states.get(entityId)!;
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1;
            const newHue = lightColor.normalizeHue(hue + (sign * lightColor.matterEnhancedHueToHa(req.stepSize)));
            const hs: [number, number] = [newHue, sat];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        endpoint.addCommandHandler('moveToSaturation', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.saturation === 'number') {
            const state = this.states.get(entityId)!;
            const [hue] = currentHs();
            const hs: [number, number] = [hue, lightColor.matterSatToHa(req.saturation)];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });
        
        endpoint.addCommandHandler('stepSaturation', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.stepSize === 'number') {
            const state = this.states.get(entityId)!;
            const [hue, sat] = currentHs();
            const sign = req.stepMode === 1 ? -1 : 1;
            const newSat = Math.max(0, Math.min(100, sat + (sign * lightColor.matterSatToHa(req.stepSize))));
            const hs: [number, number] = [hue, newSat];
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { hs });
            await sendColor(payload);
          }
        });

        endpoint.addCommandHandler('moveToColor', async (data: any) => {
          const req = data?.request ?? data;
          if (typeof req?.colorX === 'number' && typeof req?.colorY === 'number') {
            const state = this.states.get(entityId)!;
            const xy = lightColor.matterXyToHa(req.colorX, req.colorY);
            const payload = lightColor.buildColorPayload(state.attributes.supported_color_modes ?? [], state.attributes.color_mode, { xy });
            await sendColor(payload);
          }
        });
      }
      return;
    }

    if (domain === 'switch') {
      endpoint.addCommandHandler('on', async () => {
        await this.platform.ha.callService('switch', 'turn_on', entityId);
      });
      endpoint.addCommandHandler('off', async () => {
        await this.platform.ha.callService('switch', 'turn_off', entityId);
      });
    }
  }

  private toLockState(state: HassState): DoorLock.LockState {
    return ['locked', 'locking'].includes(state.state) ? DoorLock.LockState.Locked : DoorLock.LockState.Unlocked;
  }

  private logLightCapabilities(member: CompositeMember, memberType: DeviceTypeDefinition, clusterIds: ClusterId[], primaryId: string) {
    const modes: string[] = member.state.attributes.supported_color_modes ?? [];
    const hasBrightness = modes.includes('brightness') || member.state.attributes.brightness !== undefined;
    const hasColorTemp = modes.includes('color_temp') || member.state.attributes.color_temp !== undefined || member.state.attributes.color_temp_kelvin !== undefined;
    const hasRgb = modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m));
    const clusterNames = ['OnOff', ...(clusterIds.includes(LevelControl.id) ? ['LevelControl'] : []), ...(clusterIds.includes(ColorControl.id) ? ['ColorControl'] : [])];

    this.platform.log.notice(`[Composite] Detected HA light capabilities for ${member.entityId}:`);
    this.platform.log.notice(`[Composite]   supported_color_modes=${JSON.stringify(modes)}`);
    this.platform.log.notice(`[Composite]   brightness=${hasBrightness}, color_temp=${hasColorTemp}, rgb/hs/xy=${hasRgb}`);
    this.platform.log.notice(`[Composite]   Selected Matter type: ${memberType.name}`);
    this.platform.log.notice(`[Composite]   Clusters: ${clusterNames.join(', ')}`);

    const minK = member.state.attributes.min_color_temp_kelvin;
    const maxK = member.state.attributes.max_color_temp_kelvin;
    if (minK || maxK) {
      this.platform.log.notice(`[Composite]   Color temp range: ${minK ?? '?'}K–${maxK ?? '?'}K (${minK ? lightColor.kelvinToMireds(minK) : '?'}–${maxK ? lightColor.kelvinToMireds(maxK) : '?'} mireds)`);
    }
    this.platform.log.notice(`[Composite]   Integrated into composite node: ${primaryId}`);
  }
}

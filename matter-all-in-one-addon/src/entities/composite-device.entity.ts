/**
 * One Matter ServerNode containing multiple endpoints that belong to the same
 * Home Assistant device registry entry.  The first endpoint is the primary
 * capability (normally a fan); remaining compatible entities are child
 * endpoints and therefore share its QR code and fabrics.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { BooleanState, ColorControl, FanControl, LevelControl, OccupancySensing, RelativeHumidityMeasurement, TemperatureMeasurement, OnOff } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';
import type { HassState } from '../utils/ha-state.js';
import { getDeviceTypeForEntity } from '../device-registry.js';

type CompositePlatform = {
  log: any;
  ha: { callService(domain: string, service: string, entityId: string, data?: Record<string, any>): Promise<unknown> };
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

function lightClusterIds(state: HassState): ClusterId[] {
  const clusters: ClusterId[] = [OnOff.id];
  const modes: string[] = state.attributes.supported_color_modes ?? [];
  if (modes.includes('brightness') || state.attributes.brightness !== undefined) clusters.push(LevelControl.id);
  if (modes.some((mode) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp'].includes(mode))) clusters.push(ColorControl.id);
  return clusters;
}

function toMatterLevel(brightness: number): number {
  return Math.max(1, Math.min(254, Math.round((brightness / 255) * 254)));
}

/** A grouped physical HA device. */
export class CompositeDeviceEntity {
  public endpoint!: MatterbridgeEndpoint;
  public readonly endpoints = new Map<string, MatterbridgeEndpoint>();
  public readonly states = new Map<string, HassState>();

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
    if (this.primaryEntityIdOverride && this.members.some((member) => member.entityId === this.primaryEntityIdOverride)) return this.primaryEntityIdOverride;
    return this.members.find((member) => member.entityId.startsWith('fan.'))?.entityId ?? this.members[0].entityId;
  }

  async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const primary = this.members.find((member) => member.entityId === this.primaryEntityId)!;
    const primaryType = this.typeFor(primary);
    this.endpoint = new MatterbridgeEndpoint([primaryType], { id: `device_${this.deviceId}`, mode: 'server' });
    this.configureRootIdentity(this.endpoint, primaryType);
    await this.configureMember(this.endpoint, primary, true);
    this.endpoints.set(primary.entityId, this.endpoint);

    for (const member of this.members) {
      if (member.entityId === primary.entityId) continue;
      const child = this.endpoint.addChildDeviceTypeWithClusterServer(endpointId(member.entityId), this.typeFor(member), []);
      await this.configureMember(child, member, false);
      this.endpoints.set(member.entityId, child);
    }
    return this.endpoint;
  }

  async syncInitialState(): Promise<void> {
    await Promise.all(this.members.map((member) => this.updateEntity(member.entityId, member.state, true)));
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
      const percentage = typeof state.attributes.percentage === 'number' ? state.attributes.percentage : (on ? 100 : 0);
      await update(endpoint, FanControl.id, 'percentCurrent', percentage, this.platform.log);
      await update(endpoint, FanControl.id, 'percentSetting', percentage, this.platform.log);
      await update(endpoint, FanControl.id, 'fanMode', on ? 1 : 0, this.platform.log);
      return;
    }

    if (domain === 'light' || domain === 'switch') {
      await update(endpoint, OnOff.id, 'onOff', isOn(state), this.platform.log);
      if (domain === 'light' && typeof state.attributes.brightness === 'number') {
        await update(endpoint, LevelControl.id, 'currentLevel', toMatterLevel(state.attributes.brightness), this.platform.log);
      }
      if (domain === 'light') {
        const colorTemp = state.attributes.color_temp ?? (typeof state.attributes.color_temp_kelvin === 'number' ? Math.round(1_000_000 / state.attributes.color_temp_kelvin) : undefined);
        if (typeof colorTemp === 'number') {
          await update(endpoint, ColorControl.id, 'colorTemperatureMireds', colorTemp, this.platform.log);
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

  private configureRootIdentity(endpoint: MatterbridgeEndpoint, type: DeviceTypeDefinition) {
    const nodeName = this.name.substring(0, 32).trim();
    endpoint.deviceType = type.code;
    endpoint.deviceName = nodeName;
    endpoint.uniqueId = `device_${this.deviceId}`.substring(0, 32);
    endpoint.serialNumber = `device_${this.deviceId}`.substring(0, 29);
    endpoint.vendorId = 0xfff1;
    endpoint.vendorName = 'Home Assistant';
    endpoint.productId = 0x8000;
    endpoint.productName = 'Home Assistant Composite Device';
    endpoint.createDefaultBasicInformationClusterServer(nodeName, endpoint.serialNumber, endpoint.vendorId, endpoint.vendorName, endpoint.productId, endpoint.productName);
  }

  private async configureMember(endpoint: MatterbridgeEndpoint, member: CompositeMember, isRoot: boolean) {
    const [domain] = member.entityId.split('.');
    if (domain === 'fan') {
      const on = isOn(member.state);
      const percentage = typeof member.state.attributes.percentage === 'number' ? member.state.attributes.percentage : (on ? 100 : 0);
      endpoint.createDefaultFanControlClusterServer(on ? 1 : 0, undefined, percentage, percentage);
      endpoint.addClusterServers([OnOff.id]);
      endpoint.addRequiredClusterServers();
      this.addOnOffHandlers(endpoint, member.entityId, 'fan');
      endpoint.addCommandHandler('FanControl.step', async (data: any) => {
        const direction = data?.request?.direction ?? data?.direction;
        const current = this.states.get(member.entityId)?.attributes.percentage ?? percentage;
        const next = direction === 0 ? Math.min(100, current + 10) : Math.max(0, current - 10);
        await this.platform.ha.callService('fan', 'set_percentage', member.entityId, { percentage: next });
      });
      return;
    }

    if (domain === 'light') {
      endpoint.addClusterServers(lightClusterIds(member.state));
      endpoint.addRequiredClusterServers();
      this.addOnOffHandlers(endpoint, member.entityId, 'light');
      endpoint.addCommandHandler('moveToLevel', async (data: any) => {
        const level = data?.level ?? data?.request?.level;
        if (typeof level === 'number') await this.platform.ha.callService('light', 'turn_on', member.entityId, { brightness: Math.round((level / 254) * 255) });
      });
      endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
        const level = data?.level ?? data?.request?.level;
        if (typeof level !== 'number' || level === 0) await this.platform.ha.callService('light', 'turn_off', member.entityId);
        else await this.platform.ha.callService('light', 'turn_on', member.entityId, { brightness: Math.round((level / 254) * 255) });
      });
      endpoint.addCommandHandler('moveToColorTemperature', async (data: any) => {
        const colorTemperatureMireds = data?.colorTemperatureMireds ?? data?.request?.colorTemperatureMireds;
        if (typeof colorTemperatureMireds === 'number') await this.platform.ha.callService('light', 'turn_on', member.entityId, { color_temp: colorTemperatureMireds });
      });
      return;
    }

    if (domain === 'switch') {
      endpoint.addClusterServers([OnOff.id]);
      endpoint.addRequiredClusterServers();
      this.addOnOffHandlers(endpoint, member.entityId, 'switch');
      return;
    }

    // Sensor device types provide their required cluster servers. They remain
    // independent child endpoints and are never folded into fan/light state.
    endpoint.addRequiredClusterServers();
    if (!isRoot) endpoint.addRequiredClusterServers();
  }

  private addOnOffHandlers(endpoint: MatterbridgeEndpoint, entityId: string, domain: 'fan' | 'light' | 'switch') {
    endpoint.addCommandHandler('on', async () => { await this.platform.ha.callService(domain, 'turn_on', entityId); });
    endpoint.addCommandHandler('off', async () => { await this.platform.ha.callService(domain, 'turn_off', entityId); });
  }
}

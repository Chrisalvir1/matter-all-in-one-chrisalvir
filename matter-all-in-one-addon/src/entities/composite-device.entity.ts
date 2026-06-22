/**
 * One Matter ServerNode containing multiple endpoints that belong to the same
 * Home Assistant device registry entry.  The first endpoint is the primary
 * capability (normally a fan); remaining compatible entities are child
 * endpoints and therefore share its QR code and fabrics.
 *
 * v1.2.11 — Critical fix: child endpoint clusters (LevelControl, ColorControl)
 * are now declared upfront in addChildDeviceTypeWithClusterServer() instead of
 * being added post-hoc with addClusterServers().  Matter controllers (Apple Home,
 * Google Home) read the Descriptor cluster at commissioning time to discover
 * endpoint capabilities; clusters added after endpoint creation are not visible.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import {
  BooleanState, ColorControl, FanControl, LevelControl,
  OccupancySensing, RelativeHumidityMeasurement, TemperatureMeasurement, OnOff,
} from 'matterbridge/matter/clusters';
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

/**
 * Compute the ClusterIds that a light endpoint MUST expose based on HA capabilities.
 * These must be passed to addChildDeviceTypeWithClusterServer() — not added afterwards.
 *
 * Priority (per Matter spec):
 *  RGB/HS/XY → Extended Color Light → OnOff + LevelControl + ColorControl
 *  color_temp → Color Temperature Light → OnOff + LevelControl + ColorControl
 *  brightness → Dimmable Light → OnOff + LevelControl
 *  onoff-only → OnOff Light → OnOff
 */
function lightClusterIds(state: HassState, deviceType: DeviceTypeDefinition): ClusterId[] {
  const clusters: ClusterId[] = [OnOff.id];
  const modes: string[] = state.attributes.supported_color_modes ?? [];
  const hasBrightness = modes.includes('brightness') || state.attributes.brightness !== undefined;
  const hasColorTemp = modes.includes('color_temp')
    || state.attributes.color_temp !== undefined
    || state.attributes.color_temp_kelvin !== undefined;
  const hasRgb = modes.some((m) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(m));

  const isOnOffProfile = deviceType.code === 0x0100 || deviceType.code === 0x010A; // OnOffLight or OnOffPlugInUnit
  const isColorProfile = deviceType.code === 0x010C || deviceType.code === 0x010D; // ColorTemperatureLight or ExtendedColorLight

  // LevelControl required whenever brightness, color_temp or color is supported AND profile allows it
  if ((hasBrightness || hasColorTemp || hasRgb) && !isOnOffProfile) clusters.push(LevelControl.id);
  // ColorControl required when color temperature or RGB color is supported AND profile allows it
  if ((hasColorTemp || hasRgb) && isColorProfile) clusters.push(ColorControl.id);
  return clusters;
}

function toMatterLevel(brightness: number): number {
  return Math.max(1, Math.min(254, Math.round((brightness / 255) * 254)));
}

/** Convert kelvin to Matter mireds (1 000 000 / kelvin). */
function kelvinToMireds(kelvin: number): number {
  return Math.round(1_000_000 / kelvin);
}

/** Convert Matter mireds to kelvin. */
function miredsToKelvin(mireds: number): number {
  return Math.round(1_000_000 / mireds);
}

/** A grouped physical HA device — fan + light share one QR code and Matter node. */
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
    if (
      this.primaryEntityIdOverride
      && this.members.some((m) => m.entityId === this.primaryEntityIdOverride)
    ) {
      return this.primaryEntityIdOverride;
    }
    return this.members.find((m) => m.entityId.startsWith('fan.'))?.entityId ?? this.members[0].entityId;
  }

  async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const primary = this.members.find((m) => m.entityId === this.primaryEntityId)!;
    const primaryType = this.typeFor(primary);

    // ── Diagnostic logs (visible in Matterbridge log panel) ─────────────────
    this.platform.log.notice('[Composite] group_by_device_id=true');
    this.platform.log.notice(`[Composite] Found HA device_id: ${this.deviceId}`);
    this.platform.log.notice(`[Composite] Composite candidate: ${this.members.map((m) => m.entityId).join(' + ')}`);
    this.platform.log.notice(`[Composite] Primary entity: ${primary.entityId}`);
    this.platform.log.notice(`[Composite] Creating ServerNode composite accessory: ${this.name}`);
    this.platform.log.notice(`[Composite] Endpoint 1 (root): ${primaryType.name} → ${primary.entityId}`);

    this.endpoint = new MatterbridgeEndpoint([primaryType], { id: `device_${this.deviceId}`, mode: 'server' });
    this.configureRootIdentity(this.endpoint, primaryType);
    this.addRootClusters(this.endpoint, primary);
    this.addCommandHandlers(this.endpoint, primary);
    this.endpoints.set(primary.entityId, this.endpoint);

    let endpointIndex = 2;
    for (const member of this.members) {
      if (member.entityId === primary.entityId) continue;

      const [domain] = member.entityId.split('.');
      const memberType = this.typeFor(member);
      // ── CRITICAL: compute clusters BEFORE creating the child endpoint ────
      const clusterIds = this.computeClusterIds(member);

      if (domain === 'light') {
        this.logLightCapabilities(member, memberType, clusterIds, primary.entityId);
      } else {
        this.platform.log.notice(`[Composite] Integrated endpoint: ${member.entityId} (${memberType.name})`);
      }
      this.platform.log.notice(`[Composite] Endpoint ${endpointIndex}: ${memberType.name} → ${member.entityId}`);
      endpointIndex++;

      // Pass clusterIds upfront so Matterbridge's Descriptor cluster lists them
      // at commissioning time — Apple Home reads Descriptor before it can show
      // the light controls.  An empty [] here means no controls appear in Home.
      const child = this.endpoint.addChildDeviceTypeWithClusterServer(endpointId(member.entityId), memberType, clusterIds);
      this.addCommandHandlers(child, member);
      this.endpoints.set(member.entityId, child);
    }

    this.platform.log.notice(`[Composite] QR generated for composite node: ${this.name}`);
    this.platform.log.notice(`[Composite] Descriptor endpoints: [${this.members.map((m) => `${m.entityId}`).join(', ')}]`);
    return this.endpoint;
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
      const percentage = typeof state.attributes.percentage === 'number' ? state.attributes.percentage : (on ? 100 : 0);
      await update(endpoint, FanControl.id, 'percentCurrent', percentage, this.platform.log);
      await update(endpoint, FanControl.id, 'percentSetting', percentage, this.platform.log);
      await update(endpoint, FanControl.id, 'fanMode', on ? 1 : 0, this.platform.log);
      return;
    }

    if (domain === 'light' || domain === 'switch') {
      await update(endpoint, OnOff.id, 'onOff', isOn(state), this.platform.log);

      if (domain === 'light') {
        // Brightness → LevelControl.currentLevel
        if (typeof state.attributes.brightness === 'number') {
          await update(endpoint, LevelControl.id, 'currentLevel', toMatterLevel(state.attributes.brightness), this.platform.log);
        }

        // Color temperature: prefer native mireds, fall back to converting kelvin
        let colorTempMireds: number | undefined;
        if (typeof state.attributes.color_temp === 'number') {
          colorTempMireds = state.attributes.color_temp;
        } else if (typeof state.attributes.color_temp_kelvin === 'number') {
          colorTempMireds = kelvinToMireds(state.attributes.color_temp_kelvin);
        }
        if (colorTempMireds !== undefined) {
          await update(endpoint, ColorControl.id, 'colorTemperatureMireds', colorTempMireds, this.platform.log);
          await update(endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds, this.platform.log);
        }

        // HS color (hue 0-360 → 0-254, sat 0-100 → 0-254)
        if (Array.isArray(state.attributes.hs_color)) {
          const [hue, sat] = state.attributes.hs_color as number[];
          await update(endpoint, ColorControl.id, 'currentHue', Math.round((hue / 360) * 254), this.platform.log);
          await update(endpoint, ColorControl.id, 'currentSaturation', Math.round((sat / 100) * 254), this.platform.log);
          await update(endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation, this.platform.log);
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

  // ── Private helpers ──────────────────────────────────────────────────────

  private typeFor(member: CompositeMember): DeviceTypeDefinition {
    const [domain] = member.entityId.split('.');
    return member.deviceType ?? getDeviceTypeForEntity(domain, member.state.attributes.device_class, member.state.attributes);
  }

  /**
   * Clusters that must be declared when creating a child endpoint.
   * These are read by controllers at commissioning time via the Descriptor cluster.
   */
  private computeClusterIds(member: CompositeMember): ClusterId[] {
    const [domain] = member.entityId.split('.');
    if (domain === 'light') return lightClusterIds(member.state, this.typeFor(member));
    if (domain === 'switch') return [OnOff.id];
    if (domain === 'fan') return [OnOff.id, FanControl.id];
    return [];
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
    endpoint.createDefaultBasicInformationClusterServer(
      nodeName, endpoint.serialNumber,
      endpoint.vendorId, endpoint.vendorName,
      endpoint.productId, endpoint.productName,
    );
  }

  /** Initialize clusters on the ROOT endpoint (fan primary). */
  private addRootClusters(endpoint: MatterbridgeEndpoint, member: CompositeMember) {
    const [domain] = member.entityId.split('.');
    if (domain === 'fan') {
      const on = isOn(member.state);
      const percentage = typeof member.state.attributes.percentage === 'number'
        ? member.state.attributes.percentage
        : (on ? 100 : 0);
      endpoint.createDefaultFanControlClusterServer(on ? 1 : 0, undefined, percentage, percentage);
      endpoint.addClusterServers([OnOff.id]);
      endpoint.addRequiredClusterServers();
    }
  }

  /** Register Matter → HA command handlers for a given endpoint/member. */
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
      endpoint.addCommandHandler('FanControl.step', async (data: any) => {
        const direction = data?.request?.direction ?? data?.direction;
        const current = this.states.get(entityId)?.attributes.percentage ?? 50;
        const next = direction === 0 ? Math.min(100, current + 10) : Math.max(0, current - 10);
        await this.platform.ha.callService('fan', 'set_percentage', entityId, { percentage: next });
      });
      return;
    }

    if (domain === 'light') {
      endpoint.addCommandHandler('on', async () => {
        await this.platform.ha.callService('light', 'turn_on', entityId);
      });
      endpoint.addCommandHandler('off', async () => {
        await this.platform.ha.callService('light', 'turn_off', entityId);
      });

      // Brightness control
      endpoint.addCommandHandler('moveToLevel', async (data: any) => {
        const level = data?.level ?? data?.request?.level;
        if (typeof level === 'number') {
          await this.platform.ha.callService('light', 'turn_on', entityId, {
            brightness: Math.round((level / 254) * 255),
          });
        }
      });
      endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
        const level = data?.level ?? data?.request?.level;
        if (typeof level !== 'number' || level === 0) {
          await this.platform.ha.callService('light', 'turn_off', entityId);
        } else {
          await this.platform.ha.callService('light', 'turn_on', entityId, {
            brightness: Math.round((level / 254) * 255),
          });
        }
      });

      // Color temperature — prefer kelvin if the light supports it
      endpoint.addCommandHandler('moveToColorTemperature', async (data: any) => {
        const mireds = data?.colorTemperatureMireds ?? data?.request?.colorTemperatureMireds;
        if (typeof mireds === 'number') {
          const currentState = this.states.get(entityId);
          const modes: string[] = currentState?.attributes.supported_color_modes ?? [];
          // If HA device reports kelvin, send kelvin; otherwise send mireds
          if (modes.includes('color_temp') || currentState?.attributes.color_temp_kelvin !== undefined) {
            await this.platform.ha.callService('light', 'turn_on', entityId, {
              color_temp_kelvin: miredsToKelvin(mireds),
            });
          } else {
            await this.platform.ha.callService('light', 'turn_on', entityId, { color_temp: mireds });
          }
        }
      });

      // Hue and Saturation (extended color lights)
      endpoint.addCommandHandler('moveToHueAndSaturation', async (data: any) => {
        const hue = data?.hue ?? data?.request?.hue;
        const sat = data?.saturation ?? data?.request?.saturation;
        if (typeof hue === 'number' && typeof sat === 'number') {
          await this.platform.ha.callService('light', 'turn_on', entityId, {
            hs_color: [Math.round((hue / 254) * 360), Math.round((sat / 254) * 100)],
          });
        }
      });
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

  /** Emit structured diagnostic log lines for a light member. */
  private logLightCapabilities(
    member: CompositeMember,
    memberType: DeviceTypeDefinition,
    clusterIds: ClusterId[],
    primaryId: string,
  ) {
    const modes: string[] = member.state.attributes.supported_color_modes ?? [];
    const hasBrightness = modes.includes('brightness') || member.state.attributes.brightness !== undefined;
    const hasColorTemp = modes.includes('color_temp')
      || member.state.attributes.color_temp !== undefined
      || member.state.attributes.color_temp_kelvin !== undefined;
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
      this.platform.log.notice(
        `[Composite]   Color temp range: ${minK ?? '?'}K–${maxK ?? '?'}K (${minK ? kelvinToMireds(minK) : '?'}–${maxK ? kelvinToMireds(maxK) : '?'} mireds)`,
      );
    }
    this.platform.log.notice(`[Composite]   Integrated into composite node: ${primaryId}`);
  }
}

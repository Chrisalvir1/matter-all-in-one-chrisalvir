/**
 * Base entity class for exposing Home Assistant entities to Matter.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { OnOff, LevelControl, ColorControl, FanControl, OccupancySensing, BooleanState, TemperatureMeasurement, RelativeHumidityMeasurement } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export class BaseEntity {
  public platform: HomeAssistantPlatform;
  public entityId: string;
  public state: HassState;
  
  private binarySensorLatchTimeout?: NodeJS.Timeout;
  private lastCommands = new Map<string, { value: any; timestamp: number }>();
  public deviceType: DeviceTypeDefinition;

  private shouldIgnoreStateUpdate(attribute: string, windowMs = 3000): boolean {
    const last = this.lastCommands.get(attribute);
    if (!last) return false;
    const elapsed = Date.now() - last.timestamp;
    if (elapsed > windowMs) {
      this.lastCommands.delete(attribute);
      return false;
    }
    return true;
  }
  public endpoint!: MatterbridgeEndpoint;

  /**
   * Matterbridge defaults endpoint firmware to 1.0.0.  That value is shown
   * verbatim by HomeKit, so every server node must explicitly inherit the
   * running Matterbridge version.
   */
  protected applyMatterbridgeFirmware(endpoint: MatterbridgeEndpoint = this.endpoint): void {
    const version = String((this.platform as any).matterbridge?.matterbridgeVersion ?? 'Matterbridge');
    const [major = 0, minor = 0, patch = 0] = version.split(/[-+.]/).map((part) => Number.parseInt(part, 10) || 0);
    endpoint.softwareVersion = Math.min(0xffffffff, major * 1_000_000 + minor * 1_000 + patch);
    endpoint.softwareVersionString = version.startsWith('Matterbridge') ? version : `Matterbridge ${version}`;
  }

  constructor(
    platform: HomeAssistantPlatform,
    state: HassState,
    deviceType: DeviceTypeDefinition
  ) {
    this.platform = platform;
    this.entityId = state.entity_id;
    this.state = state;
    this.deviceType = deviceType;
  }

  /**
   * Determine which cluster IDs are needed based on entity domain and capabilities.
   */
  protected getRequiredClusterIds(): ClusterId[] {
    const [domain] = this.entityId.split('.');
    const clusters: ClusterId[] = [];

    if (domain === 'light' || domain === 'switch' || domain === 'media_player' || domain === 'vacuum') {
      clusters.push(OnOff.id);
      const supportedModes: string[] = this.state.attributes.supported_color_modes ?? [];
      const hasBrightness = supportedModes.includes('brightness') || this.state.attributes.brightness !== undefined;
      const isOnOffProfile = this.deviceType.code === 0x0100 || this.deviceType.code === 0x010A; // OnOffLight or OnOffPlugInUnit
      if (hasBrightness && !isOnOffProfile) {
        clusters.push(LevelControl.id);
      }
      // Only add ColorControl if the light supports real color modes AND the profile allows it
      const realColorModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp'];
      const hasColorCapability = supportedModes.some(m => realColorModes.includes(m));
      const isColorProfile = this.deviceType.code === 0x010C || this.deviceType.code === 0x010D; // ColorTemperatureLight or ExtendedColorLight
      if (hasColorCapability && isColorProfile) {
        clusters.push(ColorControl.id);
      }
    }

    return clusters;
  }

  /**
   * Create and register the MatterbridgeEndpoint.
   */
  public async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const rawName = this.state.attributes.friendly_name ?? this.entityId;

    // Preserve the Home Assistant friendly name exactly (within Matter's
    // 32-character limit). Identity and uniqueness belong to entityId/serial,
    // never to the user-visible accessory name.
    const uniqueName = rawName.substring(0, 32).trim();

    this.endpoint = new MatterbridgeEndpoint([this.deviceType], {
      id: this.entityId.replaceAll('.', '_'),
      mode: 'server',
    });

    const [domain] = this.entityId.split('.');
    
    // Explicitly set metadata properties on the endpoint instance for createDeviceServerNode
    this.endpoint.deviceType = this.deviceType.code;
    this.endpoint.deviceName = uniqueName;
    this.endpoint.uniqueId = this.entityId.replaceAll('.', '_');
    this.endpoint.serialNumber = this.entityId.replaceAll('.', '_').substring(0, 29) + '_G2';
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = 'Home Assistant';
    this.endpoint.productId = 0x8000;
    // Instead of hardcoding the domain (e.g. "Light"), use the deviceType name (e.g. "DimmablePlugInUnit")
    // to prevent Apple HomeKit from forcing the Lightbulb icon on dimmers that are not lights.
    this.endpoint.productName = this.deviceType.name;

    // Use the BasicInformation cluster (NOT BridgedDeviceBasicInformation).
    // This entity is registered with mode: 'server' so Matterbridge creates
    // an independent ServerNode with its own QR code. Using the bridged version
    // here would conflict with the server mode and prevent pairing.
    this.endpoint.createDefaultBasicInformationClusterServer(
      uniqueName,
      this.endpoint.serialNumber,
      0xfff1,
      'Home Assistant',
      0x8000,
      this.endpoint.productName
    );
    this.applyMatterbridgeFirmware();

    const isFanProfile = this.deviceType.code === 0x002b || this.deviceType.name.toLowerCase() === 'fan';

    if (domain === 'fan' && isFanProfile) {
      const on = this.state.state === 'on';
      const percentage = typeof this.state.attributes.percentage === 'number' ? this.state.attributes.percentage : (on ? 100 : 0);
      this.endpoint.createDefaultFanControlClusterServer(on ? 1 : 0, undefined, percentage, percentage);
      this.endpoint.addClusterServers([OnOff.id]);
    }

    const clusters = this.getRequiredClusterIds();
    if (clusters.length > 0) {
      this.endpoint.addClusterServers(clusters);
    }
    this.endpoint.addRequiredClusterServers();

    // Add custom cluster servers for subclasses before registering handlers and syncing state
    await this.addCustomClusterServers();

    this.registerCommandHandlers();

    return this.endpoint;
  }

  /**
   * Hook for subclasses to add custom cluster servers before registering handlers/syncing state.
   */
  protected addCustomClusterServers(): void | Promise<void> {
    return;
  }

  /**
   * Setup command handlers from Matter to Home Assistant.
   * @param endpoint - Optional endpoint override (used by subclasses like VacuumEntity).
   */
  protected registerCommandHandlers(_endpoint?: MatterbridgeEndpoint) {
    const [domain] = this.entityId.split('.');

    if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum') {
      // On/Off handlers
      this.endpoint.addCommandHandler('on', async () => {
        this.platform.log.debug(`Matter On commanded for ${this.entityId}`);
        if (domain === 'vacuum') await this.platform.ha.callService(domain, 'start', this.entityId);
        else await this.platform.ha.callService(domain, 'turn_on', this.entityId);
      });

      this.endpoint.addCommandHandler('off', async () => {
        this.platform.log.debug(`Matter Off commanded for ${this.entityId}`);
        if (domain === 'vacuum') await this.platform.ha.callService(domain, 'return_to_base', this.entityId);
        else await this.platform.ha.callService(domain, 'turn_off', this.entityId);
      });

      if (domain === 'fan' && this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
        this.endpoint.addCommandHandler('FanControl.step', async (data: any) => {
          const direction = data?.request?.direction ?? data?.direction;
          const current = typeof this.state.attributes.percentage === 'number' ? this.state.attributes.percentage : 0;
          const percentage = direction === 0 ? Math.min(100, current + 10) : Math.max(0, current - 10);
          await this.platform.ha.callService('fan', 'set_percentage', this.entityId, { percentage });
        });
      }

      // LevelControl handlers (brightness)
      if (this.endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
        this.endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data?.level ?? data?.request?.level; // 0..254
          if (typeof level === 'number') {
            const haBrightness = Math.round((level / 254) * 255);
            this.platform.log.debug(`Matter MoveToLevel commanded for ${this.entityId}: level=${level} -> HA brightness=${haBrightness}`);
            this.lastCommands.set('brightness', { value: haBrightness, timestamp: Date.now() });
            await this.platform.ha.callService(domain, 'turn_on', this.entityId, {
              brightness: haBrightness,
            });
          }
        });

        this.endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
          const level = data?.level ?? data?.request?.level;
          if (typeof level === 'number') {
            const haBrightness = Math.round((level / 254) * 255);
            this.platform.log.debug(`Matter MoveToLevelWithOnOff commanded for ${this.entityId}: level=${level} -> HA brightness=${haBrightness}`);
            this.lastCommands.set('brightness', { value: haBrightness, timestamp: Date.now() });
            if (level === 0) {
              await this.platform.ha.callService(domain, 'turn_off', this.entityId);
            } else {
              await this.platform.ha.callService(domain, 'turn_on', this.entityId, {
                brightness: haBrightness,
              });
            }
          }
        });
      }
    }
  }

  /**
   * Set initial attribute values based on current Home Assistant state.
   * NOTE: called BEFORE the endpoint is added to Matterbridge, so the
   * endpoint is still in the "inactive" lifecycle state.  We must use
   * setAttribute (not updateAttribute) and swallow the inactive-state
   * error silently — Matterbridge will pick up the initial values when
   * the endpoint transitions to active during commissioning setup.
   */
  public async syncInitialState(): Promise<void> {
    await this.updateState(this.state, true);
  }

  /**
   * Clamp a level value to the LevelControl minLevel / maxLevel bounds
   * reported by the endpoint cluster server.  Matter spec says currentLevel
   * MUST satisfy the constraint "minLevel to maxLevel"; if we send 0 when
   * minLevel=135 the transaction rolls back with an UnhandledRejection.
   *
   * Falls back to the raw value when the cluster is not present so this
   * helper is safe to call unconditionally.
   */
  /**
   * Clamp a level value to the LevelControl minLevel / maxLevel bounds
   * reported by the endpoint cluster server.  Matter spec says currentLevel
   * MUST satisfy the constraint "minLevel to maxLevel"; if we send 0 when
   * minLevel=135 the transaction rolls back with an UnhandledRejection.
   *
   * Falls back to the raw value when the cluster is not present so this
   * helper is safe to call unconditionally.
   */
  private clampLevel(rawLevel: number, isInitialSync = false): number {
    if (isInitialSync) {
      return Math.min(254, Math.max(1, rawLevel));
    }
    try {
      const minLevel = (this.endpoint as any)
        .getAttribute?.(LevelControl.id, 'minLevel') ?? 1;
      const maxLevel = (this.endpoint as any)
        .getAttribute?.(LevelControl.id, 'maxLevel') ?? 254;
      // minLevel must be at least 1 per Matter spec (0 means "off")
      const lo = Math.max(1, minLevel as number);
      const hi = Math.min(254, maxLevel as number);
      return Math.min(hi, Math.max(lo, rawLevel));
    } catch {
      return Math.min(254, Math.max(1, rawLevel));
    }
  }

  /**
   * Sync a new Home Assistant state update to the Matter endpoint.
   * Safe to call at any point in the endpoint lifecycle.
   */
  public async updateState(newState: HassState, isInitialSync = false): Promise<void> {
    this.state = newState;
    if (!this.endpoint) return;

    const [domain] = this.entityId.split('.');

    if (domain === 'light' || domain === 'switch' || domain === 'fan' || domain === 'media_player' || domain === 'vacuum') {
      const isOn = domain === 'vacuum' ? newState.state === 'cleaning' : newState.state === 'on';

      if (isInitialSync) {
        await safeSetAttribute(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);
      } else {
        await safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);
      }

      if (newState.attributes.brightness !== undefined) {
        if (!isInitialSync && this.shouldIgnoreStateUpdate('brightness')) {
          this.platform.log.debug(`Ignoring HA brightness state update for ${this.entityId} due to recent command lockout`);
        } else {
          // HA brightness: 0-255  →  Matter currentLevel: 1-254
          // Never send 0: it violates the minLevel constraint on dimmers
          // (e.g. Govee minLevel=135).  Map 0-brightness to level 1 (off
          // state is communicated via onOff cluster, not currentLevel=0).
          const raw   = Math.round((newState.attributes.brightness / 255) * 254);
          const level = this.clampLevel(Math.max(1, raw), isInitialSync);
          if (isInitialSync) {
            await safeSetAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
          } else {
            await safeUpdateAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
          }
        }
      }

      if (domain === 'fan' && this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
        const percentage = typeof newState.attributes.percentage === 'number' ? newState.attributes.percentage : (isOn ? 100 : 0);
        const update = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
        await update(this.endpoint, FanControl.id, 'percentCurrent', percentage, this.platform.log);
        await update(this.endpoint, FanControl.id, 'percentSetting', percentage, this.platform.log);
        await update(this.endpoint, FanControl.id, 'fanMode', isOn ? 1 : 0, this.platform.log);
      }
    } else if (domain === 'binary_sensor') {
      const active = ['on', 'open', 'detected', 'true'].includes(newState.state.toLowerCase());

      const updateMatter = async (isActive: boolean) => {
        if (!this.endpoint) return;
        if (this.endpoint.hasAttributeServer(OccupancySensing.id, 'occupancy')) {
          const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
          await updateFn(this.endpoint, OccupancySensing.id, 'occupancy', { occupied: isActive }, this.platform.log);
        } else if (this.endpoint.hasAttributeServer(BooleanState.id, 'stateValue')) {
          const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
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
            }, 3000); // 3 seconds latch
          }
        }
      }
    } else if (domain === 'sensor') {
      const numeric = parseFloat(newState.state);
      if (!isNaN(numeric) && this.endpoint) {
        if (this.endpoint.hasAttributeServer(TemperatureMeasurement.id, 'measuredValue')) {
          const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
          await updateFn(this.endpoint, TemperatureMeasurement.id, 'measuredValue', Math.round(numeric * 100), this.platform.log);
        } else if (this.endpoint.hasAttributeServer(RelativeHumidityMeasurement.id, 'measuredValue')) {
          const updateFn = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
          await updateFn(this.endpoint, RelativeHumidityMeasurement.id, 'measuredValue', Math.round(numeric * 100), this.platform.log);
        }
      }
    }
  }
}

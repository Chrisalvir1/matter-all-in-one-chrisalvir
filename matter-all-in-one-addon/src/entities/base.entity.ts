/**
 * Base entity class for exposing Home Assistant entities to Matter.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { OnOff, LevelControl, ColorControl, FanControl, OccupancySensing, BooleanState, TemperatureMeasurement, RelativeHumidityMeasurement } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';
import { hasColorTemperatureCapability } from '../device-registry.js';
import { getMatterSerialNumber, getHaDeviceModel, getHaDeviceManufacturer, MATTER_BRIDGE_VENDOR_ID, MATTER_BRIDGE_VENDOR_NAME } from '../utils/matter-device-identity.js';

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

  private hasColorControl(endpoint: MatterbridgeEndpoint = this.endpoint): boolean {
    const hasClusterServer = (endpoint as any).hasClusterServer;
    if (typeof hasClusterServer === 'function') {
      return hasClusterServer.call(endpoint, ColorControl);
    }
    const hasAttributeServer = (endpoint as any).hasAttributeServer;
    return typeof hasAttributeServer === 'function' && hasAttributeServer.call(endpoint, ColorControl.id, 'colorMode');
  }

  private static miredsToKelvin(mireds: number): number {
    return Math.round(1_000_000 / mireds);
  }

  private static kelvinToMireds(kelvin: number): number {
    return Math.round(1_000_000 / kelvin);
  }

  private getHsColor(state: HassState): [number, number] | undefined {
    const attributes = state.attributes as any;
    if (Array.isArray(attributes.hs_color) && attributes.hs_color.length >= 2) {
      return [attributes.hs_color[0], attributes.hs_color[1]];
    }
    if (!Array.isArray(attributes.rgb_color) || attributes.rgb_color.length < 3) return undefined;

    const [red, green, blue] = attributes.rgb_color.map((value: number) => Math.max(0, Math.min(255, value)) / 255);
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const delta = max - min;
    if (delta === 0) return [0, 0];
    let hue = 0;
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
    return [(hue + 360) % 360, Math.round((delta / max) * 100)];
  }

  protected getMatterSerialNumber(): string {
    return getMatterSerialNumber(this.platform, this.entityId);
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

  constructor(platform: HomeAssistantPlatform, state: HassState, deviceType: DeviceTypeDefinition) {
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
      const isOnOffProfile = this.deviceType.code === 0x0100 || this.deviceType.code === 0x010a; // OnOffLight or OnOffPlugInUnit
      // Only add ColorControl if the light supports real color modes AND the profile allows it
      const realColorModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp'];
      const hasColorCapability =
        supportedModes.some((m) => realColorModes.includes(m)) ||
        hasColorTemperatureCapability(this.state.attributes);
      const isColorProfile = this.deviceType.code === 0x010c || this.deviceType.code === 0x010d; // ColorTemperatureLight or ExtendedColorLight
      if ((hasBrightness || hasColorCapability) && !isOnOffProfile) {
        clusters.push(LevelControl.id);
      }
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
    this.endpoint.serialNumber = this.getMatterSerialNumber();
    this.endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    // Use real manufacturer from HA device registry (e.g. "Tuya", "Shelly").
    // Falls back to the bridge vendor name when the integration omits it.
    this.endpoint.vendorName = getHaDeviceManufacturer(this.platform, this.entityId);
    this.endpoint.productId = 0x8000;
    // Use real model from HA device registry (e.g. "CB03-SBL", "SHSW-25").
    // Falls back to the Matter device type name (e.g. "OnOffLight") when unavailable.
    this.endpoint.productName = getHaDeviceModel(this.platform, this.entityId, this.deviceType.name);

    // Use the BasicInformation cluster (NOT BridgedDeviceBasicInformation).
    // This entity is registered with mode: 'server' so Matterbridge creates
    // an independent ServerNode with its own QR code. Using the bridged version
    // here would conflict with the server mode and prevent pairing.
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

    if (domain === 'fan' && isFanProfile) {
      const on = this.state.state === 'on';
      const percentage = typeof this.state.attributes.percentage === 'number' ? this.state.attributes.percentage : on ? 100 : 0;
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
   * Reattach this entity to a ServerNode retained by Matterbridge after a
   * Home Assistant reconnect or plugin reload.  Persisted endpoints may not
   * have runtime command callbacks, so restore them only when none exist.
   */
  public adoptEndpoint(endpoint: MatterbridgeEndpoint): void {
    this.endpoint = endpoint;
    if (endpoint.commandHandler && (endpoint.commandHandler as any).handler?.length === 0) {
      this.registerCommandHandlers(endpoint);
    }
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
            this.lastCommands.set('brightness', {
              value: haBrightness,
              timestamp: Date.now(),
            });
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
            this.lastCommands.set('brightness', {
              value: haBrightness,
              timestamp: Date.now(),
            });
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

      // Govee, Tuya and other direct colour lights use ColorControl on their
      // own ServerNode.  These handlers deliberately live in BaseEntity (not
      // only in CompositeDeviceEntity) so standalone lights keep every colour
      // capability they advertised to Home Assistant.
      if (domain === 'light' && this.hasColorControl(this.endpoint)) {
        const currentHs = () => this.getHsColor(this.state) ?? [0, 100];
        const sendHs = async (hue: number, saturation: number) => {
          const hs: [number, number] = [Math.round((hue / 254) * 360), Math.round((saturation / 254) * 100)];
          this.lastCommands.set('hs_color', { value: hs, timestamp: Date.now() });
          await this.platform.ha.callService('light', 'turn_on', this.entityId, { hs_color: hs });
        };

        this.endpoint.addCommandHandler('moveToHueAndSaturation', async (data: any) => {
          const hue = data?.hue ?? data?.request?.hue;
          const saturation = data?.saturation ?? data?.request?.saturation;
          if (typeof hue === 'number' && typeof saturation === 'number') await sendHs(hue, saturation);
        });

        this.endpoint.addCommandHandler('moveToHue', async (data: any) => {
          const hue = data?.hue ?? data?.request?.hue;
          if (typeof hue !== 'number') return;
          const [, saturation] = currentHs();
          await sendHs(hue, Math.round((saturation / 100) * 254));
        });

        this.endpoint.addCommandHandler('moveToSaturation', async (data: any) => {
          const saturation = data?.saturation ?? data?.request?.saturation;
          if (typeof saturation !== 'number') return;
          const [hue] = currentHs();
          await sendHs(Math.round((hue / 360) * 254), saturation);
        });

        this.endpoint.addCommandHandler('moveToColor', async (data: any) => {
          const x = data?.colorX ?? data?.request?.colorX;
          const y = data?.colorY ?? data?.request?.colorY;
          if (typeof x !== 'number' || typeof y !== 'number') return;
          const xy: [number, number] = [x / 65535, y / 65535];
          this.lastCommands.set('xy_color', { value: xy, timestamp: Date.now() });
          await this.platform.ha.callService('light', 'turn_on', this.entityId, { xy_color: xy });
        });

        this.endpoint.addCommandHandler('moveToColorTemperature', async (data: any) => {
          const mireds = data?.colorTemperatureMireds ?? data?.request?.colorTemperatureMireds;
          if (typeof mireds !== 'number' || mireds <= 0) return;
          this.lastCommands.set('color_temp', { value: mireds, timestamp: Date.now() });
          const attributes = this.state.attributes as any;
          const usesKelvin = attributes.color_temp_kelvin !== undefined || attributes.min_color_temp_kelvin !== undefined || attributes.max_color_temp_kelvin !== undefined;
          await this.platform.ha.callService('light', 'turn_on', this.entityId, usesKelvin ? { color_temp_kelvin: BaseEntity.miredsToKelvin(mireds) } : { color_temp: mireds });
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
      const minLevel = (this.endpoint as any).getAttribute?.(LevelControl.id, 'minLevel') ?? 1;
      const maxLevel = (this.endpoint as any).getAttribute?.(LevelControl.id, 'maxLevel') ?? 254;
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
          const raw = Math.round((newState.attributes.brightness / 255) * 254);
          const level = this.clampLevel(Math.max(1, raw), isInitialSync);
          if (isInitialSync) {
            await safeSetAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
          } else {
            await safeUpdateAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
          }
        }
      }

      if (domain === 'light' && this.hasColorControl()) {
        const updateColor = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
        const attributes = newState.attributes as any;
        const colorMode = attributes.color_mode;
        const hs = this.getHsColor(newState);
        const xy = Array.isArray(attributes.xy_color) && attributes.xy_color.length >= 2 ? attributes.xy_color as [number, number] : undefined;
        const colorTempMireds = typeof attributes.color_temp === 'number'
          ? attributes.color_temp
          : typeof attributes.color_temp_kelvin === 'number'
            ? BaseEntity.kelvinToMireds(attributes.color_temp_kelvin)
            : undefined;

        if (colorTempMireds !== undefined && (colorMode === 'color_temp' || (!hs && !xy))) {
          if (!isInitialSync && this.shouldIgnoreStateUpdate('color_temp')) {
            this.platform.log.debug(`Ignoring HA colour-temperature state update for ${this.entityId} due to recent command lockout`);
          } else {
            await updateColor(this.endpoint, ColorControl.id, 'colorTemperatureMireds', colorTempMireds, this.platform.log);
            await updateColor(this.endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.ColorTemperatureMireds, this.platform.log);
          }
        } else if (hs && (colorMode === 'hs' || colorMode === 'rgb' || colorMode === 'rgbw' || colorMode === 'rgbww' || !xy)) {
          if (!isInitialSync && this.shouldIgnoreStateUpdate('hs_color')) {
            this.platform.log.debug(`Ignoring HA hue/saturation state update for ${this.entityId} due to recent command lockout`);
          } else {
            await updateColor(this.endpoint, ColorControl.id, 'currentHue', Math.round((hs[0] / 360) * 254), this.platform.log);
            await updateColor(this.endpoint, ColorControl.id, 'currentSaturation', Math.round((hs[1] / 100) * 254), this.platform.log);
            await updateColor(this.endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentHueAndCurrentSaturation, this.platform.log);
          }
        } else if (xy) {
          if (!isInitialSync && this.shouldIgnoreStateUpdate('xy_color')) {
            this.platform.log.debug(`Ignoring HA XY-colour state update for ${this.entityId} due to recent command lockout`);
          } else {
            await updateColor(this.endpoint, ColorControl.id, 'currentX', Math.round(xy[0] * 65535), this.platform.log);
            await updateColor(this.endpoint, ColorControl.id, 'currentY', Math.round(xy[1] * 65535), this.platform.log);
            await updateColor(this.endpoint, ColorControl.id, 'colorMode', ColorControl.ColorMode.CurrentXAndCurrentY, this.platform.log);
          }
        }
      }

      if (domain === 'fan' && this.endpoint.hasAttributeServer(FanControl.id, 'percentCurrent')) {
        const percentage = typeof newState.attributes.percentage === 'number' ? newState.attributes.percentage : isOn ? 100 : 0;
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

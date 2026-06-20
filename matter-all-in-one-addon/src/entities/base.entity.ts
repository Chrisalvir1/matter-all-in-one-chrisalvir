/**
 * Base entity class for exposing Home Assistant entities to Matter.
 */
import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { OnOff, LevelControl, ColorControl } from 'matterbridge/matter/clusters';
import { ClusterId } from 'matterbridge/matter/types';
import { HomeAssistantPlatform } from '../platform.js';
import { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export class BaseEntity {
  public platform: HomeAssistantPlatform;
  public entityId: string;
  public state: HassState;
  public deviceType: DeviceTypeDefinition;
  public endpoint!: MatterbridgeEndpoint;

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

    if (domain === 'light' || domain === 'switch' || domain === 'fan') {
      clusters.push(OnOff.id);
      if (this.state.attributes.brightness !== undefined) {
        clusters.push(LevelControl.id);
      }
      // Only add ColorControl if the light supports real color modes
      const supportedModes: string[] = this.state.attributes.supported_color_modes ?? [];
      const realColorModes = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww', 'color_temp'];
      const hasColorCapability = supportedModes.some(m => realColorModes.includes(m));
      if (hasColorCapability) {
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

    // Build a unique device name: use friendly name truncated to 24 chars + short entity suffix
    // This avoids the "Device already registered" error when multiple devices share the same area prefix
    const entityPart = this.entityId.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
    const displayName = rawName.length > 24
      ? rawName.substring(0, 24).trim() + ' ' + entityPart
      : rawName + (rawName.length < 28 ? ' ' + entityPart : '');
    // Final safety truncate to 32 chars (Matter spec limit)
    const uniqueName = displayName.substring(0, 32).trim();

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
    this.endpoint.productName = domain.charAt(0).toUpperCase() + domain.slice(1);

    if (this.endpoint.mode === 'server') {
      this.endpoint.createDefaultBasicInformationClusterServer(
        uniqueName,
        this.endpoint.serialNumber,
        0xfff1,
        'Home Assistant',
        0x8000,
        this.endpoint.productName
      );
    } else {
      this.endpoint.createDefaultBridgedDeviceBasicInformationClusterServer(
        uniqueName,
        this.endpoint.serialNumber,
        0xfff1,
        'Home Assistant',
        this.endpoint.productName
      );
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

    if (domain === 'light' || domain === 'switch' || domain === 'fan') {
      // On/Off handlers
      this.endpoint.addCommandHandler('on', async () => {
        this.platform.log.debug(`Matter On commanded for ${this.entityId}`);
        await this.platform.ha.callService(domain, 'turn_on', this.entityId);
      });

      this.endpoint.addCommandHandler('off', async () => {
        this.platform.log.debug(`Matter Off commanded for ${this.entityId}`);
        await this.platform.ha.callService(domain, 'turn_off', this.entityId);
      });

      // LevelControl handlers (brightness)
      if (this.endpoint.hasAttributeServer(LevelControl.id, 'currentLevel')) {
        this.endpoint.addCommandHandler('moveToLevel', async (data: any) => {
          const level = data.level; // 0..254
          const haBrightness = Math.round((level / 254) * 255);
          this.platform.log.debug(`Matter MoveToLevel commanded for ${this.entityId}: level=${level} -> HA brightness=${haBrightness}`);
          await this.platform.ha.callService(domain, 'turn_on', this.entityId, {
            brightness: haBrightness,
          });
        });

        this.endpoint.addCommandHandler('moveToLevelWithOnOff', async (data: any) => {
          const level = data.level;
          const haBrightness = Math.round((level / 254) * 255);
          this.platform.log.debug(`Matter MoveToLevelWithOnOff commanded for ${this.entityId}: level=${level} -> HA brightness=${haBrightness}`);
          if (level === 0) {
            await this.platform.ha.callService(domain, 'turn_off', this.entityId);
          } else {
            await this.platform.ha.callService(domain, 'turn_on', this.entityId, {
              brightness: haBrightness,
            });
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
  public updateState(newState: HassState, isInitialSync = false) {
    this.state = newState;
    const [domain] = this.entityId.split('.');

    if (domain === 'light' || domain === 'switch' || domain === 'fan') {
      const isOn = newState.state === 'on';

      if (isInitialSync) {
        safeSetAttribute(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);
      } else {
        safeUpdateAttribute(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);
      }

      if (newState.attributes.brightness !== undefined) {
        // HA brightness: 0-255  →  Matter currentLevel: 1-254
        // Never send 0: it violates the minLevel constraint on dimmers
        // (e.g. Govee minLevel=135).  Map 0-brightness to level 1 (off
        // state is communicated via onOff cluster, not currentLevel=0).
        const raw   = Math.round((newState.attributes.brightness / 255) * 254);
        const level = this.clampLevel(Math.max(1, raw), isInitialSync);
        if (isInitialSync) {
          safeSetAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
        } else {
          safeUpdateAttribute(this.endpoint, LevelControl.id, 'currentLevel', level, this.platform.log);
        }
      }
    }
  }
}

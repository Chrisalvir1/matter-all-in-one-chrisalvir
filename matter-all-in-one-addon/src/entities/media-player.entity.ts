import { DeviceTypeDefinition, MatterbridgeEndpoint } from 'matterbridge';
import { BasicVideoPlayer } from 'matterbridge/devices';
import { MediaPlayback, OnOff } from 'matterbridge/matter/clusters';
import { BaseEntity } from './base.entity.js';
import type { HassState } from '../utils/ha-state.js';
import { safeSetAttribute, safeUpdateAttribute } from '../utils/matter-attributes.js';

export class MediaPlayerEntity extends BaseEntity {
  public declare endpoint: BasicVideoPlayer;

  constructor(platform: any, state: HassState, deviceType: DeviceTypeDefinition) {
    super(platform, state, deviceType);
  }

  public override async createEndpoint(): Promise<MatterbridgeEndpoint> {
    const name = (this.state.attributes.friendly_name ?? this.entityId).slice(0, 32);
    const serial = `${this.entityId.replaceAll('.', '_').slice(0, 25)}_tv`;
    this.endpoint = new BasicVideoPlayer(name, serial, { onOff: this.state.state !== 'off' });
    this.endpoint.uniqueId = this.entityId.replaceAll('.', '_');
    this.endpoint.vendorId = 0xfff1;
    this.endpoint.vendorName = 'Home Assistant';
    this.endpoint.productId = 0x8000;
    this.endpoint.productName = 'Basic Video Player';
    this.registerCommandHandlers();
    return this.endpoint;
  }

  public override async updateState(state: HassState, isInitialSync = false): Promise<void> {
    this.state = state;
    const set = isInitialSync ? safeSetAttribute : safeUpdateAttribute;
    const isOn = !['off', 'standby', 'unavailable', 'unknown'].includes(state.state);
    const playbackState = state.state === 'playing'
      ? MediaPlayback.PlaybackState.Playing
      : state.state === 'paused'
        ? MediaPlayback.PlaybackState.Paused
        : MediaPlayback.PlaybackState.NotPlaying;
    await set(this.endpoint, OnOff.id, 'onOff', isOn, this.platform.log);
    await set(this.endpoint, MediaPlayback.id, 'currentState', playbackState, this.platform.log);
  }

  protected override registerCommandHandlers(): void {
    this.endpoint.addCommandHandler('on', async () => this.callService('turn_on'));
    this.endpoint.addCommandHandler('off', async () => this.callService('turn_off'));
    this.endpoint.addCommandHandler('MediaPlayback.play', async () => this.callService('media_play'));
    this.endpoint.addCommandHandler('MediaPlayback.pause', async () => this.callService('media_pause'));
    this.endpoint.addCommandHandler('MediaPlayback.stop', async () => this.callService('media_stop'));
    this.endpoint.addCommandHandler('MediaPlayback.next', async () => this.callService('media_next_track'));
    this.endpoint.addCommandHandler('MediaPlayback.previous', async () => this.callService('media_previous_track'));
  }

  private async callService(service: string): Promise<void> {
    await this.platform.ha.callService('media_player', service, this.entityId);
  }

  static matterTypeLabel = 'BasicVideoPlayer' as const;
}

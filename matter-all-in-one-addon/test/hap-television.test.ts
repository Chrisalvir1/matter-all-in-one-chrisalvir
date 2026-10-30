import { describe, expect, it, vi } from "vitest";
import { Characteristic, Service } from "@homebridge/hap-nodejs";
import { HapGenericAccessory, type HapAccessoryRecord } from "../src/hap/hap-generic-accessory.js";

describe("HAP Television accessory", () => {
  function createTvFixture(options: { hasRemote?: boolean; hasMuteSwitch?: boolean } = {}) {
    const mediaId = "media_player.hisense_50_q6";
    const remoteId = "remote.hisense_50_q6";
    const switchId = "switch.hisense_50_q6_mute";
    const deviceId = "hisense_device_123";

    const mediaState = {
      entity_id: mediaId,
      state: "on",
      attributes: {
        source_list: ["HDMI 1", "HDMI 2", "AirPlay"],
        source: "HDMI 1",
        is_volume_muted: false,
        volume_level: 0.35,
      },
    };
    const switchState = {
      entity_id: switchId,
      state: "off",
      attributes: {},
    };

    const hassEntities = new Map<string, any>([
      [mediaId, { entity_id: mediaId, device_id: deviceId }],
    ]);
    if (options.hasRemote) {
      hassEntities.set(remoteId, { entity_id: remoteId, device_id: deviceId, platform: "androidtv_remote" });
    }
    if (options.hasMuteSwitch) {
      hassEntities.set(switchId, { entity_id: switchId, device_id: deviceId });
    }

    const hassStates = new Map<string, any>([
      [mediaId, mediaState],
    ]);
    if (options.hasMuteSwitch) {
      hassStates.set(switchId, switchState);
    }

    const callService = vi.fn().mockResolvedValue(undefined);
    const platform: any = {
      entities: new Map([[mediaId, { state: mediaState, haDeviceInfo: { id: deviceId } }]]),
      ha: {
        connected: true,
        hassStates,
        hassEntities,
        callService,
      },
      log: { info: vi.fn(), warn: vi.fn() },
      recordEntityCommandFailure: vi.fn(),
    };

    const record: HapAccessoryRecord = {
      entityId: mediaId,
      hapProfile: "television",
      name: "Hisense 50 Q6",
      pincode: "240-23-982",
      port: 52004,
      username: "AA:BB:CC:DD:EE:99",
      setupId: "TV99",
      published: false,
    };

    const accessory = new HapGenericAccessory(platform, mediaId, record);
    return { accessory, platform, callService, mediaId, remoteId, switchId };
  }

  it("configures Television, TelevisionSpeaker with relative volume control, and input sources", () => {
    const { accessory } = createTvFixture();
    const tvService = accessory.accessory.getService(Service.Television);
    expect(tvService).toBeDefined();

    const speakerService = accessory.accessory.getService(Service.TelevisionSpeaker);
    expect(speakerService).toBeDefined();
    expect(speakerService!.getCharacteristic(Characteristic.Active).value).toBe(Characteristic.Active.ACTIVE);
    expect(speakerService!.getCharacteristic(Characteristic.VolumeControlType).value).toBe(
      Characteristic.VolumeControlType.RELATIVE_WITH_CURRENT,
    );

    const inputs = accessory.accessory.services.filter((s) => s.UUID === Service.InputSource.UUID);
    expect(inputs.length).toBe(3);
    expect(inputs[0].getCharacteristic(Characteristic.ConfiguredName).value).toBe("HDMI 1");
    expect(inputs[1].getCharacteristic(Characteristic.ConfiguredName).value).toBe("HDMI 2");
    expect(inputs[2].getCharacteristic(Characteristic.ConfiguredName).value).toBe("AirPlay");
  });

  it("dispatches RemoteKey touchpad and menu actions to remote.send_command when a remote entity is present", async () => {
    const { accessory, callService, remoteId } = createTvFixture({ hasRemote: true });
    const tvService = accessory.accessory.getService(Service.Television)!;
    const remoteKey = tvService.getCharacteristic(Characteristic.RemoteKey);

    // Arrow Up
    await remoteKey.handleSetRequest(Characteristic.RemoteKey.ARROW_UP);
    expect(callService).toHaveBeenCalledWith("remote", "send_command", remoteId, { command: ["DPAD_UP"] });

    // Arrow Down
    await remoteKey.handleSetRequest(Characteristic.RemoteKey.ARROW_DOWN);
    expect(callService).toHaveBeenCalledWith("remote", "send_command", remoteId, { command: ["DPAD_DOWN"] });

    // Select
    await remoteKey.handleSetRequest(Characteristic.RemoteKey.SELECT);
    expect(callService).toHaveBeenCalledWith("remote", "send_command", remoteId, { command: ["DPAD_CENTER"] });

    // Back
    await remoteKey.handleSetRequest(Characteristic.RemoteKey.BACK);
    expect(callService).toHaveBeenCalledWith("remote", "send_command", remoteId, { command: ["BACK"] });

    // Home / Exit
    await remoteKey.handleSetRequest(Characteristic.RemoteKey.EXIT);
    expect(callService).toHaveBeenCalledWith("remote", "send_command", remoteId, { command: ["HOME"] });

    // Menu / Info
    await remoteKey.handleSetRequest(Characteristic.RemoteKey.INFORMATION);
    expect(callService).toHaveBeenCalledWith("remote", "send_command", remoteId, { command: ["MENU"] });
  });

  it("controls VolumeSelector via media_player with fallback to remote", async () => {
    const { accessory, callService, mediaId } = createTvFixture({ hasRemote: true });
    const speakerService = accessory.accessory.getService(Service.TelevisionSpeaker)!;
    const volumeSelector = speakerService.getCharacteristic(Characteristic.VolumeSelector);

    // Volume Up
    await volumeSelector.handleSetRequest(Characteristic.VolumeSelector.INCREMENT);
    expect(callService).toHaveBeenCalledWith("media_player", "volume_up", mediaId, undefined);

    // Volume Down
    await volumeSelector.handleSetRequest(Characteristic.VolumeSelector.DECREMENT);
    expect(callService).toHaveBeenCalledWith("media_player", "volume_down", mediaId, undefined);
  });

  it("synchronizes Mute across media_player and associated switch.*_mute entity", async () => {
    const { accessory, callService, mediaId, switchId } = createTvFixture({ hasMuteSwitch: true });
    const speakerService = accessory.accessory.getService(Service.TelevisionSpeaker)!;
    const muteChar = speakerService.getCharacteristic(Characteristic.Mute);

    // Mute on
    await muteChar.handleSetRequest(true);
    expect(callService).toHaveBeenCalledWith("switch", "turn_on", switchId, undefined);
    expect(callService).toHaveBeenCalledWith("media_player", "volume_mute", mediaId, { is_volume_muted: true });

    // State change from switch muting the TV updates HAP
    accessory.updateFromHassState({ state: "on" }, switchId);
    expect(muteChar.value).toBe(true);

    // State change from switch unmuting updates HAP
    accessory.updateFromHassState({ state: "off" }, switchId);
    expect(muteChar.value).toBe(false);
  });
});

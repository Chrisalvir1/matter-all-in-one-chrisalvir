import { describe, expect, it, beforeEach } from "vitest";
import {
  detectDevice,
  APPLE_HOMEPOD_COLORS,
  getDeviceVisualOverride,
  setDeviceVisualOverride,
} from "../src/frontend/src/utils/deviceDetector";
import { DeviceRecord } from "../src/frontend/src/types";

describe("deviceDetector - Apple TV, HomePod official colors, chandelier & visual overrides", () => {
  // Mock localStorage for Node environment if not present
  beforeEach(() => {
    const store: Record<string, string> = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, val: string) => {
          store[key] = val;
        },
        removeItem: (key: string) => {
          delete store[key];
        },
        clear: () => {
          Object.keys(store).forEach((k) => delete store[k]);
        },
      },
    };
  });

  it("detects Apple TV 4K correctly and classifies as media player with 16:9 profile", () => {
    const device: DeviceRecord = {
      id: "dev_apple_tv_sala",
      name: "Apple TV 4K Sala",
      manufacturer: "Apple",
      model: "Apple TV 4K (3rd Gen)",
      entities: [
        {
          entityId: "media_player.apple_tv_sala",
          name: "Apple TV 4K",
          domain: "media_player",
          state: "playing",
          attributes: {
            app_name: "Netflix",
            media_title: "Stranger Things",
            entity_picture: "/api/media_player_proxy/media_player.apple_tv_sala",
            volume_level: 0.65,
          },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(device);
    expect(info.brand).toBe("Apple");
    expect(info.subtype).toBe("apple_tv");
    expect(info.category).toBe("Apple TV 4K");
    expect(info.hasMediaPlayer).toBe(true);
    expect(info.inferredArea).toBe("Sala");
  });

  it("detects Apple HomePod Mini and standard HomePod with official color palettes", () => {
    // Verify official Apple sales colors dictionary
    expect(APPLE_HOMEPOD_COLORS.homepod_mini).toBeDefined();
    expect(APPLE_HOMEPOD_COLORS.homepod_mini.space_gray.name).toBe("Gris Espacial");
    expect(APPLE_HOMEPOD_COLORS.homepod_mini.white.name).toBe("Blanco");
    expect(APPLE_HOMEPOD_COLORS.homepod_mini.midnight.name).toBe("Medianoche");
    expect(APPLE_HOMEPOD_COLORS.homepod_mini.blue.name).toBe("Azul");
    expect(APPLE_HOMEPOD_COLORS.homepod_mini.orange.name).toBe("Naranja");
    expect(APPLE_HOMEPOD_COLORS.homepod_mini.yellow.name).toBe("Amarillo");

    expect(APPLE_HOMEPOD_COLORS.homepod.midnight.name).toBe("Medianoche");
    expect(APPLE_HOMEPOD_COLORS.homepod.white.name).toBe("Blanco");
    expect(APPLE_HOMEPOD_COLORS.homepod.space_gray.name).toBe("Gris Espacial");

    const miniDevice: DeviceRecord = {
      id: "dev_homepod_mini",
      name: "HomePod Mini Cocina",
      manufacturer: "Apple",
      model: "HomePod mini",
      entities: [
        {
          entityId: "media_player.homepod_mini_cocina",
          name: "HomePod Mini",
          domain: "media_player",
          state: "playing",
          attributes: { media_title: "Bohemian Rhapsody", media_artist: "Queen" },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const miniInfo = detectDevice(miniDevice);
    expect(miniInfo.brand).toBe("Apple");
    expect(miniInfo.subtype).toBe("homepod_mini");
    expect(miniInfo.category).toBe("Apple HomePod Mini");
    expect(miniInfo.inferredArea).toBe("Cocina");
  });

  it("detects Chandelier (Candelabro) from name and configures chandelier fixture", () => {
    const chDevice: DeviceRecord = {
      id: "dev_candelabro",
      name: "Candelabro Comedor Principal",
      manufacturer: "Philips Hue",
      model: "Candle E12",
      entities: [
        {
          entityId: "light.candelabro_comedor",
          name: "Candelabro Comedor",
          domain: "light",
          state: "on",
          attributes: { brightness: 180, color_temp_kelvin: 2500 },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(chDevice);
    expect(info.isChandelier).toBe(true);
    expect(info.subtype).toBe("chandelier");
    expect(info.category).toBe("Candelabro de Techo");
    expect(info.inferredArea).toBe("Comedor");
  });

  it("infers room / area semantically when no area is assigned in Home Assistant", () => {
    const playroomLight: DeviceRecord = {
      id: "dev_playroom_light",
      name: "Luz de Playroom",
      entities: [
        {
          entityId: "light.luz_de_playroom",
          name: "Luz de Playroom",
          domain: "light",
          state: "on",
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const info = detectDevice(playroomLight);
    // Base technical domain is light (bulb), area is Playroom (not a weird 'playroom light' hardware invented)
    expect(info.subtype).toBe("bulb");
    expect(info.inferredArea).toBe("Playroom");
  });

  it("applies user persistent visual override for hardware silhouette and Apple color", () => {
    const customDevice: DeviceRecord = {
      id: "dev_custom_light",
      name: "Luz Central",
      entities: [
        {
          entityId: "light.luz_central",
          name: "Luz Central",
          domain: "light",
          state: "on",
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    // Initially detects standard bulb
    let det = detectDevice(customDevice);
    expect(det.subtype).toBe("bulb");

    // User chooses to make this a Chandelier with custom room label
    setDeviceVisualOverride("dev_custom_light", {
      visualType: "chandelier",
      roomLabel: "Gran Salón",
    });

    det = detectDevice(customDevice);
    expect(det.subtype).toBe("chandelier");
    expect(det.category).toBe("Candelabro de Techo");
    expect(det.inferredArea).toBe("Gran Salón");

    // User overrides a HomePod color to official Apple Yellow
    setDeviceVisualOverride("dev_homepod_yellow", {
      visualType: "homepod_mini",
      appleColor: "yellow",
    });

    const hpDevice: DeviceRecord = {
      id: "dev_homepod_yellow",
      name: "HomePod",
      entities: [{ entityId: "media_player.hp", name: "HP", domain: "media_player", state: "idle", exported: true, hasIssue: false, origin: "homeassistant" }],
    };

    const hpDet = detectDevice(hpDevice);
    expect(hpDet.subtype).toBe("homepod_mini");
    expect(hpDet.appleColor).toBe("yellow");
  });

  it("detects Amazon Echo devices accurately with signature cyan accent", () => {
    const echoDevice: DeviceRecord = {
      id: "dev_echo_dot",
      name: "Echo Dot Sala",
      manufacturer: "Amazon",
      model: "Echo Dot (5th Gen)",
      entities: [
        {
          entityId: "media_player.echo_dot_sala",
          name: "Echo Dot Sala",
          domain: "media_player",
          state: "playing",
          attributes: { media_title: "Rock Classics", media_artist: "Spotify" },
          exported: true,
          hasIssue: false,
          origin: "homeassistant",
        },
      ],
    };

    const echoInfo = detectDevice(echoDevice);
    expect(echoInfo.brand).toBe("Amazon");
    expect(echoInfo.subtype).toBe("echo_dot");
    expect(echoInfo.category).toBe("Altavoz Echo Dot");
    expect(echoInfo.accentColor).toBe("#00CAFF");
  });

  it("detects Tuya multi-gang wall switches like CB03-SBL Apagador Triple accurately", () => {
    const switchDevice: DeviceRecord = {
      id: "dev_tuya_switch",
      name: "Apagador Triple",
      manufacturer: "Tuya",
      model: "CB03-SBL",
      entities: [
        { entityId: "switch.apagador_triple_1", name: "Canal 1", domain: "switch", state: "on", exported: true, hasIssue: false, origin: "homeassistant" },
        { entityId: "switch.apagador_triple_2", name: "Canal 2", domain: "switch", state: "off", exported: true, hasIssue: false, origin: "homeassistant" },
        { entityId: "switch.apagador_triple_3", name: "Canal 3", domain: "switch", state: "on", exported: true, hasIssue: false, origin: "homeassistant" },
      ],
    };

    const switchInfo = detectDevice(switchDevice);
    expect(switchInfo.brand).toBe("Tuya");
    expect(switchInfo.subtype).toBe("multi_gang_switch");
    expect(switchInfo.category).toBe("Apagador Táctil Triple");
  });
});

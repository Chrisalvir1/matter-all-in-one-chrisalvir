import { describe, it, expect, vi, beforeEach } from "vitest";
import "./mocks/matterbridge.mock.js";
import { mockMatterbridge } from "./mocks/matterbridge.mock.js";
import { BaseEntity } from "../src/entities/base.entity.js";
import { CompositeDeviceEntity } from "../src/entities/composite-device.entity.js";
import {
  OnOff,
  LevelControl,
  ColorControl,
  FanControl,
} from "matterbridge/matter/clusters";
import { MatterDeviceTypes } from "../src/device-registry.js";
import { lightColor } from "../src/utils/light-color.js";
import {
  hasFanDirection,
  hasFanAuto,
  getFanSpeedCount,
  getFanModeSequence,
  getFanControlFeatures,
  snapToPhysicalLevel,
  fanSpeed,
} from "../src/converters/fan.converter.js";

vi.mock("../src/utils/matter-attributes.js", () => ({
  safeSetAttribute: vi.fn(async (ep, cluster, attr, val) => {
    if (ep.setAttribute) ep.setAttribute(cluster, attr, val);
  }),
  safeUpdateAttribute: vi.fn(async (ep, cluster, attr, val) => {
    if (ep.updateAttribute) ep.updateAttribute(cluster, attr, val);
  }),
}));

describe("Matterbridge 3.10.6 Runtime Conformance & Integration Tests", () => {
  let platform: any;

  beforeEach(() => {
    platform = {
      matterbridge: mockMatterbridge,
      log: {
        debug: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        notice: vi.fn(),
        warn: vi.fn(),
      },
      ha: {
        callService: vi.fn().mockResolvedValue(undefined),
        hassEntities: new Map([
          [
            "fan.ventilador_de_sala_main_fan",
            { id: "entity-fan-sala", device_id: "device-sala" },
          ],
          [
            "light.ventilador_de_sala_luz",
            { id: "entity-light-sala", device_id: "device-sala" },
          ],
          [
            "fan.ventilador_visitas_main_fan",
            { id: "entity-fan-visitas", device_id: "device-visitas" },
          ],
          [
            "light.ventilador_visitas_luz",
            { id: "entity-light-visitas", device_id: "device-visitas" },
          ],
          [
            "fan.ventilador_de_recamara_main_fan",
            { id: "entity-fan-recamara", device_id: "device-recamara" },
          ],
          [
            "light.ventilador_de_recamara_luz",
            { id: "entity-light-recamara", device_id: "device-recamara" },
          ],
        ]),
        hassDevices: new Map([
          ["device-sala", { serial_number: "BLE-FAN-SALA-001" }],
          ["device-visitas", { serial_number: "BLE-FAN-VISITAS-002" }],
          ["device-recamara", { serial_number: "BLE-FAN-RECAMARA-003" }],
        ]),
      },
    };
  });

  it("Living room fan: supported_features=53 -> DIR enabled, MultiSpeed+Auto+Step for Apple Home slider/mode, speedMax=6", async () => {
    const fanState: any = {
      entity_id: "fan.ventilador_de_sala_main_fan",
      state: "on",
      attributes: {
        friendly_name: "Ventilador de Sala",
        supported_features: 53, // 1 (SET_SPEED) + 4 (DIRECTION) + 16 + 32
        percentage: 88,
        percentage_step: 16.666666666666668,
        direction: "forward",
      },
    };

    expect(hasFanDirection(fanState)).toBe(true);
    expect(hasFanAuto(fanState)).toBe(false);
    expect(getFanSpeedCount(fanState)).toBe(6);
    expect(getFanModeSequence(fanState)).toBe(
      FanControl.FanModeSequence.OffLowMedHighAuto,
    );

    const features = getFanControlFeatures(fanState);
    expect(features).toContain(FanControl.Feature.MultiSpeed);
    expect(features).toContain(FanControl.Feature.Step);
    expect(features).toContain(FanControl.Feature.Auto);
    expect(features).toContain(FanControl.Feature.AirflowDirection);

    const entity = new BaseEntity(platform, fanState, MatterDeviceTypes.fan);
    const endpoint = await entity.createEndpoint();
    expect(endpoint).toBeDefined();
  });

  it("Guest room fan: supported_features=53 -> DIR enabled, speedMax=6, sequence=OffLowMedHighAuto", async () => {
    const fanState: any = {
      entity_id: "fan.ventilador_visitas_main_fan",
      state: "off",
      attributes: {
        friendly_name: "Ventilador Visitas",
        supported_features: 53,
        percentage: 32,
        percentage_step: 16.666666666666668,
        direction: "forward",
      },
    };

    expect(hasFanDirection(fanState)).toBe(true);
    expect(hasFanAuto(fanState)).toBe(false);
    expect(getFanSpeedCount(fanState)).toBe(6);
    expect(getFanModeSequence(fanState)).toBe(
      FanControl.FanModeSequence.OffLowMedHighAuto,
    );
  });

  it("Bedroom fan: supported_features=63, presets=[sleep, breeze] -> DIR enabled, MultiSpeed+Auto+Step", async () => {
    const fanState: any = {
      entity_id: "fan.ventilador_de_recamara_main_fan",
      state: "on",
      attributes: {
        friendly_name: "Ventilador de Recámara",
        supported_features: 63, // 1 + 2 (OSCILLATE) + 4 (DIRECTION) + 8 (PRESET_MODE) + 16 + 32
        percentage: 50,
        percentage_step: 16.666666666666668,
        preset_modes: ["sleep", "breeze"],
        direction: "reverse",
      },
    };

    expect(hasFanDirection(fanState)).toBe(true);
    expect(hasFanAuto(fanState)).toBe(false); // sleep/breeze are NOT Auto!
    expect(getFanSpeedCount(fanState)).toBe(6);
    expect(getFanModeSequence(fanState)).toBe(
      FanControl.FanModeSequence.OffLowMedHighAuto,
    );

    const features = getFanControlFeatures(fanState);
    expect(features).toContain(FanControl.Feature.MultiSpeed);
    expect(features).toContain(FanControl.Feature.Step);
    expect(features).toContain(FanControl.Feature.Auto);
    expect(features).toContain(FanControl.Feature.AirflowDirection);
  });

  it("Fan with genuine Auto preset: supported_features=57, presets=[low, auto] -> AUT enabled, sequence=OffLowMedHighAuto", async () => {
    const fanState: any = {
      entity_id: "fan.auto_fan",
      state: "on",
      attributes: {
        friendly_name: "Auto Fan",
        supported_features: 57, // 1 + 8 (PRESET_MODE) + 16 + 32 (NO DIRECTION)
        percentage: 50,
        preset_modes: ["low", "medium", "high", "auto"],
      },
    };

    expect(hasFanDirection(fanState)).toBe(false);
    expect(hasFanAuto(fanState)).toBe(true);
    expect(getFanModeSequence(fanState)).toBe(
      FanControl.FanModeSequence.OffLowMedHighAuto,
    );

    const features = getFanControlFeatures(fanState);
    expect(features).toContain(FanControl.Feature.MultiSpeed);
    expect(features).toContain(FanControl.Feature.Step);
    expect(features).toContain(FanControl.Feature.Auto);
    expect(features).not.toContain(FanControl.Feature.AirflowDirection);
  });

  it("Composite Device: creates Root Fan + Child Light with stable human-readable naming", async () => {
    const members = [
      {
        entityId: "fan.ventilador_de_sala_main_fan",
        state: {
          entity_id: "fan.ventilador_de_sala_main_fan",
          state: "on",
          attributes: {
            friendly_name: "VENTILADOR DE SALA",
            supported_features: 53,
            percentage: 88,
            percentage_step: 16.666666666666668,
            direction: "forward",
          },
        } as any,
      },
      {
        entityId: "light.ventilador_de_sala_luz",
        state: {
          entity_id: "light.ventilador_de_sala_luz",
          state: "on",
          attributes: {
            friendly_name: "Luz Ventilador Sala",
            brightness: 255,
            color_temp_kelvin: 4000,
            min_color_temp_kelvin: 2700,
            max_color_temp_kelvin: 6500,
            supported_color_modes: ["color_temp"],
            color_mode: "color_temp",
          },
        } as any,
      },
    ];

    const composite = new CompositeDeviceEntity(
      platform,
      "device-sala",
      "VENTILADOR DE SALA",
      members,
    );

    const rootEndpoint = await composite.createEndpoint();
    expect(rootEndpoint).toBeDefined();
    expect(rootEndpoint.deviceName).toBe("VENTILADOR DE SALA");
    expect(rootEndpoint.nodeLabel).toBe("VENTILADOR DE SALA");

    const lightChild = composite.endpoints.get("light.ventilador_de_sala_luz");
    expect(lightChild).toBeDefined();
    expect(lightChild?.deviceName).toBe("Luz Ventilador Sala");
    expect(lightChild?.nodeLabel).toBe("Luz Ventilador Sala");
    expect(lightChild?.hasClusterServer(LevelControl.id)).toBe(true);
    expect(lightChild?.hasClusterServer(ColorControl.id)).toBe(true);
  });

  it("Color Temperature Clamping: clamps mireds strictly against physical limits on all paths", () => {
    const attrs = {
      min_color_temp_kelvin: 2700, // warmest = 370 mireds
      max_color_temp_kelvin: 6500, // coldest = 154 mireds
    };

    // Out of range (115 mireds = 8695K, beyond physical max 6500K / 135 physical min)
    const outOfRangeMireds = 115;
    const clamped = lightColor.clampMireds(outOfRangeMireds, attrs, {
      minMireds: 135,
      maxMireds: 500,
    });
    expect(clamped).toBe(154); // Clamped to 154 based on 6500K limit

    // Out of range upper (600 mireds = 1666K, beyond 2700K = 370 mireds)
    const outOfRangeWarm = 600;
    const clampedWarm = lightColor.clampMireds(outOfRangeWarm, attrs, {
      minMireds: 135,
      maxMireds: 500,
    });
    expect(clampedWarm).toBe(370);
  });

  it("Composite Device: creates Root Fan + 3 Child Switches without incompatible implementation error", async () => {
    const members = [
      {
        entityId: "fan.oficina_apagador_oficina",
        state: {
          entity_id: "fan.oficina_apagador_oficina",
          state: "on",
          attributes: {
            friendly_name: "Apagador oficina Canal 1",
            supported_features: 53,
            percentage: 50,
            percentage_step: 16.666666666666668,
            direction: "forward",
          },
        } as any,
      },
      {
        entityId: "switch.apagador_oficina_canal_2",
        state: {
          entity_id: "switch.apagador_oficina_canal_2",
          state: "on",
          attributes: {
            friendly_name: "Apagador oficina Canal 2",
          },
        } as any,
      },
      {
        entityId: "switch.apagador_oficina_canal_3",
        state: {
          entity_id: "switch.apagador_oficina_canal_3",
          state: "on",
          attributes: {
            friendly_name: "Apagador oficina Canal 3",
          },
        } as any,
      },
      {
        entityId: "switch.apagador_oficina_canal_4",
        state: {
          entity_id: "switch.apagador_oficina_canal_4",
          state: "off",
          attributes: {
            friendly_name: "Apagador oficina Canal 4",
          },
        } as any,
      },
    ];

    const composite = new CompositeDeviceEntity(
      platform,
      "device_e2dae00dcd761e269a400dbbd6bd887e",
      "Apagador oficina",
      members,
    );

    const rootEndpoint = await composite.createEndpoint();
    expect(rootEndpoint).toBeDefined();
    expect(composite.endpoints.size).toBe(4);
    expect(
      composite.endpoints.get("switch.apagador_oficina_canal_2"),
    ).toBeDefined();
    expect(
      composite.endpoints.get("switch.apagador_oficina_canal_3"),
    ).toBeDefined();
    expect(
      composite.endpoints.get("switch.apagador_oficina_canal_4"),
    ).toBeDefined();
  });

  it("Light Off Settled State: HA state=on (brightness=200) -> HA state=off (brightness=200) -> Matter OnOff is strictly false", async () => {
    const lightEntityState: any = {
      entity_id: "light.ventilador_de_sala_luz",
      state: "on",
      attributes: {
        friendly_name: "Luz Ventilador Sala",
        brightness: 200,
        color_temp_kelvin: 3000,
        supported_color_modes: ["color_temp"],
        color_mode: "color_temp",
      },
    };

    const entity = new BaseEntity(
      platform,
      lightEntityState,
      MatterDeviceTypes.colorTemperatureLight,
    );
    await entity.createEndpoint();
    await entity.syncInitialState();

    expect(entity.endpoint.getAttribute(OnOff.id, "onOff")).toBe(true);

    // HA reports light turned off, cached brightness remains 200
    const offState: any = {
      ...lightEntityState,
      state: "off",
      attributes: {
        ...lightEntityState.attributes,
        brightness: 200, // HA caches last brightness
      },
    };

    await entity.updateState(offState);
    expect(entity.endpoint.getAttribute(OnOff.id, "onOff")).toBe(false);
  });

  it("Light Off Settled State: HA state=off with brightness=0 never results in Matter OnOff=true", async () => {
    const lightEntityState: any = {
      entity_id: "light.ventilador_de_sala_luz",
      state: "off",
      attributes: {
        friendly_name: "Luz Ventilador Sala",
        brightness: 0,
        color_temp_kelvin: 3000,
        supported_color_modes: ["color_temp"],
        color_mode: "color_temp",
      },
    };

    const entity = new BaseEntity(
      platform,
      lightEntityState,
      MatterDeviceTypes.colorTemperatureLight,
    );
    await entity.createEndpoint();
    await entity.syncInitialState();

    expect(entity.endpoint.getAttribute(OnOff.id, "onOff")).toBe(false);

    // Update again with brightness=0 while off
    await entity.updateState(lightEntityState);
    expect(entity.endpoint.getAttribute(OnOff.id, "onOff")).toBe(false);
  });

  it("Composite Light Off Settled State: child light endpoint reflects OnOff=false when HA light is off", async () => {
    const members = [
      {
        entityId: "fan.ventilador_de_sala_main_fan",
        state: {
          entity_id: "fan.ventilador_de_sala_main_fan",
          state: "on",
          attributes: {
            friendly_name: "VENTILADOR DE SALA",
            supported_features: 53,
            percentage: 88,
          },
        } as any,
      },
      {
        entityId: "light.ventilador_de_sala_luz",
        state: {
          entity_id: "light.ventilador_de_sala_luz",
          state: "off",
          attributes: {
            friendly_name: "Luz Ventilador Sala",
            brightness: 255, // cached brightness from HA
            color_temp_kelvin: 4000,
            supported_color_modes: ["color_temp"],
            color_mode: "color_temp",
          },
        } as any,
      },
    ];

    const composite = new CompositeDeviceEntity(
      platform,
      "device-sala",
      "VENTILADOR DE SALA",
      members,
    );

    await composite.createEndpoint();
    await composite.syncInitialState();

    const lightChild = composite.endpoints.get("light.ventilador_de_sala_luz");
    expect(lightChild).toBeDefined();
    expect(lightChild?.getAttribute(OnOff.id, "onOff")).toBe(false);
  });
});

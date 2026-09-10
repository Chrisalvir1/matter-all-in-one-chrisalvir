import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import { CompositeDeviceEntity } from "../src/entities/composite-device.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";

const platform = {
  log: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warn: vi.fn(),
  },
  ha: { callService: vi.fn().mockResolvedValue(undefined) },
};

function state(
  entityId: string,
  value: string,
  attributes: Record<string, any> = {},
) {
  return {
    entity_id: entityId,
    state: value,
    attributes: { friendly_name: entityId, ...attributes },
    last_changed: "",
    last_updated: "",
  };
}

describe("CompositeDeviceEntity", () => {
  it("creates one fan-rooted Matter node with a light child endpoint", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "fan-device",
      "Ventilador Sala",
      [
        {
          entityId: "fan.sala",
          state: state("fan.sala", "on", { percentage: 60 }),
        },
        {
          entityId: "light.sala",
          state: state("light.sala", "on", {
            brightness: 128,
            supported_color_modes: ["brightness"],
          }),
        },
      ],
    );

    const root = await composite.createEndpoint();
    expect(composite.primaryEntityId).toBe("fan.sala");
    expect(composite.endpoints.get("fan.sala")).toBe(root);
    expect(composite.endpoints.get("light.sala")).toBeDefined();
    expect((root as any).children.has("light_sala")).toBe(true);
  });

  it("sends fan and light commands to their own HA services", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "fan-device",
      "Ventilador Sala",
      [
        { entityId: "fan.sala", state: state("fan.sala", "off") },
        { entityId: "light.sala", state: state("light.sala", "off") },
      ],
    );
    await composite.createEndpoint();
    await (composite.endpoints.get("fan.sala") as any).invokeCommand("on");
    await (composite.endpoints.get("light.sala") as any).invokeCommand("on");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "fan",
      "turn_on",
      "fan.sala",
    );
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "light",
      "turn_on",
      "light.sala",
    );
  });

  it("does not re-light a fan light when Apple sends level 1 before off", async () => {
    vi.useFakeTimers();
    try {
      const composite = new CompositeDeviceEntity(
        platform,
        "fan-device",
        "Ventilador Sala",
        [
          { entityId: "fan.sala", state: state("fan.sala", "on") },
          {
            entityId: "light.sala",
            state: state("light.sala", "on", {
              brightness: 80,
              supported_color_modes: ["brightness"],
            }),
          },
        ],
      );
      await composite.createEndpoint();
      const light = composite.endpoints.get("light.sala") as any;
      const start = platform.ha.callService.mock.calls.length;

      // Command sequence from Apple Home when turning off light
      await light.invokeCommand("moveToLevelWithOnOff", { level: 1 });
      await light.invokeCommand("off");
      await vi.advanceTimersByTimeAsync(100);

      expect(platform.ha.callService.mock.calls.slice(start)).toEqual([
        ["light", "turn_off", "light.sala"],
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("publishes warm/cold fan lights as ColorTemperatureLight and sends modern HA kelvin commands", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "bedroom-fan",
      "Ventilador Recámara",
      [
        { entityId: "fan.bedroom", state: state("fan.bedroom", "off") },
        {
          entityId: "light.bedroom_main_light",
          state: state("light.bedroom_main_light", "on", {
            color_mode: "color_temp",
            min_color_temp_kelvin: 2200,
            max_color_temp_kelvin: 6500,
          }),
        },
      ],
    );

    const root = await composite.createEndpoint();
    const light = composite.endpoints.get("light.bedroom_main_light") as any;
    expect(light.deviceTypes[0]).toMatchObject({ code: 0x010c });
    expect(light.clusterServers.size).toBeGreaterThan(2);

    await light.invokeCommand("moveToColorTemperature", {
      colorTemperatureMireds: 250,
    });
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "light",
      "turn_on",
      "light.bedroom_main_light",
      {
        color_temp_kelvin: 4000,
      },
    );
    expect((root as any).children.has("light_bedroom_main_light")).toBe(true);
  });

  it("creates a lock-rooted Matter node with contact sensor integrated", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "switchbot-lock",
      "Llavin SwitchBot",
      [
        {
          entityId: "lock.llavin_switchbot",
          state: state("lock.llavin_switchbot", "locked"),
        },
        {
          entityId: "binary_sensor.llavin_switchbot_contact",
          state: state("binary_sensor.llavin_switchbot_contact", "off", {
            device_class: "door",
          }),
        },
      ],
    );

    const root = await composite.createEndpoint();
    expect(composite.primaryEntityId).toBe("lock.llavin_switchbot");
    expect(composite.endpoints.get("lock.llavin_switchbot")).toBe(root);
    expect(
      composite.endpoints.get("binary_sensor.llavin_switchbot_contact"),
    ).toBeDefined();
    expect(
      (root as any).children.has("binary_sensor_llavin_switchbot_contact"),
    ).toBe(true);

    await (
      composite.endpoints.get("lock.llavin_switchbot") as any
    ).invokeCommand("unlockDoor");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "lock",
      "unlock",
      "lock.llavin_switchbot",
    );
  });

  it("reattaches every member when Matterbridge retains a commissioned composite node", async () => {
    const members = [
      {
        entityId: "fan.sala",
        state: state("fan.sala", "on", { percentage: 40 }),
      },
      {
        entityId: "light.sala",
        state: state("light.sala", "on", { brightness: 100 }),
      },
    ];
    const original = new CompositeDeviceEntity(
      platform,
      "fan-device",
      "Ventilador Sala",
      members,
    );
    const retainedEndpoint = await original.createEndpoint();
    const restored = new CompositeDeviceEntity(
      platform,
      "fan-device",
      "Ventilador Sala",
      members,
    );

    restored.adoptEndpoint(retainedEndpoint);

    expect(restored.endpoints.get("fan.sala")).toBe(retainedEndpoint);
    expect(restored.endpoints.get("light.sala")).toBe(
      (retainedEndpoint as any).children.get("light_sala"),
    );
    await expect(restored.syncInitialState()).resolves.toBeUndefined();
  });

  it("handles fan oscillation and ambient temperature measurement in composite fan", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "govee-fan-heater",
      "Govee H7133",
      [
        {
          entityId: "fan.govee",
          state: state("fan.govee", "on", {
            percentage: 66.67,
            oscillating: true,
            current_temperature: 22.5,
            supported_features: 3, // speed + oscillation
          }),
        },
        {
          entityId: "light.govee_light",
          state: state("light.govee_light", "on", {
            brightness: 200,
            rgb_color: [255, 100, 50],
            supported_color_modes: ["rgb"],
          }),
        },
      ],
    );

    const root = await composite.createEndpoint();
    expect(root).toBeDefined();
    // Verify temperature cluster was registered
    expect(root.clusterServers.has(0x0402)).toBe(true);
    expect(root.getAttribute(0x0402, "measuredValue")).toBe(2250);

    // Verify rockSetting attribute subscription and command execution
    await (root as any).invokeAttributeChange(
      { id: 0x0202 },
      "rockSetting",
      { rockLeftRight: false },
    );
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "fan",
      "oscillate",
      "fan.govee",
      { oscillating: false },
    );
  });

  it("Plan A: creates single composite accessory for switch-based fan with fan profile and RGB light", async () => {
    const composite = new CompositeDeviceEntity(
      platform,
      "govee-playroom",
      "Ventilador Playroom",
      [
        {
          entityId: "switch.ventilador_playroom",
          state: state("switch.ventilador_playroom", "off"),
          deviceType: MatterDeviceTypes.fan,
        },
        {
          entityId: "light.ventilador_playroom_night_light",
          state: state("light.ventilador_playroom_night_light", "off", {
            supported_color_modes: ["rgb", "color_temp"],
            rgb_color: [255, 255, 255],
          }),
        },
      ],
      "switch.ventilador_playroom",
    );

    const root = await composite.createEndpoint();
    expect(composite.primaryEntityId).toBe("switch.ventilador_playroom");
    expect(composite.endpoints.get("switch.ventilador_playroom")).toBe(root);
    expect(composite.endpoints.get("light.ventilador_playroom_night_light")).toBeDefined();
    expect((root as any).children.has("light_ventilador_playroom_night_light")).toBe(true);

    // Turning on fan triggers switch.turn_on
    await (composite.endpoints.get("switch.ventilador_playroom") as any).invokeCommand("on");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "switch",
      "turn_on",
      "switch.ventilador_playroom",
    );

    // Turning off fan triggers switch.turn_off
    await (composite.endpoints.get("switch.ventilador_playroom") as any).invokeCommand("off");
    expect(platform.ha.callService).toHaveBeenCalledWith(
      "switch",
      "turn_off",
      "switch.ventilador_playroom",
    );
  });
});

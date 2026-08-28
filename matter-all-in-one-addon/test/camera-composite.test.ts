import { describe, expect, it, vi } from "vitest";
import "./mocks/matterbridge.mock.js";
import {
  CameraEntity,
  CameraAvStreamManagementId,
  WebRtcTransportProviderId,
} from "../src/entities/camera.entity.js";
import { CompositeDeviceEntity } from "../src/entities/composite-device.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
import {
  OnOff,
  OccupancySensing,
  BooleanState,
} from "matterbridge/matter/clusters";
import { MatterbridgeOnOffServer } from "matterbridge/behaviors";

const mockPlatform: any = {
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
    context: { id: "", parent_id: null, user_id: null },
  };
}

describe("CameraEntity", () => {
  it("creates a standalone Camera endpoint with Camera device type and cluster servers", async () => {
    const camState = state("camera.front_yard", "recording", {
      friendly_name: "Front Yard Camera",
      frontend_stream_type: "webrtc",
    });

    const cameraEntity = new CameraEntity(
      mockPlatform,
      camState,
      MatterDeviceTypes.camera,
    );
    const endpoint = await cameraEntity.createEndpoint();

    expect(endpoint).toBeDefined();
    expect(endpoint.deviceType).toBe(MatterDeviceTypes.camera.code);
    expect(endpoint.deviceName).toBe("Front Yard Camera");
  });

  it("configures HomeKit standalone accessory for Apple Home live streaming", async () => {
    const camState = state("camera.front_yard", "streaming", {
      friendly_name: "Front Yard Camera",
      stream_source: "rtsp://camera.local/live",
    });

    const cameraEntity = new CameraEntity(
      mockPlatform,
      camState,
      MatterDeviceTypes.camera,
    );
    const record = {
      entityId: "camera.front_yard",
      uuid: "e4a2d8a0-1234-5678-9abc-def012345678",
      username: "0E:11:22:33:44:55",
      pincode: "123-45-678",
      setupId: "12AB",
      port: 51830,
      published: false,
      strategy: "passthrough_h264" as const,
      state: "idle",
      name: "Front Yard Camera",
      manufacturer: "Google Nest",
      model: "Cam Outdoor",
      serialNumber: "camera_front_yard",
    };

    const hk = await cameraEntity.setupHomeKitAccessory(record);
    expect(hk).toBeDefined();
    expect(hk.accessory.displayName).toBe("Front Yard Camera");
    expect(hk.delegate).toBeDefined();
  });

  it("handles camera turn_on and turn_off commands via HA service calls", async () => {
    const camState = state("camera.front_yard", "idle");
    const cameraEntity = new CameraEntity(
      mockPlatform,
      camState,
      MatterDeviceTypes.camera,
    );
    const endpoint = await cameraEntity.createEndpoint();

    await (endpoint as any).invokeCommand("on");
    expect(mockPlatform.ha.callService).toHaveBeenCalledWith(
      "camera",
      "turn_on",
      "camera.front_yard",
    );

    await (endpoint as any).invokeCommand("off");
    expect(mockPlatform.ha.callService).toHaveBeenCalledWith(
      "camera",
      "turn_off",
      "camera.front_yard",
    );
  });

  it("synchronizes camera state updates", async () => {
    const camState = state("camera.front_yard", "idle");
    const cameraEntity = new CameraEntity(
      mockPlatform,
      camState,
      MatterDeviceTypes.camera,
    );
    await cameraEntity.createEndpoint();

    await cameraEntity.updateState(state("camera.front_yard", "streaming"));
    expect(cameraEntity.state.state).toBe("streaming");

    await cameraEntity.updateState(state("camera.front_yard", "off"));
    expect(cameraEntity.state.state).toBe("off");
  });
});

describe("Composite Camera Device (Unified All-in-One Accessory)", () => {
  it("groups camera, motion sensor, doorbell, spotlight, and privacy switch into a single Matter node", async () => {
    const members = [
      {
        entityId: "camera.entrance_cam",
        state: state("camera.entrance_cam", "idle", {
          friendly_name: "Cámara Entrada",
        }),
      },
      {
        entityId: "binary_sensor.entrance_motion",
        state: state("binary_sensor.entrance_motion", "off", {
          device_class: "motion",
          friendly_name: "Detección de Movimiento",
        }),
      },
      {
        entityId: "binary_sensor.entrance_doorbell",
        state: state("binary_sensor.entrance_doorbell", "off", {
          device_class: "door",
          friendly_name: "Timbre Pulsado",
        }),
      },
      {
        entityId: "light.entrance_spotlight",
        state: state("light.entrance_spotlight", "off", {
          friendly_name: "Foco Cámara",
        }),
      },
      {
        entityId: "switch.entrance_privacy_mode",
        state: state("switch.entrance_privacy_mode", "off", {
          friendly_name: "Modo Privacidad",
        }),
      },
    ];

    const composite = new CompositeDeviceEntity(
      mockPlatform,
      "device-camera-entrance",
      "Cámara Entrada Unificada",
      members,
    );

    const root = await composite.createEndpoint();

    // 1. Root entity must automatically be the camera
    expect(composite.primaryEntityId).toBe("camera.entrance_cam");
    expect(composite.endpoints.get("camera.entrance_cam")).toBe(root);

    // 2. Child endpoints must all be attached to the same ServerNode
    expect(
      composite.endpoints.get("binary_sensor.entrance_motion"),
    ).toBeDefined();
    expect(
      composite.endpoints.get("binary_sensor.entrance_doorbell"),
    ).toBeDefined();
    expect(composite.endpoints.get("light.entrance_spotlight")).toBeDefined();
    expect(
      composite.endpoints.get("switch.entrance_privacy_mode"),
    ).toBeDefined();

    expect((root as any).children.has("binary_sensor_entrance_motion")).toBe(
      true,
    );
    expect((root as any).children.has("binary_sensor_entrance_doorbell")).toBe(
      true,
    );
    expect((root as any).children.has("light_entrance_spotlight")).toBe(true);
    expect((root as any).children.has("switch_entrance_privacy_mode")).toBe(
      true,
    );

    // 3. Root camera command handlers
    await (composite.endpoints.get("camera.entrance_cam") as any).invokeCommand(
      "on",
    );
    expect(mockPlatform.ha.callService).toHaveBeenCalledWith(
      "camera",
      "turn_on",
      "camera.entrance_cam",
    );

    // 4. Spotlight child command handler
    await (
      composite.endpoints.get("light.entrance_spotlight") as any
    ).invokeCommand("on");
    expect(mockPlatform.ha.callService).toHaveBeenCalledWith(
      "light",
      "turn_on",
      "light.entrance_spotlight",
    );

    // 5. Privacy switch child command handler
    await (
      composite.endpoints.get("switch.entrance_privacy_mode") as any
    ).invokeCommand("on");
    expect(mockPlatform.ha.callService).toHaveBeenCalledWith(
      "switch",
      "turn_on",
      "switch.entrance_privacy_mode",
    );
  });

  it("updates child motion and doorbell states across the unified node", async () => {
    const members = [
      {
        entityId: "camera.tapo_c200",
        state: state("camera.tapo_c200", "streaming"),
      },
      {
        entityId: "binary_sensor.tapo_motion",
        state: state("binary_sensor.tapo_motion", "on", {
          device_class: "occupancy",
        }),
      },
    ];

    const composite = new CompositeDeviceEntity(
      mockPlatform,
      "tapo-c200-dev",
      "Tapo C200",
      members,
    );

    await composite.createEndpoint();

    await composite.updateEntity(
      "binary_sensor.tapo_motion",
      state("binary_sensor.tapo_motion", "on", { device_class: "occupancy" }),
    );
    expect(composite.states.get("binary_sensor.tapo_motion")?.state).toBe("on");

    await composite.updateEntity(
      "camera.tapo_c200",
      state("camera.tapo_c200", "recording"),
    );
    expect(composite.states.get("camera.tapo_c200")?.state).toBe("recording");
  });
});

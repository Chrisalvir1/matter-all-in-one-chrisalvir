import { describe, expect, it, vi } from "vitest";
import { NestCameraAdapter } from "../src/camera/nest/nest-camera-adapter.js";
import { CameraSourceResolver } from "../src/camera/camera-source-resolver.js";
import { detectCameraCapabilities } from "../src/camera/camera-capabilities.js";

describe("NestCameraAdapter", () => {
  it("detects Google Nest cameras by brand, manufacturer, platform, and entityId", () => {
    expect(
      NestCameraAdapter.isNestCamera("camera.nest_cam", {
        entity_id: "camera.nest_cam",
        state: "idle",
        attributes: {},
      }),
    ).toBe(true);

    expect(
      NestCameraAdapter.isNestCamera("camera.front_door", {
        entity_id: "camera.front_door",
        state: "idle",
        attributes: { brand: "Google" },
      }),
    ).toBe(true);

    expect(
      NestCameraAdapter.isNestCamera("camera.entrance", {
        entity_id: "camera.entrance",
        state: "idle",
        attributes: { manufacturer: "Nest" },
      }),
    ).toBe(true);

    expect(
      NestCameraAdapter.isNestCamera("camera.any_cam", undefined, {
        platform: "nest",
      }),
    ).toBe(true);

    expect(
      NestCameraAdapter.isNestCamera("camera.tapo_backyard", {
        entity_id: "camera.tapo_backyard",
        state: "idle",
        attributes: { brand: "TP-Link" },
      }),
    ).toBe(false);
  });

  it("finds linked Google Nest companion sensors (person, motion, doorbell)", () => {
    const mockPlatform = {
      ha: {
        hassStates: new Map([
          [
            "camera.nest_doorbell",
            {
              entity_id: "camera.nest_doorbell",
              state: "idle",
              attributes: { friendly_name: "Timbre Principal" },
            },
          ],
          [
            "binary_sensor.nest_doorbell_person",
            {
              entity_id: "binary_sensor.nest_doorbell_person",
              state: "off",
              attributes: { device_class: "occupancy" },
            },
          ],
          [
            "event.nest_doorbell_doorbell",
            {
              entity_id: "event.nest_doorbell_doorbell",
              state: "idle",
              attributes: { event_type: "doorbell" },
            },
          ],
          [
            "binary_sensor.nest_doorbell_motion",
            {
              entity_id: "binary_sensor.nest_doorbell_motion",
              state: "off",
              attributes: { device_class: "motion" },
            },
          ],
        ]),
      },
    };

    const linked = NestCameraAdapter.findLinkedNestEntities(
      mockPlatform,
      "camera.nest_doorbell",
    );
    expect(linked.person).toBe("binary_sensor.nest_doorbell_person");
    expect(linked.doorbell).toBe("event.nest_doorbell_doorbell");
    expect(linked.motion).toBe("binary_sensor.nest_doorbell_motion");
  });

  it("resolves Google Nest streams via proxy when go2rtc is not active and flags transcode required", async () => {
    const mockPlatform = {
      ha: {
        getHttpBaseUrl: () => "http://127.0.0.1:8123",
        getCameraProxyStreamUrl: (id: string) => `http://127.0.0.1:8123/api/camera_proxy_stream/${id}`,
        getAccessToken: () => "mock-token",
      },
      log: {
        debug: vi.fn(),
        notice: vi.fn(),
      },
    };

    const state = {
      entity_id: "camera.nest_garden",
      state: "idle",
      attributes: {
        frontend_stream_type: "webrtc",
        friendly_name: "Nest Garden",
      },
    };

    const source = await CameraSourceResolver.resolve(mockPlatform, state.entity_id, state as any);
    expect(source.sourceType).toBe("webrtc");
    expect(source.url).toContain("/api/camera_proxy_stream/camera.nest_garden");

    const capabilities = detectCameraCapabilities(state as any, source);
    expect(capabilities.strategy).toBe("transcode_required");
    expect(capabilities.requiresTranscoding).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { HomeAssistant } from "../src/homeAssistant.js";
import { getHaEntitySearchText } from "../src/utils/ha-entity-names.js";

describe("Home Assistant 2026.11 compatibility", () => {
  it("matches motion entities using stable ids and registry names without friendly_name", () => {
    const ha = {
      hassEntities: new Map([
        [
          "binary_sensor.feeder_occupancy",
          {
            name: "Movimiento",
            original_name: "Motion",
            device_id: "dev-feeder",
          },
        ],
      ]),
      hassDevices: new Map([
        ["dev-feeder", { name: "Comedero Omni", name_by_user: "Mi cámara" }],
      ]),
      hassStates: new Map([
        ["binary_sensor.feeder_occupancy", { attributes: {} }],
      ]),
    };
    const searchable = getHaEntitySearchText(
      ha,
      "binary_sensor.feeder_occupancy",
    );
    expect(searchable).toContain("binary_sensor.feeder_occupancy");
    expect(searchable).toContain("Movimiento");
    expect(searchable).toContain("Comedero Omni");
  });

  it("preserves the real entity_id even if the displayed name changes", () => {
    const ha = {
      hassEntities: new Map([
        ["camera.omni_feeder", { name: "Cámara", device_id: "dev-feeder" }],
      ]),
      hassDevices: new Map([
        ["dev-feeder", { name_by_user: "Sala", name: "Comedero" }],
      ]),
      hassStates: new Map([
        [
          "camera.omni_feeder",
          { attributes: { friendly_name: "Sala Cámara" } },
        ],
      ]),
    };
    expect(getHaEntitySearchText(ha, "camera.omni_feeder")).toContain(
      "camera.omni_feeder",
    );
  });

  it("does not change legacy name matching when friendly_name already exists", () => {
    const ha = {
      hassEntities: new Map([
        [
          "binary_sensor.omni_motion",
          { name: "Otro modelo", device_id: "dev-omni" },
        ],
      ]),
      hassDevices: new Map([["dev-omni", { name: "Cámara nueva" }]]),
      hassStates: new Map([
        [
          "binary_sensor.omni_motion",
          { attributes: { friendly_name: "Omni Movimiento" } },
        ],
      ]),
    };
    expect(getHaEntitySearchText(ha, "binary_sensor.omni_motion")).toBe(
      "binary_sensor.omni_motion Omni Movimiento",
    );
  });

  it("records retries and failures without retaining an ephemeral signed RTSP URL", async () => {
    const ha = new HomeAssistant("ws://127.0.0.1:8123", "test-token", 0, 0);
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary allocation error"))
      .mockResolvedValueOnce({
        success: true,
        result: { url: "rtsps://example.invalid/path?token=SECRET" },
      })
      .mockResolvedValueOnce({ success: false });
    (ha as any).request = request;
    const url = await ha.requestOmniTuyaCameraStream("camera.omni_feeder");
    expect(url).toContain("SECRET");
    const metrics = ha.getOmniCameraAllocationMetrics("camera.omni_feeder");
    expect(metrics).toMatchObject([
      {
        requests: 1,
        successes: 1,
        failures: 0,
        lastAttemptCount: 2,
        lastResult: "success",
      },
    ]);
    expect(JSON.stringify(metrics)).not.toContain("SECRET");
    expect(JSON.stringify(metrics)).not.toContain("rtsps://");

    (ha as any).request = vi.fn().mockResolvedValue({ success: false });
    expect(
      await ha.requestOmniTuyaCameraStream("camera.omni_feeder"),
    ).toBeNull();
    expect(
      ha.getOmniCameraAllocationMetrics("camera.omni_feeder"),
    ).toMatchObject([
      {
        requests: 2,
        successes: 1,
        failures: 1,
        lastAttemptCount: 3,
        lastResult: "failure",
      },
    ]);
  });

  it("keeps Omni allocations for multiple cameras independent", async () => {
    const ha = new HomeAssistant("ws://127.0.0.1:8123", "test-token", 0, 0);
    (ha as any).request = vi
      .fn()
      .mockImplementation(async ({ entity_id }: { entity_id: string }) => ({
        success: true,
        result: { url: `rtsps://test.invalid/${entity_id}?token=secret` },
      }));
    await Promise.all([
      ha.requestOmniTuyaCameraStream("camera.omni_feeder"),
      ha.requestOmniTuyaCameraStream("camera.omni_door"),
    ]);
    const metrics = ha.getOmniCameraAllocationMetrics();
    expect(metrics).toHaveLength(2);
    expect(metrics.map((m) => m.entityId).sort()).toEqual([
      "camera.omni_door",
      "camera.omni_feeder",
    ]);
    expect(metrics.every((m) => m.requests === 1 && m.successes === 1)).toBe(
      true,
    );
  });
});

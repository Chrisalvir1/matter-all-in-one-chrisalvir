import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { CameraConfigModal } from "../src/frontend/src/components/CameraConfigModal";
import {
  cameraControlAction,
  controlAvailability,
  safeCameraDiagnostics,
} from "../src/frontend/src/utils/camera-view";
import { controlCameraEntity } from "../src/camera/camera-entity-control.js";
import { CameraAiDetector } from "../src/camera/ai/camera-ai-detector.js";
import type { CameraRealEntity } from "../src/frontend/src/types";
const entity = (rawState?: string): CameraRealEntity => ({
  id: "button.alimentar_ahora",
  domain: "button",
  type: "other",
  name: "Alimentar ahora",
  state: false,
  rawState,
});
describe("camera capability and availability contracts", () => {
  it("renders six areas and keeps diagnostics/export technical actions collapsed", () => {
    const html = renderToStaticMarkup(
      React.createElement(CameraConfigModal, {
        camera: {
          provider: "home_assistant",
          cameraId: "camera.michi",
          name: "COMEDERO MICHI",
          status: { connection: "online", isOnline: true },
          realEntities: [entity("unknown")],
        },
        onClose() {},
        onRefresh() {},
        showToast() {},
      }),
    );
    for (const name of [
      "Cámara / Resumen",
      "Apple Home",
      "Controles",
      "Rendimiento",
      "Exportación",
      "Diagnóstico avanzado",
    ])
      expect(html).toContain(name);
    expect(html).not.toContain("<details open");
    expect(html).not.toContain("IA &amp; Fauna");
    expect(html).not.toContain("&lt;200");
    expect(html).not.toContain("X-HM://");
    expect(html).toContain("Disponibilidad no verificada");
    expect(html).not.toContain(">Pulsar</button>");
  });
  it.each(["unavailable", "unknown"])(
    "blocks a %s button instead of claiming it active",
    (state) => {
      expect(controlAvailability(entity(state))).toBe(state);
      expect(cameraControlAction(entity(state))).toBeUndefined();
    },
  );
  it("allows actual button.press and preserves explicit stale separately", () => {
    expect(cameraControlAction(entity("2026-10-28T10:00:00Z"))).toBe("press");
    expect(
      cameraControlAction({ ...entity("on"), availability: "stale" }),
    ).toBeUndefined();
    expect(cameraControlAction(entity())).toBeUndefined();
  });
  it("redacts signed URLs, pairing and credentials in copied diagnostics", () => {
    const text = safeCameraDiagnostics({
      rtspUrl: "rtsp://user:pass@host/source?token=secret",
      note: "error at rtsps://host/source?token=secret",
      pincode: "123-45-678",
      setupUri: "X-HM://private",
      sampleRate: 24000,
      args: ["-srtp_out_params", "SENSITIVEKEYBASE64="],
      message: "Bearer sensitive-token",
    });
    for (const secret of [
      "user:pass",
      "token=secret",
      "123-45-678",
      "X-HM://private",
      "SENSITIVEKEYBASE64",
      "sensitive-token",
    ])
      expect(text).not.toContain(secret);
    expect(text).toContain("24000");
  });
  it("routes button.press and rejects fake entities, unsupported services and unavailable states", async () => {
    const ha = {
      connected: true,
      hassStates: new Map([["button.alimentar_ahora", { state: "idle" }]]),
      callService: vi.fn().mockResolvedValue(undefined),
    };
    await controlCameraEntity(ha, "button.alimentar_ahora", "press");
    expect(ha.callService).toHaveBeenCalledWith(
      "button",
      "press",
      "button.alimentar_ahora",
    );
    await expect(
      controlCameraEntity(ha, "button.alimentar_ahora", "toggle"),
    ).rejects.toThrow("Acción");
    await expect(
      controlCameraEntity(ha, "cameraui.michi.light", "turn_on"),
    ).rejects.toThrow("Entidad");
    ha.hassStates.set("button.alimentar_ahora", { state: "unavailable" });
    await expect(
      controlCameraEntity(ha, "button.alimentar_ahora", "press"),
    ).rejects.toThrow("no disponible");
    expect(ha.callService).toHaveBeenCalledTimes(1);
  });
});
describe("unclassified motion", () => {
  it.each([true, false])(
    "triggers motion without targets with diagnostics enabled=%s",
    (enabled) => {
      vi.useFakeTimers();
      const detector = new CameraAiDetector();
      const accessory = { updateMotionState: vi.fn() };
      try {
        detector.setConfig("camera.michi", { enabled, targets: [] });
        detector.dispatchDetection(
          {
            entities: new Map([
              ["camera.michi", { homekitAccessory: accessory }],
            ]),
          },
          "camera.michi",
          {
            cameraId: "camera.michi",
            targets: [],
            labels: ["Movimiento"],
            timestamp: Date.now(),
            confidence: 1,
          },
        );
        expect(accessory.updateMotionState).toHaveBeenCalledWith(true);
        vi.advanceTimersByTime(16000);
        expect(accessory.updateMotionState).toHaveBeenLastCalledWith(false);
      } finally {
        detector.dispose();
        vi.useRealTimers();
      }
    },
  );
  it("does not promote generic pet to dog/cat", () => {
    const detector = new CameraAiDetector();
    detector.getConfig("camera.michi");
    const detection = vi.fn();
    detector.on("detection", detection);
    detector.handleHaStateChange({}, "binary_sensor.michi_pet", {
      state: "on",
      attributes: {},
    });
    expect(detection).not.toHaveBeenCalled();
    detector.dispose();
  });
  it("filtered classified metadata does not suppress a real motion pulse", () => {
    const detector = new CameraAiDetector();
    const accessory = { updateMotionState: vi.fn() };
    detector.setConfig("camera.michi", { enabled: true, targets: ["cat"] });
    detector.dispatchDetection(
      {
        entities: new Map([["camera.michi", { homekitAccessory: accessory }]]),
      },
      "camera.michi",
      {
        cameraId: "camera.michi",
        targets: ["person"],
        labels: ["Persona"],
        timestamp: Date.now(),
        confidence: 1,
      },
    );
    expect(accessory.updateMotionState).toHaveBeenCalledWith(true);
    expect(detector.getActiveDetection("camera.michi")).toBeUndefined();
    detector.dispose();
  });
});

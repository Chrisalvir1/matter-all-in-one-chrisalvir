import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  CameraAiDetector,
  ALL_AI_TARGETS,
  TARGET_LABELS_ES,
} from "../src/camera/ai/camera-ai-detector.js";

describe("CameraAiDetector", () => {
  let detector: CameraAiDetector;

  beforeEach(() => {
    detector = new CameraAiDetector();
  });

  it("includes all requested AI targets (person, dog, cat, bird, raccoon, snake, spider)", () => {
    expect(ALL_AI_TARGETS).toContain("person");
    expect(ALL_AI_TARGETS).toContain("dog");
    expect(ALL_AI_TARGETS).toContain("cat");
    expect(ALL_AI_TARGETS).toContain("bird");
    expect(ALL_AI_TARGETS).toContain("raccoon");
    expect(ALL_AI_TARGETS).toContain("snake");
    expect(ALL_AI_TARGETS).toContain("spider");

    expect(TARGET_LABELS_ES.person).toBe("Persona");
    expect(TARGET_LABELS_ES.dog).toBe("Perro");
    expect(TARGET_LABELS_ES.cat).toBe("Gato");
    expect(TARGET_LABELS_ES.bird).toBe("Ave");
    expect(TARGET_LABELS_ES.raccoon).toBe("Mapache");
    expect(TARGET_LABELS_ES.snake).toBe("Serpiente");
    expect(TARGET_LABELS_ES.spider).toBe("Araña");
  });

  it("handles incoming HA state changes for person detection and triggers HomeKit + MQTT", () => {
    const mockPlatform = {
      log: { notice: vi.fn() },
      mqttHandler: { publish: vi.fn() },
      Characteristic: { MotionDetected: "MotionDetected" },
      entities: new Map([
        [
          "camera.nest_patio",
          {
            homekitAccessory: {
              motionService: {
                setCharacteristic: vi.fn(),
              },
            },
          },
        ],
      ]),
    };

    detector.setConfig("camera.nest_patio", {
      enabled: true,
      targets: ["person", "dog", "cat"],
      sensitivity: 90,
      publishMqtt: true,
    });

    const detectionEvents: any[] = [];
    detector.on("detection", (e) => detectionEvents.push(e));

    // Simulate HA person sensor turning on
    detector.handleHaStateChange(mockPlatform, "binary_sensor.nest_patio_person", {
      state: "on",
      attributes: { person_detected: true },
    });

    expect(detectionEvents.length).toBe(1);
    expect(detectionEvents[0].targets).toContain("person");
    expect(detectionEvents[0].labels).toContain("Persona");
    expect(detectionEvents[0].confidence).toBe(0.9);

    // Verify HomeKit motion triggered
    const cameraEntity: any = mockPlatform.entities.get("camera.nest_patio");
    expect(
      cameraEntity.homekitAccessory.motionService.setCharacteristic,
    ).toHaveBeenCalledWith("MotionDetected", true);

    // Verify MQTT publish triggered
    expect(mockPlatform.mqttHandler.publish).toHaveBeenCalledWith(
      "matter-all-in-one/ai/camera_nest_patio/detection",
      expect.stringContaining("Persona"),
      { retain: false },
    );
  });

  it("detects domestic animals and wildlife (dog, cat, raccoon, snake, spider)", () => {
    const mockPlatform = {
      log: { notice: vi.fn() },
      mqttHandler: { publish: vi.fn() },
      entities: new Map(),
    };

    detector.setConfig("camera.garden_cam", {
      enabled: true,
      targets: ["raccoon", "snake", "spider", "dog"],
      sensitivity: 85,
    });

    const events: any[] = [];
    detector.on("detection", (e) => events.push(e));

    // Simulate raccoon detection event
    detector.handleHaStateChange(mockPlatform, "binary_sensor.garden_cam_raccoon", {
      state: "on",
      attributes: {},
    });

    expect(events.length).toBe(1);
    expect(events[0].targets).toContain("raccoon");
    expect(events[0].labels).toContain("Mapache");

    // Simulate snake detection event
    detector.handleHaStateChange(mockPlatform, "binary_sensor.garden_cam_serpiente", {
      state: "on",
      attributes: {},
    });

    expect(events.length).toBe(2);
    expect(events[1].targets).toContain("snake");
    expect(events[1].labels).toContain("Serpiente");
  });
});

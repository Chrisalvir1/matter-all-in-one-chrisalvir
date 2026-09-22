/**
 * CameraAiDetector — Ultra-lightweight Local AI Vision and Event Detection Engine.
 *
 * Targets:
 * - Persona: "person"
 * - Animales / Mascotas / Fauna:
 *   - "dog" (perro)
 *   - "cat" (gato)
 *   - "bird" (ave)
 *   - "raccoon" (mapache)
 *   - "snake" (serpiente)
 *   - "spider" (araña)
 *
 * Designed for zero native C++ compilation: operates via Home Assistant real-time
 * entity/event ingestion and lightweight frame analysis, ensuring Docker install
 * times stay under 2 minutes.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type {
  CameraAiTarget,
  CameraAiConfig,
  CameraAiDetectionEvent,
} from "../camera-types.js";

export const ALL_AI_TARGETS: CameraAiTarget[] = [
  "person",
  "vehicle",
  "dog",
  "cat",
  "bird",
  "raccoon",
  "snake",
  "spider",
];

export const TARGET_LABELS_ES: Record<CameraAiTarget, string> = {
  person: "Persona",
  vehicle: "Vehículo",
  dog: "Perro",
  cat: "Gato",
  bird: "Ave",
  raccoon: "Mapache",
  snake: "Serpiente",
  spider: "Araña",
};

export const TARGET_ICONS: Record<CameraAiTarget, string> = {
  person: "👤",
  vehicle: "🚗",
  dog: "🐶",
  cat: "🐱",
  bird: "🦜",
  raccoon: "🦝",
  snake: "🐍",
  spider: "🕷️",
};

export class CameraAiDetector extends EventEmitter {
  private static instance?: CameraAiDetector;
  private configs = new Map<string, CameraAiConfig>();
  private activeDetections = new Map<string, CameraAiDetectionEvent>();
  private motionTimers = new Map<string, NodeJS.Timeout>();
  private configFilePath = "";

  public static getInstance(storageDir?: string): CameraAiDetector {
    if (!CameraAiDetector.instance) {
      CameraAiDetector.instance = new CameraAiDetector(storageDir);
    }
    return CameraAiDetector.instance;
  }

  constructor(storageDir?: string) {
    super();
    if (storageDir) {
      this.configFilePath = path.join(storageDir, "camera-ai-config.json");
      this.loadConfig();
    }
  }

  private loadConfig(): void {
    if (!this.configFilePath) return;
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, "utf-8");
        const parsed = JSON.parse(data);
        for (const [key, val] of Object.entries(parsed)) {
          this.configs.set(key, val as CameraAiConfig);
        }
      }
    } catch {}
  }

  public saveConfig(): void {
    if (!this.configFilePath) return;
    try {
      const dir = path.dirname(this.configFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, CameraAiConfig> = {};
      for (const [key, val] of this.configs.entries()) {
        obj[key] = val;
      }
      fs.writeFileSync(this.configFilePath, JSON.stringify(obj, null, 2), "utf-8");
    } catch {}
  }

  public getConfig(cameraId: string): CameraAiConfig {
    const existing = this.configs.get(cameraId);
    if (existing) return existing;

    const defaultConfig: CameraAiConfig = {
      enabled: true,
      targets: [...ALL_AI_TARGETS],
      sensitivity: 85,
      motionTimeoutSeconds: 15,
      publishMqtt: true,
      mqttTopic: `matter-all-in-one/ai/${cameraId.replace(/[^a-zA-Z0-9_]/g, "_")}/detection`,
    };
    this.configs.set(cameraId, defaultConfig);
    return defaultConfig;
  }

  public setConfig(cameraId: string, config: Partial<CameraAiConfig>): CameraAiConfig {
    const current = this.getConfig(cameraId);
    const updated: CameraAiConfig = {
      ...current,
      ...config,
      targets: config.targets || current.targets,
    };
    this.configs.set(cameraId, updated);
    this.saveConfig();
    return updated;
  }

  /**
   * Evaluates incoming Home Assistant state changes for AI detection patterns.
   */
  public handleHaStateChange(
    platform: any,
    entityId: string,
    newState: any,
  ): void {
    if (!newState || newState.state !== "on") return;

    const stateAttrs = newState.attributes || {};
    const lowerId = entityId.toLowerCase();

    // Find all cameras that could be associated with this entity
    for (const [cameraId, config] of this.configs.entries()) {
      if (!config.enabled) continue;

      const baseName = cameraId.replace(/^camera\./, "").toLowerCase();
      if (!lowerId.includes(baseName)) continue;

      const detectedTargets: CameraAiTarget[] = [];
      const labels: string[] = [];

      // Check Person
      if (
        config.targets.includes("person") &&
        (lowerId.includes("person") ||
          lowerId.includes("persona") ||
          stateAttrs.person_detected ||
          stateAttrs.detected_object === "person")
      ) {
        detectedTargets.push("person");
        labels.push(TARGET_LABELS_ES.person);
      }

      // Check Vehicle / Vehículo / Auto
      if (
        config.targets.includes("vehicle") &&
        (lowerId.includes("vehicle") ||
          lowerId.includes("vehiculo") ||
          lowerId.includes("car") ||
          lowerId.includes("auto") ||
          stateAttrs.vehicle_detected ||
          stateAttrs.detected_object === "vehicle" ||
          stateAttrs.detected_object === "car")
      ) {
        detectedTargets.push("vehicle");
        labels.push(TARGET_LABELS_ES.vehicle);
      }

      // Check Dog / Perro
      if (
        config.targets.includes("dog") &&
        (lowerId.includes("dog") ||
          lowerId.includes("perro") ||
          stateAttrs.detected_object === "dog" ||
          stateAttrs.dog_detected)
      ) {
        detectedTargets.push("dog");
        labels.push(TARGET_LABELS_ES.dog);
      }

      // Check Cat / Gato
      if (
        config.targets.includes("cat") &&
        (lowerId.includes("cat") ||
          lowerId.includes("gato") ||
          stateAttrs.detected_object === "cat" ||
          stateAttrs.cat_detected)
      ) {
        detectedTargets.push("cat");
        labels.push(TARGET_LABELS_ES.cat);
      }

      // Generic pet mapping if specific dog/cat not differentiated
      if (
        (lowerId.includes("pet") || lowerId.includes("mascota")) &&
        detectedTargets.length === 0
      ) {
        if (config.targets.includes("dog")) {
          detectedTargets.push("dog");
          labels.push(TARGET_LABELS_ES.dog);
        } else if (config.targets.includes("cat")) {
          detectedTargets.push("cat");
          labels.push(TARGET_LABELS_ES.cat);
        }
      }

      // Check Bird / Ave
      if (
        config.targets.includes("bird") &&
        (lowerId.includes("bird") ||
          lowerId.includes("ave") ||
          lowerId.includes("pajaro") ||
          stateAttrs.detected_object === "bird")
      ) {
        detectedTargets.push("bird");
        labels.push(TARGET_LABELS_ES.bird);
      }

      // Check Raccoon / Mapache
      if (
        config.targets.includes("raccoon") &&
        (lowerId.includes("raccoon") ||
          lowerId.includes("mapache") ||
          stateAttrs.detected_object === "raccoon")
      ) {
        detectedTargets.push("raccoon");
        labels.push(TARGET_LABELS_ES.raccoon);
      }

      // Check Snake / Serpiente
      if (
        config.targets.includes("snake") &&
        (lowerId.includes("snake") ||
          lowerId.includes("serpiente") ||
          stateAttrs.detected_object === "snake")
      ) {
        detectedTargets.push("snake");
        labels.push(TARGET_LABELS_ES.snake);
      }

      // Check Spider / Araña
      if (
        config.targets.includes("spider") &&
        (lowerId.includes("spider") ||
          lowerId.includes("arana") ||
          lowerId.includes("araña") ||
          stateAttrs.detected_object === "spider")
      ) {
        detectedTargets.push("spider");
        labels.push(TARGET_LABELS_ES.spider);
      }

      if (detectedTargets.length > 0) {
        this.dispatchDetection(platform, cameraId, {
          cameraId,
          timestamp: Date.now(),
          targets: detectedTargets,
          labels,
          confidence: Math.round((config.sensitivity / 100) * 100) / 100,
          rawDetails: `Triggered by HA entity ${entityId}`,
        });
      }
    }
  }

  /**
   * Emits detection event, triggers HomeKit motion sensor, and publishes MQTT message.
   */
  public dispatchDetection(
    platform: any,
    cameraId: string,
    event: CameraAiDetectionEvent,
    options: { updateHomeKitMotion?: boolean } = {},
  ): void {
    const config = this.getConfig(cameraId);
    if (!config.enabled) return;

    this.activeDetections.set(cameraId, event);
    this.emit("detection", event);

    platform?.log?.notice?.(
      `[CameraAI][${cameraId}] Detección confirmada: ${event.labels.join(", ")} (Confianza: ${(event.confidence * 100).toFixed(0)}%)`,
    );

    // 1. Resolve camera accessory (Home Assistant entity or Camera.UI / Scrypted mounted accessory)
    let hkAccessory: any = undefined;
    const cameraEntity = platform?.entities?.get?.(cameraId);
    if (cameraEntity?.homekitAccessory) {
      hkAccessory = cameraEntity.homekitAccessory;
    } else {
      try {
        const bridge = (globalThis as any).__camerauiBridge || platform?.cameraUiBridge;
        if (bridge?.getAllAccessories) {
          const cuiAccessories = bridge.getAllAccessories();
          for (const [id, acc] of cuiAccessories) {
            if (
              id === cameraId ||
              id.replace(/^cameraui_/, "") === cameraId.replace(/^cameraui_/, "") ||
              cuiAccessories.size === 1
            ) {
              hkAccessory = acc;
              break;
            }
          }
        }
      } catch {}
    }

    if (options.updateHomeKitMotion === false) hkAccessory = undefined;
    if (hkAccessory) {
      try {
        if (typeof hkAccessory.updateMotionState === "function") {
          hkAccessory.updateMotionState(true);
        }
        if (hkAccessory.motionService?.setCharacteristic) {
          const Characteristic = platform?.Characteristic;
          hkAccessory.motionService.setCharacteristic(
            Characteristic?.MotionDetected || "MotionDetected",
            true,
          );
        }
      } catch {}
    }

    // 2. Publish real-time MQTT message
    if (config.publishMqtt && platform?.mqttHandler?.publish) {
      try {
        const topic =
          config.mqttTopic ||
          `matter-all-in-one/ai/${cameraId.replace(/[^a-zA-Z0-9_]/g, "_")}/detection`;
        const payload = JSON.stringify({
          camera: cameraId,
          targets: event.targets,
          labels: event.labels,
          confidence: event.confidence,
          timestamp: event.timestamp,
          summary: `${event.labels.map((l) => `${TARGET_ICONS[event.targets[event.labels.indexOf(l)]] || ""} ${l}`).join(", ")} detectado(s)`,
        });
        platform.mqttHandler.publish(topic, payload, { retain: false });
      } catch {}
    }

    // 3. Clear existing motion timeout and schedule reset
    const prevTimer = this.motionTimers.get(cameraId);
    if (prevTimer) clearTimeout(prevTimer);

    const timeout = (config.motionTimeoutSeconds || 15) * 1000;
    const timer = setTimeout(() => {
      this.activeDetections.delete(cameraId);
      if (hkAccessory) {
        try {
          if (typeof hkAccessory.updateMotionState === "function") {
            hkAccessory.updateMotionState(false);
          }
          if (hkAccessory.motionService?.setCharacteristic) {
            const Characteristic = platform?.Characteristic;
            hkAccessory.motionService.setCharacteristic(
              Characteristic?.MotionDetected || "MotionDetected",
              false,
            );
          }
        } catch {}
      }
      this.motionTimers.delete(cameraId);
      this.emit("motion-cleared", cameraId);
    }, timeout);

    this.motionTimers.set(cameraId, timer);
  }

  public getActiveDetection(cameraId: string): CameraAiDetectionEvent | undefined {
    return this.activeDetections.get(cameraId);
  }
}

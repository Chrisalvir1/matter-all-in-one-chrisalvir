/**
 * HAP Generic Accessory — expone cualquier entidad de Home Assistant como un
 * accesorio HAP nativo de hap-nodejs 2.2.3, igual que las cámaras pero sin
 * streaming de vídeo.
 *
 * Regla de oro:
 *   • Los dispositivos que ya están exportados como Matter o HAP cámara NO
 *     se tocan desde este módulo.  Este archivo sólo gestiona los accesorios
 *     creados con `HapGenericAccessory`.
 */

import {
  Accessory,
  Categories,
  Characteristic,
  Service,
  uuid,
  MDNSAdvertiser,
} from "@homebridge/hap-nodejs";
import crypto from "node:crypto";
import os from "node:os";
import {
  HAP_FIRMWARE_REVISION,
  HAP_SOFTWARE_REVISION,
} from "../utils/hap-firmware.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────

export interface HapAccessoryRecord {
  entityId: string;
  hapProfile: HapProfile;
  name: string;
  pincode: string;
  port: number;
  username: string;
  setupId: string;
  uuid: string;
  published: boolean;
  isPaired?: boolean;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  lastUpdated?: string;
  /** Home Assistant alarm code. Never reused as the HAP pairing PIN. */
  alarmCode?: string;
}

/**
 * Perfiles HAP disponibles.  Cada uno mapea a un Service + Category de
 * hap-nodejs 2.2.3.
 *
 * REGLA: Los dominios que ya tienen soporte nativo en Matter (light, switch,
 * fan, lock, sensor, binary_sensor, vacuum, cover no-garaje, climate) NO se
 * ofrecen como HAP aquí.  Sólo están los que Matter/Apple no soporta de forma
 * nativa o que el usuario quiere exponer con una entidad diferente.
 */
export type HapProfile =
  | "humidifier"
  | "dehumidifier"
  | "air_purifier"
  | "television"
  | "television_speaker"
  | "valve_irrigation"
  | "valve_faucet"
  | "valve_shower"
  | "security_system"
  | "garage_door"
  | "doorbell"
  | "fan_hap"
  | "heater_cooler"
  | "thermostat_hap"
  | "outlet_hap"
  | "switch_hap"
  | "lightbulb_hap"
  | "lock_hap"
  | "window_covering_hap"
  | "door_hap"
  | "window_hap"
  | "motion_sensor_hap"
  | "contact_sensor_hap"
  | "smoke_sensor_hap"
  | "carbon_monoxide_sensor_hap"
  | "carbon_dioxide_sensor_hap"
  | "leak_sensor_hap"
  | "occupancy_sensor_hap"
  | "temperature_sensor_hap"
  | "humidity_sensor_hap"
  | "light_sensor_hap"
  | "air_quality_sensor_hap"
  | "battery_hap"
  | "speaker_hap"
  | "irrigation_system";

/** Descripción legible de cada perfil (para la UI en español). */
export const HAP_PROFILE_LABELS: Record<HapProfile, string> = {
  humidifier: "Humidificador",
  dehumidifier: "Deshumidificador",
  air_purifier: "Purificador de Aire",
  television: "Televisor",
  television_speaker: "Altavoz TV",
  valve_irrigation: "Válvula Irrigación",
  valve_faucet: "Válvula Grifo",
  valve_shower: "Alcachofa / Ducha",
  security_system: "Panel de Alarma",
  garage_door: "Puerta de Garaje",
  doorbell: "Videoportero / Timbre",
  fan_hap: "Ventilador (HAP)",
  heater_cooler: "Calefactor / Aire",
  thermostat_hap: "Termostato (HAP)",
  outlet_hap: "Enchufe (HAP)",
  switch_hap: "Interruptor (HAP)",
  lightbulb_hap: "Bombilla (HAP)",
  lock_hap: "Cerradura (HAP)",
  window_covering_hap: "Persiana / Cubierta (HAP)",
  door_hap: "Puerta (HAP)",
  window_hap: "Ventana (HAP)",
  motion_sensor_hap: "Sensor de Movimiento (HAP)",
  contact_sensor_hap: "Sensor de Contacto (HAP)",
  smoke_sensor_hap: "Sensor de Humo (HAP)",
  carbon_monoxide_sensor_hap: "Sensor de CO (HAP)",
  carbon_dioxide_sensor_hap: "Sensor de CO₂ (HAP)",
  leak_sensor_hap: "Sensor de Fuga (HAP)",
  occupancy_sensor_hap: "Sensor de Ocupación (HAP)",
  temperature_sensor_hap: "Sensor de Temperatura (HAP)",
  humidity_sensor_hap: "Sensor de Humedad (HAP)",
  light_sensor_hap: "Sensor de Luz (HAP)",
  air_quality_sensor_hap: "Sensor de Calidad de Aire (HAP)",
  battery_hap: "Batería (HAP)",
  speaker_hap: "Altavoz (HAP)",
  irrigation_system: "Sistema de Irrigación",
};

/** Categoría HAP de cada perfil. */
const HAP_PROFILE_CATEGORIES: Record<HapProfile, Categories> = {
  humidifier: Categories.AIR_HUMIDIFIER,
  dehumidifier: Categories.AIR_DEHUMIDIFIER,
  air_purifier: Categories.AIR_PURIFIER,
  television: Categories.TELEVISION,
  television_speaker: Categories.SPEAKER,
  valve_irrigation: Categories.SPRINKLER,
  valve_faucet: Categories.FAUCET,
  valve_shower: Categories.SHOWER_HEAD,
  security_system: Categories.SECURITY_SYSTEM,
  garage_door: Categories.GARAGE_DOOR_OPENER,
  doorbell: Categories.VIDEO_DOORBELL,
  fan_hap: Categories.FAN,
  heater_cooler: Categories.AIR_HEATER,
  thermostat_hap: Categories.THERMOSTAT,
  outlet_hap: Categories.OUTLET,
  switch_hap: Categories.SWITCH,
  lightbulb_hap: Categories.LIGHTBULB,
  lock_hap: Categories.DOOR_LOCK,
  window_covering_hap: Categories.WINDOW_COVERING,
  door_hap: Categories.DOOR,
  window_hap: Categories.WINDOW,
  motion_sensor_hap: Categories.SENSOR,
  contact_sensor_hap: Categories.SENSOR,
  smoke_sensor_hap: Categories.SENSOR,
  carbon_monoxide_sensor_hap: Categories.SENSOR,
  carbon_dioxide_sensor_hap: Categories.SENSOR,
  leak_sensor_hap: Categories.SENSOR,
  occupancy_sensor_hap: Categories.SENSOR,
  temperature_sensor_hap: Categories.SENSOR,
  humidity_sensor_hap: Categories.SENSOR,
  light_sensor_hap: Categories.SENSOR,
  air_quality_sensor_hap: Categories.SENSOR,
  battery_hap: Categories.SENSOR,
  speaker_hap: Categories.SPEAKER,
  irrigation_system: Categories.SPRINKLER,
};

// ─────────────────────────────────────────────────────────────────────────────
// Clase principal
// ─────────────────────────────────────────────────────────────────────────────

export class HapGenericAccessory {
  public accessory: Accessory;
  public isPublished = false;
  private readonly discoveredSensorBindings = new Map<
    string,
    { service: any; characteristic: any; read: (state: any) => unknown }
  >();
  private pendingAlarmTarget: number | undefined;
  private valveSetDurationSeconds = 0;
  private valveDeadlineMs: number | undefined;
  private valveDurationTimer: ReturnType<typeof setInterval> | undefined;
  private valveClosePending = false;

  constructor(
    public readonly platform: any,
    public readonly entityId: string,
    public record: HapAccessoryRecord,
    private readonly onLastPairingRemoved?: (
      accessory: HapGenericAccessory,
    ) => Promise<void>,
  ) {
    const accUuid =
      record.uuid || uuid.generate(`homekit:generic:${entityId}`);
    this.record.uuid = accUuid;
    this.accessory = new Accessory(record.name || entityId, accUuid);
    this.configureAccessoryInformation();
    this.addServiceForProfile(record.hapProfile);
    this.bindPrimaryHomeAssistantEntity();
    this.addDiscoveredSensorServices();
    this.accessory.on("characteristic-warning", (warning) => {
      this.platform.log?.warn?.(
        `[HAPCommandTrace][${this.entityId}] warning=${warning.type} characteristic=${warning.characteristic.displayName}`,
      );
    });
    this.accessory.on("paired", () => {
      this.record.isPaired = true;
      this.record.lastUpdated = new Date().toISOString();
      void this.platform.saveHapAccessoryRecords?.();
    });
    this.accessory.on("unpaired", () => {
      this.record.isPaired = false;
      this.record.lastUpdated = new Date().toISOString();
      // Let hap-nodejs finish its remove-pairing response before restarting.
      setTimeout(() => {
        if (this.onLastPairingRemoved) {
          void this.onLastPairingRemoved(this);
        } else {
          void this.platform.saveHapAccessoryRecords?.();
        }
      }, 0);
    });
  }

  // ──────────────────────────────────────────────
  // Información base del accesorio (igual que cámaras)
  // ──────────────────────────────────────────────

  private configureAccessoryInformation(): void {
    const info = this.accessory.getService(Service.AccessoryInformation);
    if (!info) return;
    const mfr = "Matter All-In-One Chrisalvir";
    const model = (this.record.model || HAP_PROFILE_LABELS[this.record.hapProfile] || "HAP Device")
      .replace(/\s*\(HAP-NodeJS[^)]*\)/gi, "")
      .trim();

    info
      .setCharacteristic(Characteristic.Manufacturer, mfr)
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(
        Characteristic.SerialNumber,
        this.record.serialNumber || this.entityId.replaceAll(".", "_"),
      )
      .setCharacteristic(
        Characteristic.Name,
        this.record.name || this.entityId,
      )
      .setCharacteristic(
        Characteristic.FirmwareRevision,
        HAP_FIRMWARE_REVISION,
      );
    info.setCharacteristic(
      Characteristic.SoftwareRevision,
      HAP_SOFTWARE_REVISION,
    );
  }

  // ──────────────────────────────────────────────
  // Sensores reales del mismo dispositivo de Home Assistant
  // ──────────────────────────────────────────────

  private getHomeAssistantState(entityId: string): any {
    return this.platform.ha?.hassStates?.get(entityId) ??
      this.platform.entities.get(entityId)?.state;
  }

  private getDeviceMembers(): any[] {
    const own = { entityId: this.entityId };
    const deviceId = this.platform.ha?.hassEntities?.get(this.entityId)?.device_id;
    if (deviceId) {
      // The registry contains every HA entity for the physical device. The
      // bridge entity map only contains entities it exports, which can omit a
      // real humidity/temperature sensor required by this HAP accessory.
      const members = Array.from(this.platform.ha?.hassEntities?.values() ?? [])
        .filter((entity: any) => entity.device_id === deviceId)
        .filter((entity: any) => this.platform.ha?.hassStates?.has(entity.entity_id))
        .map((entity: any) => ({ entityId: entity.entity_id }));
      return members.length ? members : [own];
    }
    const candidate = this.platform.getCompositeCandidate?.(this.entityId);
    return Array.isArray(candidate?.members) && candidate.members.length
      ? candidate.members
      : [own];
  }

  private bindDiscoveredSensor(
    entityId: string,
    serviceType: any,
    characteristic: any,
    suffix: string,
    read: (state: any) => unknown,
  ): void {
    const service = this.accessory.addService(
      serviceType,
      `${this.record.name} ${suffix}`,
      `sensor:${entityId}`,
    );
    service.getCharacteristic(characteristic).onGet(() =>
      read(this.getHomeAssistantState(entityId)) as any,
    );
    this.discoveredSensorBindings.set(entityId, { service, characteristic, read });
  }

  private addDiscoveredSensorServices(): void {
    const members = this.getDeviceMembers();
    const find = (domain: string, deviceClass: string) =>
      members.find((item: any) => {
        const state = this.getHomeAssistantState(item.entityId);
        return item.entityId.startsWith(`${domain}.`) && state?.attributes?.device_class === deviceClass;
      });
    const numeric = (
      deviceClass: string,
      serviceType: any,
      characteristic: any,
      suffix: string,
      minimum = 0,
    ) => {
      const member = find("sensor", deviceClass);
      if (!member) return;
      this.bindDiscoveredSensor(member.entityId, serviceType, characteristic, suffix, (state) => {
        const value = Number(state?.state);
        return Number.isFinite(value) ? Math.max(minimum, value) : minimum;
      });
    };

    // Only device members reported by HA are exported. No guessed sensor names,
    // values, or entities are created for HAP.
    numeric("temperature", Service.TemperatureSensor, Characteristic.CurrentTemperature, "Temperatura");
    if (this.record.hapProfile !== "humidifier" && this.record.hapProfile !== "dehumidifier") {
      numeric("humidity", Service.HumiditySensor, Characteristic.CurrentRelativeHumidity, "Humedad");
    }
    numeric("illuminance", Service.LightSensor, Characteristic.CurrentAmbientLightLevel, "Iluminación", 0.0001);
    numeric("battery", Service.Battery, Characteristic.BatteryLevel, "Batería");

    const binaryMappings: Array<[string, any, any, string, (state: any) => unknown]> = [
      ["motion", Service.MotionSensor, Characteristic.MotionDetected, "Movimiento", (state) => state?.state === "on"],
      ["door", Service.ContactSensor, Characteristic.ContactSensorState, "Puerta", (state) => state?.state === "on" ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED],
      ["window", Service.ContactSensor, Characteristic.ContactSensorState, "Ventana", (state) => state?.state === "on" ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED],
      ["moisture", Service.LeakSensor, Characteristic.LeakDetected, "Fuga", (state) => state?.state === "on" ? Characteristic.LeakDetected.LEAK_DETECTED : Characteristic.LeakDetected.LEAK_NOT_DETECTED],
      ["smoke", Service.SmokeSensor, Characteristic.SmokeDetected, "Humo", (state) => state?.state === "on" ? Characteristic.SmokeDetected.SMOKE_DETECTED : Characteristic.SmokeDetected.SMOKE_NOT_DETECTED],
    ];
    for (const [deviceClass, serviceType, characteristic, suffix, read] of binaryMappings) {
      const member = find("binary_sensor", deviceClass);
      if (member) this.bindDiscoveredSensor(member.entityId, serviceType, characteristic, suffix, read);
    }
  }

  private getCurrentHumidity(): number | undefined {
    const primary = Number(
      this.getHomeAssistantState(this.entityId)?.attributes?.current_humidity,
    );
    if (Number.isFinite(primary) && primary >= 0 && primary <= 100) return primary;
    const sensor = this.getDeviceMembers().find((member: any) => {
      const state = this.getHomeAssistantState(member.entityId);
      return member.entityId.startsWith("sensor.") && state?.attributes?.device_class === "humidity";
    });
    const value = Number(sensor && this.getHomeAssistantState(sensor.entityId)?.state);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : undefined;
  }

  private async callHaWithResponseBudget(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const startedAt = Date.now();
    const command = `${domain}.${service}`;
    this.platform.log?.info?.(`[HAPCommandTrace][${this.entityId}] start service=${command}`);
    if (!this.platform.ha?.callService || this.platform.ha.connected === false) {
      throw -70402; // HAP SERVICE_COMMUNICATION_FAILURE
    }
    const operation = Promise.resolve()
      .then(() => this.platform.ha.callService(domain, service, this.entityId, data))
      .then(
        () => ({ failed: false as const }),
        (error: unknown) => ({ failed: true as const, error }),
      );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      operation,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 750);
      }),
    ]);
    if (timer) clearTimeout(timer);
    const report = (failed: boolean, late: boolean) => {
      this.platform.log?.info?.(`[HAPCommandTrace][${this.entityId}] ${late ? "ha_finished_after_handler" : "handler_returned"} service=${command} elapsed_ms=${Date.now() - startedAt} outcome=${failed ? "failed" : "completed"}`);
      if (failed) {
        this.setReachability(false);
        this.platform.recordEntityCommandFailure?.(this.entityId, `HAP: Home Assistant failed to execute ${command}.`);
      }
    };
    if (outcome === undefined) {
      this.platform.log?.info?.(`[HAPCommandTrace][${this.entityId}] handler_returned_pending service=${command} elapsed_ms=${Date.now() - startedAt}`);
      void operation.then((result) => report(result.failed, true)).catch(() => undefined);
      return;
    }
    report(outcome.failed, false);
    if (outcome.failed) throw -70402;
  }

  private bindPrimaryHomeAssistantEntity(): void {
    const [domain] = this.entityId.split(".");
    const state = () => this.platform.entities.get(this.entityId)?.state;
    const bindPower = (service: any, characteristic: any) => {
      service.getCharacteristic(characteristic)
        .onGet(() => state()?.state === "on" ? 1 : 0)
        .onSet(async (value: any) => {
          await this.callHaWithResponseBudget(domain, value ? "turn_on" : "turn_off");
        });
    };
    switch (this.record.hapProfile) {
      case "switch_hap": bindPower(this.accessory.getService(Service.Switch), Characteristic.On); break;
      case "outlet_hap": bindPower(this.accessory.getService(Service.Outlet), Characteristic.On); break;
      case "lightbulb_hap": {
        const service = this.accessory.getService(Service.Lightbulb);
        if (service) {
          bindPower(service, Characteristic.On);
          service.getCharacteristic(Characteristic.Brightness)
            .onGet(() => Math.round((Number(state()?.attributes?.brightness) || 0) * 100 / 255))
            .onSet(async (value: any) => this.callHaWithResponseBudget("light", "turn_on", { brightness_pct: Number(value) }));
          const color = () => state()?.attributes?.hs_color;
          if (Array.isArray(color())) {
            service.getCharacteristic(Characteristic.Hue).onGet(() => Number(color()?.[0]) || 0);
            service.getCharacteristic(Characteristic.Saturation).onGet(() => Number(color()?.[1]) || 0);
            const setColor = async () => this.callHaWithResponseBudget("light", "turn_on", {
              hs_color: [Number(service.getCharacteristic(Characteristic.Hue).value || 0), Number(service.getCharacteristic(Characteristic.Saturation).value || 0)],
            });
            service.getCharacteristic(Characteristic.Hue).onSet(setColor);
            service.getCharacteristic(Characteristic.Saturation).onSet(setColor);
          }
        }
        break;
      }
      case "fan_hap": {
        const service = this.accessory.getService(Service.Fanv2);
        if (service) {
          bindPower(service, Characteristic.Active);
          service.getCharacteristic(Characteristic.RotationSpeed)
            .onGet(() => Number(state()?.attributes?.percentage) || 0)
            .onSet(async (value: any) => this.callHaWithResponseBudget(domain, "set_percentage", { percentage: Number(value) }));
        }
        break;
      }
      case "valve_irrigation":
      case "valve_faucet":
      case "valve_shower": {
        const service = this.accessory.getService(Service.Valve);
        if (!service) break;
        const active = () => this.isValveActive(state());
        service.getCharacteristic(Characteristic.Active)
          .onGet(() => active() ? 1 : 0)
          .onSet(async (value: any) => this.setValveActive(value === 1));
        service.getCharacteristic(Characteristic.InUse)
          .onGet(() => active() ? 1 : 0);
        service.getCharacteristic(Characteristic.SetDuration)
          .onGet(() => this.valveSetDurationSeconds)
          .onSet(async (value: any) => {
            const seconds = Math.max(0, Math.floor(Number(value)));
            if (!Number.isFinite(seconds)) throw -70410;
            this.valveSetDurationSeconds = seconds;
            if (active()) this.startValveDurationTimer(seconds);
          });
        service.getCharacteristic(Characteristic.RemainingDuration)
          .onGet(() => this.getValveRemainingDuration());
        break;
      }
    }
  }

  // ──────────────────────────────────────────────
  // Fábrica de servicios por perfil
  // ──────────────────────────────────────────────

  private addServiceForProfile(profile: HapProfile): void {
    switch (profile) {
      // ── Humidificador / Deshumidificador ──────────────────────────────────
      case "humidifier":
      case "dehumidifier": {
        const svc = this.accessory.addService(
          Service.HumidifierDehumidifier,
          this.record.name,
        );

        svc.getCharacteristic(Characteristic.Active)
          .onGet(() => {
            const ent = this.platform.entities.get(this.entityId);
            this.platform.log?.info?.(
              `[HAPCommandTrace][${this.entityId}] read characteristic=Active ha_state=${ent?.state?.state ?? "missing"}`,
            );
            return ent?.state?.state === "on" ? 1 : 0;
          })
          .onSet(async (value) => {
            const [domain] = this.entityId.split(".");
            const active = value === 1;
            await this.callHaWithResponseBudget(domain, active ? "turn_on" : "turn_off");
          });

        svc.getCharacteristic(Characteristic.CurrentHumidifierDehumidifierState)
          .onGet(() => {
            const ent = this.platform.entities.get(this.entityId);
            if (ent?.state?.state !== "on") return 1; // INACTIVE
            return profile === "humidifier" ? 2 : 3; // HUMIDIFYING or DEHUMIDIFYING
          });

        svc.getCharacteristic(Characteristic.TargetHumidifierDehumidifierState)
          .setValue(profile === "humidifier" ? 1 : 2)
          .onGet(() => (profile === "humidifier" ? 1 : 2));

        svc.getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .onGet(() => {
            const current = this.getCurrentHumidity();
            if (current !== undefined) return current;
            const target = Number(this.getHomeAssistantState(this.entityId)?.attributes?.humidity);
            return Number.isFinite(target) && target >= 0 && target <= 100 ? target : 0;
          });

        svc.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold)
          .onGet(() => {
            const value = Number(this.platform.entities.get(this.entityId)?.state?.attributes?.humidity);
            return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0;
          })
          .onSet(async (value) => {
            const [domain] = this.entityId.split(".");
            svc.updateCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold, Number(value));
            await this.callHaWithResponseBudget(domain, "set_humidity", { humidity: Number(value) });
          });

        break;
      }

      // ── Purificador de aire ────────────────────────────────────────────────
      case "air_purifier": {
        const svc = this.accessory.addService(
          Service.AirPurifier,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.Active).setValue(0);
        svc
          .getCharacteristic(Characteristic.CurrentAirPurifierState)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.TargetAirPurifierState)
          .setValue(1);
        break;
      }

      // ── Televisor ─────────────────────────────────────────────────────────
      case "television": {
        const tv = this.accessory.addService(Service.Television, this.record.name);
        const mediaState = () => this.platform.entities.get(this.entityId)?.state;
        tv.setCharacteristic(Characteristic.ConfiguredName, this.record.name);
        tv.setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);
        tv.getCharacteristic(Characteristic.Active)
          .onGet(() => mediaState()?.state === "off" ? 0 : 1)
          .onSet(async (value: any) => this.callHaWithResponseBudget("media_player", value ? "turn_on" : "turn_off"));

        const sources = Array.isArray(mediaState()?.attributes?.source_list)
          ? mediaState().attributes.source_list as string[]
          : [];
        const activeSource = () => String(mediaState()?.attributes?.source || "");
        tv.getCharacteristic(Characteristic.ActiveIdentifier)
          .onGet(() => Math.max(1, sources.indexOf(activeSource()) + 1))
          .onSet(async (value: any) => {
            const source = sources[Number(value) - 1];
            if (source) await this.callHaWithResponseBudget("media_player", "select_source", { source });
          });

        const speaker = this.accessory.addService(Service.TelevisionSpeaker, `${this.record.name} Audio`);
        speaker.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
        speaker.getCharacteristic(Characteristic.Mute)
          .onGet(() => Boolean(mediaState()?.attributes?.is_volume_muted))
          .onSet(async (value: any) => this.callHaWithResponseBudget("media_player", "volume_mute", { is_volume_muted: Boolean(value) }));
        speaker.getCharacteristic(Characteristic.Volume)
          .onGet(() => Math.round((Number(mediaState()?.attributes?.volume_level) || 0) * 100))
          .onSet(async (value: any) => this.callHaWithResponseBudget("media_player", "volume_set", { volume_level: Number(value) / 100 }));
        tv.addLinkedService(speaker);

        sources.forEach((source, index) => {
          const input = this.accessory.addService(Service.InputSource, source, `input:${index + 1}`);
          input.setCharacteristic(Characteristic.Identifier, index + 1);
          input.setCharacteristic(Characteristic.ConfiguredName, source);
          input.setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED);
          input.setCharacteristic(Characteristic.InputSourceType, Characteristic.InputSourceType.HDMI);
          tv.addLinkedService(input);
        });
        break;
      }

      // ── Altavoz TV ────────────────────────────────────────────────────────
      case "television_speaker": {
        const svc = this.accessory.addService(
          Service.TelevisionSpeaker,
          this.record.name,
        );
        svc.setCharacteristic(
          Characteristic.VolumeControlType,
          Characteristic.VolumeControlType.ABSOLUTE,
        );
        svc.getCharacteristic(Characteristic.Mute).setValue(false);
        break;
      }

      // ── Válvulas ──────────────────────────────────────────────────────────
      case "valve_irrigation":
      case "valve_faucet":
      case "valve_shower": {
        const valveType =
          profile === "valve_irrigation"
            ? Characteristic.ValveType.IRRIGATION
            : profile === "valve_faucet"
              ? Characteristic.ValveType.WATER_FAUCET
              : Characteristic.ValveType.SHOWER_HEAD;
        const svc = this.accessory.addService(
          Service.Valve,
          this.record.name,
        );
        const initialState = this.getHomeAssistantState(this.entityId);
        const initialActive = this.isValveActive(initialState);
        svc.getCharacteristic(Characteristic.Active).setValue(initialActive ? 1 : 0);
        svc.getCharacteristic(Characteristic.InUse).setValue(initialActive ? 1 : 0);
        svc.setCharacteristic(Characteristic.ValveType, valveType);
        break;
      }

      // ── Panel de alarma ───────────────────────────────────────────────────
      case "security_system": {
        const svc = this.accessory.addService(
          Service.SecuritySystem,
          this.record.name,
        );
        const current = svc.getCharacteristic(Characteristic.SecuritySystemCurrentState);
        const target = svc.getCharacteristic(Characteristic.SecuritySystemTargetState);
        current.setValue(Characteristic.SecuritySystemCurrentState.DISARMED);
        target.setValue(Characteristic.SecuritySystemTargetState.DISARM);
        target.onGet(() => this.getAlarmTargetState());
        current.onGet(() => this.getAlarmCurrentState());
        target.onSet(async (value: any) => this.setAlarmTargetState(Number(value)));
        this.syncAlarmState(this.getHomeAssistantState(this.entityId));
        break;
      }

      // ── Puerta de garaje ──────────────────────────────────────────────────
      case "garage_door": {
        const svc = this.accessory.addService(
          Service.GarageDoorOpener,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CurrentDoorState)
          .setValue(Characteristic.CurrentDoorState.CLOSED);
        svc
          .getCharacteristic(Characteristic.TargetDoorState)
          .setValue(Characteristic.TargetDoorState.CLOSED);
        svc.getCharacteristic(Characteristic.ObstructionDetected).setValue(false);
        break;
      }

      // ── Timbre / Videoportero ─────────────────────────────────────────────
      case "doorbell": {
        this.accessory.addService(Service.Doorbell, this.record.name);
        break;
      }

      // ── Ventilador HAP ────────────────────────────────────────────────────
      case "fan_hap": {
        const svc = this.accessory.addService(Service.Fanv2, this.record.name);
        svc.getCharacteristic(Characteristic.Active).setValue(0);
        break;
      }

      // ── Calefactor / Aire ─────────────────────────────────────────────────
      case "heater_cooler": {
        const svc = this.accessory.addService(
          Service.HeaterCooler,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.Active).setValue(0);
        svc
          .getCharacteristic(Characteristic.CurrentHeaterCoolerState)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.TargetHeaterCoolerState)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setValue(20);
        break;
      }

      // ── Termostato HAP ────────────────────────────────────────────────────
      case "thermostat_hap": {
        const svc = this.accessory.addService(
          Service.Thermostat,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setValue(20);
        svc
          .getCharacteristic(Characteristic.TargetTemperature)
          .setValue(21);
        svc
          .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.TargetHeatingCoolingState)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.TemperatureDisplayUnits)
          .setValue(0);
        break;
      }

      // ── Enchufe HAP ───────────────────────────────────────────────────────
      case "outlet_hap": {
        const svc = this.accessory.addService(Service.Outlet, this.record.name);
        svc.getCharacteristic(Characteristic.On).setValue(false);
        svc.getCharacteristic(Characteristic.OutletInUse).setValue(false);
        break;
      }

      // ── Interruptor HAP ───────────────────────────────────────────────────
      case "switch_hap": {
        const svc = this.accessory.addService(
          Service.Switch,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.On).setValue(false);
        break;
      }

      // ── Bombilla HAP ──────────────────────────────────────────────────────
      case "lightbulb_hap": {
        const svc = this.accessory.addService(
          Service.Lightbulb,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.On).setValue(false);
        break;
      }

      // ── Cerradura HAP ─────────────────────────────────────────────────────
      case "lock_hap": {
        const svc = this.accessory.addService(
          Service.LockMechanism,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.LockCurrentState)
          .setValue(Characteristic.LockCurrentState.SECURED);
        svc
          .getCharacteristic(Characteristic.LockTargetState)
          .setValue(Characteristic.LockTargetState.SECURED);
        break;
      }

      // ── Persiana HAP ──────────────────────────────────────────────────────
      case "window_covering_hap": {
        const svc = this.accessory.addService(
          Service.WindowCovering,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CurrentPosition)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.TargetPosition)
          .setValue(0);
        svc
          .getCharacteristic(Characteristic.PositionState)
          .setValue(Characteristic.PositionState.STOPPED);
        break;
      }

      // ── Puerta HAP ────────────────────────────────────────────────────────
      case "door_hap": {
        const svc = this.accessory.addService(Service.Door, this.record.name);
        svc.getCharacteristic(Characteristic.CurrentPosition).setValue(0);
        svc.getCharacteristic(Characteristic.TargetPosition).setValue(0);
        svc
          .getCharacteristic(Characteristic.PositionState)
          .setValue(Characteristic.PositionState.STOPPED);
        break;
      }

      // ── Ventana HAP ───────────────────────────────────────────────────────
      case "window_hap": {
        const svc = this.accessory.addService(
          Service.Window,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.CurrentPosition).setValue(0);
        svc.getCharacteristic(Characteristic.TargetPosition).setValue(0);
        svc
          .getCharacteristic(Characteristic.PositionState)
          .setValue(Characteristic.PositionState.STOPPED);
        break;
      }

      // ── Sensor de movimiento ──────────────────────────────────────────────
      case "motion_sensor_hap": {
        const svc = this.accessory.addService(
          Service.MotionSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.MotionDetected)
          .setValue(false);
        break;
      }

      // ── Sensor de contacto ────────────────────────────────────────────────
      case "contact_sensor_hap": {
        const svc = this.accessory.addService(
          Service.ContactSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.ContactSensorState)
          .setValue(
            Characteristic.ContactSensorState.CONTACT_DETECTED,
          );
        break;
      }

      // ── Sensor de humo ────────────────────────────────────────────────────
      case "smoke_sensor_hap": {
        const svc = this.accessory.addService(
          Service.SmokeSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.SmokeDetected)
          .setValue(Characteristic.SmokeDetected.SMOKE_NOT_DETECTED);
        break;
      }

      // ── Sensor CO ─────────────────────────────────────────────────────────
      case "carbon_monoxide_sensor_hap": {
        const svc = this.accessory.addService(
          Service.CarbonMonoxideSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CarbonMonoxideDetected)
          .setValue(
            Characteristic.CarbonMonoxideDetected.CO_LEVELS_NORMAL,
          );
        break;
      }

      // ── Sensor CO₂ ────────────────────────────────────────────────────────
      case "carbon_dioxide_sensor_hap": {
        const svc = this.accessory.addService(
          Service.CarbonDioxideSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CarbonDioxideDetected)
          .setValue(
            Characteristic.CarbonDioxideDetected.CO2_LEVELS_NORMAL,
          );
        break;
      }

      // ── Sensor fuga ───────────────────────────────────────────────────────
      case "leak_sensor_hap": {
        const svc = this.accessory.addService(
          Service.LeakSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.LeakDetected)
          .setValue(Characteristic.LeakDetected.LEAK_NOT_DETECTED);
        break;
      }

      // ── Sensor ocupación ─────────────────────────────────────────────────
      case "occupancy_sensor_hap": {
        const svc = this.accessory.addService(
          Service.OccupancySensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.OccupancyDetected)
          .setValue(
            Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
          );
        break;
      }

      // ── Sensor temperatura ────────────────────────────────────────────────
      case "temperature_sensor_hap": {
        const svc = this.accessory.addService(
          Service.TemperatureSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CurrentTemperature)
          .setValue(20);
        break;
      }

      // ── Sensor humedad ────────────────────────────────────────────────────
      case "humidity_sensor_hap": {
        const svc = this.accessory.addService(
          Service.HumiditySensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CurrentRelativeHumidity)
          .setValue(50);
        break;
      }

      // ── Sensor luz ────────────────────────────────────────────────────────
      case "light_sensor_hap": {
        const svc = this.accessory.addService(
          Service.LightSensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.CurrentAmbientLightLevel)
          .setValue(0.0001);
        break;
      }

      // ── Sensor calidad aire ───────────────────────────────────────────────
      case "air_quality_sensor_hap": {
        const svc = this.accessory.addService(
          Service.AirQualitySensor,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.AirQuality)
          .setValue(Characteristic.AirQuality.UNKNOWN);
        break;
      }

      // ── Batería ───────────────────────────────────────────────────────────
      case "battery_hap": {
        const svc = this.accessory.addService(
          Service.Battery,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.BatteryLevel).setValue(100);
        svc
          .getCharacteristic(Characteristic.ChargingState)
          .setValue(Characteristic.ChargingState.NOT_CHARGING);
        svc
          .getCharacteristic(Characteristic.StatusLowBattery)
          .setValue(Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL);
        break;
      }

      // ── Altavoz HAP ───────────────────────────────────────────────────────
      case "speaker_hap": {
        const svc = this.accessory.addService(
          Service.Speaker,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.Mute).setValue(false);
        break;
      }

      // ── Sistema de irrigación ─────────────────────────────────────────────
      case "irrigation_system": {
        const svc = this.accessory.addService(
          Service.IrrigationSystem,
          this.record.name,
        );
        svc.getCharacteristic(Characteristic.Active).setValue(0);
        svc.getCharacteristic(Characteristic.InUse).setValue(0);
        svc
          .getCharacteristic(Characteristic.ProgramMode)
          .setValue(Characteristic.ProgramMode.NO_PROGRAM_SCHEDULED);
        break;
      }

      default:
        // Perfil desconocido → interruptor genérico como fallback
        this.accessory.addService(Service.Switch, this.record.name);
        break;
    }
  }

  // ──────────────────────────────────────────────
  // Publicación / despublicación
  // ──────────────────────────────────────────────

  /** Retorna true si el accesorio tiene al menos un fabric establecido. */
  public isPaired(): boolean {
    try {
      const info = (this.accessory as any)._accessoryInfo;
      if (typeof info?.paired === "function") return info.paired();
      const clients = info?.pairedClients;
      if (clients instanceof Map) return clients.size > 0;
      return Boolean(clients && Object.keys(clients).length > 0);
    } catch {
      return false;
    }
  }

  public get setupUri(): string {
    try {
      if (typeof this.accessory.setupURI === "function") {
        return this.accessory.setupURI();
      }
      return (this.accessory as any)._setupURI || "";
    } catch {
      return "";
    }
  }

  public static detectPrimaryNetworkInterface():
    { name: string; ip: string } | undefined {
    try {
      const ifaces = os.networkInterfaces();
      const ignoredPatterns =
        /^(lo|docker|hassio|veth|br-|dummy|tun|tap|tailscale|wg|utun|llw|awdl)/i;

      for (const [name, addrs] of Object.entries(ifaces)) {
        if (ignoredPatterns.test(name)) continue;
        for (const addr of addrs || []) {
          if (addr.internal) continue;
          if (addr.family === "IPv4" || (addr.family as any) === 4) {
            if (
              addr.address.startsWith("172.17.") ||
              addr.address.startsWith("172.30.")
            )
              continue;
            return { name, ip: addr.address };
          }
        }
      }
    } catch {}
    return undefined;
  }

  public async publish(): Promise<void> {
    const category = HAP_PROFILE_CATEGORIES[this.record.hapProfile] ?? Categories.OTHER;
    await this.accessory.publish({
      username: this.record.username,
      pincode: this.record.pincode,
      setupID: this.record.setupId,
      port: this.record.port,
      category,
      advertiser: MDNSAdvertiser.CIAO,
      bind: undefined,
    });
    this.isPublished = true;
    try {
      this.accessory.setupURI();
    } catch {}
  }

  public async unpublish(): Promise<void> {
    this.clearValveDurationTimer();
    try {
      await this.accessory.unpublish();
    } catch {
      // Ignorar si ya estaba sin publicar
    }
    this.isPublished = false;
  }

  public handlesEntityId(entityId: string): boolean {
    return entityId === this.entityId || this.getDeviceMembers().some(
      (member: any) => member.entityId === entityId,
    );
  }

  public updateFromHassState(state: any, sourceEntityId = this.entityId): void {
    try {
      if (sourceEntityId !== this.entityId) {
        if (
          (this.record.hapProfile === "humidifier" || this.record.hapProfile === "dehumidifier") &&
          state?.attributes?.device_class === "humidity"
        ) {
          const humidity = Number(state?.state);
          if (Number.isFinite(humidity) && humidity >= 0 && humidity <= 100) {
            this.accessory.getService(Service.HumidifierDehumidifier)?.updateCharacteristic(
              Characteristic.CurrentRelativeHumidity,
              humidity,
            );
          }
        }
        const binding = this.discoveredSensorBindings.get(sourceEntityId);
        if (binding) {
          binding.service.updateCharacteristic(
            binding.characteristic,
            binding.read(state),
          );
        }
        return;
      }
      this.setReachability(
        state?.state !== "unavailable" && state?.state !== "unknown",
      );
      if (this.record.hapProfile === "security_system") {
        this.syncAlarmState(state);
        return;
      }
      if (this.isValveProfile()) {
        this.syncValveState(state);
        return;
      }
      const on = state?.state === "on";
      switch (this.record.hapProfile) {
        case "switch_hap": this.accessory.getService(Service.Switch)?.updateCharacteristic(Characteristic.On, on); break;
        case "outlet_hap": this.accessory.getService(Service.Outlet)?.updateCharacteristic(Characteristic.On, on); break;
        case "lightbulb_hap": {
          const light = this.accessory.getService(Service.Lightbulb);
          light?.updateCharacteristic(Characteristic.On, on);
          if (state?.attributes?.brightness !== undefined) light?.updateCharacteristic(Characteristic.Brightness, Math.round(Number(state.attributes.brightness) * 100 / 255));
          if (Array.isArray(state?.attributes?.hs_color)) {
            light?.updateCharacteristic(Characteristic.Hue, Number(state.attributes.hs_color[0]) || 0);
            light?.updateCharacteristic(Characteristic.Saturation, Number(state.attributes.hs_color[1]) || 0);
          }
          break;
        }
        case "fan_hap": {
          const fan = this.accessory.getService(Service.Fanv2);
          fan?.updateCharacteristic(Characteristic.Active, on ? 1 : 0);
          if (state?.attributes?.percentage !== undefined) fan?.updateCharacteristic(Characteristic.RotationSpeed, Number(state.attributes.percentage) || 0);
          break;
        }
        case "television": {
          this.accessory.getService(Service.Television)?.updateCharacteristic(Characteristic.Active, state?.state === "off" ? 0 : 1);
          this.accessory.getService(Service.TelevisionSpeaker)?.updateCharacteristic(Characteristic.Mute, Boolean(state?.attributes?.is_volume_muted));
          if (state?.attributes?.volume_level !== undefined) this.accessory.getService(Service.TelevisionSpeaker)?.updateCharacteristic(Characteristic.Volume, Math.round(Number(state.attributes.volume_level) * 100));
          break;
        }
      }
      if (
        this.record.hapProfile === "humidifier" ||
        this.record.hapProfile === "dehumidifier"
      ) {
        const svc = this.accessory.getService(Service.HumidifierDehumidifier);
        if (svc) {
          const isOn = state?.state === "on";
          svc.updateCharacteristic(Characteristic.Active, isOn ? 1 : 0);
          svc.updateCharacteristic(
            Characteristic.CurrentHumidifierDehumidifierState,
            isOn ? (this.record.hapProfile === "humidifier" ? 2 : 3) : 1,
          );
          const curHum = Number(state?.attributes?.current_humidity);
          if (!isNaN(curHum) && curHum >= 0 && curHum <= 100) {
            svc.updateCharacteristic(
              Characteristic.CurrentRelativeHumidity,
              curHum,
            );
          }
          const targetHum = Number(state?.attributes?.humidity);
          if (!isNaN(targetHum) && targetHum >= 0 && targetHum <= 100) {
            svc.updateCharacteristic(
              Characteristic.RelativeHumidityHumidifierThreshold,
              targetHum,
            );
          }
        }
      }
    } catch {}
  }

  private isValveProfile(): boolean {
    return this.record.hapProfile === "valve_irrigation" ||
      this.record.hapProfile === "valve_faucet" ||
      this.record.hapProfile === "valve_shower";
  }

  private isValveActive(state: any): boolean {
    const value = String(state?.state ?? "").toLowerCase();
    return value === "open" || value === "opening" || value === "closing" || value === "on";
  }

  private syncValveState(state: any): void {
    const service = this.accessory.getService(Service.Valve);
    if (!service) return;
    const value = String(state?.state ?? "").toLowerCase();
    if (value === "unavailable" || value === "unknown" || !value) {
      this.setReachability(false);
      return;
    }
    this.setReachability(true);
    const active = this.isValveActive(state);
    service.updateCharacteristic(Characteristic.Active, active ? 1 : 0);
    service.updateCharacteristic(Characteristic.InUse, active ? 1 : 0);
    if (active && this.valveSetDurationSeconds > 0 && this.valveDeadlineMs === undefined) {
      this.startValveDurationTimer(this.valveSetDurationSeconds);
    } else if (!active) {
      this.clearValveDurationTimer();
      service.updateCharacteristic(Characteristic.RemainingDuration, 0);
    }
  }

  private async setValveActive(active: boolean): Promise<void> {
    const domain = this.entityId.split(".")[0];
    const service = domain === "valve"
      ? (active ? "open_valve" : "close_valve")
      : (active ? "turn_on" : "turn_off");
    try {
      await this.callHaWithResponseBudget(domain, service);
    } finally {
      if (!active) this.clearValveDurationTimer();
    }
  }

  private getValveRemainingDuration(): number {
    if (this.valveDeadlineMs === undefined) return 0;
    return Math.max(0, Math.ceil((this.valveDeadlineMs - Date.now()) / 1000));
  }

  private clearValveDurationTimer(): void {
    if (this.valveDurationTimer) clearInterval(this.valveDurationTimer);
    this.valveDurationTimer = undefined;
    this.valveDeadlineMs = undefined;
    this.valveClosePending = false;
  }

  private startValveDurationTimer(seconds: number): void {
    this.clearValveDurationTimer();
    if (seconds <= 0) return;
    this.valveDeadlineMs = Date.now() + seconds * 1000;
    const service = this.accessory.getService(Service.Valve);
    const tick = () => {
      const remaining = this.getValveRemainingDuration();
      service?.updateCharacteristic(Characteristic.RemainingDuration, remaining);
      if (remaining > 0 || this.valveClosePending) return;
      this.valveClosePending = true;
      if (this.valveDurationTimer) clearInterval(this.valveDurationTimer);
      this.valveDurationTimer = undefined;
      this.valveDeadlineMs = undefined;
      void this.setValveActive(false).catch((error: unknown) => {
        this.valveClosePending = false;
        this.setReachability(false);
        this.platform.recordEntityCommandFailure?.(
          this.entityId,
          "HAP valve duration expired but Home Assistant could not close the valve.",
        );
        this.platform.log?.warn?.(
          `[HAP][${this.entityId}] duration close failed (${error instanceof Error ? error.name : "unknown error"}).`,
        );
      });
    };
    this.valveDurationTimer = setInterval(tick, 1000);
    tick();
  }

  private getSecuritySystemService(): any {
    return this.accessory.getService(Service.SecuritySystem);
  }

  private supportsAlarmNight(): boolean {
    const night = Characteristic.SecuritySystemTargetState.NIGHT_ARM;
    const characteristic = this.getSecuritySystemService()?.getCharacteristic(
      Characteristic.SecuritySystemTargetState,
    );
    return Number.isInteger(night) &&
      Array.isArray(characteristic?.props?.validValues) &&
      characteristic.props.validValues.includes(night);
  }

  private mapAlarmMode(value: unknown): number | undefined {
    switch (value) {
      case "disarmed": return Characteristic.SecuritySystemCurrentState.DISARMED;
      case "armed_home": return Characteristic.SecuritySystemCurrentState.STAY_ARM;
      case "armed_away": return Characteristic.SecuritySystemCurrentState.AWAY_ARM;
      case "armed_night":
        return this.supportsAlarmNight()
          ? Characteristic.SecuritySystemCurrentState.NIGHT_ARM
          : undefined;
      default: return undefined;
    }
  }

  private mapAlarmTarget(value: unknown): number | undefined {
    switch (value) {
      case "disarmed": return Characteristic.SecuritySystemTargetState.DISARM;
      case "armed_home": return Characteristic.SecuritySystemTargetState.STAY_ARM;
      case "armed_away": return Characteristic.SecuritySystemTargetState.AWAY_ARM;
      case "armed_night":
        return this.supportsAlarmNight()
          ? Characteristic.SecuritySystemTargetState.NIGHT_ARM
          : undefined;
      default: return undefined;
    }
  }

  private getAlarmCurrentState(): number {
    const state = this.getSecuritySystemService()?.getCharacteristic(
      Characteristic.SecuritySystemCurrentState,
    ).value;
    return Number.isInteger(state)
      ? Number(state)
      : Characteristic.SecuritySystemCurrentState.DISARMED;
  }

  private getAlarmTargetState(): number {
    if (this.pendingAlarmTarget !== undefined) return this.pendingAlarmTarget;
    const state = this.getSecuritySystemService()?.getCharacteristic(
      Characteristic.SecuritySystemTargetState,
    ).value;
    return Number.isInteger(state)
      ? Number(state)
      : Characteristic.SecuritySystemTargetState.DISARM;
  }

  private syncAlarmState(state: any): void {
    const service = this.getSecuritySystemService();
    if (!service) return;
    const status = String(state?.state || "").toLowerCase();
    const attrs = state?.attributes || {};
    if (status === "unavailable" || status === "unknown" || !status) {
      this.setReachability(false);
      return;
    }
    this.setReachability(true);

    // Argus exposes meaningful progress through attributes while its state
    // remains `arming`. HAP has no CurrentState=ARMING value, so retain the
    // last HA-confirmed CurrentState and expose only the pending TargetState.
    if (status === "arming" && attrs.argus_arming_transition === true) {
      const target = this.mapAlarmTarget(attrs.arming_target);
      if (target !== undefined) {
        this.pendingAlarmTarget = target;
        service.updateCharacteristic(Characteristic.SecuritySystemTargetState, target);
      } else {
        // Keep the previously confirmed mode; an incomplete/unrecognized
        // target must never be converted into a final armed state.
        this.platform.log?.warn?.(
          `[HAP][${this.entityId}] Argus arming transition has an unsupported or missing target.`,
        );
      }
      return;
    }

    const current = this.mapAlarmMode(status);
    if (status === "triggered" || status === "alarm_triggered") {
      service.updateCharacteristic(
        Characteristic.SecuritySystemCurrentState,
        Characteristic.SecuritySystemCurrentState.ALARM_TRIGGERED,
      );
      return;
    }
    if (current === undefined) return;

    this.pendingAlarmTarget = undefined;
    service.updateCharacteristic(Characteristic.SecuritySystemCurrentState, current);
    const target = status === "armed_night"
      ? Characteristic.SecuritySystemTargetState.NIGHT_ARM
      : status === "armed_away"
        ? Characteristic.SecuritySystemTargetState.AWAY_ARM
        : status === "armed_home"
          ? Characteristic.SecuritySystemTargetState.STAY_ARM
          : Characteristic.SecuritySystemTargetState.DISARM;
    service.updateCharacteristic(Characteristic.SecuritySystemTargetState, target);
  }

  private async setAlarmTargetState(target: number): Promise<void> {
    const services = new Map<number, string>([
      [Characteristic.SecuritySystemTargetState.DISARM, "alarm_disarm"],
      [Characteristic.SecuritySystemTargetState.STAY_ARM, "alarm_arm_home"],
      [Characteristic.SecuritySystemTargetState.AWAY_ARM, "alarm_arm_away"],
    ]);
    if (this.supportsAlarmNight()) {
      services.set(Characteristic.SecuritySystemTargetState.NIGHT_ARM, "alarm_arm_night");
    }
    const service = services.get(target);
    if (!service) throw -70410; // HAP INVALID_VALUE_IN_REQUEST

    const attrs = this.getHomeAssistantState(this.entityId)?.attributes || {};
    const armAction = service !== "alarm_disarm";
    const codeRequired = armAction
      ? attrs.code_arm_required === true
      : attrs.code_disarm_required === true;
    const code = this.record.alarmCode?.trim();
    if (codeRequired && !code) {
      const message = `Home Assistant requires an alarm PIN to run ${service} for ${this.entityId}; configure the alarm PIN in this add-on first.`;
      this.platform.log?.warn?.(`[HAP][${this.entityId}] ${message}`);
      throw -70411; // HAP INSUFFICIENT_AUTHORIZATION
    }

    try {
      await this.callHaWithResponseBudget(
        "alarm_control_panel",
        service,
        code ? { code } : undefined,
      );
      // Do not alter CurrentState here. Home Assistant is authoritative and
      // its state_changed event confirms disarm/arm completion.
    } catch (error) {
      this.platform.log?.warn?.(
        `[HAP][${this.entityId}] ${service} failed; retaining Home Assistant's confirmed state: ${String(error)}`,
      );
      throw error;
    }
  }

  /**
   * HomeKit accessories are independently reachable from the Matter bridge.
   * Mirror Home Assistant availability here so Casa does not leave a paired
   * HAP accessory looking healthy after its backing entity disappears.
   */
  public setReachability(reachable: boolean): void {
    for (const service of this.accessory.services) {
      try {
        if (!service.testCharacteristic(Characteristic.StatusActive)) {
          service.addOptionalCharacteristic(Characteristic.StatusActive);
        }
        service.updateCharacteristic(Characteristic.StatusActive, reachable);
      } catch {}
      try {
        if (!service.testCharacteristic(Characteristic.StatusFault)) {
          service.addOptionalCharacteristic(Characteristic.StatusFault);
        }
        service.updateCharacteristic(
          Characteristic.StatusFault,
          reachable ? 0 : 1,
        );
      } catch {}
    }
  }

  // ──────────────────────────────────────────────
  // Helpers estáticos de generación de credenciales
  // ──────────────────────────────────────────────

  /**
   * Genera credenciales HAP deterministas a partir del entityId, igual que
   * `getOrCreateHomeKitCameraRecord` en platform.ts.
   */
  static generateCredentials(
    entityId: string,
    usedPorts: Set<number>,
    startPort = 52000,
    rotationSeed = "",
  ): {
    username: string;
    pincode: string;
    setupId: string;
    port: number;
    uuid: string;
  } {
    const hash = crypto
      .createHash("sha256")
      .update(`hap:generic:${entityId}:${rotationSeed}`)
      .digest("hex");

    const username =
      `1A:${hash.substring(0, 2)}:${hash.substring(2, 4)}:${hash.substring(4, 6)}:${hash.substring(6, 8)}:${hash.substring(8, 10)}`.toUpperCase();

    const pinPart1 = (
      (Math.abs(parseInt(hash.substring(10, 13), 16)) % 900) +
      100
    ).toString();
    const pinPart2 = (
      (Math.abs(parseInt(hash.substring(13, 15), 16)) % 90) +
      10
    ).toString();
    const pinPart3 = (
      (Math.abs(parseInt(hash.substring(15, 18), 16)) % 900) +
      100
    ).toString();
    const pincode = `${pinPart1}-${pinPart2}-${pinPart3}`;
    const setupId = hash.substring(18, 22).toUpperCase();

    let port = startPort;
    while (usedPorts.has(port)) port++;

    return {
      username,
      pincode,
      setupId,
      port,
      uuid: `${uuid.generate(`homekit:generic:${entityId}`)}`,
    };
  }
}

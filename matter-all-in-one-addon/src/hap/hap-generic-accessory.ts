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

  constructor(
    public readonly platform: any,
    public readonly entityId: string,
    public record: HapAccessoryRecord,
  ) {
    const accUuid =
      record.uuid || uuid.generate(`homekit:generic:${entityId}`);
    this.record.uuid = accUuid;
    this.accessory = new Accessory(record.name || entityId, accUuid);
    this.configureAccessoryInformation();
    this.addServiceForProfile(record.hapProfile);
  }

  // ──────────────────────────────────────────────
  // Información base del accesorio (igual que cámaras)
  // ──────────────────────────────────────────────

  private configureAccessoryInformation(): void {
    const info = this.accessory.getService(Service.AccessoryInformation);
    if (!info) return;
    info
      .setCharacteristic(
        Characteristic.Manufacturer,
        this.record.manufacturer || "Home Assistant",
      )
      .setCharacteristic(
        Characteristic.Model,
        this.record.model || HAP_PROFILE_LABELS[this.record.hapProfile] || "HAP Device",
      )
      .setCharacteristic(
        Characteristic.SerialNumber,
        this.record.serialNumber || this.entityId.replaceAll(".", "_"),
      )
      .setCharacteristic(
        Characteristic.Name,
        this.record.name || this.entityId,
      )
      .setCharacteristic(Characteristic.FirmwareRevision, "1.0.0");
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
            return ent?.state?.state === "on" ? 1 : 0;
          })
          .onSet(async (value) => {
            const [domain] = this.entityId.split(".");
            const service = value === 1 ? "turn_on" : "turn_off";
            await this.platform.ha?.callService(domain, service, this.entityId);
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
            const ent = this.platform.entities.get(this.entityId);
            const val = Number(ent?.state?.attributes?.current_humidity);
            return !isNaN(val) && val >= 0 && val <= 100 ? val : 50;
          });

        svc.getCharacteristic(Characteristic.RelativeHumidityHumidifierThreshold)
          .onGet(() => {
            const ent = this.platform.entities.get(this.entityId);
            const val = Number(ent?.state?.attributes?.humidity);
            return !isNaN(val) && val >= 0 && val <= 100 ? val : 50;
          })
          .onSet(async (value) => {
            const [domain] = this.entityId.split(".");
            await this.platform.ha?.callService(domain, "set_humidity", this.entityId, {
              humidity: Number(value),
            });
          });

        // Detect linked light if part of a composite device (e.g. Govee Diffuser)
        const candidate = this.platform.getCompositeCandidate?.(this.entityId);
        const lightMember = candidate?.members.find((m: any) =>
          m.entityId.startsWith("light."),
        );
        if (lightMember) {
          const lightEnt = this.platform.entities.get(lightMember.entityId);
          const lightName =
            lightEnt?.state?.attributes?.friendly_name || `${this.record.name} Luz`;
          const lightSvc = this.accessory.addService(
            Service.Lightbulb,
            lightName,
            "light",
          );
          lightSvc
            .getCharacteristic(Characteristic.On)
            .onGet(() => {
              const ent = this.platform.entities.get(lightMember.entityId);
              return ent?.state?.state === "on";
            })
            .onSet(async (val) => {
              await this.platform.ha?.callService(
                "light",
                val ? "turn_on" : "turn_off",
                lightMember.entityId,
              );
            });

          lightSvc
            .getCharacteristic(Characteristic.Brightness)
            .onGet(() => {
              const ent = this.platform.entities.get(lightMember.entityId);
              const bri = ent?.state?.attributes?.brightness;
              return bri !== undefined
                ? Math.round((Number(bri) / 255) * 100)
                : 100;
            })
            .onSet(async (val) => {
              await this.platform.ha?.callService(
                "light",
                "turn_on",
                lightMember.entityId,
                { brightness_pct: Number(val) },
              );
            });
          svc.addLinkedService(lightSvc);
        }
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
        const tv = this.accessory.addService(
          Service.Television,
          this.record.name,
        );
        tv.setCharacteristic(Characteristic.ConfiguredName, this.record.name);
        tv.setCharacteristic(
          Characteristic.SleepDiscoveryMode,
          Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE,
        );
        tv.getCharacteristic(Characteristic.Active).setValue(
          Characteristic.Active.INACTIVE,
        );
        tv.getCharacteristic(Characteristic.ActiveIdentifier).setValue(1);
        // Agregar speaker vinculado al TV
        const speaker = this.accessory.addService(
          Service.TelevisionSpeaker,
        );
        speaker.setCharacteristic(
          Characteristic.VolumeControlType,
          Characteristic.VolumeControlType.ABSOLUTE,
        );
        tv.addLinkedService(speaker);
        // Fuente de entrada por defecto
        const input = this.accessory.addService(
          Service.InputSource,
          "HDMI 1",
          "hdmi1",
        );
        input.setCharacteristic(Characteristic.Identifier, 1);
        input.setCharacteristic(Characteristic.ConfiguredName, "HDMI 1");
        input.setCharacteristic(
          Characteristic.IsConfigured,
          Characteristic.IsConfigured.CONFIGURED,
        );
        input.setCharacteristic(
          Characteristic.InputSourceType,
          Characteristic.InputSourceType.HDMI,
        );
        tv.addLinkedService(input);
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
        svc.getCharacteristic(Characteristic.Active).setValue(0);
        svc.getCharacteristic(Characteristic.InUse).setValue(0);
        svc.setCharacteristic(Characteristic.ValveType, valveType);
        break;
      }

      // ── Panel de alarma ───────────────────────────────────────────────────
      case "security_system": {
        const svc = this.accessory.addService(
          Service.SecuritySystem,
          this.record.name,
        );
        svc
          .getCharacteristic(Characteristic.SecuritySystemCurrentState)
          .setValue(Characteristic.SecuritySystemCurrentState.DISARMED);
        svc
          .getCharacteristic(Characteristic.SecuritySystemTargetState)
          .setValue(Characteristic.SecuritySystemTargetState.DISARM);
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
      return (this.accessory as any)._accessoryInfo?.pairedClients?.size > 0;
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
    const primaryIface = HapGenericAccessory.detectPrimaryNetworkInterface();
    await this.accessory.publish(
      {
        username: this.record.username,
        pincode: this.record.pincode,
        setupID: this.record.setupId,
        port: this.record.port,
        category,
        advertiser: MDNSAdvertiser.CIAO,
        bind: primaryIface?.name ? [primaryIface.name] : undefined,
      },
      true,
    );
    this.isPublished = true;
    try {
      this.accessory.setupURI();
    } catch {}
  }

  public async unpublish(): Promise<void> {
    try {
      await this.accessory.unpublish();
    } catch {
      // Ignorar si ya estaba sin publicar
    }
    this.isPublished = false;
  }

  public updateFromHassState(state: any): void {
    try {
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
  ): {
    username: string;
    pincode: string;
    setupId: string;
    port: number;
    uuid: string;
  } {
    const hash = crypto
      .createHash("sha256")
      .update(`hap:generic:${entityId}`)
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

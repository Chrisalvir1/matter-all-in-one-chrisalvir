import React, { useState } from "react";
import { DeviceRecord } from "../types";
import { AppleHomeIcon } from "./AppleHomeIcon";
import { DeviceCardArt } from "./DeviceCardArt";
import { LiquidSlider } from "./LiquidSlider";
import { extractLightColor, extractLightColorInfo } from "../utils/colors";
import {
  detectDevice,
  APPLE_HOMEPOD_COLORS,
  getDeviceVisualOverride,
  setDeviceVisualOverride,
} from "../utils/deviceDetector";
import { api } from "../api/client";

interface DeviceCardProps {
  device: DeviceRecord;
  searchQuery: string;
  onConfigure: () => void;
  onRefresh?: () => void;
  isDashboardMode?: boolean;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({
  device,
  searchQuery,
  onConfigure,
  onRefresh,
  isDashboardMode: propDashboardMode = false,
}) => {
  const isDashboardMode =
    propDashboardMode ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mode") === "dashboard");
  const [togglingEntityIds, setTogglingEntityIds] = useState<Set<string>>(new Set());
  const [imgLoaded, setImgLoaded] = useState(false);
  const [showKelvinPicker, setShowKelvinPicker] = useState(false);

  const deviceInfo = detectDevice(device);

  const exported = device.entities.filter((e) => e.exported).length;
  const isMqtt = device.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."));
  const hasIssue = device.entities.some((e) => e.exported && e.hasIssue);

  // Sub-entities breakdown
  const isFanDevice =
    deviceInfo.hasFan ||
    deviceInfo.isTowerFan ||
    deviceInfo.isCeilingFan ||
    deviceInfo.subtype === "tower_fan" ||
    deviceInfo.subtype === "ceiling_fan" ||
    (device.name && device.name.toLowerCase().includes("ventilador"));

  // Fan entity resolution: check domain "fan", or if fan device, find the switch controlling the fan
  const fanEntity =
    device.entities.find((e) => e.domain === "fan") ||
    (isFanDevice
      ? device.entities.find(
          (e) =>
            e.domain === "switch" &&
            (e.entityId.toLowerCase().includes("ventilador") ||
             e.entityId.toLowerCase().includes("fan") ||
             (e.name && (e.name.toLowerCase().includes("ventilador") || e.name.toLowerCase().includes("fan"))))
        ) || device.entities.find((e) => e.domain === "switch" && !e.entityId.includes("auto_stop"))
      : undefined);

  // Detect Govee H7133 specifically or tower fans with heater switch
  const isH7133 =
    (device.model || "").toUpperCase().includes("H7133") ||
    (device.name || "").toLowerCase().includes("h7133") ||
    device.entities.some(
      (e) =>
        e.entityId.toLowerCase().includes("h7133") ||
        (e.name || "").toLowerCase().includes("h7133")
    ) ||
    (device.entities.some((e) => e.entityId.toLowerCase().includes("ventilador_playroom")) &&
      device.entities.some((e) => e.entityId.toLowerCase().includes("auto_stop")));

  // Detect temperature sensor
  const tempSensor = device.entities.find(
    (e) =>
      e.domain === "sensor" &&
      (e.attributes?.device_class === "temperature" ||
        e.entityId.toLowerCase().includes("temperature") ||
        e.entityId.toLowerCase().includes("temperatura") ||
        (e.name || "").toLowerCase().includes("temperatura"))
  );

  const lightEntity = device.entities.find((e) => e.domain === "light");

  // Detect Govee H7133 auto_stop entity (Heating / Auto mode switch)
  const autoStopEntity = device.entities.find(
    (e) => e.domain === "switch" && e.entityId.toLowerCase().includes("auto_stop")
  );

  // Persistent user mode preference for Govee H7133 (fan vs heat vs off)
  const [h7133Mode, setH7133Mode] = useState<"fan" | "heat" | "off">(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(`govee_h7133_mode_${device.id}`);
        if (saved === "heat" || saved === "fan" || saved === "off") return saved;
      } catch {}
    }
    return "fan";
  });

  // Selected heat level for Govee H7133 (1: Bajo, 2: Medio, 3: Alto, auto: Termostato)
  const [h7133HeatLevel, setH7133HeatLevel] = useState<"1" | "2" | "3" | "auto">(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(`govee_h7133_heat_level_${device.id}`);
        if (saved === "1" || saved === "2" || saved === "3" || saved === "auto") return saved;
      } catch {}
    }
    return "1";
  });

  // Selected fan speed percentage for Govee H7133 (33: Low, 66: Med, 100: High)
  const [h7133FanSpeedPct, setH7133FanSpeedPct] = useState<number>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(`govee_h7133_fan_speed_pct_${device.id}`);
        if (saved) {
          const num = Number(saved);
          if (!isNaN(num) && num > 0 && num <= 100) return num;
        }
      } catch {}
    }
    return 100;
  });

  // Selected oscillation mode for Govee H7133 ("off" | "horizontal" | "vertical" | "all")
  const [h7133Oscillation, setH7133Oscillation] = useState<"off" | "horizontal" | "vertical" | "all">(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = window.localStorage.getItem(`govee_h7133_oscillation_${device.id}`);
        if (saved === "off" || saved === "horizontal" || saved === "vertical" || saved === "all") return saved;
      } catch {}
    }
    return "off";
  });

  // Oscillation entities detection (strictly excludes main fanEntity, heaterEntity, autoStopEntity)
  const oscVerticalSwitch = device.entities.find(
    (e) =>
      e.domain === "switch" &&
      e.entityId !== fanEntity?.entityId &&
      e.entityId !== autoStopEntity?.entityId &&
      (/vert|up_down|arriba|abajo/i.test(e.entityId) || /vert|arriba|abajo/i.test(e.name || ""))
  );

  const oscHorizontalSwitch = device.entities.find(
    (e) =>
      e.domain === "switch" &&
      e.entityId !== fanEntity?.entityId &&
      e.entityId !== autoStopEntity?.entityId &&
      (/horiz|left_right|izq|der/i.test(e.entityId) || /horiz|izq|der/i.test(e.name || ""))
  );

  const oscGeneralSwitch = device.entities.find(
    (e) =>
      e.domain === "switch" &&
      e.entityId !== fanEntity?.entityId &&
      e.entityId !== heaterEntity?.entityId &&
      e.entityId !== autoStopEntity?.entityId &&
      (/oscil|swing|sweep|shake|giro|girar|rotar|pan/i.test(e.entityId) ||
       /oscil|swing|sweep|shake|giro|girar|rotar/i.test(e.name || "")) &&
      e.entityId !== oscVerticalSwitch?.entityId &&
      e.entityId !== oscHorizontalSwitch?.entityId
  );

  const oscSelectEntity = device.entities.find(
    (e) =>
      e.domain === "select" &&
      (/oscil|swing|sweep|angle|direction|range/i.test(e.entityId) ||
       /oscil|swing|sweep|dirección|ángulo/i.test(e.name || "") ||
       (e.attributes?.options || []).some((opt: string) => /oscil|swing|sweep|horiz|vert|angle/i.test(opt)))
  );

  const oscClimateEntity = device.entities.find(
    (e) =>
      e.domain === "climate" &&
      Array.isArray(e.attributes?.swing_modes) &&
      e.attributes.swing_modes.length > 0
  );

  const oscFanEntity = device.entities.find(
    (e) => e.domain === "fan"
  );

  // Detect heater / climate entity
  const heaterEntity =
    device.entities.find((e) => e.domain === "climate") ||
    device.entities.find(
      (e) =>
        e.domain === "switch" &&
        (e.entityId.toLowerCase().includes("heater") ||
          e.entityId.toLowerCase().includes("calefactor") ||
          (e.name || "").toLowerCase().includes("calefactor")) &&
        !e.entityId.toLowerCase().includes("auto_stop")
    );

  // Only show exported switch channels on the card face — non-exported hidden until modal.
  // For Govee H7133, all power, modes, and oscillation are controlled via dedicated controls.
  const rawSwitchEntities = device.entities.filter(
    (e) =>
      e.domain === "switch" &&
      e.entityId !== fanEntity?.entityId &&
      (!isH7133 ||
        (e.entityId !== heaterEntity?.entityId &&
         e.entityId !== autoStopEntity?.entityId &&
         e.entityId !== oscVerticalSwitch?.entityId &&
         e.entityId !== oscHorizontalSwitch?.entityId &&
         e.entityId !== oscGeneralSwitch?.entityId))
  );
  const switchEntities = isH7133
    ? []
    : rawSwitchEntities.filter((e) => e.exported).length > 0
    ? rawSwitchEntities.filter((e) => e.exported)
    : (!fanEntity && !lightEntity ? rawSwitchEntities.slice(0, 3) : []);

  const coverEntity = device.entities.find((e) => e.domain === "cover");

  // Check orientation override hook
  const visualOverride = getDeviceVisualOverride(device.id);
  const [overrideOrientation, setOverrideOrientation] = useState<"vertical" | "horizontal" | undefined>(
    visualOverride?.orientation === "horizontal" || visualOverride?.orientation === "vertical"
      ? visualOverride.orientation
      : undefined
  );

  const isComposite =
    Boolean(isH7133) ||
    (Boolean(fanEntity) && Boolean(lightEntity)) ||
    (deviceInfo.subtype === "multi_gang_switch" && switchEntities.length > 1);

  // Domain priority: Prioritize media_player (Apple TV, HomePod), climate, fan
  const domainPriority = ["media_player", "climate", "fan", "lock", "cover", "vacuum", "camera", "humidifier", "light", "switch", "sensor"];
  const sortedEntities = [...device.entities].sort((a, b) => {
    const idxA = domainPriority.indexOf(a.domain);
    const idxB = domainPriority.indexOf(b.domain);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  const primaryEntity = isFanDevice && fanEntity ? fanEntity : (sortedEntities[0] || device.entities[0]);
  const primaryDomain = isFanDevice && fanEntity ? "fan" : (primaryEntity?.domain || "switch");
  const primaryState = primaryEntity?.state || "off";
  const primaryAttributes = primaryEntity?.attributes || {};

  // Check orientation (Vertical / De pie vs Horizontal / Acostado)
  const orientationSensor = device.entities.find(
    (e) =>
      e.entityId.toLowerCase().includes("orientation") ||
      e.entityId.toLowerCase().includes("tilt") ||
      e.entityId.toLowerCase().includes("posture") ||
      e.entityId.toLowerCase().includes("inclinacion") ||
      (e.name || "").toLowerCase().includes("orientación") ||
      (e.name || "").toLowerCase().includes("postura") ||
      (e.name || "").toLowerCase().includes("acostado")
  );
  const isSensorHorizontal =
    orientationSensor &&
    (orientationSensor.state === "horizontal" ||
      orientationSensor.state === "acostado" ||
      orientationSensor.state === "lying" ||
      orientationSensor.state === "flat" ||
      orientationSensor.state === "on");
  const isAttrHorizontal =
    primaryAttributes?.orientation === "horizontal" ||
    primaryAttributes?.placement === "horizontal" ||
    primaryAttributes?.horizontal === true ||
    primaryAttributes?.tilt === true;

  const effectiveOrientation: "vertical" | "horizontal" =
    overrideOrientation ||
    (isSensorHorizontal || isAttrHorizontal ? "horizontal" : "vertical");

  const handleToggleOrientation = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOrientation = effectiveOrientation === "vertical" ? "horizontal" : "vertical";
    setOverrideOrientation(nextOrientation);
    setDeviceVisualOverride(device.id, {
      ...visualOverride,
      orientation: nextOrientation,
    });
  };

  const domains = [...new Set(device.entities.map((e) => e.domain))].slice(0, 3);

  const room = deviceInfo.inferredArea || device.area;
  const originText = isMqtt
    ? "MQTT Auto-Discovery"
    : room
      ? `📍 ${room} · ${deviceInfo.brand}`
      : deviceInfo.brand !== "Home Assistant"
        ? `${deviceInfo.brand} · Home Assistant`
        : "Home Assistant";

  // Check if primary domain is controllable via toggle
  const isControllable = ["light", "switch", "fan", "climate", "lock", "cover", "humidifier", "vacuum", "media_player"].includes(
    primaryDomain
  );
  // Govee H7133 active mode calculation
  const isFanPoweredOn = fanEntity ? fanEntity.state === "on" : (primaryDomain === "fan" && primaryState === "on");
  const currentH7133Mode: "fan" | "heat" | "off" =
    h7133Mode === "off" || !isFanPoweredOn
      ? "off"
      : (h7133Mode === "heat" ? "heat" : "fan");

  const isHeating = isH7133
    ? currentH7133Mode === "heat"
    : Boolean(
        (heaterEntity?.domain === "climate" && (heaterEntity.state === "heat" || heaterEntity.state === "on")) ||
        (heaterEntity?.domain === "switch" && heaterEntity.state === "on")
      );

  const isOn = isH7133
    ? currentH7133Mode !== "off"
    : (
        primaryState === "on" ||
        primaryState === "playing" ||
        primaryState === "heat" ||
        primaryState === "cool" ||
        primaryState === "open" ||
        primaryState === "unlocked" ||
        primaryState === "cleaning" ||
        isHeating
      );

  // Light color & brightness for card illumination
  const activeLight = lightEntity || (primaryDomain === "light" ? primaryEntity : undefined);
  const isLightActive = activeLight ? activeLight.state === "on" : false;
  const lightColorInfo = extractLightColorInfo(activeLight?.attributes);
  const [lr, lg, lb] = lightColorInfo.rgb;
  const lightBrightness = activeLight
    ? typeof activeLight.attributes?.brightness === "number"
      ? activeLight.attributes.brightness / 255
      : isLightActive
      ? 1.0
      : 0
    : 0;

  // Rich media info extraction
  const mediaTitle = (primaryAttributes.media_title || primaryAttributes.track_name || "") as string;
  const mediaSeries = (primaryAttributes.media_series_title || "") as string;
  const mediaSeason = primaryAttributes.media_season;
  const mediaEpisode = primaryAttributes.media_episode;
  const mediaArtist = (primaryAttributes.media_artist || primaryAttributes.artist || "") as string;
  const mediaApp = (primaryAttributes.app_name || primaryAttributes.source || "") as string;
  const mediaChannel = (primaryAttributes.media_channel || "") as string;
  const entityPicture = primaryAttributes.entity_picture as string | undefined;

  let fullMediaText = "";
  if (mediaSeries) {
    fullMediaText = `${mediaSeries}${mediaTitle ? ` · ${mediaTitle}` : ""}${
      mediaSeason && mediaEpisode ? ` (T${mediaSeason}:E${mediaEpisode})` : ""
    }`;
  } else if (mediaTitle) {
    fullMediaText = `${mediaTitle}${mediaArtist ? ` · ${mediaArtist}` : ""}`;
  } else if (mediaChannel) {
    fullMediaText = mediaChannel;
  } else if (mediaApp) {
    fullMediaText = mediaApp;
  }

  // Status text description
  let statusSummary = isOn ? "Activo" : "Inactivo";
  if (primaryDomain === "media_player") {
    const isPlaying = primaryState === "playing";
    const isPaused = primaryState === "paused";
    statusSummary = isPlaying
      ? fullMediaText || "Reproduciendo"
      : isPaused
      ? `En pausa${fullMediaText ? ` · ${fullMediaText}` : ""}`
      : "Inactivo";
  } else if (primaryDomain === "fan") {
    const pct = primaryAttributes.percentage;
    const osc = primaryAttributes.oscillating;
    statusSummary = isH7133
      ? currentH7133Mode === "heat"
        ? `Calefacción (${h7133HeatLevel === "auto" ? "Auto" : `Nivel ${h7133HeatLevel}`})${osc ? " · Oscilando" : ""}`
        : currentH7133Mode === "fan"
        ? `Ventilación manual · ${pct !== undefined ? `${pct}%` : "100%"}${osc ? " · Oscilando" : ""}`
        : "Apagado"
      : isHeating
      ? `Calefacción activa${osc ? " · Oscilando" : ""}`
      : isOn
      ? `${pct !== undefined ? `${pct}%` : "Encendido"}${osc ? " · Oscilando" : ""}`
      : "Apagado";
  } else if (primaryDomain === "light") {
    const bri = primaryAttributes.brightness;
    const pct = bri ? Math.round((bri / 255) * 100) : null;
    statusSummary = isOn
      ? `Encendida${pct ? ` · ${pct}%` : ""} · ${lightColorInfo.label}`
      : "Apagada";
  } else if (primaryDomain === "climate") {
    const curTemp = primaryAttributes.current_temperature;
    statusSummary = `${isOn ? primaryState.toUpperCase() : "APAGADO"}${
      curTemp !== undefined ? ` · ${curTemp}°C` : ""
    }`;
  } else if (primaryDomain === "lock") {
    statusSummary = primaryState === "locked" ? "Bloqueado" : "Desbloqueado";
  } else if (primaryDomain === "cover") {
    const pos = primaryAttributes.current_position;
    statusSummary = `${isOn ? "Abierta" : "Cerrada"}${pos !== undefined ? ` · ${pos}%` : ""}`;
  }

  const handleToggleEntity = async (e: React.MouseEvent, entityId: string) => {
    e.stopPropagation();
    if (togglingEntityIds.has(entityId)) return;

    if (isH7133 && entityId === fanEntity?.entityId) {
      const nextMode = fanEntity?.state === "on" ? "off" : "fan";
      setH7133Mode(nextMode);
      try {
        window.localStorage.setItem(`govee_h7133_mode_${device.id}`, nextMode);
      } catch {}
    }

    setTogglingEntityIds((prev) => new Set(prev).add(entityId));
    try {
      await api.toggleDeviceState(entityId);
      onRefresh?.();
    } catch (err) {
      console.error("Error toggling entity:", err);
    } finally {
      setTogglingEntityIds((prev) => {
        const next = new Set(prev);
        next.delete(entityId);
        return next;
      });
    }
  };

  const executeH7133FanMode = async (speedPct = h7133FanSpeedPct) => {
    const targetFanId = fanEntity?.entityId || primaryEntity?.entityId;
    // Step 1: Turn on main power
    if (targetFanId) {
      await api.turnOnEntity(targetFanId).catch(() => {});
      // Allow microcontroller to boot
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const tasks: Promise<any>[] = [];

    // Step 2: Turn off auto_stop switch (Auto heating thermostatic shutoff)
    if (autoStopEntity) {
      tasks.push(api.turnOffEntity(autoStopEntity.entityId).catch(() => {}));
    }

    // Step 3: Turn off heater entity if it is a separate switch
    if (heaterEntity && heaterEntity.domain === "switch" && heaterEntity.entityId !== targetFanId) {
      tasks.push(api.turnOffEntity(heaterEntity.entityId).catch(() => {}));
    }

    // Step 4: Explicitly set fan speed / percentage so it NEVER stays at 0!
    if (fanEntity && fanEntity.domain === "fan") {
      tasks.push(api.setEntityValue(fanEntity.entityId, speedPct).catch(() => {}));
    }

    // Step 5: If fan entity has preset_modes, select Fan mode
    if (fanEntity?.attributes?.preset_modes && Array.isArray(fanEntity.attributes.preset_modes)) {
      const match = fanEntity.attributes.preset_modes.find((m: string) =>
        /^(fan|fan_only|ventilador|normal|manual)$/i.test(m) || m.toLowerCase().includes("fan")
      );
      if (match) {
        tasks.push(api.setPresetMode(fanEntity.entityId, match).catch(() => {}));
      }
    }

    // Step 6: Check select entities for Fan option (e.g. select.ventilador_playroom_mode)
    const selectEntities = device.entities.filter((e) => e.domain === "select");
    for (const sel of selectEntities) {
      const options: string[] = sel.attributes?.options || [];
      const fanOpt = options.find((opt: string) =>
        /^(fan|fan_only|ventilador|normal|manual)$/i.test(opt) || opt.toLowerCase().includes("fan")
      );
      if (fanOpt) {
        tasks.push(api.selectOption(sel.entityId, fanOpt).catch(() => {}));
      }
      // Also check if there's a gear/speed select entity
      if (/gear|speed|velocidad/i.test(sel.entityId) || /gear|speed|velocidad/i.test(sel.name || "")) {
        const speedLevel = speedPct <= 33 ? "1" : speedPct <= 66 ? "2" : "3";
        const targetRegex =
          speedLevel === "1"
            ? /^(1|low|bajo|gear 1|gear_1)$/i
            : speedLevel === "2"
            ? /^(2|medium|med|medio|gear 2|gear_2)$/i
            : /^(3|high|alto|gear 3|gear_3)$/i;
        const gearMatch = options.find((opt) => targetRegex.test(opt));
        if (gearMatch) {
          tasks.push(api.selectOption(sel.entityId, gearMatch).catch(() => {}));
        }
      }
    }

    // Step 7: If climate entity exists, switch HVAC mode to fan_only
    const climateEntities = device.entities.filter((e) => e.domain === "climate");
    for (const clim of climateEntities) {
      if (clim.attributes?.hvac_modes?.includes("fan_only")) {
        tasks.push(api.setHvacMode(clim.entityId, "fan_only").catch(() => {}));
      }
    }

    await Promise.allSettled(tasks);

    // Reinforce after 250ms in case microcontroller took extra time to transition from boot
    setTimeout(() => {
      if (fanEntity && fanEntity.domain === "fan") {
        api.setEntityValue(fanEntity.entityId, speedPct).catch(() => {});
      }
      for (const sel of selectEntities) {
        const options: string[] = sel.attributes?.options || [];
        const fanOpt = options.find((opt: string) =>
          /^(fan|fan_only|ventilador|normal|manual)$/i.test(opt) || opt.toLowerCase().includes("fan")
        );
        if (fanOpt) api.selectOption(sel.entityId, fanOpt).catch(() => {});
      }
      if (fanEntity?.attributes?.preset_modes) {
        const match = fanEntity.attributes.preset_modes.find((m: string) =>
          /^(fan|fan_only|ventilador|normal|manual)$/i.test(m) || m.toLowerCase().includes("fan")
        );
        if (match) api.setPresetMode(fanEntity.entityId, match).catch(() => {});
      }
    }, 250);
  };

  const handleSetH7133FanSpeed = async (e: React.MouseEvent, level: "low" | "med" | "high") => {
    e.stopPropagation();
    const pct = level === "low" ? 33 : level === "med" ? 66 : 100;
    setH7133FanSpeedPct(pct);
    try {
      window.localStorage.setItem(`govee_h7133_fan_speed_pct_${device.id}`, String(pct));
    } catch {}

    if (currentH7133Mode !== "fan") {
      setH7133Mode("fan");
      try {
        window.localStorage.setItem(`govee_h7133_mode_${device.id}`, "fan");
      } catch {}
    }

    try {
      await executeH7133FanMode(pct);
      await new Promise((resolve) => setTimeout(resolve, 350));
      onRefresh?.();
    } catch (err) {
      console.error("Error setting H7133 fan speed:", err);
    }
  };

  const handleSetOscillation = async (e: React.MouseEvent, mode: "off" | "horizontal" | "vertical" | "all") => {
    e.stopPropagation();
    setH7133Oscillation(mode);
    try {
      window.localStorage.setItem(`govee_h7133_oscillation_${device.id}`, mode);
    } catch {}

    const isOscActive = mode !== "off";
    const tasks: Promise<any>[] = [];

    // 1. Dedicated oscillation switch (never the main power switch)
    if (oscGeneralSwitch) {
      if (isOscActive) {
        tasks.push(api.turnOnEntity(oscGeneralSwitch.entityId).catch(() => {}));
      } else {
        tasks.push(api.turnOffEntity(oscGeneralSwitch.entityId).catch(() => {}));
      }
    }

    // 2. Separate horizontal / vertical switches if present
    if (oscHorizontalSwitch) {
      if (mode === "horizontal" || mode === "all") {
        tasks.push(api.turnOnEntity(oscHorizontalSwitch.entityId).catch(() => {}));
      } else {
        tasks.push(api.turnOffEntity(oscHorizontalSwitch.entityId).catch(() => {}));
      }
    }
    if (oscVerticalSwitch) {
      if (mode === "vertical" || mode === "all") {
        tasks.push(api.turnOnEntity(oscVerticalSwitch.entityId).catch(() => {}));
      } else {
        tasks.push(api.turnOffEntity(oscVerticalSwitch.entityId).catch(() => {}));
      }
    }

    // 3. Select entity if present
    if (oscSelectEntity) {
      const options: string[] = oscSelectEntity.attributes?.options || [];
      let targetOption: string | undefined;
      if (!isOscActive) {
        targetOption = options.find((opt) => /^(off|fijo|none|stop|desactivado|no)$/i.test(opt) || opt.toLowerCase().includes("off"));
      } else if (mode === "horizontal") {
        targetOption = options.find((opt) => /horiz|left_right|izq|60/i.test(opt)) || options.find((opt) => /^(on|activado|si|yes|oscil)/i.test(opt));
      } else if (mode === "vertical") {
        targetOption = options.find((opt) => /vert|up_down|arriba|40/i.test(opt)) || options.find((opt) => /^(on|activado|si|yes|oscil)/i.test(opt));
      } else if (mode === "all") {
        targetOption = options.find((opt) => /all|both|todo|3d/i.test(opt)) || options.find((opt) => /^(on|activado|si|yes|oscil)/i.test(opt));
      }
      if (!targetOption && isOscActive) {
        targetOption = options.find((opt) => !/^(off|fijo|none|stop|desactivado|no)$/i.test(opt));
      }
      if (targetOption) {
        tasks.push(api.selectOption(oscSelectEntity.entityId, targetOption).catch(() => {}));
      }
    }

    // 4. Climate swing mode if present
    if (oscClimateEntity) {
      const modes: string[] = oscClimateEntity.attributes?.swing_modes || [];
      const targetSwing = isOscActive
        ? modes.find((m) => /^(on|both|horizontal|swing|oscillat)/i.test(m)) || modes[1] || "on"
        : modes.find((m) => /^(off|stop|none)/i.test(m)) || "off";
      tasks.push(api.setClimateSwingMode(oscClimateEntity.entityId, targetSwing).catch(() => {}));
    }

    // 5. Genuine fan domain entity (ONLY if domain is genuinely "fan", NEVER on a switch!)
    if (oscFanEntity && oscFanEntity.domain === "fan") {
      tasks.push(api.setFanOscillation(oscFanEntity.entityId, isOscActive).catch(() => {}));
    }

    // CRITICAL FOR H7133: If currently in Fan mode, RE-ASSERT Fan mode so hardware NEVER slips into heating!
    if (isH7133 && currentH7133Mode === "fan") {
      if (autoStopEntity) {
        tasks.push(api.turnOffEntity(autoStopEntity.entityId).catch(() => {}));
      }
      if (heaterEntity && heaterEntity.domain === "switch" && heaterEntity.entityId !== fanEntity?.entityId) {
        tasks.push(api.turnOffEntity(heaterEntity.entityId).catch(() => {}));
      }
      const selectEntities = device.entities.filter((e) => e.domain === "select" && e.entityId !== oscSelectEntity?.entityId);
      for (const sel of selectEntities) {
        const options: string[] = sel.attributes?.options || [];
        const fanOpt = options.find((opt: string) =>
          /^(fan|fan_only|ventilador|normal|manual)$/i.test(opt) || opt.toLowerCase().includes("fan")
        );
        if (fanOpt) tasks.push(api.selectOption(sel.entityId, fanOpt).catch(() => {}));
      }
    }

    await Promise.allSettled(tasks);
    await new Promise((r) => setTimeout(r, 250));
    onRefresh?.();
  };

  const executeH7133HeatMode = async (level: "1" | "2" | "3" | "auto") => {
    const targetFanId = fanEntity?.entityId || primaryEntity?.entityId;
    if (targetFanId) {
      await api.turnOnEntity(targetFanId).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const tasks: Promise<any>[] = [];

    if (level === "auto") {
      // Auto: Activate auto_stop thermostatic mode
      if (autoStopEntity) {
        tasks.push(api.turnOnEntity(autoStopEntity.entityId).catch(() => {}));
      }
      if (fanEntity?.attributes?.preset_modes) {
        const autoPreset = fanEntity.attributes.preset_modes.find((m: string) =>
          /^(auto|termostato)$/i.test(m) || m.toLowerCase().includes("auto")
        );
        if (autoPreset) tasks.push(api.setPresetMode(fanEntity.entityId, autoPreset).catch(() => {}));
      }
      const selectEntities = device.entities.filter((e) => e.domain === "select");
      for (const sel of selectEntities) {
        const autoOpt = (sel.attributes?.options || []).find((opt: string) =>
          /^(auto|termostato)$/i.test(opt) || opt.toLowerCase().includes("auto")
        );
        if (autoOpt) tasks.push(api.selectOption(sel.entityId, autoOpt).catch(() => {}));
      }
      const climateEntities = device.entities.filter((e) => e.domain === "climate");
      for (const clim of climateEntities) {
        if (clim.attributes?.hvac_modes?.includes("auto")) {
          tasks.push(api.setHvacMode(clim.entityId, "auto").catch(() => {}));
        }
      }
    } else {
      // Levels 1, 2, 3: Disable auto_stop so it stays on explicit heat level
      if (autoStopEntity) {
        tasks.push(api.turnOffEntity(autoStopEntity.entityId).catch(() => {}));
      }

      // Map level to percentage and speed
      const pct = level === "1" ? 33 : level === "2" ? 66 : 100;
      if (fanEntity) {
        tasks.push(api.setEntityValue(fanEntity.entityId, pct).catch(() => {}));
      }

      // Fan preset modes
      if (fanEntity?.attributes?.preset_modes) {
        const presets: string[] = fanEntity.attributes.preset_modes;
        const targetRegex =
          level === "1"
            ? /^(1|low|bajo|gear 1|gear_1|heat 1)$/i
            : level === "2"
            ? /^(2|medium|med|medio|gear 2|gear_2|heat 2)$/i
            : /^(3|high|alto|gear 3|gear_3|heat 3)$/i;
        const match = presets.find((p) => targetRegex.test(p));
        if (match) tasks.push(api.setPresetMode(fanEntity.entityId, match).catch(() => {}));
      }

      // Select entities (gear and mode)
      const selectEntities = device.entities.filter((e) => e.domain === "select");
      for (const sel of selectEntities) {
        const options: string[] = sel.attributes?.options || [];
        const targetRegex =
          level === "1"
            ? /^(1|low|bajo|gear 1|gear_1|heat 1)$/i
            : level === "2"
            ? /^(2|medium|med|medio|gear 2|gear_2|heat 2)$/i
            : /^(3|high|alto|gear 3|gear_3|heat 3)$/i;
        const match = options.find((opt) => targetRegex.test(opt));
        if (match) {
          tasks.push(api.selectOption(sel.entityId, match).catch(() => {}));
        } else {
          const gearMode = options.find((opt) => /^(gear|custom|heat)$/i.test(opt));
          if (gearMode) tasks.push(api.selectOption(sel.entityId, gearMode).catch(() => {}));
        }
      }

      // Turn on separate heater switch if any
      if (heaterEntity && heaterEntity.domain === "switch" && heaterEntity.entityId !== targetFanId) {
        tasks.push(api.turnOnEntity(heaterEntity.entityId).catch(() => {}));
      }

      // Set climate entity to heat
      const climateEntities = device.entities.filter((e) => e.domain === "climate");
      for (const clim of climateEntities) {
        if (clim.attributes?.hvac_modes?.includes("heat")) {
          tasks.push(api.setHvacMode(clim.entityId, "heat").catch(() => {}));
        }
      }
    }

    await Promise.allSettled(tasks);
  };

  const executeH7133OffMode = async () => {
    const offCalls: Promise<any>[] = [];
    if (fanEntity) offCalls.push(api.turnOffEntity(fanEntity.entityId));
    if (primaryEntity && primaryEntity.entityId !== fanEntity?.entityId) {
      offCalls.push(api.turnOffEntity(primaryEntity.entityId));
    }
    if (heaterEntity && heaterEntity.entityId !== fanEntity?.entityId) {
      offCalls.push(api.turnOffEntity(heaterEntity.entityId));
    }
    if (autoStopEntity && autoStopEntity.entityId !== fanEntity?.entityId) {
      offCalls.push(api.turnOffEntity(autoStopEntity.entityId));
    }
    const otherSwitches = device.entities.filter(
      (e) =>
        e.domain === "switch" &&
        e.entityId !== fanEntity?.entityId &&
        e.entityId !== primaryEntity?.entityId &&
        e.entityId !== heaterEntity?.entityId &&
        e.entityId !== autoStopEntity?.entityId
    );
    for (const sw of otherSwitches) {
      offCalls.push(api.turnOffEntity(sw.entityId));
    }
    await Promise.allSettled(offCalls);
  };

  const handleSetH7133Mode = async (e: React.MouseEvent, mode: "fan" | "heat" | "off") => {
    e.stopPropagation();
    setH7133Mode(mode);
    try {
      window.localStorage.setItem(`govee_h7133_mode_${device.id}`, mode);
    } catch {}

    try {
      if (mode === "fan") {
        await executeH7133FanMode();
      } else if (mode === "heat") {
        await executeH7133HeatMode(h7133HeatLevel);
      } else {
        await executeH7133OffMode();
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
      onRefresh?.();
    } catch (err) {
      console.error("Error setting H7133 mode:", err);
    }
  };

  const handleSetH7133HeatLevel = async (e: React.MouseEvent, level: "1" | "2" | "3" | "auto") => {
    e.stopPropagation();
    setH7133HeatLevel(level);
    try {
      window.localStorage.setItem(`govee_h7133_heat_level_${device.id}`, level);
    } catch {}

    if (currentH7133Mode !== "heat") {
      setH7133Mode("heat");
      try {
        window.localStorage.setItem(`govee_h7133_mode_${device.id}`, "heat");
      } catch {}
    }

    try {
      await executeH7133HeatMode(level);
      await new Promise((resolve) => setTimeout(resolve, 350));
      onRefresh?.();
    } catch (err) {
      console.error("Error setting H7133 heat level:", err);
    }
  };

  const currentKelvin =
    lightEntity?.attributes?.color_temp_kelvin ||
    (lightEntity?.attributes?.color_temp
      ? Math.round(1000000 / lightEntity.attributes.color_temp)
      : 2700);

  const handleSetKelvin = async (kelvin: number) => {
    if (!lightEntity) return;
    try {
      await api.setLightSettings(lightEntity.entityId, { kelvin });
      onRefresh?.();
    } catch (err) {
      console.error("Error setting light Kelvin:", err);
    }
  };

  // Card dynamic illumination style based on Kelvin / RGB or Active Heater
  const cardIlluminationStyle: React.CSSProperties = isLightActive
    ? {
        borderColor: `rgba(${lr}, ${lg}, ${lb}, ${Math.min(0.7, 0.35 * lightBrightness + 0.25)})`,
        boxShadow: `0 16px 40px rgba(0, 0, 0, 0.55), 0 0 ${Math.round(
          28 * lightBrightness
        )}px rgba(${lr}, ${lg}, ${lb}, ${0.35 * lightBrightness}), inset 0 1px 0 rgba(${lr}, ${lg}, ${lb}, ${0.5 * lightBrightness})`,
      }
    : isHeating
    ? {
        borderColor: "rgba(251, 146, 60, 0.5)",
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0.55), 0 0 24px rgba(234, 88, 12, 0.35), inset 0 1px 0 rgba(251, 146, 60, 0.45)",
      }
    : {};

  return (
    <article
      className={`device-card apple-home-card liquid-glass-card ${
        isDashboardMode ? "dashboard-mode" : ""
      } ${hasIssue ? "needs-attention" : ""} ${
        exported === 0 ? "is-unexported" : "is-exported"
      }`}
      onClick={isDashboardMode && isControllable && primaryEntity ? (e) => handleToggleEntity(e, primaryEntity.entityId) : onConfigure}
      style={{
        position: "relative",
        ...cardIlluminationStyle,
      }}
    >
      {/* Dynamic Apple Home Artwork Background with Spinning Blades & Kelvin Illumination */}
      <DeviceCardArt
        domain={primaryDomain}
        state={primaryState}
        attributes={primaryAttributes}
        fanPercentage={
          isH7133
            ? (currentH7133Mode !== "off"
                ? (typeof fanEntity?.attributes?.percentage === "number" && fanEntity.attributes.percentage > 0
                    ? fanEntity.attributes.percentage
                    : h7133FanSpeedPct)
                : 0)
            : typeof fanEntity?.attributes?.percentage === "number"
            ? fanEntity.attributes.percentage
            : primaryDomain === "fan" && typeof primaryAttributes?.percentage === "number"
            ? primaryAttributes.percentage
            : (fanEntity ? fanEntity.state === "on" : primaryDomain === "fan" && isOn) || isHeating
            ? 100
            : 0
        }
        isFanOn={
          isH7133
            ? currentH7133Mode !== "off"
            : ((fanEntity ? fanEntity.state === "on" : primaryDomain === "fan" && isOn) || isHeating)
        }
        isOscillating={isH7133 ? h7133Oscillation !== "off" : Boolean(fanEntity?.attributes?.oscillating || primaryAttributes?.oscillating)}
        oscillationMode={isH7133 ? h7133Oscillation : undefined}
        lightRgb={[lr, lg, lb]}
        lightBrightness={lightBrightness}
        isLightOn={isLightActive}
        subtype={deviceInfo.subtype}
        brand={deviceInfo.brand}
        model={deviceInfo.model}
        appleColor={deviceInfo.appleColor}
        isHeating={isHeating}
        orientation={effectiveOrientation}
        hasProductImage={Boolean(deviceInfo.productImageUrl && imgLoaded)}
      />

      {/* Real product photo — CDN image shown in top-right zone */}
      {deviceInfo.productImageUrl && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: "130px",
            height: "170px",
            pointerEvents: "none",
            zIndex: 1,
            overflow: "hidden",
            maskImage: "linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to left, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
            display: imgLoaded ? "block" : "none",
          }}
        >
          <img
            src={deviceInfo.productImageUrl}
            alt={deviceInfo.productImageAlt || deviceInfo.brand}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => {
              setImgLoaded(false);
              (e.target as HTMLImageElement).style.display = "none";
            }}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "right top",
              opacity: isOn ? 0.95 : 0.5,
              transition: "opacity 0.5s ease",
              filter: isOn ? "none" : "grayscale(0.4)",
            }}
          />
        </div>
      )}

      {/* Card Header & Controls (z-index: 2 for absolute click priority) */}
      <div className="card-top" style={{ position: "relative", zIndex: 2 }}>
        <button
          type="button"
          className={`card-icon-button ${isControllable ? "is-clickable" : ""}`}
          onClick={isControllable && primaryEntity ? (e) => handleToggleEntity(e, primaryEntity.entityId) : undefined}
          title={isControllable ? `Conmutar ${device.name}` : undefined}
          disabled={primaryEntity ? togglingEntityIds.has(primaryEntity.entityId) : false}
        >
          <AppleHomeIcon
            domain={primaryDomain}
            state={primaryState}
            attributes={primaryAttributes}
            size={36}
          />
        </button>

        <div className="badge-cluster" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {!isDashboardMode && (
            exported === 0 ? (
              <span className="export-badge unexported" title="Disponible en Home Assistant pero no exportado a Matter">
                NO EXPORTADO
              </span>
            ) : (
              <span className={`export-badge ${exported ? "active" : ""}`}>
                {exported}/{device.entities.length}
              </span>
            )
          )}

          {/* If single controllable device, show main quick toggle */}
          {!isComposite && isControllable && primaryEntity && (
            <button
              type="button"
              className={`quick-toggle-pill ${isOn ? "active" : "inactive"}`}
              onClick={(e) => handleToggleEntity(e, primaryEntity.entityId)}
              disabled={togglingEntityIds.has(primaryEntity.entityId)}
              aria-label={isOn ? "Apagar" : "Encender"}
              title={isOn ? "Apagar dispositivo" : "Encender dispositivo"}
            >
              <span className="toggle-thumb" />
            </button>
          )}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2, paddingRight: deviceInfo.productImageUrl ? "120px" : undefined }}>
        <div
          className="device-brand-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            marginBottom: "5px",
            flexWrap: "wrap",
          }}
        >
          <span
            className="brand-pill"
            style={{
              fontSize: "0.68rem",
              fontWeight: 750,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              padding: "2px 7px",
              borderRadius: "6px",
              background: `rgba(${deviceInfo.brandColor}, 0.15)`,
              border: `1px solid rgba(${deviceInfo.brandColor}, 0.35)`,
              color: deviceInfo.accentColor,
            }}
          >
            {deviceInfo.brand}
          </span>
          {deviceInfo.model && (
            <span
              className="model-pill"
              style={{
                fontSize: "0.68rem",
                fontWeight: 600,
                padding: "2px 6px",
                borderRadius: "6px",
                background: "rgba(0, 0, 0, 0.3)",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                color: "#cbd5e1",
              }}
            >
              {deviceInfo.model}
            </span>
          )}
          <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
            {deviceInfo.category}
          </span>
          {deviceInfo.subtype === "tower_fan" && (
            <button
              type="button"
              className="orientation-toggle-btn"
              onClick={handleToggleOrientation}
              title={`Orientación: actualmente ${effectiveOrientation === "horizontal" ? "Acostado" : "De pie"}. Haz clic para conmutar.`}
            >
              {effectiveOrientation === "horizontal" ? "➡️ Acostado" : "⬆️ De pie"}
            </button>
          )}
          {tempSensor && (
            <span
              className="temp-pill"
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                padding: "2px 7px",
                borderRadius: "6px",
                background: "rgba(56, 189, 248, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                color: "#38BDF8",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
              }}
              title={`Temperatura ambiente: ${tempSensor.state} ${tempSensor.attributes?.unit_of_measurement || "°F"}`}
            >
              🌡️ {tempSensor.state} {tempSensor.attributes?.unit_of_measurement || "°F"}
            </span>
          )}
        </div>
        <h3 title={device.name}>{device.name}</h3>
        {!isComposite && <p className="device-status-highlight">{statusSummary}</p>}
        {/* Rich Now Playing banner for Apple TV / HomePod / Media Players */}
        {primaryDomain === "media_player" && (primaryState === "playing" || primaryState === "paused") && (
          <div
            className="now-playing-pill"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "6px",
              marginBottom: "4px",
              padding: "5px 8px",
              background: "rgba(0, 0, 0, 0.45)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "10px",
              backdropFilter: "blur(10px)",
            }}
          >
            {entityPicture ? (
              <img
                src={entityPicture}
                alt="Carátula"
                style={{
                  width: "30px",
                  height: "30px",
                  borderRadius: "6px",
                  objectFit: "cover",
                  flexShrink: 0,
                  boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                }}
              />
            ) : (
              <span style={{ fontSize: "14px", flexShrink: 0 }}>
                {mediaApp.toLowerCase().includes("netflix")
                  ? "🍿"
                  : mediaApp.toLowerCase().includes("youtube")
                  ? "▶️"
                  : "🎬"}
              </span>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              {mediaApp && (
                <div
                  style={{
                    fontSize: "0.62rem",
                    fontWeight: 750,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#38BDF8",
                    lineHeight: 1.1,
                  }}
                >
                  {mediaApp}
                </div>
              )}
              <div
                style={{
                  fontSize: "0.74rem",
                  fontWeight: 600,
                  color: "#F8FAFC",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {fullMediaText || "Reproduciendo contenido"}
              </div>
            </div>
          </div>
        )}
        <p className="device-meta">{originText}</p>

        {/* Official Apple Color Picker for HomePod and HomePod Mini */}
        {(deviceInfo.subtype === "homepod_mini" || deviceInfo.subtype === "homepod") && (
          <div
            className="homepod-color-picker"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "6px",
              marginBottom: "4px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span style={{ fontSize: "0.68rem", color: "#94a3b8", fontWeight: 600 }}>Color Apple:</span>
            {Object.entries(
              deviceInfo.subtype === "homepod_mini"
                ? APPLE_HOMEPOD_COLORS.homepod_mini
                : APPLE_HOMEPOD_COLORS.homepod
            ).map(([colKey, colData]) => (
              <button
                key={colKey}
                type="button"
                title={colData.name}
                onClick={() => {
                  setDeviceVisualOverride(device.id, {
                    ...getDeviceVisualOverride(device.id),
                    appleColor: colKey,
                  });
                  onRefresh?.();
                }}
                style={{
                  width: "16px",
                  height: "16px",
                  borderRadius: "50%",
                  background: colData.hex,
                  border: deviceInfo.appleColor === colKey ? "2px solid #FFFFFF" : "1px solid rgba(255,255,255,0.25)",
                  boxShadow: deviceInfo.appleColor === colKey ? `0 0 6px ${colData.hex}` : "none",
                  cursor: "pointer",
                  padding: 0,
                  transform: deviceInfo.appleColor === colKey ? "scale(1.2)" : "scale(1)",
                  transition: "all 0.15s ease",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* COMPOSITE MULTI-ENTITY CONTROLS (e.g. Fan + Light + Switches) */}
      {isComposite && (
        <div
          className="composite-controls-cluster"
          style={{
            position: "relative",
            zIndex: 3,
            marginTop: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          {/* Govee H7133 Quick Mode Selector */}
          {isH7133 && (
            <div
              className="h7133-mode-selector"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                background: "rgba(0, 0, 0, 0.35)",
                border:
                  currentH7133Mode === "heat"
                    ? "1.5px solid rgba(251, 146, 60, 0.5)"
                    : currentH7133Mode === "fan"
                    ? "1.5px solid rgba(56, 189, 248, 0.4)"
                    : "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "14px",
                padding: "8px 10px",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span
                  style={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: currentH7133Mode === "heat" ? "#FB923C" : currentH7133Mode === "fan" ? "#38BDF8" : "#94A3B8",
                  }}
                >
                  {currentH7133Mode === "heat"
                    ? `🔥 Calefactor Activo (${h7133HeatLevel === "auto" ? "Auto" : `Nivel ${h7133HeatLevel}`})`
                    : currentH7133Mode === "fan"
                    ? "🌪️ Fan Manual Activo (Sin Calefacción)"
                    : "💤 En Reposo"}
                </span>
                {tempSensor && (
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      color: "#F8FAFC",
                      background: "rgba(255, 255, 255, 0.08)",
                      padding: "2px 7px",
                      borderRadius: "6px",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                    }}
                  >
                    🌡️ {tempSensor.state} {tempSensor.attributes?.unit_of_measurement || "°F"}
                  </span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                <button
                  type="button"
                  onClick={(e) => handleSetH7133Mode(e, "fan")}
                  style={{
                    padding: "6px 4px",
                    borderRadius: "8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    border:
                      currentH7133Mode === "fan"
                        ? "1.5px solid #38BDF8"
                        : "1px solid rgba(255, 255, 255, 0.1)",
                    background:
                      currentH7133Mode === "fan"
                        ? "rgba(2, 132, 199, 0.35)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: currentH7133Mode === "fan" ? "#38BDF8" : "#94A3B8",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    transition: "all 0.15s ease",
                  }}
                  title="Activar ventilador en modo manual sin calefactor"
                >
                  <span style={{ fontSize: "14px" }}>🌪️</span>
                  <span>Fan Manual</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSetH7133Mode(e, "heat")}
                  style={{
                    padding: "6px 4px",
                    borderRadius: "8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    border:
                      currentH7133Mode === "heat"
                        ? "1.5px solid #FB923C"
                        : "1px solid rgba(255, 255, 255, 0.1)",
                    background:
                      currentH7133Mode === "heat"
                        ? "rgba(234, 88, 12, 0.35)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: currentH7133Mode === "heat" ? "#FB923C" : "#94A3B8",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    transition: "all 0.15s ease",
                  }}
                  title="Activar modo calefactor con ventilación"
                >
                  <span style={{ fontSize: "14px" }}>🔥</span>
                  <span>Calefactor</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSetH7133Mode(e, "off")}
                  style={{
                    padding: "6px 4px",
                    borderRadius: "8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    border:
                      currentH7133Mode === "off"
                        ? "1.5px solid #94A3B8"
                        : "1px solid rgba(255, 255, 255, 0.1)",
                    background:
                      currentH7133Mode === "off"
                        ? "rgba(148, 163, 184, 0.25)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: currentH7133Mode === "off" ? "#FFF" : "#94A3B8",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    transition: "all 0.15s ease",
                  }}
                  title="Apagar ventilador y calefactor"
                >
                  <span style={{ fontSize: "14px" }}>💤</span>
                  <span>Apagar</span>
                </button>
              </div>

              {/* Fan Speed & Oscillation Controls when in fan mode */}
              {currentH7133Mode === "fan" && (
                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* Speed Bar: Low (1), Med (2), High (3) */}
                  <div>
                    <div
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 600,
                        color: "#38BDF8",
                        marginBottom: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Velocidad ventilador:</span>
                      <span style={{ color: "#BAE6FD" }}>
                        {h7133FanSpeedPct <= 33
                          ? "1 · Bajo (Low · 33%)"
                          : h7133FanSpeedPct <= 66
                          ? "2 · Medio (Med · 66%)"
                          : "3 · Alto (High · 100%)"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "4px" }}>
                      {[
                        { id: "low", label: "1 · Low", desc: "Velocidad baja (33%)", match: h7133FanSpeedPct <= 33 },
                        { id: "med", label: "2 · Med", desc: "Velocidad media (66%)", match: h7133FanSpeedPct > 33 && h7133FanSpeedPct <= 66 },
                        { id: "high", label: "3 · High", desc: "Velocidad máxima (100%)", match: h7133FanSpeedPct > 66 },
                      ].map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={(e) => handleSetH7133FanSpeed(e, s.id as "low" | "med" | "high")}
                          style={{
                            padding: "6px 2px",
                            borderRadius: "6px",
                            fontSize: "0.7rem",
                            fontWeight: s.match ? 700 : 500,
                            border: s.match
                              ? "1.5px solid #38BDF8"
                              : "1px solid rgba(255, 255, 255, 0.12)",
                            background: s.match
                              ? "rgba(14, 165, 233, 0.4)"
                              : "rgba(255, 255, 255, 0.05)",
                            color: s.match ? "#E0F2FE" : "#94A3B8",
                            cursor: "pointer",
                            textAlign: "center",
                            transition: "all 0.15s ease",
                          }}
                          title={s.desc}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Oscillation Bar: Horizontal, Vertical, Todo (3D), Fijo */}
                  <div>
                    <div
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 600,
                        color: "#38BDF8",
                        marginBottom: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Rango / Oscilación:</span>
                      <span style={{ color: "#BAE6FD" }}>
                        {h7133Oscillation === "horizontal"
                          ? "Horizontal (↔️)"
                          : h7133Oscillation === "vertical"
                          ? "Vertical (↕️)"
                          : h7133Oscillation === "all"
                          ? "3D Todo (🔄)"
                          : "Fijo (Off)"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px" }}>
                      {[
                        { id: "horizontal", label: "↔️ Horiz", desc: "Oscilación horizontal izquierda-derecha" },
                        { id: "vertical", label: "↕️ Vert", desc: "Oscilación vertical arriba-abajo" },
                        { id: "all", label: "🔄 Todo", desc: "Oscilación completa 3D (Arriba, Abajo y Lados)" },
                        { id: "off", label: "⏸️ Fijo", desc: "Sin oscilación (Fijo)" },
                      ].map((osc) => {
                        const isSelected = h7133Oscillation === osc.id;
                        return (
                          <button
                            key={osc.id}
                            type="button"
                            onClick={(e) => handleSetOscillation(e, osc.id as any)}
                            style={{
                              padding: "6px 2px",
                              borderRadius: "6px",
                              fontSize: "0.7rem",
                              fontWeight: isSelected ? 700 : 500,
                              border: isSelected
                                ? "1.5px solid #38BDF8"
                                : "1px solid rgba(255, 255, 255, 0.12)",
                              background: isSelected
                                ? "rgba(14, 165, 233, 0.35)"
                                : "rgba(255, 255, 255, 0.05)",
                              color: isSelected ? "#E0F2FE" : "#94A3B8",
                              cursor: "pointer",
                              textAlign: "center",
                              transition: "all 0.15s ease",
                            }}
                            title={osc.desc}
                          >
                            {osc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Heat Level & Oscillation Selector when in heat mode */}
              {currentH7133Mode === "heat" && (
                <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div>
                    <div
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 600,
                        color: "#FB923C",
                        marginBottom: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Potencia calefactor:</span>
                      <span style={{ color: "#FED7AA" }}>
                        {h7133HeatLevel === "1"
                          ? "Nivel 1 (Bajo · 33%)"
                          : h7133HeatLevel === "2"
                          ? "Nivel 2 (Medio · 66%)"
                          : h7133HeatLevel === "3"
                          ? "Nivel 3 (Alto · 100%)"
                          : "Modo Auto (Termostato)"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px" }}>
                      {[
                        { id: "1", label: "1 · Bajo", desc: "Calefacción suave (Nivel 1)" },
                        { id: "2", label: "2 · Medio", desc: "Calefacción moderada (Nivel 2)" },
                        { id: "3", label: "3 · Alto", desc: "Calefacción máxima (Nivel 3)" },
                        { id: "auto", label: "🌡️ Auto", desc: "Termostato automático" },
                      ].map((lvl) => {
                        const isSelected = h7133HeatLevel === lvl.id;
                        return (
                          <button
                            key={lvl.id}
                            type="button"
                            onClick={(e) => handleSetH7133HeatLevel(e, lvl.id as "1" | "2" | "3" | "auto")}
                            style={{
                              padding: "6px 2px",
                              borderRadius: "6px",
                              fontSize: "0.7rem",
                              fontWeight: isSelected ? 700 : 500,
                              border: isSelected
                                ? "1.5px solid #FB923C"
                                : "1px solid rgba(255, 255, 255, 0.12)",
                              background: isSelected
                                ? "rgba(234, 88, 12, 0.45)"
                                : "rgba(255, 255, 255, 0.05)",
                              color: isSelected ? "#FED7AA" : "#94A3B8",
                              cursor: "pointer",
                              textAlign: "center",
                              transition: "all 0.15s ease",
                            }}
                            title={lvl.desc}
                          >
                            {lvl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Oscillation Bar in Heat Mode */}
                  <div>
                    <div
                      style={{
                        fontSize: "0.66rem",
                        fontWeight: 600,
                        color: "#FB923C",
                        marginBottom: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span>Rango / Oscilación:</span>
                      <span style={{ color: "#FED7AA" }}>
                        {h7133Oscillation === "horizontal"
                          ? "Horizontal (↔️)"
                          : h7133Oscillation === "vertical"
                          ? "Vertical (↕️)"
                          : h7133Oscillation === "all"
                          ? "3D Todo (🔄)"
                          : "Fijo (Off)"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "4px" }}>
                      {[
                        { id: "horizontal", label: "↔️ Horiz", desc: "Oscilación horizontal izquierda-derecha" },
                        { id: "vertical", label: "↕️ Vert", desc: "Oscilación vertical arriba-abajo" },
                        { id: "all", label: "🔄 Todo", desc: "Oscilación completa 3D" },
                        { id: "off", label: "⏸️ Fijo", desc: "Sin oscilación (Fijo)" },
                      ].map((osc) => {
                        const isSelected = h7133Oscillation === osc.id;
                        return (
                          <button
                            key={osc.id}
                            type="button"
                            onClick={(e) => handleSetOscillation(e, osc.id as any)}
                            style={{
                              padding: "6px 2px",
                              borderRadius: "6px",
                              fontSize: "0.7rem",
                              fontWeight: isSelected ? 700 : 500,
                              border: isSelected
                                ? "1.5px solid #FB923C"
                                : "1px solid rgba(255, 255, 255, 0.12)",
                              background: isSelected
                                ? "rgba(234, 88, 12, 0.35)"
                                : "rgba(255, 255, 255, 0.05)",
                              color: isSelected ? "#FED7AA" : "#94A3B8",
                              cursor: "pointer",
                              textAlign: "center",
                              transition: "all 0.15s ease",
                            }}
                            title={osc.desc}
                          >
                            {osc.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Fan sub-control with spinning icon & speed slider */}
          {fanEntity && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.28)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.09)",
                borderRadius: "14px",
                padding: "8px 10px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AppleHomeIcon
                    domain="fan"
                    state={(isH7133 ? currentH7133Mode !== "off" : fanEntity.state === "on") ? "on" : "off"}
                    attributes={fanEntity.attributes}
                    size={24}
                  />
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f8fafc" }}>
                      {fanEntity.name || "Ventilador"}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: isH7133
                          ? currentH7133Mode === "heat"
                            ? "#FB923C"
                            : currentH7133Mode === "fan"
                            ? "#38BDF8"
                            : "#94A3B8"
                          : fanEntity.state === "on"
                          ? "#38BDF8"
                          : "#94A3B8",
                      }}
                    >
                      {isH7133
                        ? currentH7133Mode === "heat"
                          ? `Calefacción activa (${h7133HeatLevel === "auto" ? "Auto" : `Nivel ${h7133HeatLevel}`})${h7133Oscillation !== "off" ? ` · 🔄 ${h7133Oscillation === "all" ? "3D Todo" : h7133Oscillation === "vertical" ? "Vertical" : "Horizontal"}` : ""}`
                          : currentH7133Mode === "fan"
                          ? `Ventilación pura · ${typeof fanEntity.attributes?.percentage === "number" && fanEntity.attributes.percentage > 0 ? fanEntity.attributes.percentage : h7133FanSpeedPct}%${h7133Oscillation !== "off" ? ` · 🔄 ${h7133Oscillation === "all" ? "3D Todo" : h7133Oscillation === "vertical" ? "Vertical" : "Horizontal"}` : ""}`
                          : "Apagado"
                        : fanEntity.state === "on"
                        ? `Encendido · ${fanEntity.attributes?.percentage ?? 100}%`
                        : "Apagado"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={`quick-toggle-pill ${
                    (isH7133 ? currentH7133Mode !== "off" : fanEntity.state === "on") ? "active" : "inactive"
                  }`}
                  onClick={(e) => {
                    if (isH7133) {
                      handleSetH7133Mode(e, currentH7133Mode === "off" ? "fan" : "off");
                    } else {
                      handleToggleEntity(e, fanEntity.entityId);
                    }
                  }}
                  disabled={togglingEntityIds.has(fanEntity.entityId)}
                  title="Conmutar ventilador"
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              <LiquidSlider
                entityId={fanEntity.entityId}
                domain={isH7133 ? "h7133_fan" : (fanEntity.domain || "fan")}
                initialValue={
                  typeof fanEntity.attributes?.percentage === "number" && fanEntity.attributes.percentage > 0
                    ? fanEntity.attributes.percentage
                    : isH7133 && currentH7133Mode === "fan"
                    ? h7133FanSpeedPct
                    : (isH7133 ? currentH7133Mode !== "off" : fanEntity.state === "on")
                    ? 100
                    : 0
                }
                color={isH7133 && currentH7133Mode === "heat" ? "#FB923C" : "var(--apple-cyan, #007aff)"}
                label="Velocidad ventilador"
                onChange={(val) => {
                  if (isH7133) {
                    setH7133FanSpeedPct(val);
                    try {
                      window.localStorage.setItem(`govee_h7133_fan_speed_pct_${device.id}`, String(val));
                    } catch {}
                    if (currentH7133Mode === "fan") {
                      executeH7133FanMode(val);
                    }
                  }
                }}
                onRefresh={onRefresh}
              />
            </div>
          )}

          {/* Light sub-control with compact bulb, toggle, level & interactive Kelvin picker */}
          {lightEntity && (
            <div
              style={{
                background: "rgba(0, 0, 0, 0.28)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: isLightActive
                  ? `1px solid rgba(${lr}, ${lg}, ${lb}, 0.35)`
                  : "1px solid rgba(255, 255, 255, 0.09)",
                borderRadius: "14px",
                padding: "8px 10px",
                transition: "border-color 0.4s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <AppleHomeIcon domain="light" state={lightEntity.state} attributes={lightEntity.attributes} size={24} />
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f8fafc" }}>
                      {lightEntity.name || "Luz"}
                    </div>
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: lightEntity.state === "on" ? `rgb(${lr}, ${lg}, ${lb})` : "#94a3b8",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {lightEntity.state === "on" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowKelvinPicker((prev) => !prev);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            background: showKelvinPicker
                              ? "rgba(255, 255, 255, 0.16)"
                              : "rgba(255, 255, 255, 0.06)",
                            border: showKelvinPicker
                              ? `1px solid rgb(${lr}, ${lg}, ${lb})`
                              : "1px solid rgba(255, 255, 255, 0.12)",
                            borderRadius: "6px",
                            padding: "2px 6px",
                            color: "#f8fafc",
                            fontSize: "0.70rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                          }}
                          title="Clic para graduar Kelvin y temperatura de color"
                        >
                          <span
                            style={{
                              width: "7px",
                              height: "7px",
                              borderRadius: "50%",
                              background: lightColorInfo.hex,
                              boxShadow: `0 0 6px ${lightColorInfo.hex}`,
                              display: "inline-block",
                              flexShrink: 0,
                            }}
                          />
                          <span>
                            {lightEntity.attributes?.brightness
                              ? `${Math.round((lightEntity.attributes.brightness / 255) * 100)}% · `
                              : ""}
                            {currentKelvin}K
                          </span>
                          <span style={{ fontSize: "0.6rem", opacity: 0.8 }}>
                            {showKelvinPicker ? "▲" : "▼"}
                          </span>
                        </button>
                      ) : (
                        <span>Apagada</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Small toggle switch to activate/deactivate */}
                <button
                  type="button"
                  className={`quick-toggle-pill ${lightEntity.state === "on" ? "active" : "inactive"}`}
                  onClick={(e) => handleToggleEntity(e, lightEntity.entityId)}
                  disabled={togglingEntityIds.has(lightEntity.entityId)}
                  title="Conmutar luz"
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              {/* Brightness Dimmer Slider */}
              <LiquidSlider
                entityId={lightEntity.entityId}
                domain="light"
                initialValue={
                  lightEntity.attributes?.brightness
                    ? Math.round((lightEntity.attributes.brightness / 255) * 100)
                    : lightEntity.state === "on"
                    ? 100
                    : 0
                }
                color={`rgb(${lr}, ${lg}, ${lb})`}
                label="Brillo luz"
                onRefresh={onRefresh}
              />

              {/* Interactive Kelvin Temperature Selector Panel */}
              {showKelvinPicker && lightEntity.state === "on" && (
                <div
                  style={{
                    marginTop: "8px",
                    padding: "8px 10px",
                    background: "rgba(0, 0, 0, 0.4)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "10px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.70rem", fontWeight: 700, color: "#cbd5e1" }}>
                      🌡️ Temperatura: <strong style={{ color: lightColorInfo.hex }}>{currentKelvin}K</strong>
                    </span>
                    <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>
                      {lightColorInfo.label}
                    </span>
                  </div>

                  {/* Gradient Kelvin Range Slider */}
                  <input
                    type="range"
                    min="2000"
                    max="6500"
                    step="50"
                    value={currentKelvin}
                    onChange={(e) => handleSetKelvin(Number(e.target.value))}
                    style={{
                      width: "100%",
                      height: "8px",
                      borderRadius: "4px",
                      appearance: "none",
                      outline: "none",
                      cursor: "pointer",
                      background: "linear-gradient(to right, #ff9329 0%, #ffbe76 35%, #fff2e0 60%, #e0f2fe 80%, #bae6fd 100%)",
                      boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
                    }}
                    title="Deslizar para ajustar grados Kelvin (2000K - 6500K)"
                  />

                  {/* Quick Preset Buttons */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                    <button
                      type="button"
                      onClick={() => handleSetKelvin(2700)}
                      style={{
                        padding: "4px 2px",
                        fontSize: "0.68rem",
                        fontWeight: currentKelvin <= 3000 ? 700 : 500,
                        borderRadius: "6px",
                        border: currentKelvin <= 3000 ? "1px solid #ffbe76" : "1px solid rgba(255,255,255,0.08)",
                        background: currentKelvin <= 3000 ? "rgba(255, 190, 118, 0.25)" : "rgba(255,255,255,0.04)",
                        color: "#fff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      🟠 2700K Cálido
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetKelvin(4000)}
                      style={{
                        padding: "4px 2px",
                        fontSize: "0.68rem",
                        fontWeight: currentKelvin > 3000 && currentKelvin < 5500 ? 700 : 500,
                        borderRadius: "6px",
                        border: currentKelvin > 3000 && currentKelvin < 5500 ? "1px solid #fff2e0" : "1px solid rgba(255,255,255,0.08)",
                        background: currentKelvin > 3000 && currentKelvin < 5500 ? "rgba(255, 255, 255, 0.22)" : "rgba(255,255,255,0.04)",
                        color: "#fff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      🟡 4000K Neutro
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetKelvin(6500)}
                      style={{
                        padding: "4px 2px",
                        fontSize: "0.68rem",
                        fontWeight: currentKelvin >= 5500 ? 700 : 500,
                        borderRadius: "6px",
                        border: currentKelvin >= 5500 ? "1px solid #bae6fd" : "1px solid rgba(255,255,255,0.08)",
                        background: currentKelvin >= 5500 ? "rgba(186, 230, 253, 0.25)" : "rgba(255,255,255,0.04)",
                        color: "#fff",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      ⚪ 6500K Frío
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Multi-Gang Switch row: When there are 2 or more switches, render them horizontally in a sleek grid! */}
          {switchEntities.length >= 2 ? (
            <div
              className="multi-gang-switches-cluster"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                background: "rgba(0, 0, 0, 0.28)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "8px 10px",
                backdropFilter: "blur(10px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8" }}>
                  Canales ({switchEntities.length})
                </span>
                <span style={{ fontSize: "0.72rem", color: switchEntities.some(s => s.state === "on") ? "#38BDF8" : "#64748B" }}>
                  {switchEntities.filter(s => s.state === "on").length} encendido{switchEntities.filter(s => s.state === "on").length === 1 ? "" : "s"}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(switchEntities.length, 4)}, 1fr)`,
                  gap: "6px",
                }}
              >
                {switchEntities.map((sw, idx) => {
                  const isSwOn = sw.state === "on";
                  const cleanLabel = sw.name
                    ? sw.name.replace(device.name, "").replace(/interruptor/i, "").trim() || `Canal ${idx + 1}`
                    : `Canal ${idx + 1}`;
                  return (
                    <button
                      key={sw.entityId}
                      type="button"
                      onClick={(e) => handleToggleEntity(e, sw.entityId)}
                      disabled={togglingEntityIds.has(sw.entityId)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "8px 4px",
                        borderRadius: "10px",
                        background: isSwOn ? "rgba(56, 189, 248, 0.18)" : "rgba(255, 255, 255, 0.04)",
                        border: isSwOn ? "1.5px solid #38BDF8" : "1px solid rgba(255, 255, 255, 0.08)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        gap: "4px",
                      }}
                      title={`Conmutar ${sw.name || `Canal ${idx + 1}`}`}
                    >
                      <AppleHomeIcon domain="switch" state={sw.state} size={18} />
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          color: isSwOn ? "#FFFFFF" : "#94A3B8",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          maxWidth: "100%",
                        }}
                      >
                        {cleanLabel}
                      </span>
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background: isSwOn ? "#38BDF8" : "rgba(255, 255, 255, 0.25)",
                          boxShadow: isSwOn ? "0 0 8px #38BDF8" : "none",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            switchEntities.map((sw) => {
              const isHeaterSwitch =
                sw.entityId.toLowerCase().includes("auto_stop") ||
                sw.entityId.toLowerCase().includes("heater") ||
                sw.entityId.toLowerCase().includes("calefactor") ||
                (sw.name || "").toLowerCase().includes("auto_stop") ||
                (sw.name || "").toLowerCase().includes("calefactor") ||
                (sw.name || "").toLowerCase().includes("heater");
              const switchLabel = isHeaterSwitch
                ? "Calefactor / Auto-Stop"
                : sw.name || "Interruptor";
              const isSwActive = sw.state === "on";

              return (
                <div
                  key={sw.entityId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "6px 10px",
                    background: isHeaterSwitch && isSwActive ? "rgba(234, 88, 12, 0.22)" : "rgba(0, 0, 0, 0.18)",
                    border: isHeaterSwitch && isSwActive ? "1px solid rgba(251, 146, 60, 0.35)" : "1px solid rgba(255, 255, 255, 0.06)",
                    borderRadius: "10px",
                    transition: "all 0.25s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    {isHeaterSwitch ? (
                      <span style={{ fontSize: "16px", filter: isSwActive ? "drop-shadow(0 0 6px #FF6A00)" : "none" }}>
                        🔥
                      </span>
                    ) : (
                      <AppleHomeIcon domain="switch" state={sw.state} size={18} />
                    )}
                    <span
                      style={{
                        fontSize: "0.76rem",
                        color: isHeaterSwitch && isSwActive ? "#FFD8A8" : "#e2e8f0",
                        fontWeight: isHeaterSwitch ? 600 : 400,
                      }}
                    >
                      {switchLabel}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`quick-toggle-pill ${isSwActive ? "active" : "inactive"}`}
                    onClick={(e) => handleToggleEntity(e, sw.entityId)}
                    disabled={togglingEntityIds.has(sw.entityId)}
                    style={{
                      transform: "scale(0.85)",
                      background: isHeaterSwitch && isSwActive ? "#EA580C" : undefined,
                    }}
                    title={isHeaterSwitch ? "Conmutar calefactor" : `Conmutar ${sw.name || "interruptor"}`}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SINGLE CONTROLLABLE SLIDER (Standalone Light, Fan, Cover) */}
      {!isComposite && isControllable && primaryEntity && (
        <div style={{ position: "relative", zIndex: 3, marginTop: 8 }}>
          {primaryDomain === "light" && (
            <LiquidSlider
              entityId={primaryEntity.entityId}
              domain="light"
              initialValue={
                primaryAttributes.brightness
                  ? Math.round((primaryAttributes.brightness / 255) * 100)
                  : isOn
                  ? 100
                  : 0
              }
              color={`rgb(${lr}, ${lg}, ${lb})`}
              label="Brillo"
              onRefresh={onRefresh}
            />
          )}
          {primaryDomain === "fan" && (
            <LiquidSlider
              entityId={primaryEntity.entityId}
              domain="fan"
              initialValue={
                typeof primaryAttributes.percentage === "number"
                  ? primaryAttributes.percentage
                  : isOn
                  ? 100
                  : 0
              }
              color="var(--apple-cyan, #007aff)"
              label="Velocidad"
              onRefresh={onRefresh}
            />
          )}
          {primaryDomain === "cover" && (
            <LiquidSlider
              entityId={primaryEntity.entityId}
              domain="cover"
              initialValue={
                typeof primaryAttributes.current_position === "number"
                  ? primaryAttributes.current_position
                  : 0
              }
              color="var(--apple-blue, #38bdf8)"
              label="Posición"
              onRefresh={onRefresh}
            />
          )}
          {primaryDomain === "media_player" && (
            <div
              className="media-player-controls"
              style={{
                background: "rgba(0, 0, 0, 0.35)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "14px",
                padding: "8px 10px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Transport Buttons: Previous, Play/Pause, Next */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "14px" }}>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await api.mediaAction(primaryEntity.entityId, "media_previous_track");
                      onRefresh?.();
                    } catch {}
                  }}
                  title="Pista anterior"
                  style={{ width: "32px", height: "32px", borderRadius: "50%", padding: 0, display: "grid", placeItems: "center", fontSize: "0.85rem", color: "#CBD5E1" }}
                >
                  ⏮
                </button>
                <button
                  type="button"
                  className={`quick-toggle-pill ${isOn ? "active" : "inactive"}`}
                  onClick={(e) => handleToggleEntity(e, primaryEntity.entityId)}
                  title={primaryState === "playing" ? "Pausar" : "Reproducir"}
                  style={{ width: "38px", height: "38px", borderRadius: "50%", padding: 0, display: "grid", placeItems: "center", fontSize: "1rem" }}
                >
                  {primaryState === "playing" ? "⏸" : "▶"}
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await api.mediaAction(primaryEntity.entityId, "media_next_track");
                      onRefresh?.();
                    } catch {}
                  }}
                  title="Siguiente pista"
                  style={{ width: "32px", height: "32px", borderRadius: "50%", padding: 0, display: "grid", placeItems: "center", fontSize: "0.85rem", color: "#CBD5E1" }}
                >
                  ⏭
                </button>
              </div>

              {/* Volume Slider */}
              {typeof primaryAttributes.volume_level === "number" && (
                <LiquidSlider
                  entityId={primaryEntity.entityId}
                  domain="media_player"
                  initialValue={Math.round(primaryAttributes.volume_level * 100)}
                  color="var(--apple-blue, #007aff)"
                  label="Volumen"
                  onRefresh={onRefresh}
                />
              )}
            </div>
          )}
        </div>
      )}


      <div className="card-footer" style={{ position: "relative", zIndex: 2 }}>
        <span className="entity-summary">
          {device.entities.length} entidad{device.entities.length === 1 ? "" : "es"}
        </span>
        {!isDashboardMode ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
          >
            Configurar
          </button>
        ) : (
          <span className="dashboard-action-hint">
            {isControllable ? "Toca para conmutar" : "Solo lectura"}
          </span>
        )}
      </div>
    </article>
  );
};

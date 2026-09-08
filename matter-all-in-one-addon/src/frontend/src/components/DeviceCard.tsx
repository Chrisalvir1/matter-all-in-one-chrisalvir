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

  // Check heating mode (explicit climate entity or heater switch, excluding auto_stop)
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
  const isHeating =
    (heaterEntity?.domain === "climate" && (heaterEntity.state === "heat" || heaterEntity.state === "on")) ||
    (heaterEntity?.domain === "switch" && heaterEntity.state === "on");

  // Only show exported switch channels on the card face — non-exported hidden until modal,
  // EXCEPT if this is a standalone switch device with no fan/light, keep at least the first switch visible
  const rawSwitchEntities = device.entities.filter(
    (e) =>
      e.domain === "switch" &&
      e.entityId !== fanEntity?.entityId &&
      (!isH7133 || e.entityId !== heaterEntity?.entityId)
  );
  const switchEntities = rawSwitchEntities.filter((e) => e.exported).length > 0
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
  const isOn =
    primaryState === "on" ||
    primaryState === "playing" ||
    primaryState === "heat" ||
    primaryState === "cool" ||
    primaryState === "open" ||
    primaryState === "unlocked" ||
    primaryState === "cleaning" ||
    isHeating;

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
    statusSummary = isHeating
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

  const handleSetH7133Mode = async (e: React.MouseEvent, mode: "fan" | "heat" | "off") => {
    e.stopPropagation();
    try {
      if (mode === "fan") {
        if (heaterEntity && heaterEntity.state === "on") {
          await api.turnOffEntity(heaterEntity.entityId);
        }
        if (fanEntity && fanEntity.state !== "on") {
          await api.turnOnEntity(fanEntity.entityId);
        }
      } else if (mode === "heat") {
        if (fanEntity && fanEntity.state !== "on") {
          await api.turnOnEntity(fanEntity.entityId);
        }
        if (heaterEntity && heaterEntity.state !== "on") {
          await api.turnOnEntity(heaterEntity.entityId);
        }
      } else {
        if (heaterEntity && heaterEntity.state === "on") {
          await api.turnOffEntity(heaterEntity.entityId);
        }
        if (fanEntity && fanEntity.state === "on") {
          await api.turnOffEntity(fanEntity.entityId);
        }
      }
      onRefresh?.();
    } catch (err) {
      console.error("Error setting H7133 mode:", err);
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
          typeof fanEntity?.attributes?.percentage === "number"
            ? fanEntity.attributes.percentage
            : primaryDomain === "fan" && typeof primaryAttributes?.percentage === "number"
            ? primaryAttributes.percentage
            : (fanEntity ? fanEntity.state === "on" : primaryDomain === "fan" && isOn) || isHeating
            ? 100
            : 0
        }
        isFanOn={(fanEntity ? fanEntity.state === "on" : primaryDomain === "fan" && isOn) || isHeating}
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
                border: isHeating
                  ? "1.5px solid rgba(251, 146, 60, 0.5)"
                  : "1px solid rgba(56, 189, 248, 0.3)",
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
                    color: isHeating ? "#FB923C" : fanEntity?.state === "on" ? "#38BDF8" : "#94A3B8",
                  }}
                >
                  {isHeating
                    ? "🔥 Calefactor Activo"
                    : fanEntity?.state === "on"
                    ? "🌪️ Fan Manual Activo"
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
                      fanEntity?.state === "on" && !isHeating
                        ? "1.5px solid #38BDF8"
                        : "1px solid rgba(255, 255, 255, 0.1)",
                    background:
                      fanEntity?.state === "on" && !isHeating
                        ? "rgba(2, 132, 199, 0.35)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: "#FFF",
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
                    border: isHeating ? "1.5px solid #FB923C" : "1px solid rgba(255, 255, 255, 0.1)",
                    background: isHeating ? "rgba(234, 88, 12, 0.35)" : "rgba(255, 255, 255, 0.04)",
                    color: "#FFF",
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
                      (!fanEntity || fanEntity.state !== "on") && !isHeating
                        ? "1.5px solid #94A3B8"
                        : "1px solid rgba(255, 255, 255, 0.1)",
                    background:
                      (!fanEntity || fanEntity.state !== "on") && !isHeating
                        ? "rgba(148, 163, 184, 0.25)"
                        : "rgba(255, 255, 255, 0.04)",
                    color: (!fanEntity || fanEntity.state !== "on") && !isHeating ? "#FFF" : "#94A3B8",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "2px",
                    transition: "all 0.15s ease",
                  }}
                  title="Apagar ventilador y calefactor"
                >
                  <span style={{ fontSize: "14px" }}>🛑</span>
                  <span>Apagar</span>
                </button>
              </div>
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
                  <AppleHomeIcon domain="fan" state={fanEntity.state} attributes={fanEntity.attributes} size={24} />
                  <div>
                    <div style={{ fontSize: "0.82rem", fontWeight: 600, color: "#f8fafc" }}>
                      {fanEntity.name || "Ventilador"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: fanEntity.state === "on" ? "#38bdf8" : "#94a3b8" }}>
                      {fanEntity.state === "on"
                        ? `Encendido · ${fanEntity.attributes?.percentage ?? 100}%`
                        : "Apagado"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={`quick-toggle-pill ${fanEntity.state === "on" ? "active" : "inactive"}`}
                  onClick={(e) => handleToggleEntity(e, fanEntity.entityId)}
                  disabled={togglingEntityIds.has(fanEntity.entityId)}
                  title="Conmutar ventilador"
                >
                  <span className="toggle-thumb" />
                </button>
              </div>

              <LiquidSlider
                entityId={fanEntity.entityId}
                domain="fan"
                initialValue={
                  typeof fanEntity.attributes?.percentage === "number"
                    ? fanEntity.attributes.percentage
                    : fanEntity.state === "on"
                    ? 100
                    : 0
                }
                color="var(--apple-cyan, #007aff)"
                label="Velocidad ventilador"
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

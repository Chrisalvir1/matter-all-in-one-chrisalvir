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

  const lightEntity = device.entities.find((e) => e.domain === "light");

  // Only show exported switch channels on the card face — non-exported hidden until modal,
  // EXCEPT if this is a standalone switch device with no fan/light, keep at least the first switch visible
  const rawSwitchEntities = device.entities.filter((e) => e.domain === "switch" && e.entityId !== fanEntity?.entityId);
  const switchEntities = rawSwitchEntities.filter((e) => e.exported).length > 0
    ? rawSwitchEntities.filter((e) => e.exported)
    : (!fanEntity && !lightEntity ? rawSwitchEntities.slice(0, 3) : []);

  const coverEntity = device.entities.find((e) => e.domain === "cover");

  const isComposite = (Boolean(fanEntity) && Boolean(lightEntity)) || (deviceInfo.subtype === "multi_gang_switch" && switchEntities.length > 1);

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
    primaryState === "cleaning";

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
    statusSummary = isOn
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

  // Card dynamic illumination style based on Kelvin / RGB
  const cardIlluminationStyle: React.CSSProperties = isLightActive
    ? {
        borderColor: `rgba(${lr}, ${lg}, ${lb}, ${Math.min(0.7, 0.35 * lightBrightness + 0.25)})`,
        boxShadow: `0 16px 40px rgba(0, 0, 0, 0.55), 0 0 ${Math.round(
          28 * lightBrightness
        )}px rgba(${lr}, ${lg}, ${lb}, ${0.35 * lightBrightness}), inset 0 1px 0 rgba(${lr}, ${lg}, ${lb}, ${0.5 * lightBrightness})`,
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
            : (fanEntity ? fanEntity.state === "on" : primaryDomain === "fan" && isOn)
            ? 100
            : 0
        }
        isFanOn={fanEntity ? fanEntity.state === "on" : primaryDomain === "fan" && isOn}
        lightRgb={[lr, lg, lb]}
        lightBrightness={lightBrightness}
        isLightOn={isLightActive}
        subtype={deviceInfo.subtype}
        brand={deviceInfo.brand}
        model={deviceInfo.model}
        appleColor={deviceInfo.appleColor}
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

          {/* Light sub-control with glowing icon, Kelvin hue & dimmer slider */}
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
                      {lightEntity.state === "on" && (
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
                      )}
                      <span>
                        {lightEntity.state === "on"
                          ? `Encendida${
                              lightEntity.attributes?.brightness
                                ? ` · ${Math.round((lightEntity.attributes.brightness / 255) * 100)}%`
                                : ""
                            } · ${lightColorInfo.label}`
                          : "Apagada"}
                      </span>
                    </div>
                  </div>
                </div>

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
            switchEntities.map((sw) => (
              <div
                key={sw.entityId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 10px",
                  background: "rgba(0, 0, 0, 0.18)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <AppleHomeIcon domain="switch" state={sw.state} size={18} />
                  <span style={{ fontSize: "0.76rem", color: "#e2e8f0" }}>{sw.name || "Interruptor"}</span>
                </div>
                <button
                  type="button"
                  className={`quick-toggle-pill ${sw.state === "on" ? "active" : "inactive"}`}
                  onClick={(e) => handleToggleEntity(e, sw.entityId)}
                  disabled={togglingEntityIds.has(sw.entityId)}
                  style={{ transform: "scale(0.85)" }}
                  title={`Conmutar ${sw.name || "interruptor"}`}
                >
                  <span className="toggle-thumb" />
                </button>
              </div>
            ))
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

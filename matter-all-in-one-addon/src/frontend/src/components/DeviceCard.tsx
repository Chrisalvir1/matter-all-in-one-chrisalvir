import React, { useState } from "react";
import { DeviceRecord } from "../types";
import { AppleHomeIcon } from "./AppleHomeIcon";
import { DeviceCardArt } from "./DeviceCardArt";
import { LiquidSlider } from "./LiquidSlider";
import { extractLightColor } from "../utils/colors";
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

  const deviceInfo = detectDevice(device);

  const exported = device.entities.filter((e) => e.exported).length;
  const isMqtt = device.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."));
  const hasIssue = device.entities.some((e) => e.exported && e.hasIssue);

  // Sub-entities breakdown
  const fanEntity = device.entities.find((e) => e.domain === "fan");
  const lightEntity = device.entities.find((e) => e.domain === "light");
  const switchEntities = device.entities.filter((e) => e.domain === "switch");
  const coverEntity = device.entities.find((e) => e.domain === "cover");

  const controllableCount = device.entities.filter((e) =>
    ["light", "fan", "switch", "cover", "climate", "lock", "humidifier", "vacuum", "media_player"].includes(e.domain)
  ).length;

  const isComposite = (Boolean(fanEntity) && Boolean(lightEntity)) || controllableCount > 1;

  // Domain priority: Prioritize media_player (Apple TV, HomePod), climate, fan
  const domainPriority = ["media_player", "climate", "fan", "lock", "cover", "vacuum", "camera", "humidifier", "light", "switch", "sensor"];
  const sortedEntities = [...device.entities].sort((a, b) => {
    const idxA = domainPriority.indexOf(a.domain);
    const idxB = domainPriority.indexOf(b.domain);
    return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
  });

  const primaryEntity = sortedEntities[0] || device.entities[0];
  const primaryDomain = primaryEntity?.domain || "switch";
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
  const [lr, lg, lb] = extractLightColor(activeLight?.attributes);
  const lightBrightness = activeLight
    ? typeof activeLight.attributes?.brightness === "number"
      ? activeLight.attributes.brightness / 255
      : isLightActive
      ? 1.0
      : 0
    : 0;

  // Status text description
  let statusSummary = isOn ? "Activo" : "Inactivo";
  if (primaryDomain === "media_player") {
    const title = primaryAttributes.media_title;
    const app = primaryAttributes.app_name;
    const artist = primaryAttributes.media_artist;
    const isPlaying = primaryState === "playing";
    const isPaused = primaryState === "paused";
    statusSummary = isPlaying
      ? `${title || app || "Reproduciendo"}${artist ? ` · ${artist}` : ""}`
      : isPaused
      ? "En pausa"
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
    statusSummary = isOn ? `Encendida${pct ? ` · ${pct}%` : ""}` : "Apagada";
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
      />

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

      <div style={{ position: "relative", zIndex: 2 }}>
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
                      }}
                    >
                      {lightEntity.state === "on"
                        ? `Encendida${
                            lightEntity.attributes?.brightness
                              ? ` · ${Math.round((lightEntity.attributes.brightness / 255) * 100)}%`
                              : ""
                          }`
                        : "Apagada"}
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

          {/* Switch sub-controls (e.g. oscillation, etc.) */}
          {switchEntities.map((sw) => (
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
          ))}
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

      <div className="tags" style={{ position: "relative", zIndex: 2, marginTop: "10px" }}>
        {isMqtt && <span className="tag tag-mqtt">📡 MQTT</span>}
        <span
          className="tag tag-brand"
          style={{
            color: deviceInfo.accentColor,
            borderColor: `rgba(${deviceInfo.brandColor}, 0.35)`,
            background: `rgba(${deviceInfo.brandColor}, 0.08)`,
          }}
        >
          {deviceInfo.brand}
        </span>
        {deviceInfo.model && <span className="tag">{deviceInfo.model}</span>}
        {hasIssue && <span className="tag tag-warning">Revisar</span>}
        {domains.map((dom) => (
          <span className="tag" key={dom}>
            {dom}
          </span>
        ))}
      </div>

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

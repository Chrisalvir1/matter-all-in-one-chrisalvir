import React, { useState } from "react";
import { DeviceRecord } from "../types";
import { AppleHomeIcon } from "./AppleHomeIcon";
import { DeviceCardArt } from "./DeviceCardArt";
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
  const [isToggling, setIsToggling] = useState(false);
  const exported = device.entities.filter((e) => e.exported).length;
  const isMqtt = device.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."));
  const hasIssue = device.entities.some((e) => e.exported && e.hasIssue);

  const primaryEntity = device.entities[0];
  const primaryDomain = primaryEntity?.domain || "switch";
  const primaryState = primaryEntity?.state || "off";
  const primaryAttributes = primaryEntity?.attributes || {};

  const domains = [...new Set(device.entities.map((e) => e.domain))].slice(0, 3);

  const brandInfo = device.manufacturer
    ? `${device.manufacturer}${device.model ? ` (${device.model})` : ""}`
    : "";
  const originText = isMqtt
    ? "MQTT Auto-Discovery"
    : brandInfo
      ? `${brandInfo}${device.area ? ` · 📍 ${device.area}` : ""}`
      : device.area
        ? `📍 ${device.area} · Home Assistant`
        : "Home Assistant";

  // Check if primary domain is controllable via toggle
  const isControllable = ["light", "switch", "fan", "climate", "lock", "cover", "humidifier"].includes(
    primaryDomain
  );
  const isOn =
    primaryState === "on" ||
    primaryState === "heat" ||
    primaryState === "cool" ||
    primaryState === "open" ||
    primaryState === "unlocked";

  // Status text description
  let statusSummary = isOn ? "Activo" : "Inactivo";
  if (primaryDomain === "fan") {
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

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!primaryEntity || !isControllable || isToggling) return;
    setIsToggling(true);
    try {
      await api.toggleDeviceState(primaryEntity.entityId);
      onRefresh?.();
    } catch (err) {
      console.error("Error toggling entity:", err);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <article
      className={`device-card apple-home-card liquid-glass-card ${
        isDashboardMode ? "dashboard-mode" : ""
      } ${hasIssue ? "needs-attention" : ""} ${
        exported === 0 ? "is-unexported" : "is-exported"
      }`}
      onClick={isDashboardMode && isControllable ? handleToggle : onConfigure}
      style={{ position: "relative" }}
    >
      {/* Dynamic Apple Home Artwork Background with Deep Dark Gradient */}
      <DeviceCardArt
        domain={primaryDomain}
        state={primaryState}
        attributes={primaryAttributes}
      />

      {/* Card Header & Controls (z-index: 2 for absolute click priority) */}
      <div className="card-top" style={{ position: "relative", zIndex: 2 }}>
        <button
          type="button"
          className={`card-icon-button ${isControllable ? "is-clickable" : ""}`}
          onClick={isControllable ? handleToggle : undefined}
          title={isControllable ? `Conmutar ${device.name}` : undefined}
          disabled={isToggling}
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

          {isControllable && (
            <button
              type="button"
              className={`quick-toggle-pill ${isOn ? "active" : "inactive"}`}
              onClick={handleToggle}
              disabled={isToggling}
              aria-label={isOn ? "Apagar" : "Encender"}
              title={isOn ? "Apagar dispositivo" : "Encender dispositivo"}
            >
              <span className="toggle-thumb" />
            </button>
          )}
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 2 }}>
        <h3 title={device.name}>{device.name}</h3>
        <p className="device-status-highlight">{statusSummary}</p>
        <p className="device-meta">{originText}</p>
      </div>

      <div className="tags" style={{ position: "relative", zIndex: 2 }}>
        {isMqtt && <span className="tag tag-mqtt">📡 MQTT</span>}
        {device.manufacturer && <span className="tag tag-brand">{device.manufacturer}</span>}
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
      </div>
    </article>
  );
};

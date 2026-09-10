import React from "react";
import { DeviceRecord, EntityRecord } from "../types";

interface DeviceCardProps {
  device: DeviceRecord;
  searchQuery: string;
  onConfigure: () => void;
}

function getDomainIcon(domain: string): string {
  switch (domain) {
    case "light":
      return "💡";
    case "switch":
      return "🔌";
    case "camera":
      return "📹";
    case "climate":
      return "❄️";
    case "fan":
      return "🌀";
    case "cover":
      return "🪟";
    case "lock":
      return "🔒";
    case "sensor":
      return "🌡️";
    case "binary_sensor":
      return "🔔";
    case "vacuum":
      return "🤖";
    case "humidifier":
      return "💧";
    default:
      return "⚡";
  }
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, searchQuery, onConfigure }) => {
  const isComposite =
    device.entities.some((e) => e.composite || e.isComposite || e.compositeDeviceId) ||
    (device.entities.some((e) => e.domain === "fan") &&
     device.entities.some((e) => e.domain === "light"));

  const compositeExported =
    isComposite && device.entities.some((e) => e.exported && !e.auxiliary);
  const exported = device.entities.filter((e) => e.exported).length;
  const isMqtt = device.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."));
  const hasIssue = device.entities.some((e) => e.exported && e.hasIssue);
  const fanEntity = device.entities.find((e) => e.domain === "fan");
  const primaryDomain = isComposite
    ? (fanEntity ? "fan" : "light")
    : (device.entities[0]?.domain || "switch");

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

  return (
    <article
      className={`device-card ${hasIssue ? "needs-attention" : ""}`}
      onClick={onConfigure}
    >
      <div className="card-top">
        <span className="device-icon">{getDomainIcon(primaryDomain)}</span>
        <span
          className={`export-badge ${
            isComposite
              ? compositeExported
                ? "active"
                : ""
              : exported
              ? "active"
              : ""
          }`}
        >
          {isComposite
            ? compositeExported
              ? "1/1 Matter"
              : "0/1 Matter"
            : `${exported}/${device.entities.length}`}
        </span>
      </div>
      <h3 title={device.name}>{device.name}</h3>
      <p className="device-meta">{originText}</p>
      <div className="tags">
        {isComposite && (
          <span
            className="tag"
            style={{
              background: "rgba(59, 130, 246, 0.15)",
              color: "#60a5fa",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              fontWeight: 600,
            }}
          >
            ⚡ Unificado (1 QR)
          </span>
        )}
        {isMqtt && <span className="tag tag-mqtt">📡 MQTT</span>}
        {device.manufacturer && <span className="tag tag-brand">{device.manufacturer}</span>}
        {hasIssue && <span className="tag tag-warning">Revisar</span>}
        {domains.map((dom) => (
          <span className="tag" key={dom}>
            {dom}
          </span>
        ))}
      </div>
      <div className="card-footer">
        <span className="entity-summary">
          {isComposite
            ? `1 accesorio · ${device.entities.length} entidad${device.entities.length === 1 ? "" : "es"}`
            : `${device.entities.length} entidad${device.entities.length === 1 ? "" : "es"}`}
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

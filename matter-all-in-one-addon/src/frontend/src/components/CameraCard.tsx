import React from "react";
import { CameraRecord, DeviceRecord } from "../types";

interface CameraCardProps {
  camera?: CameraRecord;
  haDevice?: DeviceRecord;
  onConfigure: () => void;
}

export function extractCameraBrand(item: CameraRecord | DeviceRecord | undefined | null): string {
  if (!item) return "Marca no identificada";
  const name = ("name" in item ? item.name : "") || "";
  const model = ("displayModel" in item ? item.displayModel : "model" in item ? item.model : "") || "";
  const mfr = ("displayManufacturer" in item ? item.displayManufacturer : "manufacturer" in item ? item.manufacturer : "") || "";

  const knownBrands = [
    "EZVIZ",
    "Tapo",
    "TP-Link",
    "Reolink",
    "Eufy",
    "Hikvision",
    "Dahua",
    "Aqara",
    "Nest",
    "Ring",
    "UniFi",
    "Amcrest",
    "Imou",
    "Wyze",
    "Tuya",
    "Sonoff",
    "Blink",
    "Foscam",
    "Axis",
    "Wansview",
  ];

  for (const b of knownBrands) {
    const reg = new RegExp(`\\b${b}\\b`, "i");
    if (reg.test(name) || reg.test(model) || reg.test(mfr)) {
      return b.toUpperCase();
    }
  }

  if (mfr && mfr.toLowerCase() !== "desconocido") return mfr.toUpperCase();
  return "Marca no identificada";
}

export const CameraCard: React.FC<CameraCardProps> = ({ camera, haDevice, onConfigure }) => {
  if (camera) {
    const isOnline = camera.status?.connection === "online" || camera.status?.isOnline !== false;
    const brand = extractCameraBrand(camera);
    const modelDisplay = camera.displayModel || camera.model || "";
    const sn = camera.displaySerialNumber || camera.serialNumber || (camera.cameraId ? `CAM-${camera.cameraId}` : "");

    const realSensors = (camera.sensors || []).filter(
      (s) =>
        s.type === "motion" ||
        s.type === "doorbell" ||
        s.name?.toLowerCase().includes("movimiento") ||
        s.name?.toLowerCase().includes("timbre") ||
        s.name?.toLowerCase().includes("motion")
    );

    const entitiesCount = 1 + realSensors.length;

    return (
      <article
        className="device-card scrypted-camera-card is-scrypted-camera"
        onClick={onConfigure}
      >
        <div className="card-top">
          <span className="device-icon" style={{ fontSize: "1.2rem" }}>📹</span>
          <div className="card-pills-group" style={{ display: "flex", gap: 5 }}>
            <span className="badge-scrypted-tag">SCRYPTED</span>
            <span
              className="tag"
              style={{
                fontSize: "0.68rem",
                background: isOnline ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: isOnline ? "#6ee7b7" : "#fca5a5",
                borderColor: isOnline ? "rgba(52, 211, 153, 0.4)" : "rgba(239, 68, 68, 0.4)",
              }}
            >
              {isOnline ? "🟢 En línea" : "🔴 Desconectada"}
            </span>
          </div>
        </div>
        <h3 title={camera.name}>{camera.name}</h3>
        <p className="device-meta">
          {brand}
          {modelDisplay && modelDisplay !== "Modelo no identificado" ? ` (${modelDisplay})` : ""}
          {sn ? ` · SN: ${sn}` : ""}
        </p>
        <div className="tags">
          {realSensors.map((s, idx) => (
            <span className="tag" key={idx}>
              {s.type === "doorbell" || s.name?.toLowerCase().includes("timbre") ? "🔔 Timbre" : "🏃 Movimiento"}
            </span>
          ))}
        </div>
        <div className="card-footer">
          <span className="entity-summary">
            {entitiesCount} entidad{entitiesCount === 1 ? "" : "es"}
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
  }

  if (haDevice) {
    const brand = extractCameraBrand(haDevice);
    const camEntities = haDevice.entities.filter((e) => e.domain === "camera");
    const realSensors = haDevice.entities.filter(
      (e) =>
        e.domain === "binary_sensor" &&
        (e.entityId.includes("motion") ||
          e.entityId.includes("doorbell") ||
          e.entityId.includes("movimiento") ||
          e.entityId.includes("timbre"))
    );
    const entitiesCount = camEntities.length + realSensors.length;
    const isExported = haDevice.entities.some((e) => e.exported);

    return (
      <article className="device-card ha-camera-card" onClick={onConfigure}>
        <div className="card-top">
          <span className="device-icon" style={{ fontSize: "1.2rem" }}>📹</span>
          <div className="card-pills-group" style={{ display: "flex", gap: 5 }}>
            <span className="tag tag-brand">HOME ASSISTANT</span>
            {isExported && <span className="tag tag-mqtt">EN MATTER</span>}
          </div>
        </div>
        <h3 title={haDevice.name}>{haDevice.name}</h3>
        <p className="device-meta">
          {brand}
          {haDevice.model ? ` (${haDevice.model})` : ""}
          {haDevice.area ? ` · 📍 ${haDevice.area}` : ""}
        </p>
        <div className="tags">
          {realSensors.map((s, idx) => (
            <span className="tag" key={idx}>
              {s.entityId.includes("doorbell") || s.entityId.includes("timbre") ? "🔔 Timbre" : "🏃 Movimiento"}
            </span>
          ))}
        </div>
        <div className="card-footer">
          <span className="entity-summary">
            {entitiesCount} entidad{entitiesCount === 1 ? "" : "es"}
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
  }

  return null;
};

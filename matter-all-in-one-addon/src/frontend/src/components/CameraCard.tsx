import React from "react";
import { CameraRecord, CameraUiCameraItem, DeviceRecord } from "../types";

interface CameraCardProps {
  camera?: CameraRecord;
  haDevice?: DeviceRecord;
  cameraUiCamera?: CameraUiCameraItem;
  onConfigure: () => void;
}

export function extractCameraBrand(item: CameraRecord | DeviceRecord | CameraUiCameraItem): string {
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

export const CameraCard: React.FC<CameraCardProps> = ({
  camera,
  haDevice,
  cameraUiCamera,
  onConfigure,
}) => {
  if (camera) {
    const isOnline = camera.status?.connection === "online" || camera.status?.isOnline !== false;
    const isHapPaired = camera.identity?.homeKitPairingState === "paired";
    const isMatterPaired = camera.bindingState?.matterCommissioned === true;
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
          <div className="card-pills-group" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span className="badge-scrypted-tag">SCRYPTED</span>
            {isHapPaired && (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#6ee7b7",
                  border: "1px solid rgba(52, 211, 153, 0.4)",
                  fontWeight: 600,
                }}
              >
                🍏 HAP Apple Home
              </span>
            )}
            {isMatterPaired && (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(59, 130, 246, 0.15)",
                  color: "#60a5fa",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  fontWeight: 600,
                }}
              >
                ⚡ Matter
              </span>
            )}
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

  if (cameraUiCamera) {
    const isOnline = cameraUiCamera.homeKitEnabled !== false;
    const isHapPaired = cameraUiCamera.isPaired === true;
    const brand = extractCameraBrand(cameraUiCamera);
    const modelDisplay = cameraUiCamera.model || "Cámara RTSP";
    const sn = cameraUiCamera.id.toUpperCase();

    const sensors: string[] = [];
    if (cameraUiCamera.motionTopic || cameraUiCamera.motionActive) sensors.push("🏃 Movimiento");
    if (cameraUiCamera.doorbellTopic || cameraUiCamera.doorbellActive) sensors.push("🔔 Timbre");

    const resolutionLabel =
      cameraUiCamera.width && cameraUiCamera.height
        ? `${cameraUiCamera.width >= 2304 ? "2K" : cameraUiCamera.width >= 3840 ? "4K" : "1080p"} · Passthrough`
        : "HD · Passthrough";

    return (
      <article
        className="device-card cameraui-camera-card"
        onClick={onConfigure}
        style={{ borderLeft: "3px solid #a855f7" }}
      >
        <div className="card-top">
          <span className="device-icon" style={{ fontSize: "1.2rem" }}>🎥</span>
          <div className="card-pills-group" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span className="badge-cameraui-tag">CAMERA.UI</span>
            {isHapPaired ? (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#6ee7b7",
                  border: "1px solid rgba(52, 211, 153, 0.4)",
                  fontWeight: 600,
                }}
              >
                🍏 HAP Vinculado en Apple Home
              </span>
            ) : (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fde68a",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  fontWeight: 600,
                }}
              >
                ⏳ Pendiente HAP
              </span>
            )}
            <span
              className="tag"
              style={{
                fontSize: "0.68rem",
                background: isOnline ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
                color: isOnline ? "#6ee7b7" : "#fca5a5",
                borderColor: isOnline ? "rgba(52, 211, 153, 0.4)" : "rgba(239, 68, 68, 0.4)",
              }}
            >
              {isOnline ? "🟢 En línea" : "🔴 Desactivada"}
            </span>
          </div>
        </div>

        <h3 title={cameraUiCamera.name}>{cameraUiCamera.name}</h3>
        <p className="device-meta">
          {brand} · {modelDisplay} · <code>{sn}</code>
        </p>

        <div className="tags">
          <span
            className="tag"
            style={{
              fontSize: "0.7rem",
              background: "rgba(16, 185, 129, 0.12)",
              color: "#6ee7b7",
              border: "1px solid rgba(52, 211, 153, 0.3)",
            }}
          >
            ⚡ {resolutionLabel}
          </span>
          {cameraUiCamera.hasAudio !== false && (
            <span
              className="tag"
              style={{
                fontSize: "0.7rem",
                background: "rgba(59, 130, 246, 0.12)",
                color: "#93c5fd",
                border: "1px solid rgba(59, 130, 246, 0.3)",
              }}
            >
              🔊 Audio 24kbps AAC-ELD
            </span>
          )}
          {sensors.map((s, idx) => (
            <span className="tag" key={idx}>
              {s}
            </span>
          ))}
        </div>

        <div className="card-footer">
          <span className="entity-summary" style={{ fontSize: "0.78rem" }}>
            PIN: <strong>{cameraUiCamera.pincode || "031-45-154"}</strong>
          </span>
          <button
            className="button button-secondary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onConfigure();
            }}
          >
            Ver QR / Vincular
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
    const isCommissioned = haDevice.entities.some((e) => e.exported && e.commissioned);

    return (
      <article className="device-card ha-camera-card" onClick={onConfigure}>
        <div className="card-top">
          <span className="device-icon" style={{ fontSize: "1.2rem" }}>📹</span>
          <div className="card-pills-group" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span className="badge-ha-tag">HOME ASSISTANT</span>
            {isCommissioned && (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#6ee7b7",
                  border: "1px solid rgba(52, 211, 153, 0.4)",
                  fontWeight: 600,
                }}
              >
                🍏 Matter Vinculado
              </span>
            )}
            {!isCommissioned && isExported && <span className="tag tag-mqtt">EN MATTER</span>}
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

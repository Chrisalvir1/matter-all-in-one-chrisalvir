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
    "Google",
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
    const isOnline = camera.status?.connection === "online" && camera.status?.isOnline === true;
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
                🍏 Enlazada a Casa
              </span>
            ) : (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fcd34d",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  fontWeight: 600,
                }}
              >
                ⚠️ No enlazada a Casa
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
        <div className="card-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="entity-summary">
            {entitiesCount} entidad{entitiesCount === 1 ? "" : "es"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {!isHapPaired && (
              <button
                className="button button-primary"
                type="button"
                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigure();
                }}
              >
                📲 Enlazar QR
              </button>
            )}
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
        </div>
      </article>
    );
  }

  if (cameraUiCamera) {
    const isOnline = cameraUiCamera.status === "online" && cameraUiCamera.homeKitEnabled !== false;
    const isHapPaired = cameraUiCamera.isPaired === true;
    const brand = extractCameraBrand(cameraUiCamera);
    const modelDisplay = cameraUiCamera.model && cameraUiCamera.model !== "Cámara RTSP" ? cameraUiCamera.model : "";
    const sn = cameraUiCamera.serialNumber || (cameraUiCamera.id.startsWith("cameraui_") ? "" : cameraUiCamera.id);

    // Only real sensors and entities verified from hardware or Home Assistant
    const realSensors: string[] = [];
    if (cameraUiCamera.realEntities && cameraUiCamera.realEntities.length > 0) {
      for (const ent of cameraUiCamera.realEntities) {
        if (ent.type === "motion" && !realSensors.includes("🏃 Movimiento")) realSensors.push("🏃 Movimiento");
        if (ent.type === "light" && !realSensors.includes("💡 Luz")) realSensors.push("💡 Luz");
        if (ent.type === "siren" && !realSensors.includes("🚨 Sirena")) realSensors.push("🚨 Sirena");
        if (ent.type === "doorbell" && !realSensors.includes("🔔 Timbre")) realSensors.push("🔔 Timbre");
      }
    } else {
      if (cameraUiCamera.motionTopic || cameraUiCamera.motionActive) realSensors.push("🏃 Movimiento");
      if (cameraUiCamera.hasLight) realSensors.push("💡 Luz");
      if (cameraUiCamera.hasSiren) realSensors.push("🚨 Sirena");
      if (cameraUiCamera.doorbellTopic || cameraUiCamera.doorbellActive) realSensors.push("🔔 Timbre");
    }

    const entitiesCount = 1 + realSensors.length;

    return (
      <article
        className="device-card cameraui-camera-card"
        onClick={onConfigure}
        style={{ borderLeft: "3px solid #a855f7" }}
      >
        <div className="card-top">
          <span className="device-icon" style={{ fontSize: "1.2rem" }}>🎥</span>
          <div className="card-pills-group" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span className="badge-cameraui-tag">
              {cameraUiCamera.sourceProvider === "home_assistant" ? "HOME ASSISTANT RTSP" : "CAMERA.UI"}
            </span>
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
                🍏 Enlazada a Casa
              </span>
            ) : (
              <span
                className="tag"
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fcd34d",
                  border: "1px solid rgba(245, 158, 11, 0.4)",
                  fontWeight: 600,
                }}
              >
                ⚠️ No enlazada a Casa
              </span>
            )}
            <span
              className="tag"
              style={{
                fontSize: "0.68rem",
                background: isOnline
                  ? "rgba(16, 185, 129, 0.15)"
                  : cameraUiCamera.homeKitEnabled === false
                    ? "rgba(156, 163, 175, 0.15)"
                    : "rgba(239, 68, 68, 0.15)",
                color: isOnline
                  ? "#6ee7b7"
                  : cameraUiCamera.homeKitEnabled === false
                    ? "#9ca3af"
                    : "#fca5a5",
                borderColor: isOnline
                  ? "rgba(52, 211, 153, 0.4)"
                  : cameraUiCamera.homeKitEnabled === false
                    ? "rgba(156, 163, 175, 0.4)"
                    : "rgba(239, 68, 68, 0.4)",
              }}
            >
              {isOnline
                ? "🟢 En línea"
                : cameraUiCamera.homeKitEnabled === false
                  ? "⚪ Desactivada"
                  : "🔴 Desconectada"}
            </span>
          </div>
        </div>

        <h3 title={cameraUiCamera.name}>{cameraUiCamera.name}</h3>
        <p className="device-meta">
          {brand}
          {modelDisplay ? ` (${modelDisplay})` : ""}
          {sn ? ` · SN: ${sn}` : ""}
        </p>

        <div className="tags">
          {cameraUiCamera.motionActive && (
            <span
              className="tag"
              style={{
                fontSize: "0.72rem",
                background: "rgba(239, 68, 68, 0.25)",
                color: "#ef4444",
                border: "1px solid #ef4444",
                fontWeight: 700,
              }}
            >
              🚨 ¡MOVIMIENTO DETECTADO!{cameraUiCamera.motionSource ? ` (${cameraUiCamera.motionSource.split(' ')[0]})` : ""}
            </span>
          )}
          {realSensors.map((s, idx) => (
            <span className="tag" key={idx}>
              {s}
            </span>
          ))}
        </div>

        <div className="card-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="entity-summary">
            {entitiesCount} entidad{entitiesCount === 1 ? "" : "es"}
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {!isHapPaired && (
              <button
                className="button button-primary"
                type="button"
                style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  onConfigure();
                }}
              >
                📲 Enlazar QR
              </button>
            )}
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

    // Detect Google Nest cameras that need go2rtc configuration
    const isNestCamera =
      brand === "GOOGLE" ||
      brand === "NEST" ||
      haDevice.entities.some(
        (e) => e.domain === "camera" && (e.entityId.includes("nest") || e.entityId.includes("google"))
      );
    const streamStrategy = (haDevice as any).streamStrategy as string | undefined;
    const needsGo2rtc = isNestCamera && streamStrategy === "unsupported";

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
            {needsGo2rtc && (
              <span
                className="tag"
                title="Esta cámara Nest necesita go2rtc configurado para tener live stream en HomeKit. Haz clic en Configurar para ver los pasos."
                style={{
                  fontSize: "0.68rem",
                  background: "rgba(251, 146, 60, 0.15)",
                  color: "#fb923c",
                  border: "1px solid rgba(251, 146, 60, 0.4)",
                  fontWeight: 600,
                  cursor: "help",
                }}
              >
                ⚠️ Nest: Configurar go2rtc
              </span>
            )}
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

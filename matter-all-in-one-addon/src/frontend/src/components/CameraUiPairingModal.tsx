import React, { useState } from "react";
import { CameraUiCameraItem } from "../types";
import { api } from "../api/client";
import { QRCodeDisplay } from "./QRCodeDisplay";
import { extractCameraBrand } from "./CameraCard";

interface CameraUiPairingModalProps {
  camera: CameraUiCameraItem | null;
  onClose: () => void;
  onRefresh: () => void;
  onOpenGlobalSettings: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const CameraUiPairingModal: React.FC<CameraUiPairingModalProps> = ({
  camera,
  onClose,
  onRefresh,
  onOpenGlobalSettings,
  showToast,
}) => {
  const [isResetting, setIsResetting] = useState(false);

  if (!camera) return null;

  const brand = extractCameraBrand(camera);
  const pin = camera.pincode || "031-45-154";
  const setupUri = camera.setupUri || `X-HM://00GW95DQA${(camera.setupId || "CUI1").substring(0, 4)}`;

  const handleResetPairing = async () => {
    setIsResetting(true);
    try {
      const res = await api.resetCameraUiPairing(camera.id);
      if (res.success) {
        showToast("✓ Emparejamiento HAP restablecido. Listo para volver a escanear en Apple Home.");
        onRefresh();
      } else {
        showToast("No se pudo restablecer el emparejamiento", true);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, true);
    } finally {
      setIsResetting(false);
    }
  };

  const resolutionDisplay =
    camera.width && camera.height
      ? `${camera.width >= 2304 ? "2K" : camera.width >= 3840 ? "4K" : "1080p"} (${camera.width}x${camera.height}) @ ${camera.fps || 30}fps`
      : "HD 1080p (RTSP)";

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true">
      <section className="modal" style={{ maxWidth: 580, maxHeight: "92vh", overflowY: "auto" }}>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>

        <header className="modal-header">
          <span className="modal-icon" style={{ fontSize: "1.8rem" }}>🎥</span>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span className="badge-cameraui-tag">CAMERA.UI</span>
              <span
                className="tag"
                style={{
                  fontSize: "0.7rem",
                  background: camera.isPaired ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                  color: camera.isPaired ? "#6ee7b7" : "#fde68a",
                  border: camera.isPaired ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(245, 158, 11, 0.4)",
                  fontWeight: 600,
                }}
              >
                {camera.isPaired ? "🍏 HAP Vinculado en Apple Home" : "⏳ Listo para Vincular"}
              </span>
            </div>
            <h2>{camera.name}</h2>
            <p className="entity-id">
              {brand} · ID: <code>{camera.id}</code> · Puerto HAP: <code>{camera.port || 51860}</code>
            </p>
          </div>
        </header>

        <div style={{ marginTop: 16 }}>
          {/* QR Code and Pairing Section */}
          <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "16px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <QRCodeDisplay
              pairingCode={setupUri}
              pinCode={pin}
              entityName={camera.name}
              elementId={`cameraui-qr-${camera.id}`}
              variant="hap-homekit"
              noteText="Escanea con la app Casa en tu iPhone o iPad (HAP nativo Apple Home)"
            />
          </div>

          {/* Architecture and Streaming Pipeline Specs */}
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 10,
              background: "rgba(139, 92, 246, 0.08)",
              border: "1px solid rgba(139, 92, 246, 0.25)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              fontSize: "0.82rem",
            }}
          >
            <div style={{ fontWeight: 600, color: "#c084fc", display: "flex", alignItems: "center", gap: 6 }}>
              <span>⚡</span>
              <span>Arquitectura de Transmisión Passthrough (0% CPU en Raspberry Pi)</span>
            </div>

            <div style={{ color: "var(--dim)", lineHeight: 1.4 }}>
              Esta cámara se transmite como puente directo a Apple HomeKit. La transcodificación y compresión son procesadas por el servidor de <strong>Camera.UI</strong>, no por Home Assistant ni por la Raspberry Pi.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 10px", borderRadius: 6 }}>
                <span style={{ color: "var(--dim)", display: "block", fontSize: "0.72rem" }}>RESOLUCIÓN Y VÍDEO</span>
                <strong style={{ color: "#6ee7b7" }}>{resolutionDisplay}</strong>
                <span style={{ fontSize: "0.72rem", color: "#34d399", display: "block" }}>✓ Passthrough H.264 / 2K activo</span>
              </div>

              <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 10px", borderRadius: 6 }}>
                <span style={{ color: "var(--dim)", display: "block", fontSize: "0.72rem" }}>AUDIO EN VIVO</span>
                <strong style={{ color: "#6ee7b7" }}>AAC-ELD 24 kbps</strong>
                <span style={{ fontSize: "0.72rem", color: "#34d399", display: "block" }}>✓ Sincronización PTS acústica</span>
              </div>
            </div>

            <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 10px", borderRadius: 6, marginTop: 2, wordBreak: "break-all" }}>
              <span style={{ color: "var(--dim)", display: "block", fontSize: "0.72rem" }}>ORIGEN RTSP DIRECTO</span>
              <code>{camera.rtspUrl}</code>
            </div>

            {(camera.motionTopic || camera.doorbellTopic) && (
              <div style={{ background: "rgba(0,0,0,0.2)", padding: "8px 10px", borderRadius: 6 }}>
                <span style={{ color: "var(--dim)", display: "block", fontSize: "0.72rem" }}>EVENTOS MQTT SUSCRITOS</span>
                {camera.motionTopic && (
                  <div style={{ fontSize: "0.78rem" }}>
                    🏃 Movimiento: <code>{camera.motionTopic}</code>
                  </div>
                )}
                {camera.doorbellTopic && (
                  <div style={{ fontSize: "0.78rem" }}>
                    🔔 Timbre: <code>{camera.doorbellTopic}</code>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleResetPairing}
              disabled={isResetting}
              style={{ fontSize: "0.82rem" }}
              title="Genera un nuevo identificador si Apple Home no detecta la cámara"
            >
              {isResetting ? "Restableciendo..." : "🔄 Restablecer PIN / Emparejamiento"}
            </button>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  onClose();
                  onOpenGlobalSettings();
                }}
                style={{ fontSize: "0.82rem" }}
              >
                ⚙️ Ajustes Camera.UI
              </button>
              <button type="button" className="button button-primary" onClick={onClose} style={{ fontSize: "0.82rem" }}>
                Listo
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

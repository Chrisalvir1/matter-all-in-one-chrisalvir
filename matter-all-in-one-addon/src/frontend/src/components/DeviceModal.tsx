import React, { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { DeviceRecord, EntityRecord } from "../types";
import { api } from "../api/client";

interface DeviceModalProps {
  device: DeviceRecord | null;
  targetEntity?: EntityRecord | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const DeviceModal: React.FC<DeviceModalProps> = ({
  device,
  targetEntity,
  onClose,
  onRefresh,
  showToast,
}) => {
  const [selectedEntity, setSelectedEntity] = useState<EntityRecord | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [multiAdminOpen, setMultiAdminOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!device) return;
    const initial = targetEntity || device.entities[0] || null;
    setSelectedEntity(initial);
    setMultiAdminOpen(false);
  }, [device, targetEntity]);

  const pairingCode = selectedEntity?.pairingCode || device?.entities.find((e) => e.pairingCode)?.pairingCode || "";

  useEffect(() => {
    if (!pairingCode || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pairingCode, {
      width: 180,
      margin: 2,
      color: { dark: "#09101f", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch((err) => console.error("QR error:", err));
  }, [pairingCode, selectedEntity]);

  if (!device) return null;

  const handleToggleExport = async (entity: EntityRecord) => {
    try {
      await api.toggleExport(entity.entityId, !entity.exported);
      entity.exported = !entity.exported;
      showToast(entity.exported ? `✓ ${entity.name} publicado en Matter` : `Retirado de Matter`);
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al modificar publicación", true);
    }
  };

  const handleReconnect = async () => {
    if (!selectedEntity) return;
    setIsBusy(true);
    showToast("Reconectando accesorio Matter...");
    try {
      await api.reconnectAccessory(selectedEntity.compositeDeviceId || selectedEntity.entityId);
      showToast("✓ Accesorio reconectado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al reconectar", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenCommissioning = async () => {
    if (!selectedEntity) return;
    setIsBusy(true);
    try {
      await api.openCommissioning(selectedEntity.entityId);
      setMultiAdminOpen(true);
      showToast("✓ Modo Multi-Admin Abierto. Puedes emparejar en una segunda plataforma.");
    } catch (err: any) {
      showToast(err.message || "Error al abrir Multi-Admin", true);
    } finally {
      setIsBusy(false);
    }
  };

  const logs = selectedEntity?.logs || [];

  return (
    <div className="modal-backdrop open" id="device-modal" role="dialog" aria-modal="true">
      <section className="modal modal-wide" style={{ maxWidth: 900 }}>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <header className="modal-header">
          <span className="modal-icon" style={{ fontSize: "1.8rem" }}>⚡</span>
          <div>
            <p className="eyebrow">DISPOSITIVO FÍSICO MATTER</p>
            <h2>{device.name}</h2>
            <p className="entity-id">
              {device.manufacturer ? `${device.manufacturer} · ` : ""}
              {device.model ? `${device.model} · ` : ""}
              {device.area ? `📍 ${device.area}` : device.id}
            </p>
          </div>
        </header>

        <div className="camera-modal-layout" style={{ gridTemplateColumns: "280px minmax(0, 1fr)" }}>
          {/* Left Column: QR Code */}
          <div className="qr-panel" style={{ textAlign: "center" }}>
            {pairingCode ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
                <canvas ref={canvasRef} style={{ borderRadius: 10, background: "#fff", padding: 6 }} />
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--dim)", textTransform: "uppercase" }}>
                    CÓDIGO MANUAL MATTER
                  </span>
                  <div style={{ fontSize: "1.1rem", fontWeight: 700, letterSpacing: "0.08em" }}>
                    {selectedEntity?.manualPairingCode || pairingCode}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 20, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                Sin código QR disponible para esta entidad.
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button
                className="button button-secondary button-sm"
                id="reconnect-accessory-button"
                type="button"
                onClick={handleReconnect}
                disabled={isBusy}
              >
                Reconectar Accesorio
              </button>
              <button
                className="button button-secondary button-sm"
                id="regenerate-code-button"
                type="button"
                onClick={handleOpenCommissioning}
                disabled={isBusy}
              >
                Abrir Modo Multi-Admin
              </button>
              <button
                className="button button-danger-outline button-sm"
                id="reset-accessory-button"
                type="button"
                onClick={onClose}
              >
                Cerrar
              </button>
            </div>

            {multiAdminOpen && (
              <div id="multi-admin-hint" style={{ marginTop: 10, fontSize: "0.75rem", color: "#34d399", background: "rgba(16,185,129,0.1)", padding: 6, borderRadius: 6 }}>
                ✓ Modo Multi-Admin Abierto
              </div>
            )}
          </div>

          {/* Right Column: Entities list & details */}
          <div className="selection-panel">
            <h4 style={{ margin: "0 0 10px", fontSize: "0.85rem", color: "var(--dim)", textTransform: "uppercase" }}>
              Canales y Endpoints del Accesorio ({device.entities.length})
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
              {device.entities.map((ent) => (
                <div
                  key={ent.entityId}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: selectedEntity?.entityId === ent.entityId ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.03)",
                    border: selectedEntity?.entityId === ent.entityId ? "1px solid rgba(56, 189, 248, 0.4)" : "1px solid rgba(255, 255, 255, 0.06)",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedEntity(ent)}
                >
                  <div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{ent.name || ent.entityId}</div>
                    <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)" }}>
                      {ent.domain} · {ent.entityId}
                    </div>
                  </div>
                  <label
                    style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: "0.75rem" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(ent.exported)}
                      onChange={() => handleToggleExport(ent)}
                    />
                    <span>{ent.exported ? "En Matter" : "Excluido"}</span>
                  </label>
                </div>
              ))}
            </div>

            {/* Fabrics section */}
            <div id="fabrics-section" style={{ marginBottom: 14 }}>
              <h5 style={{ margin: "0 0 6px", fontSize: "0.8rem", color: "var(--dim)" }}>FABRICS / VINCULACIONES</h5>
              <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Desconectar de ecosistemas Matter existentes si cambias de controlador.
              </div>
            </div>

            {/* Diagnostics Logs */}
            <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 8, padding: 10, fontSize: "0.75rem" }}>
              <strong style={{ color: "var(--dim)" }}>HISTORIAL Y DIAGNÓSTICO:</strong>
              {logs.length === 0 ? (
                <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>
                  Sin errores registrados para este accesorio.
                </div>
              ) : (
                logs.map((l, i) => (
                  <div key={i} style={{ marginTop: 2 }}>
                    [{l.timestamp.slice(11, 19)}] {l.message}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

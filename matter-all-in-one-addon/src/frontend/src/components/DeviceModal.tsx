import React, { useState, useEffect } from "react";
import { DeviceRecord, EntityRecord } from "../types";
import { api } from "../api/client";
import { QRCodeDisplay } from "./QRCodeDisplay";

interface DeviceModalProps {
  device: DeviceRecord | null;
  targetEntity?: EntityRecord | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

function getDomainIcon(domain?: string): string {
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

  useEffect(() => {
    if (!device) return;
    const initial = targetEntity || device.entities[0] || null;
    setSelectedEntity(initial);
    setMultiAdminOpen(false);
  }, [device, targetEntity]);

  if (!device) return null;

  const sortedEntities = [...device.entities].sort((a, b) => {
    if (targetEntity) {
      if (a.entityId === targetEntity.entityId) return -1;
      if (b.entityId === targetEntity.entityId) return 1;
    }
    const primaryDelta =
      Number(b.entityId === b.compositePrimaryEntityId) -
      Number(a.entityId === a.compositePrimaryEntityId);
    return (
      primaryDelta ||
      Number(b.exported) - Number(a.exported) ||
      (a.name || a.entityId).localeCompare(b.name || b.entityId)
    );
  });

  const activeEntity = selectedEntity || sortedEntities[0] || null;

  // Pairing code: primary entity's code or selected entity's code
  const pairingCode =
    activeEntity?.pairingCode ||
    device.entities.find((e) => e.pairingCode)?.pairingCode ||
    "";
  const manualCode =
    activeEntity?.manualPairingCode ||
    device.entities.find((e) => e.manualPairingCode)?.manualPairingCode ||
    pairingCode;

  const isExported = Boolean(activeEntity?.exported);
  const isCommissioned = Boolean(activeEntity?.commissioned);

  const handleToggleExport = async (entity: EntityRecord) => {
    setIsBusy(true);
    try {
      const nextState = !entity.exported;
      const res = await api.toggleExport(entity.entityId, nextState);
      entity.exported = nextState;
      if (res?.pairingCode) {
        entity.pairingCode = res.pairingCode;
        if (res.manualPairingCode) entity.manualPairingCode = res.manualPairingCode;
      }
      showToast(
        nextState
          ? `✓ ${entity.name || entity.entityId} publicado en Matter`
          : `Retirado de Matter`
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al modificar publicación", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReconnect = async () => {
    if (!activeEntity) return;
    setIsBusy(true);
    showToast("Reconectando accesorio Matter...");
    try {
      await api.reconnectAccessory(
        activeEntity.compositeDeviceId || activeEntity.entityId
      );
      showToast("✓ Accesorio reconectado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al reconectar", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenCommissioning = async () => {
    if (!activeEntity) return;
    setIsBusy(true);
    try {
      await api.openCommissioning(activeEntity.entityId);
      setMultiAdminOpen(true);
      showToast(
        "✓ Modo Multi-Admin Abierto. Puedes emparejar en una segunda plataforma."
      );
    } catch (err: any) {
      showToast(err.message || "Error al abrir Multi-Admin", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetAccessory = async () => {
    if (!activeEntity) return;
    if (
      !confirm(
        "¿Desconectar este accesorio de todas las casas y generar un nuevo código QR limpio?"
      )
    )
      return;
    setIsBusy(true);
    try {
      await api.resetAccessory(activeEntity.entityId);
      showToast("✓ Accesorio desvinculado y nuevo QR generado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al desvincular", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyDiagnostics = () => {
    if (!activeEntity) return;
    const diagText = JSON.stringify(
      {
        entityId: activeEntity.entityId,
        name: activeEntity.name,
        domain: activeEntity.domain,
        exported: activeEntity.exported,
        commissioned: activeEntity.commissioned,
        logs: selectedEntity?.logs || activeEntity.logs || [],
      },
      null,
      2
    );
    navigator.clipboard.writeText(diagText).then(() => {
      showToast("✓ Diagnóstico copiado al portapapeles");
    });
  };

  const activeNodesCount = new Set(
    device.entities.filter((e) => e.exported).map((e) => e.compositeDeviceId || e.entityId)
  ).size;

  const logs = selectedEntity?.logs || activeEntity?.logs || [];

  return (
    <div
      className="modal-backdrop open"
      id="device-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-modal-name"
    >
      <section
        className="modal modal-wide modal-fullscreen"
        style={{
          width: "min(98vw, 1720px)",
          maxWidth: "98vw",
          height: "min(96vh, 960px)",
          maxHeight: "96vh",
          display: "flex",
          flexDirection: "column",
          padding: "24px 32px",
        }}
      >
        <button
          className="icon-button"
          id="device-modal-close"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          ×
        </button>

        <header className="modal-header" style={{ marginBottom: 8 }}>
          <span className="modal-icon" id="device-modal-icon">
            {getDomainIcon(device.entities[0]?.domain)}
          </span>
          <div>
            <p className="eyebrow">DISPOSITIVO IOT · MATTER ALL-IN-ONE</p>
            <h2 id="device-modal-name">{device.name}</h2>
            <p className="entity-id" id="device-modal-id">
              {device.manufacturer ? `${device.manufacturer} · ` : ""}
              {device.model ? `${device.model} · ` : ""}
              {device.area ? `📍 ${device.area}` : device.id}
            </p>
          </div>
        </header>

        <div className="modal-layout">
          {/* Column 1: Entity List */}
          <div className="entity-list-col" style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
            <div className="section-header">
              <h3>Entidades disponibles</h3>
              <span id="modal-export-count">
                {activeNodesCount
                  ? `${activeNodesCount} accesorio Matter · ${device.entities.filter((e) => e.exported).length}/${device.entities.length} endpoints`
                  : `0/${device.entities.length} publicadas`}
              </span>
            </div>
            <div
              className="entity-list"
              id="entity-list"
              style={{
                flex: 1,
                minHeight: 0,
                maxHeight: "none",
                overflowY: "auto",
              }}
            >
              {sortedEntities.map((ent) => {
                const isSelected = activeEntity?.entityId === ent.entityId;
                return (
                  <div
                    key={ent.entityId}
                    className={`entity-row${ent.exported ? "" : " dimmed"}${isSelected ? " selected" : ""}`}
                    onClick={() => setSelectedEntity(ent)}
                  >
                    <span className="entity-row-icon">
                      {getDomainIcon(ent.domain)}
                    </span>
                    <div>
                      <div className="entity-row-name">
                        {ent.name || ent.entityId}
                      </div>
                      <div className="entity-row-id">{ent.entityId}</div>
                      <span
                        className={`entity-state${ent.state === "on" ? " on" : ""}`}
                      >
                        {ent.state || "desconocido"}
                      </span>
                    </div>
                    <div
                      className="export-control"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={Boolean(ent.exported)}
                          onChange={() => handleToggleExport(ent)}
                        />
                        <span />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Column 2: Selection Panel */}
          <aside
            className="selection-panel"
            id="selection-panel"
            style={{
              flex: 1,
              minHeight: 0,
              maxHeight: "none",
              overflowY: "auto",
              padding: 22,
              gap: 14,
            }}
          >
            <p className="card-label">SELECCIÓN Y CONFIGURACIÓN</p>
            <h3 id="selection-title">
              <span className="selection-title-text">
                {activeEntity?.name || activeEntity?.entityId || "Selecciona una entidad"}
              </span>
              {isCommissioned && (
                <span className="home-badge commissioned">
                  🏠 Vinculado
                </span>
              )}
            </h3>
            <p id="selection-description">
              {isExported
                ? "Esta entidad está activa y expuesta a través de Matter."
                : "Activa el interruptor para publicar este canal en Matter."}
            </p>

            <dl className="selection-meta" id="selection-meta">
              <div>
                <dt>Entidad ID</dt>
                <dd>{activeEntity?.entityId || "—"}</dd>
              </div>
              <div>
                <dt>Dominio</dt>
                <dd>{activeEntity?.domain || "—"}</dd>
              </div>
              {activeEntity?.area_name && (
                <div>
                  <dt>Área</dt>
                  <dd>{activeEntity.area_name}</dd>
                </div>
              )}
              <div>
                <dt>Estado Matter</dt>
                <dd>{isCommissioned ? "Emparejado en red Matter" : isExported ? "Listo para vincular" : "Sin publicar"}</dd>
              </div>
            </dl>

            {/* Fabrics section */}
            <section className="fabrics-section" id="fabrics-section">
              <div className="fabrics-heading">
                <span className="fabrics-icon" aria-hidden="true">🏠</span>
                <strong>Casas / Controladores Conectados</strong>
              </div>
              <p className="fabrics-subtitle">
                Desconectar de ecosistemas Matter existentes si cambias de controlador o si ya eliminaste este accesorio en tu app de Apple Home, Google Home o Alexa.
              </p>
            </section>

            {/* Diagnostics Panel */}
            <section
              className="diagnostics-panel"
              id="diagnostics-panel"
              aria-live="polite"
            >
              <div className="diagnostics-heading">
                <span id="diagnostics-icon" aria-hidden="true">✓</span>
                <strong id="diagnostics-heading-text">Diagnóstico y logs</strong>
                <button
                  id="copy-diagnostics-button"
                  className="copy-diagnostics-button"
                  type="button"
                  onClick={handleCopyDiagnostics}
                  title="Copiar diagnóstico y logs"
                >
                  Copiar
                </button>
              </div>
              <p id="diagnostics-summary">
                {logs.length === 0 ? (
                  "Sin errores registrados para este accesorio."
                ) : (
                  `${logs.length} eventos registrados`
                )}
              </p>
              {logs.length > 0 && (
                <ul id="diagnostics-list">
                  {logs.slice(-6).map((l, i) => (
                    <li key={i}>{typeof l === "string" ? l : (l as any)?.message || JSON.stringify(l)}</li>
                  ))}
                </ul>
              )}
            </section>
          </aside>

          {/* Column 3: QR Panel */}
          <div
            className="qr-panel"
            id="qr-panel"
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 0,
              height: "100%",
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            <p className="card-label">CÓDIGO MATTER</p>
            <div
              className={`qr-status-label${isCommissioned ? " commissioned" : isExported ? " active" : ""}`}
              id="qr-status-label"
            >
              {isCommissioned
                ? "Vinculado a Matter"
                : isExported
                  ? "Listo para emparejar"
                  : "Sin publicar"}
            </div>

            {isCommissioned && !multiAdminOpen && (
              <div className="commissioned-hint" style={{ display: "block" }}>
                <p className="hint-title">🔒 Vinculado a Matter</p>
                <p className="hint-desc">
                  Este accesorio ya tiene una casa registrada en Matter. Para
                  emparejarlo en una segunda plataforma, pulsa «Modo Multi-Admin».
                </p>
              </div>
            )}

            {multiAdminOpen && (
              <div id="multi-admin-hint" className="multi-admin-hint" style={{ display: "block" }}>
                <p className="hint-title">🌐 Modo Multi-Admin Abierto (15 min)</p>
                <p className="hint-desc">
                  Ventana de emparejamiento abierta. Escanea este código QR en
                  <strong> Google Home</strong>, <strong>Alexa</strong> o{" "}
                  <strong>SmartThings</strong>.
                </p>
              </div>
            )}

            {isExported ? (
              <QRCodeDisplay
                pairingCode={pairingCode}
                manualCode={manualCode}
                entityName={activeEntity?.name || device.name}
                elementId="device-qr-code"
              />
            ) : (
              <div
                className="qr-liquid-glass-card"
                style={{
                  padding: 24,
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 14,
                  background: "rgba(255, 255, 255, 0.04)",
                  borderRadius: 16,
                  border: "1px dashed rgba(56, 189, 248, 0.4)",
                }}
              >
                <div style={{ fontSize: 36 }}>⚡</div>
                <div style={{ color: "#FFF", fontSize: 14, fontWeight: 600 }}>
                  Accesorio sin publicar en Matter
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "var(--text-secondary, #94a3b8)", lineHeight: 1.4 }}>
                  Pulsa el botón de abajo para activar esta entidad en Matter y generar de inmediato su código QR.
                </p>
                {activeEntity && (
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => handleToggleExport(activeEntity)}
                    disabled={isBusy}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      fontSize: 13,
                      fontWeight: 700,
                      borderRadius: 10,
                      background: "linear-gradient(135deg, #0284c7, #0369a1)",
                      border: "none",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
                    }}
                  >
                    🚀 Activar y Generar Código QR
                  </button>
                )}
              </div>
            )}

            <div className="accessory-controls" id="accessory-controls" style={{ marginTop: "auto", paddingTop: 12 }}>
              {isExported && (
                <div className="matter-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    className="button button-secondary action-btn"
                    id="reconnect-accessory-button"
                    type="button"
                    onClick={handleReconnect}
                    disabled={isBusy}
                    title="Refresca la conexión con Home Assistant y Matter"
                  >
                    ↻ Recargar / Sincronizar
                  </button>

                  <button
                    className="button button-secondary action-btn"
                    id="regenerate-code-button"
                    type="button"
                    onClick={handleOpenCommissioning}
                    disabled={isBusy}
                  >
                    Abrir Modo Multi-Admin
                  </button>

                  <button
                    className="button button-danger action-btn"
                    id="reset-accessory-button"
                    type="button"
                    onClick={handleResetAccessory}
                    disabled={isBusy}
                    title="Desconectar de todas las casas y generar un nuevo código QR"
                  >
                    Desconectar todo y nuevo QR
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

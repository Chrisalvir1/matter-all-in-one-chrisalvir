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

function getControllerBadge(vendorId?: number | null, controllerName?: string): { icon: string; name: string } {
  const name = controllerName || "Controlador Matter";
  const vid = vendorId !== null && vendorId !== undefined ? Number(vendorId) : null;
  if (vid === 0x1349 || /apple/i.test(name)) {
    return { icon: "🍎", name: "Apple Home" };
  }
  if (vid === 0x6006 || /google/i.test(name)) {
    return { icon: "🌐", name: "Google Home" };
  }
  if (vid === 0x1211 || /amazon|alexa/i.test(name)) {
    return { icon: "🔊", name: "Amazon Alexa" };
  }
  if (
    (vid !== null && [0x10e1, 0x110a, 0x127b, 0x1175, 0x1360].includes(vid)) ||
    /smartthings|samsung/i.test(name)
  ) {
    return { icon: "💠", name: "Samsung SmartThings" };
  }
  if (vid === 0x130d || /home assistant/i.test(name)) {
    return { icon: "🏠", name: "Home Assistant" };
  }
  return { icon: "📱", name };
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
  const [freshPairingCode, setFreshPairingCode] = useState<string | null>(null);
  const [freshManualCode, setFreshManualCode] = useState<string | null>(null);
  const [resetFabrics, setResetFabrics] = useState<boolean>(false);

  const sortedEntities = device
    ? [...device.entities].sort((a, b) => {
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
      })
    : [];

  useEffect(() => {
    if (!device) return;
    const initial = targetEntity || sortedEntities[0] || device.entities[0] || null;
    setSelectedEntity(initial);
    setMultiAdminOpen(false);
    setFreshPairingCode(null);
    setFreshManualCode(null);
    setResetFabrics(false);
  }, [device, targetEntity]);

  if (!device) return null;

  const activeEntity = selectedEntity || sortedEntities[0] || null;

  // Pairing code: fresh code from reset, primary entity's code, or selected entity's code
  const pairingCode =
    freshPairingCode ||
    activeEntity?.pairingCode ||
    device.entities.find((e) => e.pairingCode)?.pairingCode ||
    "";
  const manualCode =
    freshManualCode ||
    activeEntity?.manualPairingCode ||
    device.entities.find((e) => e.manualPairingCode)?.manualPairingCode ||
    "";

  const matterFabrics = resetFabrics
    ? []
    : Array.isArray(activeEntity?.matterFabrics)
    ? activeEntity.matterFabrics
    : Array.isArray(device.entities.find((e) => e.matterFabrics?.length)?.matterFabrics)
    ? device.entities.find((e) => e.matterFabrics?.length)!.matterFabrics!
    : [];

  const isExported = Boolean(activeEntity?.exported);
  const isCommissioned = !resetFabrics && Boolean(activeEntity?.commissioned);

  const handleRemoveFabric = async (fabricIndex: number | string) => {
    if (!activeEntity) return;
    if (!confirm("¿Desconectar este accesorio de este controlador Matter?")) return;
    setIsBusy(true);
    try {
      await api.removeFabric(activeEntity.entityId, fabricIndex);
      showToast("✓ Controlador desconectado");
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al desconectar", true);
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggleExport = async (entity: EntityRecord) => {
    try {
      const nextState = !entity.exported;
      await api.toggleExport(entity.entityId, nextState);
      entity.exported = nextState;
      showToast(
        nextState
          ? `✓ ${entity.name || entity.entityId} publicado en Matter`
          : `Retirado de Matter`
      );
      onRefresh();
    } catch (err: any) {
      showToast(err.message || "Error al modificar publicación", true);
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
        "¿Desconectar este accesorio de todas las casas y generar un nuevo código QR limpio?\n\nIMPORTANTE: Si ya agregaste este accesorio en Apple Home, primero elimínalo de la app Casa (Ajustes -> Eliminar accesorio) para evitar que Apple Home intente reconectar una sesión obsoleta."
      )
    )
      return;
    setIsBusy(true);
    try {
      const res: any = await api.resetAccessory(activeEntity.entityId);
      if (res?.pairingCode || res?.manualPairingCode) {
        setFreshPairingCode(res.pairingCode || null);
        setFreshManualCode(res.manualPairingCode || null);
        setResetFabrics(true);
        activeEntity.pairingCode = res.pairingCode || activeEntity.pairingCode;
        activeEntity.manualPairingCode = res.manualPairingCode || activeEntity.manualPairingCode;
        activeEntity.commissioned = false;
        activeEntity.matterFabrics = [];
      }
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
            {getDomainIcon(activeEntity?.domain || sortedEntities[0]?.domain || device.entities[0]?.domain)}
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

        <div
          className="modal-layout"
          style={{
            display: "grid",
            gridTemplateColumns: "350px minmax(0, 1fr) 420px",
            gap: 24,
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            alignItems: "stretch",
          }}
        >
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

            {/* Matter Profile Selector */}
            {activeEntity && Array.isArray(activeEntity.profiles) && activeEntity.profiles.length > 0 && !activeEntity.auxiliary && (
              <div
                className="profile-field"
                id="profile-field"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  marginTop: 14,
                  padding: 12,
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                }}
              >
                <label
                  htmlFor="profile-select"
                  style={{
                    fontSize: 10,
                    fontWeight: 750,
                    letterSpacing: "0.05em",
                    color: "var(--dim)",
                    textTransform: "uppercase",
                  }}
                >
                  Perfil Matter
                </label>
                <select
                  id="profile-select"
                  aria-label="Perfil Matter"
                  value={activeEntity.profileId || activeEntity.matterType || ""}
                  onChange={async (e) => {
                    const newProfile = e.target.value;
                    try {
                      setIsBusy(true);
                      await api.setDeviceProfile(activeEntity.entityId, newProfile);
                      activeEntity.profileId = newProfile;
                      activeEntity.matterType = newProfile;
                      showToast(`✓ Perfil Matter actualizado a ${newProfile}`);
                      onRefresh();
                    } catch (err: any) {
                      showToast(err.message || "Error al cambiar perfil Matter", true);
                    } finally {
                      setIsBusy(false);
                    }
                  }}
                  disabled={isBusy}
                  style={{
                    width: "100%",
                    padding: "8px 10px",
                    background: "#0b1528",
                    color: "var(--text)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {activeEntity.profiles.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.appleHome === "supported"
                        ? ""
                        : p.appleHome === "experimental"
                        ? " · experimental"
                        : " · no compatible con Apple Home"}
                    </option>
                  ))}
                </select>
                {(() => {
                  const cur =
                    activeEntity.profiles.find(
                      (p: any) =>
                        p.id === (activeEntity.profileId || activeEntity.matterType)
                    ) || activeEntity.profiles[0];
                  return cur ? (
                    <small
                      id="profile-note"
                      style={{ color: "var(--muted)", fontSize: 10, lineHeight: 1.4 }}
                    >
                      {cur.description}
                    </small>
                  ) : null;
                })()}
              </div>
            )}

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

              {matterFabrics.length > 0 ? (
                <div className="fabrics-list">
                  {matterFabrics.map((fabric: any, idx: number) => {
                    const badge = getControllerBadge(fabric.vendorId, fabric.controller);
                    const targetIndex = fabric.fabricIndex ?? fabric.fabricId ?? idx + 1;
                    return (
                      <div key={targetIndex} className="fabric-item">
                        <div className="fabric-info">
                          <div className="fabric-controller-line">
                            <span style={{ fontSize: 15 }}>{badge.icon}</span>
                            <span className="fabric-name">{badge.name}</span>
                          </div>
                          {fabric.label && (
                            <span className="fabric-home-name">
                              Casa: <strong>{fabric.label}</strong>
                            </span>
                          )}
                          <span className="fabric-detail">
                            Fabric {targetIndex}
                            {fabric.vendorId ? ` · VID: 0x${Number(fabric.vendorId).toString(16).toUpperCase()}` : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="button button-danger-outline button-xs"
                          onClick={() => handleRemoveFabric(targetIndex)}
                          disabled={isBusy}
                          title="Desconectar únicamente esta casa"
                          style={{
                            padding: "4px 8px",
                            fontSize: "11px",
                            borderRadius: "6px",
                            cursor: "pointer",
                            background: "rgba(239, 68, 68, 0.15)",
                            color: "#fca5a5",
                            border: "1px solid rgba(239, 68, 68, 0.35)",
                          }}
                        >
                          Desconectar
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", padding: "4px 0" }}>
                  {isCommissioned
                    ? "Sesión registrada en el puente (sin etiquetas de controlador reportadas)."
                    : "No hay casas ni controladores vinculados a este accesorio."}
                </div>
              )}
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
              <div
                className="commissioned-hint"
                style={{
                  display: "block",
                  background: "rgba(245, 158, 11, 0.12)",
                  border: "1px solid rgba(245, 158, 11, 0.3)",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <p className="hint-title" style={{ color: "#fbbf24", fontWeight: 700, margin: "0 0 4px 0" }}>
                  🔒 Sesión Matter Registrada
                </p>
                <p className="hint-desc" style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 10px 0", lineHeight: 1.4 }}>
                  El puente tiene guardada una vinculación previa. Si no lo tienes en Apple Home o no conecta, pulsa «Desconectar todo y nuevo QR» para generar credenciales limpias:
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="button button-danger button-xs"
                    onClick={handleResetAccessory}
                    disabled={isBusy}
                    style={{
                      padding: "6px 10px",
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    🔄 Desconectar y nuevo QR
                  </button>
                  <button
                    type="button"
                    className="button button-secondary button-xs"
                    onClick={handleOpenCommissioning}
                    disabled={isBusy}
                    style={{
                      padding: "6px 10px",
                      fontSize: 11,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                  >
                    Abrir Multi-Admin
                  </button>
                </div>
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
                style={{ padding: 24, textAlign: "center", color: "var(--text-secondary)" }}
              >
                Activa la entidad para generar el código QR de Matter.
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

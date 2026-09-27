import React, { useState } from "react";
import { CameraPtzInfo, PtzZone } from "../types";
import { api } from "../api/client";

interface PtzControlsCardProps {
  cameras: CameraPtzInfo[];
  onRefresh: () => void;
}

export const PtzControlsCard: React.FC<PtzControlsCardProps> = ({
  cameras,
  onRefresh,
}) => {
  const [selectedCameraId, setSelectedCameraId] = useState<string>(
    cameras.length > 0 ? cameras[0].entityId : "",
  );
  const [moving, setMoving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingZone, setEditingZone] = useState<PtzZone | null>(null);

  const activeCamera =
    cameras.find((c) => c.entityId === selectedCameraId) || cameras[0];

  const handleMove = async (
    direction: "up" | "down" | "left" | "right" | "zoom_in" | "zoom_out" | "center",
  ) => {
    if (!activeCamera) return;
    setMoving(direction);
    try {
      await api.sendPtzCommand(activeCamera.entityId, {
        command: "move",
        direction,
        step: 0.1,
      });
      setMessage(`Movimiento ${direction} ejecutado con éxito.`);
      setTimeout(() => setMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setMessage(`Error: ${err.message || err}`);
    } finally {
      setMoving(null);
    }
  };

  const handleActivateZone = async (zoneId: number) => {
    if (!activeCamera) return;
    setMoving(`zone_${zoneId}`);
    try {
      await api.sendPtzCommand(activeCamera.entityId, {
        command: "set_zone_active",
        zone_id: zoneId,
      });
      setMessage(`Zona ${zoneId} activada correctamente.`);
      setTimeout(() => setMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setMessage(`Error al activar zona: ${err.message || err}`);
    } finally {
      setMoving(null);
    }
  };

  const handleExportMatter = async () => {
    try {
      setMessage("Generando exportación Matter 1.6.1 DPTZ...");
      const res = await api.generateMatterPtzExport();
      if (res.success) {
        setMessage(
          `Exportación generada: ${res.exportData?.camerasCount || 0} cámaras listas en generated/ptz-matter-config.json`,
        );
      }
      setTimeout(() => setMessage(null), 5000);
    } catch (err: any) {
      setMessage(`Error en exportación Matter: ${err.message || err}`);
    }
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCamera || !editingZone) return;
    try {
      await api.saveCameraPtzZones(activeCamera.entityId, {
        zone: editingZone,
      });
      setEditingZone(null);
      setMessage("Zona actualizada correctamente.");
      setTimeout(() => setMessage(null), 3000);
      onRefresh();
    } catch (err: any) {
      setMessage(`Error al guardar zona: ${err.message || err}`);
    }
  };

  if (!cameras || cameras.length === 0) {
    return null;
  }

  return (
    <section className="card ptz-card" aria-label="Control PTZ y Zonas" style={{ marginTop: "1.5rem" }}>
      <div className="card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.25rem" }}>📹</span>
            <h3 style={{ margin: 0 }}>Cámaras PTZ y Zonas de Vigilancia (Matter 1.6.1)</h3>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {cameras.length > 1 && (
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              className="button button-secondary"
              style={{ padding: "0.4rem 0.8rem", borderRadius: "8px" }}
            >
              {cameras.map((c) => (
                <option key={c.entityId} value={c.entityId}>
                  {c.name} ({c.ptzType})
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            className="button button-secondary"
            onClick={handleExportMatter}
            title="Exportar configuración Matter DPTZ y Single-Switch a generated/ptz-matter-config.json"
          >
            ⚡ Exportar a Matter
          </button>
        </div>
      </div>

      {message && (
        <div
          style={{
            margin: "0 1.5rem 1rem",
            padding: "0.75rem 1rem",
            borderRadius: "8px",
            background: message.startsWith("Error")
              ? "rgba(239, 68, 68, 0.15)"
              : "rgba(16, 185, 129, 0.15)",
            border: message.startsWith("Error")
              ? "1px solid rgba(239, 68, 68, 0.3)"
              : "1px solid rgba(16, 185, 129, 0.3)",
            color: message.startsWith("Error") ? "#ef4444" : "#10b981",
            fontSize: "0.9rem",
          }}
        >
          {message}
        </div>
      )}

      {activeCamera && (
        <div style={{ padding: "0 1.5rem 1.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.5rem" }}>
          {/* PTZ Pad & Controls */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600 }}>{activeCamera.name}</span>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "0.2rem 0.6rem",
                  borderRadius: "999px",
                  background:
                    activeCamera.ptzType === "hardware"
                      ? "rgba(59, 130, 246, 0.2)"
                      : "rgba(16, 185, 129, 0.2)",
                  color:
                    activeCamera.ptzType === "hardware" ? "#60a5fa" : "#34d399",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {activeCamera.ptzType === "hardware" ? "Hardware PTZ" : "Digital PTZ (DPTZ)"}
              </span>
            </div>

            {/* Directional Pad */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 56px)",
                gridTemplateRows: "repeat(3, 56px)",
                gap: "8px",
                margin: "1rem 0",
              }}
            >
              <div />
              <button
                type="button"
                className="button button-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", padding: 0 }}
                onClick={() => handleMove("up")}
                disabled={moving !== null}
                title="Mover arriba"
              >
                ▲
              </button>
              <div />

              <button
                type="button"
                className="button button-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", padding: 0 }}
                onClick={() => handleMove("left")}
                disabled={moving !== null}
                title="Mover izquierda"
              >
                ◀
              </button>
              <button
                type="button"
                className="button button-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", padding: 0 }}
                onClick={() => handleMove("center")}
                disabled={moving !== null}
                title="Centrar imagen"
              >
                ⊙
              </button>
              <button
                type="button"
                className="button button-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", padding: 0 }}
                onClick={() => handleMove("right")}
                disabled={moving !== null}
                title="Mover derecha"
              >
                ▶
              </button>

              <div />
              <button
                type="button"
                className="button button-secondary"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.25rem", padding: 0 }}
                onClick={() => handleMove("down")}
                disabled={moving !== null}
                title="Mover abajo"
              >
                ▼
              </button>
              <div />
            </div>

            {/* Zoom Controls */}
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: "0.4rem 1rem" }}
                onClick={() => handleMove("zoom_in")}
                disabled={moving !== null}
                title="Zoom in (acercar)"
              >
                🔍 + Zoom In
              </button>
              <button
                type="button"
                className="button button-secondary"
                style={{ padding: "0.4rem 1rem" }}
                onClick={() => handleMove("zoom_out")}
                disabled={moving !== null}
                title="Zoom out (alejar)"
              >
                🔎 - Zoom Out
              </button>
            </div>
          </div>

          {/* Surveillance Zones List */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <div>
                <strong style={{ fontSize: "1rem" }}>Zonas de Vigilancia (1..5)</strong>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Publicadas en MQTT: <code>matter-all-in-one/camera/{activeCamera.entityId.replace(/\./g, "_")}/ptz/zones</code>
                </p>
              </div>
              <span
                style={{
                  fontSize: "0.8rem",
                  padding: "0.2rem 0.5rem",
                  borderRadius: "4px",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                Zona activa: <strong>{activeCamera.currentZoneId ?? 1}</strong>
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {activeCamera.zones.map((zone) => {
                const isActive = activeCamera.currentZoneId === zone.id;
                return (
                  <div
                    key={zone.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.6rem 0.8rem",
                      borderRadius: "8px",
                      background: isActive
                        ? "rgba(99, 102, 241, 0.15)"
                        : "rgba(255, 255, 255, 0.02)",
                      border: isActive
                        ? "1px solid rgba(99, 102, 241, 0.4)"
                        : "1px solid rgba(255, 255, 255, 0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                      <span
                        style={{
                          width: "22px",
                          height: "22px",
                          borderRadius: "50%",
                          background: isActive ? "#6366f1" : "rgba(255,255,255,0.1)",
                          color: "#fff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                        }}
                      >
                        {zone.id}
                      </span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{zone.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          ROI: x={zone.viewport?.x ?? 0}, y={zone.viewport?.y ?? 0}, w={zone.viewport?.width ?? 1}, h={zone.viewport?.height ?? 1}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className={`button ${isActive ? "button-primary" : "button-secondary"}`}
                        style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
                        onClick={() => handleActivateZone(zone.id)}
                        disabled={moving !== null}
                      >
                        {isActive ? "✓ Activa" : "Activar"}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        style={{ padding: "0.3rem 0.5rem", fontSize: "0.8rem" }}
                        onClick={() => setEditingZone(zone)}
                        title="Editar nombre y viewport de la zona"
                      >
                        ✏
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit Zone Modal */}
      {editingZone && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#1e1e2d",
              borderRadius: "12px",
              padding: "1.5rem",
              width: "90%",
              maxWidth: "420px",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <h4 style={{ margin: "0 0 1rem" }}>Editar Zona {editingZone.id}</h4>
            <form onSubmit={handleSaveZone}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>
                  Nombre de la Zona:
                </label>
                <input
                  type="text"
                  value={editingZone.name}
                  onChange={(e) =>
                    setEditingZone({ ...editingZone, name: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#fff",
                  }}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
                <div>
                  <label style={{ display: "block", marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                    X (0.0 - 1.0):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={editingZone.viewport?.x ?? 0}
                    onChange={(e) =>
                      setEditingZone({
                        ...editingZone,
                        viewport: {
                          ...(editingZone.viewport || { x: 0, y: 0, width: 1, height: 1 }),
                          x: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "0.4rem",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                    Y (0.0 - 1.0):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={editingZone.viewport?.y ?? 0}
                    onChange={(e) =>
                      setEditingZone({
                        ...editingZone,
                        viewport: {
                          ...(editingZone.viewport || { x: 0, y: 0, width: 1, height: 1 }),
                          y: parseFloat(e.target.value) || 0,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "0.4rem",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                    Ancho (0.1 - 1.0):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1"
                    value={editingZone.viewport?.width ?? 1}
                    onChange={(e) =>
                      setEditingZone({
                        ...editingZone,
                        viewport: {
                          ...(editingZone.viewport || { x: 0, y: 0, width: 1, height: 1 }),
                          width: parseFloat(e.target.value) || 1,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "0.4rem",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", marginBottom: "0.3rem", fontSize: "0.8rem" }}>
                    Alto (0.1 - 1.0):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="1"
                    value={editingZone.viewport?.height ?? 1}
                    onChange={(e) =>
                      setEditingZone({
                        ...editingZone,
                        viewport: {
                          ...(editingZone.viewport || { x: 0, y: 0, width: 1, height: 1 }),
                          height: parseFloat(e.target.value) || 1,
                        },
                      })
                    }
                    style={{
                      width: "100%",
                      padding: "0.4rem",
                      borderRadius: "6px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "#fff",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEditingZone(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button button-primary">
                  Guardar Zona
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

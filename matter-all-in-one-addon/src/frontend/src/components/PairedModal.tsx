import React, { useState } from "react";
import { DeviceRecord, CameraRecord, CameraUiCameraItem } from "../types";

interface PairedModalProps {
  // Matter paired: IoT devices + HA cameras with Matter commissioned
  matterDevices: DeviceRecord[];
  matterCameras: CameraRecord[];
  matterHaCameras: DeviceRecord[];
  // HAP paired: Camera.UI cameras + Scrypted cameras + HA cameras paired with HomeKit
  cuiCameras?: CameraUiCameraItem[];
  hapCameras: CameraRecord[];
  hapHaCameras: DeviceRecord[];
  onClose: () => void;
  onOpenDevice: (device: DeviceRecord) => void;
  onOpenCuiCamera?: (cam: CameraUiCameraItem) => void;
}

export const PairedModal: React.FC<PairedModalProps> = ({
  matterDevices,
  matterCameras,
  matterHaCameras,
  cuiCameras = [],
  hapCameras,
  hapHaCameras,
  onClose,
  onOpenDevice,
  onOpenCuiCamera,
}) => {
  const [activeTab, setActiveTab] = useState<"matter" | "hap">("matter");

  const totalMatter = matterDevices.length + matterCameras.length + matterHaCameras.length;
  const totalHap = cuiCameras.length + hapCameras.length + hapHaCameras.length;

  return (
    <div
      className="modal-backdrop open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        opacity: 1,
        pointerEvents: "auto",
      }}
    >
      <div
        className="paired-modal modal"
        style={{
          background: "var(--glass)",
          border: "1px solid var(--border)",
          borderRadius: "18px",
          width: "min(900px, 100%)",
          maxHeight: "min(700px, 90vh)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 22px 0", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", marginBottom: 4 }}>DISPOSITIVOS EMPAREJADOS</div>
            <h3 style={{ margin: 0, fontSize: "18px", color: "var(--text)" }}>
              🍏 {totalMatter + totalHap} vinculados en total
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid var(--border)",
              borderRadius: "50%", width: 34, height: 34, cursor: "pointer",
              color: "var(--text)", fontSize: "18px", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", gap: 8, padding: "14px 22px 0", flexShrink: 0,
          borderBottom: "1px solid var(--border)",
        }}>
          <button
            type="button"
            onClick={() => setActiveTab("matter")}
            style={{
              padding: "8px 16px", borderRadius: "10px 10px 0 0",
              background: activeTab === "matter" ? "rgba(16, 185, 129, 0.15)" : "transparent",
              border: activeTab === "matter" ? "1px solid rgba(16,185,129,0.4)" : "1px solid transparent",
              borderBottom: activeTab === "matter" ? "1px solid var(--glass)" : "1px solid transparent",
              color: activeTab === "matter" ? "#34d399" : "var(--muted)",
              cursor: "pointer", fontSize: "13px", fontWeight: 600,
              marginBottom: "-1px",
            }}
          >⚡ Matter <span style={{ opacity: 0.7, fontWeight: 400 }}>({totalMatter})</span></button>
          <button
            type="button"
            onClick={() => setActiveTab("hap")}
            style={{
              padding: "8px 16px", borderRadius: "10px 10px 0 0",
              background: activeTab === "hap" ? "rgba(59, 130, 246, 0.15)" : "transparent",
              border: activeTab === "hap" ? "1px solid rgba(59,130,246,0.4)" : "1px solid transparent",
              borderBottom: activeTab === "hap" ? "1px solid var(--glass)" : "1px solid transparent",
              color: activeTab === "hap" ? "#60a5fa" : "var(--muted)",
              cursor: "pointer", fontSize: "13px", fontWeight: 600,
              marginBottom: "-1px",
            }}
          >🏠 HAP IoT & Cámaras <span style={{ opacity: 0.7, fontWeight: 400 }}>({totalHap})</span></button>
        </div>

        {/* Content: split panel on desktop, stacked on mobile */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {/* Matter Panel */}
          {activeTab === "matter" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
              {totalMatter === 0 ? (
                <p style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>No hay dispositivos emparejados en Matter.</p>
              ) : (
                <>
                  {matterDevices.length > 0 && (
                    <>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 10 }}>IOT DEVICES ({matterDevices.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {matterDevices.map(d => (
                          <button
                            key={d.id} type="button"
                            onClick={() => onOpenDevice(d)}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)",
                              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                              color: "var(--text)", textAlign: "left", width: "100%",
                            }}
                          >
                            <span style={{ fontSize: 20 }}>⚡</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.entities.filter(e => e.exported && e.commissioned).length} entidad(es) emparejada(s)</div>
                            </div>
                            <span style={{ color: "#34d399", fontSize: 11, fontWeight: 600 }}>✓ Matter</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {(matterCameras.length > 0 || matterHaCameras.length > 0) && (
                    <>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 10 }}>CÁMARAS MATTER ({matterCameras.length + matterHaCameras.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {matterCameras.map(c => (
                          <div
                            key={c.cameraId}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)",
                              borderRadius: 10, padding: "10px 14px",
                            }}
                          >
                            <span style={{ fontSize: 20 }}>📹</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>Scrypted · Matter</div>
                            </div>
                            <span style={{ color: "#34d399", fontSize: 11, fontWeight: 600 }}>✓ Matter</span>
                          </div>
                        ))}
                        {matterHaCameras.map(d => (
                          <button
                            key={d.id} type="button"
                            onClick={() => onOpenDevice(d)}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)",
                              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                              color: "var(--text)", textAlign: "left", width: "100%",
                            }}
                          >
                            <span style={{ fontSize: 20 }}>📷</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>HA Camera · Matter</div>
                            </div>
                            <span style={{ color: "#34d399", fontSize: 11, fontWeight: 600 }}>✓ Matter</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* HAP Panel */}
          {activeTab === "hap" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px" }}>
              {totalHap === 0 ? (
                <p style={{ color: "var(--muted)", textAlign: "center", padding: 40 }}>No hay dispositivos emparejados en HAP.</p>
              ) : (
                <>
                  {cuiCameras.length > 0 && (
                    <>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 10 }}>CÁMARAS HOMEKIT HAP ({cuiCameras.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {cuiCameras.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => onOpenCuiCamera?.(c)}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
                              borderRadius: 10, padding: "10px 14px", cursor: onOpenCuiCamera ? "pointer" : "default",
                              color: "var(--text)", textAlign: "left", width: "100%",
                            }}
                          >
                            <span style={{ fontSize: 20 }}>📹</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>{c.model || "Cámara HAP"} · HomeKit</div>
                            </div>
                            <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600 }}>✓ HAP</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {hapCameras.length > 0 && (
                    <>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 10 }}>CÁMARAS HAP SCRYPTED ({hapCameras.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                        {hapCameras.map(c => (
                          <div
                            key={c.cameraId}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
                              borderRadius: 10, padding: "10px 14px",
                            }}
                          >
                            <span style={{ fontSize: 20 }}>📹</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>Scrypted · HomeKit</div>
                            </div>
                            <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600 }}>✓ HAP</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {hapHaCameras.length > 0 && (
                    <>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", marginBottom: 10 }}>CÁMARAS HAP HA ({hapHaCameras.length})</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {hapHaCameras.map(d => (
                          <button
                            key={d.id} type="button"
                            onClick={() => onOpenDevice(d)}
                            style={{
                              display: "flex", alignItems: "center", gap: 12,
                              background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.2)",
                              borderRadius: 10, padding: "10px 14px", cursor: "pointer",
                              color: "var(--text)", textAlign: "left", width: "100%",
                            }}
                          >
                            <span style={{ fontSize: 20 }}>📷</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>HA Camera · HomeKit</div>
                            </div>
                            <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 600 }}>✓ HAP</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

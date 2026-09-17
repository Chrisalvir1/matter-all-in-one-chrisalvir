import React, { useState, useEffect, useRef } from "react";
import { CameraUiCameraItem, CameraUiConfigResponse } from "../types";
import { api } from "../api/client";

interface CameraUiModalProps {
  config: CameraUiConfigResponse | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const CameraUiModal: React.FC<CameraUiModalProps> = ({
  config,
  onClose,
  onRefresh,
  showToast,
}) => {
  const [enabled, setEnabled] = useState(false);
  const [serverUrl, setServerUrl] = useState("http://localhost:8181");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [allowSelfSigned, setAllowSelfSigned] = useState(true);
  const [mqttEnabled, setMqttEnabled] = useState(true);
  const [mqttTopicPrefix, setMqttTopicPrefix] = useState("camera.ui");
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; isError?: boolean } | null>(null);
  const [cameras, setCameras] = useState<CameraUiCameraItem[]>([]);
  const [activeTab, setActiveTab] = useState<"settings" | "cameras">("settings");
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (config && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setEnabled(config.enabled ?? false);
      setServerUrl(config.serverUrl || "http://localhost:8181");
      setUsername(config.username || "");
      setAllowSelfSigned(config.allowSelfSignedCertificate ?? true);
      setMqttEnabled(config.mqttEnabled ?? true);
      setMqttTopicPrefix(config.mqttTopicPrefix || "camera.ui");
    }
    loadCameras();
  }, [config]);

  const loadCameras = async () => {
    try {
      const list = await api.getCameraUiCameras();
      setCameras(list);
    } catch {}
  };

  const handleTest = async () => {
    if (!serverUrl.trim()) {
      showToast("Ingresa la URL del servidor Camera.UI", true);
      return;
    }
    setIsTesting(true);
    setTestResult({ text: "Comprobando conexión con Camera.UI..." });
    try {
      const res = await api.testCameraUiConnection({
        serverUrl: serverUrl.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        allowSelfSignedCertificate: allowSelfSigned,
      });
      if (res.ok) {
        setTestResult({ text: `✓ ${res.message}` });
      } else {
        setTestResult({ text: `❌ ${res.message}`, isError: true });
      }
    } catch (err: any) {
      setTestResult({ text: `❌ Error: ${err.message}`, isError: true });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.syncCameraUiCameras({
        serverUrl: serverUrl.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        allowSelfSignedCertificate: allowSelfSigned,
      });
      if (res.success) {
        showToast(`✓ Sincronización completa: ${res.totalCameras} cámaras detectadas (${res.newCameras} nuevas).`);
        setCameras(res.cameras || []);
        onRefresh();
      } else {
        showToast("Error al sincronizar cámaras de Camera.UI", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al sincronizar", true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleHomeKit = async (cameraId: string) => {
    try {
      await api.toggleCameraUiHomeKit(cameraId);
      await loadCameras();
      showToast("✓ Estado de HomeKit actualizado.");
      onRefresh();
    } catch (err: any) {
      showToast(`Error: ${err.message}`, true);
    }
  };

  const handleResetPairing = async (cameraId: string) => {
    try {
      const res = await api.resetCameraUiPairing(cameraId);
      if (res.success) {
        showToast("✓ Emparejamiento HomeKit restablecido. Listo para escanear en Apple Home.");
        await loadCameras();
        onRefresh();
      } else {
        showToast("No se pudo restablecer el emparejamiento", true);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`, true);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim()) {
      showToast("Ingresa la URL del servidor Camera.UI", true);
      return;
    }
    setIsSaving(true);
    try {
      await api.saveCameraUiConfig({
        enabled,
        serverUrl: serverUrl.trim(),
        username: username.trim() || undefined,
        password: password || undefined,
        allowSelfSignedCertificate: allowSelfSigned,
        mqttEnabled,
        mqttTopicPrefix: mqttTopicPrefix.trim() || "camera.ui",
      });
      showToast("✓ Configuración de Camera.UI guardada exitosamente");
      onRefresh();
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al guardar", true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-backdrop open" role="dialog" aria-modal="true">
      <section className="modal" style={{ maxWidth: 620, maxHeight: "90vh", overflowY: "auto" }}>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <header className="modal-header">
          <span className="modal-icon" style={{ fontSize: "1.8rem" }}>🎥</span>
          <div>
            <p className="eyebrow">INTEGRACIÓN DE CÁMARAS Y MQTT</p>
            <h2>Camera.UI / Homebridge Camera.UI</h2>
            <p className="entity-id">Descubrimiento RTSP, eventos MQTT (movimiento/timbre) y puente directo HomeKit HAP</p>
          </div>
        </header>

        <div style={{ display: "flex", gap: 10, margin: "12px 0 16px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: 8 }}>
          <button
            type="button"
            className={`button ${activeTab === "settings" ? "button-primary" : "button-secondary"}`}
            style={{ fontSize: "0.85rem", padding: "6px 14px" }}
            onClick={() => setActiveTab("settings")}
          >
            ⚙️ Configuración y Conexión
          </button>
          <button
            type="button"
            className={`button ${activeTab === "cameras" ? "button-primary" : "button-secondary"}`}
            style={{ fontSize: "0.85rem", padding: "6px 14px" }}
            onClick={() => {
              setActiveTab("cameras");
              loadCameras();
            }}
          >
            📷 Cámaras Descubiertas ({cameras.length})
          </button>
        </div>

        {activeTab === "settings" ? (
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span>Habilitar integración Camera.UI</span>
            </label>

            <div>
              <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4 }}>
                URL del Servidor Camera.UI
              </label>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://192.168.1.100:8181"
                required
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              />
              <span style={{ fontSize: "0.75rem", color: "var(--dim)" }}>
                Puerto REST por defecto de Camera.UI: 8181 (o HTTPS en 3543). Restreaming RTSP nativo en puerto 8554.
              </span>
              <div style={{ marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.8rem", color: "var(--dim)" }}>
                  <input
                    type="checkbox"
                    checked={allowSelfSigned}
                    onChange={(e) => setAllowSelfSigned(e.target.checked)}
                  />
                  <span>Permitir certificados SSL autofirmados (HTTPS local)</span>
                </label>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4 }}>
                  Usuario (opcional)
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4 }}>
                  Contraseña (opcional)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={config?.hasPassword ? "•••••••• (guardada)" : "••••••••"}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                />
              </div>
            </div>

            <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.85rem", fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={mqttEnabled}
                  onChange={(e) => setMqttEnabled(e.target.checked)}
                />
                <span>Escuchar tópicos MQTT de Camera.UI para Movimiento y Timbre</span>
              </label>

              {mqttEnabled && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: "block", fontSize: "0.75rem", color: "var(--dim)", marginBottom: 4 }}>
                    Prefijo de Tópicos MQTT
                  </label>
                  <input
                    type="text"
                    value={mqttTopicPrefix}
                    onChange={(e) => setMqttTopicPrefix(e.target.value)}
                    placeholder="camera.ui"
                    style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontSize: "0.85rem" }}
                  />
                  <span style={{ fontSize: "0.75rem", color: "var(--dim)", display: "block", marginTop: 4 }}>
                    Se suscribe automáticamente a <code>camera.ui/#</code> y <code>cameraui/#</code> para disparar notificaciones de movimiento y timbres en Apple Home.
                  </span>
                </div>
              )}
            </div>

            {testResult && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  fontSize: "0.8rem",
                  background: testResult.isError ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)",
                  color: testResult.isError ? "#fca5a5" : "#6ee7b7",
                }}
              >
                {testResult.text}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 12 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting}
                >
                  {isTesting ? "Comprobando..." : "Probar Conexión"}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={handleSync}
                  disabled={isSyncing}
                >
                  {isSyncing ? "Sincronizando..." : "🔄 Sincronizar Cámaras"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="button button-secondary" type="button" onClick={onClose}>
                  Cancelar
                </button>
                <button className="button button-primary" type="submit" disabled={isSaving}>
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--dim)" }}>
                {cameras.length === 0
                  ? "No se han sincronizado cámaras aún."
                  : `${cameras.length} cámaras encontradas en Camera.UI.`}
              </span>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleSync}
                disabled={isSyncing}
                style={{ fontSize: "0.8rem", padding: "4px 10px" }}
              >
                {isSyncing ? "Sincronizando..." : "🔄 Sincronizar Ahora"}
              </button>
            </div>

            {cameras.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.1)" }}>
                <p style={{ margin: 0, color: "var(--dim)", fontSize: "0.9rem" }}>
                  Asegúrate de que la URL del servidor sea correcta y presiona <strong>Sincronizar Ahora</strong>.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {cameras.map((cam) => (
                  <div
                    key={cam.id}
                    style={{
                      padding: "12px",
                      borderRadius: 8,
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <strong style={{ fontSize: "0.95rem" }}>{cam.name}</strong>
                        <div style={{ fontSize: "0.75rem", color: "var(--dim)", marginTop: 2 }}>
                          ID: <code>{cam.id}</code> · Puerto HAP: <code>{cam.port || "Pendiente"}</code>
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: 6,
                          background: cam.isPaired ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)",
                          color: cam.isPaired ? "#6ee7b7" : "#fde68a",
                        }}
                      >
                        {cam.isPaired ? "✓ Vinculada en Apple Home" : "⚠️ Lista para vincular"}
                      </span>
                    </div>

                    <div style={{ fontSize: "0.8rem", color: "var(--dim)", wordBreak: "break-all" }}>
                      RTSP: <code>{cam.rtspUrl}</code>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: "0.8rem" }}>
                          PIN: <strong>{cam.pincode || "031-45-154"}</strong>
                        </span>
                        {cam.setupUri && !cam.isPaired && (
                          <a
                            href={cam.setupUri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="button button-secondary"
                            style={{ fontSize: "0.75rem", padding: "2px 8px", textDecoration: "none" }}
                          >
                            🔗 Código HomeKit
                          </a>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                          onClick={() => handleResetPairing(cam.id)}
                          title="Restablece el ID y genera nuevo PIN si Apple Home no la encuentra"
                        >
                          Restablecer PIN
                        </button>
                        <button
                          type="button"
                          className={`button ${cam.homeKitEnabled ? "button-primary" : "button-secondary"}`}
                          style={{ fontSize: "0.75rem", padding: "3px 8px" }}
                          onClick={() => handleToggleHomeKit(cam.id)}
                        >
                          {cam.homeKitEnabled ? "Activada en HomeKit" : "Desactivada"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

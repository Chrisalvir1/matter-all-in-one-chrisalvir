import React, { useState, useEffect } from "react";
import { api } from "../api/client";
import { copyToClipboard } from "../utils/clipboard";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  const [mqttHost, setMqttHost] = useState("");
  const [mqttPort, setMqttPort] = useState(1883);
  const [mqttUser, setMqttUser] = useState("");
  const [mqttPass, setMqttPass] = useState("");
  const [isSavingMqtt, setIsSavingMqtt] = useState(false);
  const [systemLogs, setSystemLogs] = useState<string[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    api
      .getMqttConfig()
      .then((cfg) => {
        if (cfg) {
          setMqttHost(cfg.host || "");
          setMqttPort(cfg.port || 1883);
          setMqttUser(cfg.username || "");
          setMqttPass(cfg.password || "");
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveMqtt = async () => {
    setIsSavingMqtt(true);
    try {
      await api.saveMqttConfig({
        host: mqttHost,
        port: Number(mqttPort),
        username: mqttUser,
        password: mqttPass,
      });
      showToast("✓ Configuración MQTT guardada");
    } catch (err: any) {
      showToast(err.message || "Error al guardar MQTT", true);
    } finally {
      setIsSavingMqtt(false);
    }
  };

  const handleRestart = async () => {
    if (!confirm("¿Deseas reiniciar el servicio de Matter All-in-One?")) return;
    try {
      await api.restartService();
      showToast("Reiniciando servicio...");
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al reiniciar servicio", true);
    }
  };

  const handleFactoryReset = async () => {
    const ok = confirm(
      "¿Estás seguro de que deseas restablecer de fábrica el plugin? Se eliminarán todos los accesorios Matter y requerirá volver a emparejar."
    );
    if (!ok) return;
    try {
      await api.factoryReset();
      showToast("Restablecimiento de fábrica iniciado...");
      onClose();
    } catch (err: any) {
      showToast(err.message || "Error al restablecer", true);
    }
  };

  const handleLoadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getLogs();
      setSystemLogs(res.logs || []);
      setShowLogs(true);
    } catch (err: any) {
      showToast(err.message || "Error al cargar logs", true);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleCopyAllLogs = async () => {
    try {
      let logsToCopy = systemLogs;
      if (logsToCopy.length === 0) {
        const res = await api.getLogs();
        logsToCopy = res.logs || [];
        setSystemLogs(logsToCopy);
      }
      const text = logsToCopy.join("\n");
      const ok = await copyToClipboard(text);
      if (ok) {
        showToast("✓ Todos los logs copiados al portapapeles");
      } else {
        showToast("⚠️ No se pudo acceder al portapapeles", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al copiar logs", true);
    }
  };

  return (
    <div
      className="modal-backdrop open"
      id="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <section className="modal modal-small">
        <button
          className="icon-button"
          id="settings-modal-close"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">MANTENIMIENTO</p>
        <h2 id="settings-title">Ajustes del servicio</h2>
        <p className="lead compact">
          Estas acciones afectan a todos los accesorios y al servicio Matterbridge subyacente.
        </p>
        <div className="settings-actions">
          <div className="settings-row mqtt-settings-row">
            <div>
              <strong>Configuración MQTT (Auto-Discovery)</strong>
              <p>
                Habilita la integración de dispositivos MQTT directamente en Matter.
              </p>
            </div>
            <div className="mqtt-form">
              <input
                type="text"
                id="mqtt-host"
                placeholder="Broker IP (ej. 192.168.1.50)"
                aria-label="MQTT Host"
                className="form-input"
                value={mqttHost}
                onChange={(e) => setMqttHost(e.target.value)}
              />
              <input
                type="number"
                id="mqtt-port"
                placeholder="Puerto (ej. 1883)"
                aria-label="MQTT Port"
                className="form-input"
                value={mqttPort}
                onChange={(e) => setMqttPort(Number(e.target.value))}
              />
              <input
                type="text"
                id="mqtt-user"
                placeholder="Usuario"
                aria-label="MQTT User"
                className="form-input"
                value={mqttUser}
                onChange={(e) => setMqttUser(e.target.value)}
              />
              <input
                type="password"
                id="mqtt-pass"
                placeholder="Contraseña"
                aria-label="MQTT Password"
                className="form-input"
                value={mqttPass}
                onChange={(e) => setMqttPass(e.target.value)}
              />
              <button
                className="button button-primary"
                id="mqtt-save-button"
                type="button"
                onClick={handleSaveMqtt}
                disabled={isSavingMqtt}
              >
                {isSavingMqtt ? "Guardando..." : "Guardar MQTT"}
              </button>
            </div>
          </div>
          <div className="settings-row">
            <div>
              <strong>Reiniciar servicio</strong>
              <p>Recarga el servicio y restablece conexiones activas.</p>
            </div>
            <button
              className="button button-primary"
              id="restart-button"
              type="button"
              onClick={handleRestart}
            >
              Reiniciar
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>Registros del sistema (Logs del Add-on)</strong>
              <p>Inspecciona o copia el historial de eventos y errores del servicio.</p>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleLoadLogs}
                disabled={isLoadingLogs}
              >
                {isLoadingLogs ? "Cargando..." : showLogs ? "🔄 Actualizar" : "👁️ Ver logs"}
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={handleCopyAllLogs}
                title="Copiar todos los logs al portapapeles"
              >
                📋 Copiar todo
              </button>
            </div>
          </div>

          {showLogs && (
            <div
              style={{
                marginTop: 6,
                marginBottom: 10,
                padding: 10,
                background: "rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                userSelect: "text",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 6,
                  fontSize: "0.75rem",
                  color: "var(--dim)",
                }}
              >
                <span>Últimos {systemLogs.length} eventos registrados</span>
                <button
                  type="button"
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                  }}
                  onClick={() => setShowLogs(false)}
                >
                  Ocultar
                </button>
              </div>
              <pre
                style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  fontSize: "0.72rem",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  userSelect: "text",
                  color: "#e2e8f0",
                }}
              >
                {systemLogs.length > 0
                  ? systemLogs.slice(-100).join("\n")
                  : "No hay registros disponibles."}
              </pre>
            </div>
          )}

          <div className="settings-row danger-row">
            <div>
              <strong>Restablecimiento de fábrica</strong>
              <p>
                Elimina la configuración del plugin y requiere volver a emparejar.
              </p>
            </div>
            <button
              className="button button-danger"
              id="factory-reset-button"
              type="button"
              onClick={handleFactoryReset}
            >
              Restablecer
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

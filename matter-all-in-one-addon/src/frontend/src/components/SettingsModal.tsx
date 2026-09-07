import React, { useState, useEffect } from "react";
import { api } from "../api/client";

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

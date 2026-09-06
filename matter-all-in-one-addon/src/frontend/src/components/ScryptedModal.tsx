import React, { useState, useEffect } from "react";
import { ScryptedConfigResponse } from "../types";
import { api } from "../api/client";

interface ScryptedModalProps {
  config: ScryptedConfigResponse | null;
  onClose: () => void;
  onRefresh: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const ScryptedModal: React.FC<ScryptedModalProps> = ({
  config,
  onClose,
  onRefresh,
  showToast,
}) => {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [allowSelfSigned, setAllowSelfSigned] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (config) {
      setServerUrl(config.serverUrl || "");
      setUsername(config.username || "");
      setAllowSelfSigned(Boolean(config.allowSelfSignedCertificate));
    }
  }, [config]);

  const handleTest = async () => {
    if (!serverUrl.trim() || !username.trim() || !password) {
      showToast("Completa la URL, usuario y contraseña", true);
      return;
    }
    setIsTesting(true);
    setTestResult({ text: "Comprobando conexión con Scrypted..." });
    try {
      const res = await api.testScryptedConnection({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password,
        allowSelfSignedCertificate: allowSelfSigned,
      });
      if (res.success) {
        setTestResult({ text: `✓ Conexión exitosa. Se detectaron ${res.cameraCount || 0} cámaras.` });
      } else {
        setTestResult({ text: `❌ ${res.error || "No se pudo conectar"}`, isError: true });
      }
    } catch (err: any) {
      setTestResult({ text: `❌ Error: ${err.message}`, isError: true });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim() || !username.trim()) {
      showToast("Ingresa la URL y el usuario", true);
      return;
    }
    setIsSaving(true);
    try {
      await api.saveScryptedConfig({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password,
        allowSelfSignedCertificate: allowSelfSigned,
      });
      showToast("✓ Configuración de Scrypted guardada exitosamente");
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
      <section className="modal" style={{ maxWidth: 520 }}>
        <button className="icon-button" type="button" aria-label="Cerrar" onClick={onClose}>
          ×
        </button>
        <header className="modal-header">
          <span className="modal-icon" style={{ fontSize: "1.8rem" }}>📹</span>
          <div>
            <p className="eyebrow">INTEGRACIÓN DE CÁMARAS</p>
            <h2>Conectar con Scrypted</h2>
            <p className="entity-id">Transmisión de alta velocidad HAP y Matter</p>
          </div>
        </header>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4 }}>
              URL del Servidor Scrypted
            </label>
            <input
              type="url"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://192.168.1.100:10443"
              required
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4 }}>
              Usuario de Scrypted
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--dim)", marginBottom: 4 }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: "0.82rem" }}>
            <input
              type="checkbox"
              checked={allowSelfSigned}
              onChange={(e) => setAllowSelfSigned(e.target.checked)}
            />
            <span>Permitir certificados SSL autofirmados (HTTPS local)</span>
          </label>

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
            <button
              className="button button-secondary"
              type="button"
              onClick={handleTest}
              disabled={isTesting}
            >
              {isTesting ? "Comprobando..." : "Probar Conexión"}
            </button>
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
      </section>
    </div>
  );
};

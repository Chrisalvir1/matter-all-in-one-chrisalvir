import React, { useState } from "react";
import { api } from "../api/client";

interface LovelaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (msg: string, isError?: boolean) => void;
}

export const LovelaceModal: React.FC<LovelaceModalProps> = ({
  isOpen,
  onClose,
  showToast,
}) => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [copiedYaml, setCopiedYaml] = useState(false);

  if (!isOpen) return null;

  const exampleYaml = `type: custom:matter-apple-card
entity: fan.govee_h7133 # Cambia por tu entidad (fan, light, climate, switch, cover, lock)
# Opcional (se autodetecta solo por marca y modelo):
# name: Ventilador Sala
# brand: Govee
# model: H7133
# show_matter_badge: true`;

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const res = await api.installLovelaceCard();
      if (res.success) {
        showToast("✓ Tarjeta copiada correctamente a /config/www/matter-apple-card.js");
      } else {
        showToast(res.message || "No se pudo copiar automáticamente a /config/www/", true);
      }
    } catch (err: any) {
      showToast(err.message || "Error al solicitar instalación", true);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleCopyYaml = () => {
    navigator.clipboard.writeText(exampleYaml);
    setCopiedYaml(true);
    showToast("✓ Código YAML copiado al portapapeles");
    setTimeout(() => setCopiedYaml(false), 3000);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-content" style={{ maxWidth: 640 }}>
        <header className="modal-header">
          <div>
            <p className="eyebrow">DASHBOARDS DE HOME ASSISTANT</p>
            <h2>Tarjeta Nativa Apple Home (Liquid Glass)</h2>
          </div>
          <button
            className="button button-ghost button-close"
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </header>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ margin: 0, color: "var(--text-secondary, #94a3b8)", fontSize: "0.95rem" }}>
            Usa estas tarjetas con cristal esmerilado <strong>Liquid Glass</strong>, iconos cinéticos de
            Apple Home (aspas girando a velocidad real, resplandor RGB/Kelvin, dial térmico) y control local
            directo en <strong>cualquier Dashboard de Home Assistant</strong>.
          </p>

          <div
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#f8fafc" }}>
              1. Recurso en Home Assistant (/config/www)
            </h4>
            <p style={{ margin: "0 0 12px 0", fontSize: "0.88rem", color: "#cbd5e1" }}>
              El add-on coloca el archivo <code>matter-apple-card.js</code> directamente en tu carpeta{" "}
              <code>/config/www/</code> de Home Assistant.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? "Instalando..." : "↻ Copiar / Actualizar tarjeta en /config/www/"}
              </button>
              <span style={{ fontSize: "0.82rem", color: "var(--color-success, #10b981)" }}>
                URL: <code>/local/matter-apple-card.js</code>
              </span>
            </div>
          </div>

          <div
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h4 style={{ margin: "0 0 10px 0", color: "#f8fafc" }}>
              2. Registrar Recurso en Home Assistant (Una sola vez)
            </h4>
            <ol
              style={{
                margin: 0,
                paddingLeft: 20,
                fontSize: "0.88rem",
                color: "#cbd5e1",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <li>
                Ve a <strong>Ajustes</strong> → <strong>Paneles de control</strong> en Home Assistant.
              </li>
              <li>
                Pulsa los <strong>tres puntos ⋮</strong> (arriba a la derecha) y selecciona{" "}
                <strong>Recursos</strong>.
              </li>
              <li>
                Pulsa <strong>Añadir recurso</strong>:
                <div
                  style={{
                    background: "rgba(15, 23, 42, 0.8)",
                    padding: "8px 12px",
                    borderRadius: 6,
                    marginTop: 6,
                    fontFamily: "monospace",
                    fontSize: "0.85rem",
                  }}
                >
                  URL: <strong>/local/matter-apple-card.js</strong>
                  <br />
                  Tipo: <strong>Módulo JavaScript</strong>
                </div>
              </li>
            </ol>
          </div>

          <div
            style={{
              background: "rgba(30, 41, 59, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <h4 style={{ margin: 0, color: "#f8fafc" }}>3. Añadir a cualquier Dashboard</h4>
              <button
                className="button button-secondary"
                type="button"
                onClick={handleCopyYaml}
                style={{ padding: "4px 10px", fontSize: "0.82rem" }}
              >
                {copiedYaml ? "✓ Copiado" : "Copiar YAML"}
              </button>
            </div>
            <p style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "#cbd5e1" }}>
              Al editar cualquier Dashboard, pulsa <strong>Añadir tarjeta</strong> y busca{" "}
              <strong>Matter Apple Liquid Glass</strong> en el selector visual, o pega este YAML en modo
              manual:
            </p>
            <pre
              style={{
                background: "rgba(15, 23, 42, 0.9)",
                padding: 12,
                borderRadius: 8,
                overflowX: "auto",
                color: "#38bdf8",
                fontSize: "0.82rem",
                margin: 0,
              }}
            >
              {exampleYaml}
            </pre>
          </div>
        </div>

        <footer className="modal-footer">
          <button className="button button-primary" type="button" onClick={onClose}>
            Entendido
          </button>
        </footer>
      </div>
    </div>
  );
};

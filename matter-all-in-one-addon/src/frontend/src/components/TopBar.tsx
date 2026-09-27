import React from "react";
import { StatusResponse } from "../types";

interface TopBarProps {
  status: StatusResponse | null;
  onOpenSettings: () => void;
  onRestartService: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  status,
  onOpenSettings,
  onRestartService,
}) => {
  const isOnline = status?.haStatus === "conectado";
  const matterVer = status?.matterVersion || "Desconocida";
  const matterbridgeVer = status?.matterbridgeVersion || "Desconocida";

  return (
    <header className="topbar" role="banner" aria-label="Barra superior de servicio">
      <div className="topbar-left">
        <div className="topbar-brand">
          <img
            className="topbar-logo"
            src="logo.png"
            alt="Logo"
            aria-hidden="true"
          />
          <div className="topbar-brand-info">
            <p className="eyebrow">MATTER {matterVer} BRIDGE</p>
            <h1>Matter All In One Chrisalvir</h1>
          </div>
        </div>

        <div className="topbar-status-badge" aria-live="polite">
          <span className={`status-orb ${isOnline ? "online" : "offline"}`} id="bridge-orb" />
          <div className="topbar-status-desc">
            <strong id="bridge-title">
              {status ? (isOnline ? "Conectado a Home Assistant" : "Desconectado") : "Iniciando…"}
            </strong>
          </div>
          {status?.matterVersion && (
            <span className="version-pill" id="matter-version" title="Versión oficial del data model Matter">
              Matter {matterVer}
            </span>
          )}
          {status?.matterbridgeVersion && (
            <span
              className="version-pill"
              id="matterbridge-version"
              title="Versión del runtime de Matterbridge"
              style={{ background: "rgba(99, 102, 241, 0.2)", borderColor: "rgba(99, 102, 241, 0.4)" }}
            >
              MB {matterbridgeVer}
            </span>
          )}
          {status?.version && (
            <span className="version-pill" id="version" title="Versión del addon">
              v{status.version}
            </span>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        <button
          className="button button-secondary button-topbar"
          id="settings-button"
          type="button"
          onClick={onOpenSettings}
        >
          <span className="btn-icon" aria-hidden="true">⚙</span>
          Ajustes del servicio
        </button>
        <button
          className="button button-secondary button-restart-quick button-topbar"
          id="quick-restart-button"
          type="button"
          onClick={onRestartService}
        >
          <span className="btn-icon" aria-hidden="true">↻</span>
          Reiniciar Servicio
        </button>
      </div>
    </header>
  );
};

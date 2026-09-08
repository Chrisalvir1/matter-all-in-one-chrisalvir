import React from "react";
import { StatusResponse } from "../types";

interface TopBarProps {
  status: StatusResponse | null;
  onOpenSettings: () => void;
  onRestartService: () => void;
  isDashboardMode?: boolean;
  onToggleDashboardMode?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  status,
  onOpenSettings,
  onRestartService,
  isDashboardMode = false,
  onToggleDashboardMode,
}) => {
  const isOnline = status?.haStatus === "conectado";

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
            <p className="eyebrow">MATTER 1.6 BRIDGE</p>
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
          {status?.version && (
            <span className="version-pill" id="version">
              v{status.version}
            </span>
          )}
        </div>
      </div>

      <div className="topbar-actions">
        {onToggleDashboardMode && (
          <button
            className={`button button-secondary button-topbar ${isDashboardMode ? "button-primary" : ""}`}
            id="toggle-dashboard-button"
            type="button"
            onClick={onToggleDashboardMode}
            title={
              isDashboardMode
                ? "Cambiar a modo Administración (con códigos QR y configuración)"
                : "Cambiar a modo Dashboard (control interactivo sin configuración)"
            }
          >
            <span className="btn-icon" aria-hidden="true">
              {isDashboardMode ? "🛠️" : "📱"}
            </span>
            {isDashboardMode ? "Modo Admin" : "Modo Dashboard"}
          </button>
        )}
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

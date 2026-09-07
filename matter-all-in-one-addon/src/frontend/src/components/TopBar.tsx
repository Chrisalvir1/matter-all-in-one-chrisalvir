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

  return (
    <header className="topbar" role="region" aria-label="Barra superior de servicio">
      <div className="topbar-status">
        <div className="connection-state topbar-connection">
          <span
            className={`connection-dot ${isOnline ? "online" : "offline"}`}
            id="ha-dot"
          />
          <span id="ha-status">
            {isOnline
              ? "Home Assistant conectado"
              : "Conectando con Home Assistant…"}
          </span>
        </div>
        {status?.version && (
          <span className="version-pill" id="version">
            v{status.version}
          </span>
        )}
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

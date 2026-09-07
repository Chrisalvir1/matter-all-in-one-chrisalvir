import React from "react";
import { StatusResponse } from "../types";

interface HeaderProps {
  status: StatusResponse | null;
  onOpenSettings: () => void;
  onRestartService: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  onOpenSettings,
  onRestartService,
}) => {
  const isOnline = status?.haStatus === "conectado";

  return (
    <aside className="sidebar" aria-label="Estado del servicio">
      <div className="brand">
        <img
          className="brand-logo"
          src="logo.png"
          alt="Logo"
          aria-hidden="true"
        />
        <div>
          <p className="eyebrow">MATTER 1.6 BRIDGE</p>
          <h1>Matter All In One Chrisalvir</h1>
        </div>
      </div>

      <section className="bridge-card" aria-live="polite">
        <span className={`status-orb ${isOnline ? "online" : "offline"}`} id="bridge-orb" />
        <div>
          <p className="card-label">Estado del servicio</p>
          <strong id="bridge-title">
            {status ? (isOnline ? "Conectado a Home Assistant" : "Desconectado") : "Iniciando…"}
          </strong>
          <p id="bridge-description">
            {isOnline
              ? "Conectado con éxito a la API de Home Assistant."
              : "Comprobando la conexión con Home Assistant."}
          </p>
        </div>
      </section>

      <section className="sidebar-note">
        <span aria-hidden="true">✦</span>
        <p>
          Cada dispositivo físico se expone como un accesorio Matter con un
          código de emparejamiento único.
        </p>
      </section>

      <div className="sidebar-spacer" />

      <button
        className="button button-secondary button-restart-quick"
        id="quick-restart-button"
        type="button"
        onClick={onRestartService}
      >
        ↻ Reiniciar Servicio
      </button>
      <button
        className="button button-secondary"
        id="settings-button"
        type="button"
        onClick={onOpenSettings}
      >
        Ajustes del servicio
      </button>

      <div className="connection-state">
        <span className={`connection-dot ${isOnline ? "online" : "offline"}`} id="ha-dot" />
        <span id="ha-status">
          {isOnline ? "Home Assistant conectado" : "Conectando con Home Assistant…"}
        </span>
      </div>
      <p className="version" id="version">
        {status?.version ? `v${status.version}` : "—"}
      </p>
    </aside>
  );
};

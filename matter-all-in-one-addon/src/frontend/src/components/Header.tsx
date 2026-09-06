import React from "react";
import { StatusResponse } from "../types";

interface HeaderProps {
  status: StatusResponse | null;
  searchQuery: string;
  onSearchChange: (val: string) => void;
  onOpenSettings: () => void;
  onRestartService: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onRestartService,
}) => {
  const isOnline = status?.haStatus === "conectado";

  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-logo" src="logo.png" alt="Matter All-in-One Logo" />
        <div>
          <span className="eyebrow">MATTER 1.6 BRIDGE</span>
          <h1>Matter All In One Chrisalvir</h1>
        </div>
      </div>

      <div className="card status-card">
        <span className="card-label">Estado del servicio</span>
        <div className="status-row">
          <span className={`connection-dot ${isOnline ? "online" : "offline"}`} />
          <strong id="ha-status">
            {status ? (isOnline ? "Conectado a Home Assistant" : "Desconectado") : "Iniciando..."}
          </strong>
        </div>
        <p className="status-note">
          {isOnline
            ? "Conectado con éxito a la API de Home Assistant."
            : "Comprobando la conexión con Home Assistant."}
        </p>
      </div>

      <div className="card info-card">
        <p>Cada dispositivo físico se expone como un accesorio Matter con un código de emparejamiento único.</p>
      </div>

      <div className="sidebar-actions">
        <button className="button button-danger-outline" type="button" onClick={onRestartService}>
          ↻ Reiniciar Servicio
        </button>
        <button className="button button-secondary" type="button" onClick={onOpenSettings}>
          Ajustes del servicio
        </button>
      </div>

      <div className="sidebar-footer">
        <span className={`connection-dot ${isOnline ? "online" : "offline"}`} />
        <span>{isOnline ? "Home Assistant conectado" : "Conectando con Home Assistant..."}</span>
      </div>
    </aside>
  );
};

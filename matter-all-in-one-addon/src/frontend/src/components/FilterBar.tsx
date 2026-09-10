import React from "react";
import { FilterType } from "../hooks/useAddonState";

interface FilterBarProps {
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  stats: {
    totalDevices: number;
    iotDevices: number;
    totalCameras: number;
    pairedTotal: number;
    unpairedTotal: number;
    unexportedCount: number;
    mqttCount: number;
    issues: number;
  };
  scryptedConfig: {
    connectionStatus?: string;
    serverUrl?: string;
    cameraCount?: number;
  } | null;
  onOpenScryptedModal: () => void;
  onSyncCameras: () => void;
  isSyncing: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  activeFilter,
  onFilterChange,
  stats,
  scryptedConfig,
  onOpenScryptedModal,
  onSyncCameras,
  isSyncing,
}) => {
  const isScryptedConnected =
    scryptedConfig?.connectionStatus === "connected" || (scryptedConfig?.cameraCount ?? 0) > 0;

  return (
    <>
      <div className="filter-bar" role="group" aria-label="Filtrar dispositivos">
        <button
          className={`filter-chip ${activeFilter === "all" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("all")}
        >
          TODOS <span className="chip-badge">{stats.totalDevices + stats.totalCameras}</span>
        </button>

        <button
          className={`filter-chip ${activeFilter === "iot" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("iot")}
        >
          IOT <span className="chip-badge">{stats.iotDevices}</span>
        </button>

        <button
          className={`filter-chip ${activeFilter === "cameras" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("cameras")}
        >
          CÁMARAS 📹 <span className="chip-badge">{stats.totalCameras}</span>
        </button>

        <button
          className={`filter-chip ${activeFilter === "paired" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("paired")}
        >
          EN MATTER EMPAREJADOS 🍏 <span className="chip-badge">{stats.pairedTotal}</span>
        </button>

        <button
          className={`filter-chip ${activeFilter === "unpaired" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("unpaired")}
        >
          PENDIENTES QR <span className="chip-badge">{stats.unpairedTotal}</span>
        </button>

        <button
          className={`filter-chip filter-chip-unexported ${activeFilter === "unexported" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("unexported")}
        >
          NO EXPORTADOS (HA) <span className="chip-badge">{stats.unexportedCount}</span>
        </button>

        <button
          className={`filter-chip ${activeFilter === "mqtt" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("mqtt")}
        >
          MQTT <span className="chip-badge">{stats.mqttCount}</span>
        </button>

        <button
          className={`filter-chip filter-chip-warning ${activeFilter === "issues" ? "active" : ""}`}
          type="button"
          onClick={() => onFilterChange("issues")}
        >
          NECESITA ATENCIÓN <span className="chip-badge">{stats.issues}</span>
        </button>
      </div>

      {/* Scrypted management bar — visible on 'cameras' or 'all' if cameras exist */}
      {(activeFilter === "cameras" || activeFilter === "paired") && (
        <div className="scrypted-header-bar" style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 16px" }}>
          {isScryptedConnected ? (
            <>
              <span className="badge-connected" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span className="connection-dot online" /> Conectado
              </span>
              <span className="scrypted-url-display" style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                {scryptedConfig?.serverUrl || "Servidor Scrypted"} · {stats.totalCameras} cámaras
              </span>
              <button
                className="button button-sm button-primary"
                type="button"
                onClick={onSyncCameras}
                disabled={isSyncing}
              >
                {isSyncing ? "Sincronizando..." : "🔄 Sincronizar nuevas cámaras"}
              </button>
              <button
                className="button button-sm button-secondary"
                type="button"
                onClick={onOpenScryptedModal}
              >
                ⚙️ Servidor
              </button>
            </>
          ) : (
            <button
              className="button button-primary"
              type="button"
              onClick={onOpenScryptedModal}
            >
              📹 Conectar con Scrypted
            </button>
          )}
        </div>
      )}
    </>
  );
};

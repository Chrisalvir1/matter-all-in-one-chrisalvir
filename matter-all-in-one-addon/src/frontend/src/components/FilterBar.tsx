import React from "react";
import { FilterType } from "../hooks/useAddonState";

interface FilterBarProps {
  activeFilter: FilterType;
  stats: {
    totalCameras: number;
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
  stats,
  scryptedConfig,
  onOpenScryptedModal,
  onSyncCameras,
  isSyncing,
}) => {
  const isScryptedConnected =
    scryptedConfig?.connectionStatus === "connected" || (scryptedConfig?.cameraCount ?? 0) > 0;

  // Only display the contextual management bar when viewing cameras or paired accessories
  if (activeFilter !== "cameras" && activeFilter !== "paired") {
    return null;
  }

  return (
    <div className="scrypted-header-bar" style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 16px" }}>
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
  );
};

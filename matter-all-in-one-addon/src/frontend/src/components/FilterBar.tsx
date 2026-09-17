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
  cameraUiConfig?: {
    enabled?: boolean;
    serverUrl?: string;
  } | null;
  onOpenScryptedModal: () => void;
  onOpenCameraUiModal: () => void;
  onSyncCameras: () => void;
  isSyncing: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  activeFilter,
  stats,
  scryptedConfig,
  cameraUiConfig,
  onOpenScryptedModal,
  onOpenCameraUiModal,
  onSyncCameras,
  isSyncing,
}) => {
  const isScryptedConnected =
    scryptedConfig?.connectionStatus === "connected" || (scryptedConfig?.cameraCount ?? 0) > 0;
  const isCameraUiActive = Boolean(cameraUiConfig?.enabled);

  // Only display the contextual management bar when viewing cameras or paired accessories
  if (activeFilter !== "cameras" && activeFilter !== "paired") {
    return null;
  }

  return (
    <div className="scrypted-header-bar" style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 16px", flexWrap: "wrap" }}>
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
            {isSyncing ? "Sincronizando..." : "🔄 Sincronizar Scrypted"}
          </button>
          <button
            className="button button-sm button-secondary"
            type="button"
            onClick={onOpenScryptedModal}
          >
            ⚙️ Scrypted
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

      {/* Camera.UI Integration Button */}
      <button
        className={`button button-sm ${isCameraUiActive ? "button-primary" : "button-secondary"}`}
        type="button"
        onClick={onOpenCameraUiModal}
        style={{ marginLeft: "auto" }}
      >
        {isCameraUiActive ? "🎥 Camera.UI (Activo)" : "🎥 Conectar Camera.UI / MQTT"}
      </button>
    </div>
  );
};

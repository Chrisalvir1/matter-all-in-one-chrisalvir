import React from "react";
import { FilterType } from "../hooks/useAddonState";

interface FilterBarProps {
  activeFilter: FilterType;
  stats: {
    totalCameras: number;
    scryptedTotal?: number;
    camerauiTotal?: number;
    haCamsTotal?: number;
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
      {/* Scrypted Source Info */}
      {isScryptedConnected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="badge-scrypted-tag">SCRYPTED</span>
          <span className="scrypted-url-display" style={{ fontSize: "0.82rem", opacity: 0.85 }}>
            {stats.scryptedTotal ?? 0} cámaras
          </span>
          <button
            className="button button-sm button-primary"
            type="button"
            onClick={onSyncCameras}
            disabled={isSyncing}
            style={{ fontSize: "0.78rem", padding: "4px 8px" }}
          >
            {isSyncing ? "Sincronizando..." : "🔄 Sincronizar"}
          </button>
          <button
            className="button button-sm button-secondary"
            type="button"
            onClick={onOpenScryptedModal}
            style={{ fontSize: "0.78rem", padding: "4px 8px" }}
          >
            ⚙️ Scrypted
          </button>
        </div>
      ) : (
        <button
          className="button button-secondary"
          type="button"
          onClick={onOpenScryptedModal}
          style={{ fontSize: "0.82rem" }}
        >
          📹 Conectar con Scrypted
        </button>
      )}

      {/* Camera.UI Source Info */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
        {isCameraUiActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="badge-cameraui-tag">CAMERA.UI</span>
            <span style={{ fontSize: "0.82rem", opacity: 0.85 }}>
              {stats.camerauiTotal ?? 0} cámaras
            </span>
          </div>
        )}
        <button
          className={`button button-sm ${isCameraUiActive ? "button-primary" : "button-secondary"}`}
          type="button"
          onClick={onOpenCameraUiModal}
          style={{ fontSize: "0.8rem", padding: "4px 10px" }}
        >
          {isCameraUiActive ? "🎥 Ajustes Camera.UI" : "🎥 Conectar Camera.UI / MQTT"}
        </button>
      </div>
    </div>
  );
};

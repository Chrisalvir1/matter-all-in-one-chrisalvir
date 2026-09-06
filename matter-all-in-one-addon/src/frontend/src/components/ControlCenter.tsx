import React from "react";

interface ControlCenterProps {
  stats: {
    totalDevices: number;
    exportedNodes: number;
    pairedNodes: number;
    scryptedTotal: number;
    scryptedPaired: number;
    haCamsTotal: number;
    haCamsPaired: number;
  };
  loading: boolean;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({ stats, loading }) => {
  const message = stats.exportedNodes
    ? `${stats.exportedNodes} accesorio${stats.exportedNodes === 1 ? "" : "s"} listo${stats.exportedNodes === 1 ? "" : "s"} para Matter`
    : "Selecciona un dispositivo para comenzar";

  return (
    <section className="overview" aria-label="Resumen de dispositivos">
      <div className="overview-main">
        <span className="overview-icon" aria-hidden="true">
          ✦
        </span>
        <div>
          <span className="overview-label">CENTRO DE CONTROL</span>
          <strong id="overview-message">{loading ? "Cargando accesorios…" : message}</strong>
        </div>
      </div>
      <div className="overview-stat">
        <span>Dispositivos</span>
        <strong id="stat-devices">{loading ? "—" : stats.totalDevices}</strong>
      </div>
      <div className="overview-stat">
        <span>En Matter</span>
        <strong id="stat-exported">{loading ? "—" : stats.exportedNodes}</strong>
      </div>
      <div className="overview-stat">
        <span>Emparejados</span>
        <strong id="stat-paired">{loading ? "—" : stats.pairedNodes}</strong>
      </div>
      <div className="overview-stat">
        <span>Cámaras Scrypted</span>
        <strong id="stat-cams-scrypted">{loading ? "—" : stats.scryptedTotal}</strong>
        <small id="stat-scrypted-paired" style={{ fontSize: "0.72rem", color: "#34d399", fontWeight: 600 }}>
          {stats.scryptedPaired} emparejada{stats.scryptedPaired === 1 ? "" : "s"}
        </small>
      </div>
      <div className="overview-stat">
        <span>Cámaras HA</span>
        <strong id="stat-cams-ha">{loading ? "—" : stats.haCamsTotal}</strong>
        <small id="stat-ha-paired" style={{ fontSize: "0.72rem", color: "#60a5fa", fontWeight: 600 }}>
          {stats.haCamsPaired} emparejada{stats.haCamsPaired === 1 ? "" : "s"}
        </small>
      </div>
    </section>
  );
};

import React from "react";
import { FilterType } from "../hooks/useAddonState";

interface ControlCenterProps {
  stats: {
    totalDevices: number;
    iotDevices: number;
    totalCameras: number;
    pairedTotal: number;
    pairedNodes: number;
    scryptedTotal: number;
    scryptedPaired: number;
    haCamsTotal: number;
    haCamsPaired: number;
    unpairedTotal: number;
    unactivatedTotal: number;
    mqttCount: number;
    issues: number;
    exportedNodes: number;
  };
  activeFilter: FilterType;
  onFilterChange: (filter: FilterType) => void;
  loading: boolean;
  onRefresh: () => void;
  filteredCount?: number;
}

export const ControlCenter: React.FC<ControlCenterProps> = ({
  stats,
  activeFilter,
  onFilterChange,
  loading,
  onRefresh,
  filteredCount,
}) => {
  const cards: Array<{
    id: FilterType;
    icon: string;
    label: string;
    count: number;
    subtext: string;
    variant?: "default" | "success" | "warning" | "cyan";
  }> = [
    {
      id: "all",
      icon: "🌐",
      label: "TODOS",
      count: stats.totalDevices,
      subtext: `${stats.iotDevices} IoT + ${stats.totalCameras} Cams`,
      variant: "default",
    },
    {
      id: "iot",
      icon: "⚡",
      label: "DISPOSITIVOS IOT",
      count: stats.iotDevices,
      subtext: "Luces, switches, clima",
      variant: "cyan",
    },
    {
      id: "cameras",
      icon: "📹",
      label: "CÁMARAS HAP & MATTER",
      count: stats.totalCameras,
      subtext: `${stats.scryptedTotal} Scrypted · ${stats.haCamsTotal} HA`,
      variant: "default",
    },
    {
      id: "paired",
      icon: "🍏",
      label: "EMPAREJADOS",
      count: stats.pairedTotal,
      subtext: `${stats.pairedNodes} Matter · ${stats.scryptedPaired} HAP`,
      variant: "success",
    },
    {
      id: "unpaired",
      icon: "⏳",
      label: "MATTER ACTIVO SIN EMPAREJAR",
      count: stats.unpairedTotal,
      subtext: "Código QR listo para enlazar",
      variant: "default",
    },
    {
      id: "unactivated",
      icon: "⚪",
      label: "NO ACTIVADOS",
      count: stats.unactivatedTotal,
      subtext: "Dispositivos inactivos",
      variant: "default",
    },
    {
      id: "mqtt",
      icon: "📡",
      label: "DISPOSITIVOS MQTT",
      count: stats.mqttCount,
      subtext: "Auto-Discovery",
      variant: "default",
    },
    {
      id: "issues",
      icon: "⚠️",
      label: "NECESITA ATENCIÓN",
      count: stats.issues,
      subtext: stats.issues > 0 ? `${stats.issues} con incidencias` : "Red saludable",
      variant: stats.issues > 0 ? "warning" : "default",
    },
  ];

  return (
    <section className="liquid-control-center" aria-label="Centro de Control de Dispositivos">
      {/* Top Glass Header Bar */}
      <div className="control-center-header">
        <div className="control-center-title-group">
          <span className="control-center-sparkle" aria-hidden="true">
            ✦
          </span>
          <div>
            <div className="control-center-badge-row">
              <span className="control-center-label">CENTRO DE CONTROL MATTER & HAP</span>
              <span className="control-center-status-pill">
                {stats.issues > 0 ? (
                  <span className="pill-warning">⚠️ {stats.issues} requieren atención</span>
                ) : (
                  <span className="pill-healthy">✓ Red 100% operativa</span>
                )}
              </span>
            </div>
            <strong className="control-center-summary-text">
              {loading
                ? "Sincronizando dispositivos y accesorios…"
                : `${stats.exportedNodes} accesorios activos en Matter · ${stats.pairedTotal} emparejados en el hogar`}
            </strong>
          </div>
        </div>

        <div className="control-center-actions">
          {typeof filteredCount === "number" && (
            <span className="filtered-counter-tag">
              Mostrando: <strong>{filteredCount}</strong>
            </span>
          )}
          <button
            className="refresh-glass-button"
            id="refresh-button"
            type="button"
            onClick={onRefresh}
            title="Recargar estados en tiempo real"
            disabled={loading}
          >
            <span className={loading ? "spin" : ""}>↻</span> Actualizar
          </button>
        </div>
      </div>

      {/* Interactive Liquid Glass Grid */}
      <div className="control-center-grid" role="tablist" aria-label="Filtros de accesorios">
        {cards.map((card) => {
          const isActive = activeFilter === card.id;
          const isWarning = card.variant === "warning" || (card.id === "issues" && card.count > 0);
          const isSuccess = card.variant === "success" || (card.id === "paired" && card.count > 0);

          return (
            <button
              key={card.id}
              role="tab"
              aria-selected={isActive}
              id={`tab-${card.id}`}
              className={`glass-card-tab ${isActive ? "active" : ""} ${isWarning ? "card-warning" : ""} ${isSuccess ? "card-success" : ""}`}
              onClick={() => onFilterChange(card.id)}
              type="button"
            >
              <div className="tab-card-header">
                <span className="tab-card-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="tab-card-title">{card.label}</span>
              </div>

              <div className="tab-card-body">
                <strong className="tab-card-count">{loading ? "—" : card.count}</strong>
              </div>

              <div className="tab-card-footer">
                <span className="tab-card-subtext">{card.subtext}</span>
                {isActive && <span className="active-indicator-dot" />}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

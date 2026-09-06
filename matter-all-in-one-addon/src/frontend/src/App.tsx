import React, { useState, useMemo } from "react";
import { useAddonState, FilterType } from "./hooks/useAddonState";
import { Header } from "./components/Header";
import { ControlCenter } from "./components/ControlCenter";
import { FilterBar } from "./components/FilterBar";
import { CameraBrandGroup } from "./components/CameraBrandGroup";
import { DeviceCard } from "./components/DeviceCard";
import { CameraConfigModal } from "./components/CameraConfigModal";
import { DeviceModal } from "./components/DeviceModal";
import { ScryptedModal } from "./components/ScryptedModal";
import { extractCameraBrand } from "./components/CameraCard";
import { CameraRecord, DeviceRecord } from "./types";
import { api } from "./api/client";

export const App: React.FC = () => {
  const {
    status,
    allDevices,
    cameras,
    realHaCameraDevices,
    scryptedConfig,
    loading,
    searchQuery,
    setSearchQuery,
    activeFilter,
    setActiveFilter,
    stats,
    toastMessage,
    showToast,
    refreshAll,
  } = useAddonState();

  const [selectedCamera, setSelectedCamera] = useState<CameraRecord | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [isScryptedModalOpen, setIsScryptedModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter devices based on search and active tab
  const filteredDevices = useMemo(() => {
    let list = allDevices;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.area && d.area.toLowerCase().includes(q)) ||
        d.entities.some((e) => e.name?.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q))
      );
    }

    switch (activeFilter) {
      case "active":
        return list.filter((d) => d.entities.some((e) => e.exported));
      case "mqtt":
        return list.filter((d) => d.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt.")));
      case "unpaired":
        return list.filter((d) => d.entities.some((e) => e.exported && !e.commissioned));
      case "unexported":
        return list.filter((d) => d.entities.every((e) => !e.exported));
      case "issues":
        return list.filter((d) => d.entities.some((e) => e.exported && e.hasIssue));
      default:
        return list;
    }
  }, [allDevices, searchQuery, activeFilter]);

  // Group cameras by brand when activeFilter === "cameras"
  const cameraBrandGroups = useMemo(() => {
    if (activeFilter !== "cameras") return [];

    const map = new Map<string, { scrypted: CameraRecord[]; ha: DeviceRecord[] }>();

    for (const cam of cameras) {
      if (searchQuery.trim() && !cam.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
        continue;
      }
      const brand = extractCameraBrand(cam);
      if (!map.has(brand)) map.set(brand, { scrypted: [], ha: [] });
      map.get(brand)!.scrypted.push(cam);
    }

    for (const dev of realHaCameraDevices) {
      if (searchQuery.trim() && !dev.name.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
        continue;
      }
      const brand = extractCameraBrand(dev);
      if (!map.has(brand)) map.set(brand, { scrypted: [], ha: [] });
      map.get(brand)!.ha.push(dev);
    }

    const sortedBrands = [...map.keys()].sort((a, b) => {
      const aUnknown = a.toLowerCase().includes("no identificada");
      const bUnknown = b.toLowerCase().includes("no identificada");
      if (aUnknown && !bUnknown) return 1;
      if (!aUnknown && bUnknown) return -1;
      return a.localeCompare(b, "es", { sensitivity: "base" });
    });

    return sortedBrands.map((brand) => ({
      brand,
      scrypted: map.get(brand)!.scrypted,
      ha: map.get(brand)!.ha,
    }));
  }, [activeFilter, cameras, realHaCameraDevices, searchQuery]);

  const handleSyncCameras = async () => {
    setIsSyncing(true);
    showToast("Sincronizando cámaras de Scrypted...");
    try {
      const res = await api.syncCameras();
      showToast(`✓ Sincronización completada. ${res.cameras?.length || 0} cámaras encontradas.`);
      refreshAll();
    } catch (err: any) {
      showToast(err.message || "Error al sincronizar cámaras", true);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRestartService = async () => {
    if (!confirm("¿Deseas reiniciar el servicio de Matter All-in-One?")) return;
    try {
      await api.restartService();
      showToast("Reiniciando servicio...");
    } catch (err: any) {
      showToast(err.message || "Error al reiniciar", true);
    }
  };

  return (
    <div className="layout">
      {/* Sidebar Header */}
      <Header
        status={status}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenSettings={() => setIsScryptedModalOpen(true)}
        onRestartService={handleRestartService}
      />

      {/* Main Content Area */}
      <main className="content">
        <header className="content-header">
          <div>
            <span className="eyebrow">PUBLICACIÓN CONTROLADA</span>
            <h2>Tu espacio Matter</h2>
            <p className="hero-text">
              Activa la entidad principal para publicar el dispositivo físico. Sus capacidades compatibles se
              integran como endpoints bajo un único código Matter.
            </p>
          </div>
          <label className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="search"
              placeholder="Buscar dispositivo o habitación"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
        </header>

        {/* Control Center */}
        <ControlCenter stats={stats} loading={loading} />

        {/* Info Banner */}
        <section className="info-banner" aria-label="Información de emparejamiento">
          <span className="info-icon" aria-hidden="true">✦</span>
          <div>
            <strong>Un dispositivo, un único acceso Matter</strong>
            <p>Cada dispositivo físico tiene un único código QR y manual de emparejamiento.</p>
          </div>
        </section>

        {/* Toolbar */}
        <div className="toolbar">
          <span>
            {activeFilter === "cameras"
              ? `${stats.totalCameras} cámaras · Clasificadas por marca`
              : `${filteredDevices.length} dispositivos · ${stats.exportedNodes} activos en Matter`}
          </span>
          <button className="text-button" type="button" onClick={refreshAll}>
            Actualizar
          </button>
        </div>

        {/* Filter Bar */}
        <FilterBar
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          stats={stats}
          scryptedConfig={scryptedConfig}
          onOpenScryptedModal={() => setIsScryptedModalOpen(true)}
          onSyncCameras={handleSyncCameras}
          isSyncing={isSyncing}
        />

        {/* Device / Camera Grid */}
        <section className="device-grid" aria-label="Dispositivos">
          {loading ? (
            <div className="loading-state" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
              <div className="spinner" />
              <p>Cargando entidades de Home Assistant…</p>
            </div>
          ) : activeFilter === "cameras" ? (
            cameraBrandGroups.length === 0 ? (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
                No se encontraron cámaras configuradas.
              </div>
            ) : (
              cameraBrandGroups.map((group) => (
                <CameraBrandGroup
                  key={group.brand}
                  brand={group.brand}
                  scryptedCameras={group.scrypted}
                  haCameras={group.ha}
                  onConfigureCamera={(cam) => setSelectedCamera(cam)}
                  onConfigureHaDevice={(dev) => setSelectedDevice(dev)}
                />
              ))
            )
          ) : filteredDevices.length === 0 ? (
            <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--text-secondary)" }}>
              No hay dispositivos que coincidan con los filtros seleccionados.
            </div>
          ) : (
            filteredDevices.map((device) => (
              <DeviceCard
                key={device.id}
                device={device}
                searchQuery={searchQuery}
                onConfigure={() => setSelectedDevice(device)}
              />
            ))
          )}
        </section>
      </main>

      {/* Camera Configuration Modal */}
      {selectedCamera && (
        <CameraConfigModal
          camera={selectedCamera}
          onClose={() => setSelectedCamera(null)}
          onRefresh={refreshAll}
          showToast={showToast}
        />
      )}

      {/* Device Configuration Modal */}
      {selectedDevice && (
        <DeviceModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onRefresh={refreshAll}
          showToast={showToast}
        />
      )}

      {/* Scrypted Connection Modal */}
      {isScryptedModalOpen && (
        <ScryptedModal
          config={scryptedConfig}
          onClose={() => setIsScryptedModalOpen(false)}
          onRefresh={refreshAll}
          showToast={showToast}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`toast ${toastMessage.isError ? "error" : "success"}`}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            padding: "12px 20px",
            borderRadius: 10,
            background: toastMessage.isError ? "#ef4444" : "#10b981",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.9rem",
            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            zIndex: 9999,
          }}
        >
          {toastMessage.text}
        </div>
      )}
    </div>
  );
};

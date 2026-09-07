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
import { SettingsModal } from "./components/SettingsModal";
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
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter devices based on search and active tab
  const filteredDevices = useMemo(() => {
    let list = allDevices;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.manufacturer && d.manufacturer.toLowerCase().includes(q)) ||
          (d.model && d.model.toLowerCase().includes(q)) ||
          (d.area && d.area.toLowerCase().includes(q)) ||
          d.entities.some(
            (e) =>
              e.name?.toLowerCase().includes(q) ||
              e.entityId.toLowerCase().includes(q)
          )
      );
    }

    switch (activeFilter) {
      case "active":
        return list.filter((d) => d.entities.some((e) => e.exported));
      case "mqtt":
        return list.filter((d) =>
          d.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."))
        );
      case "unpaired":
        return list.filter((d) =>
          d.entities.some((e) => e.exported && !e.commissioned)
        );
      case "unexported":
        return list.filter((d) => d.entities.every((e) => !e.exported));
      case "issues":
        return list.filter((d) =>
          d.entities.some((e) => e.exported && e.hasIssue)
        );
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
      showToast(`✓ Sincronización completada. ${res?.length || 0} cámaras encontradas.`);
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
    <>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <div className="app-shell">
        {/* Sidebar Header */}
        <Header
          status={status}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
          onRestartService={handleRestartService}
        />

        {/* Main Content Area */}
        <main className="content">
          <header className="content-header">
            <div>
              <p className="eyebrow">
                <span className="eyebrow-pulse" aria-hidden="true" />
                PUBLICACIÓN CONTROLADA
              </p>
              <h2>Tu espacio Matter</h2>
              <p className="lead">
                Activa la entidad principal para publicar el dispositivo físico.
                Sus capacidades compatibles se integran como endpoints bajo un
                único código Matter.
              </p>
            </div>
            <label className="search" htmlFor="device-search">
              <span aria-hidden="true">⌕</span>
              <input
                id="device-search"
                type="search"
                placeholder="Buscar dispositivo o habitación"
                autoComplete="off"
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
              <p>
                Cada dispositivo físico tiene un único código QR y manual de
                emparejamiento. Los endpoints integrados comparten ese código.
              </p>
            </div>
          </section>

          {/* Toolbar */}
          <div className="toolbar">
            <span id="device-count">
              {activeFilter === "cameras"
                ? `${stats.totalCameras} cámaras · Clasificadas por marca`
                : `${filteredDevices.length} dispositivos · ${stats.exportedNodes} activos en Matter`}
            </span>
            <button className="text-button" id="refresh-button" type="button" onClick={refreshAll}>
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
          <section className="device-grid" id="device-list" aria-live="polite" aria-busy={loading}>
            {loading ? (
              <div className="empty-state" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
                <span className="spinner" />
                <p>Cargando entidades de Home Assistant…</p>
              </div>
            ) : activeFilter === "cameras" ? (
              cameraBrandGroups.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
                  <p>No se encontraron cámaras configuradas.</p>
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
              <div className="empty-state" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
                <p>No hay dispositivos que coincidan con los filtros seleccionados.</p>
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
      </div>

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

      {/* General Settings Modal (MQTT, Restart, Reset) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        showToast={showToast}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`toast show${toastMessage.isError ? " error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toastMessage.text}
        </div>
      )}
    </>
  );
};

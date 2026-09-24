import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAddonState, FilterType } from "./hooks/useAddonState";
import { TopBar } from "./components/TopBar";
import { ControlCenter } from "./components/ControlCenter";
import { FilterBar } from "./components/FilterBar";
import { CameraBrandGroup } from "./components/CameraBrandGroup";
import { DeviceCard } from "./components/DeviceCard";
import { CameraConfigModal } from "./components/CameraConfigModal";
import { DeviceModal } from "./components/DeviceModal";
import { ScryptedModal } from "./components/ScryptedModal";
import { CameraUiModal } from "./components/CameraUiModal";
import { SettingsModal } from "./components/SettingsModal";
import { extractCameraBrand } from "./components/CameraCard";
import {
  CameraRecord,
  CameraUiCameraItem,
  DeviceRecord,
  CameraSensorRecord,
  CameraRealEntity,
} from "./types";
import { api } from "./api/client";

export const App: React.FC = () => {
  const {
    status,
    allDevices,
    cameras,
    cameraUiCameras,
    realHaCameraDevices,
    scryptedConfig,
    cameraUiConfig,
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
  const [selectedCameraUiCamera, setSelectedCameraUiCamera] = useState<CameraUiCameraItem | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceRecord | null>(null);
  const [isScryptedModalOpen, setIsScryptedModalOpen] = useState(false);
  const [isCameraUiModalOpen, setIsCameraUiModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Keep selectedDevice in sync with updated allDevices from periodic polls / SSE / refreshAll
  useEffect(() => {
    if (!selectedDevice) return;
    const updated = allDevices.find((d) => d.id === selectedDevice.id);
    if (updated) {
      setSelectedDevice(updated);
    }
  }, [allDevices]);

  // Keep selectedCamera in sync with updated cameras
  useEffect(() => {
    if (!selectedCamera) return;
    const updated = cameras.find((c) => c.cameraId === selectedCamera.cameraId);
    if (updated) {
      setSelectedCamera(updated);
    }
  }, [cameras]);

  // Keep selectedCameraUiCamera in sync with updated cameraUiCameras
  useEffect(() => {
    if (!selectedCameraUiCamera) return;
    const updated = cameraUiCameras.find((c) => c.id === selectedCameraUiCamera.id);
    if (updated) {
      setSelectedCameraUiCamera(updated);
    }
  }, [cameraUiCameras]);

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

    const haCameraIds = new Set(realHaCameraDevices.map((d) => d.id));
    const iotOnlyList = list.filter((d) => !haCameraIds.has(d.id));

    switch (activeFilter) {
      case "all":
        return iotOnlyList;
      case "iot":
        return iotOnlyList;
      case "cameras":
        return [];
      case "paired":
        return iotOnlyList.filter((d) =>
          d.entities.some((e) => e.exported && e.commissioned)
        );
      case "unpaired":
        return iotOnlyList.filter((d) =>
          d.entities.some((e) => e.exported && !e.commissioned)
        );
      case "unactivated":
        return iotOnlyList.filter(
          (d) => !d.entities.some((e) => e.exported || e.commissioned)
        );
      case "mqtt":
        return iotOnlyList.filter((d) =>
          d.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."))
        );
      case "issues":
        return iotOnlyList.filter((d) => {
          return d.entities.some((e) => {
            if (!e.exported) return false;
            return (
              e.hasIssue ||
              e.state === "unavailable" ||
              e.state === "unknown" ||
              e.state === "offline"
            );
          });
        });
      default:
        return iotOnlyList;
    }
  }, [allDevices, realHaCameraDevices, searchQuery, activeFilter]);

  // Group cameras by brand when relevant to active tab
  const cameraBrandGroups = useMemo(() => {
    if (activeFilter === "iot" || activeFilter === "mqtt") return [];

    const map = new Map<string, { scrypted: CameraRecord[]; ha: DeviceRecord[]; cui: CameraUiCameraItem[] }>();

    let scryptedList = cameras;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      scryptedList = scryptedList.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (activeFilter === "paired") {
      scryptedList = scryptedList.filter(
        (c) => c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true
      );
    } else if (activeFilter === "unpaired") {
      // Only cameras with active bridge waiting to be paired
      scryptedList = scryptedList.filter(
        (c) =>
          Boolean(c.identity?.matterPairingCode) &&
          !(c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true)
      );
    } else if (activeFilter === "unactivated") {
      // Cameras not paired and without active bridge
      scryptedList = scryptedList.filter(
        (c) =>
          !(c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true) &&
          !Boolean(c.identity?.matterPairingCode)
      );
    } else if (activeFilter === "issues") {
      scryptedList = scryptedList.filter((c) => {
        const isCameraActive =
          c.identity?.homeKitPairingState === "paired" ||
          c.bindingState?.matterCommissioned === true ||
          Boolean(c.identity?.matterPairingCode);
        if (!isCameraActive) return false;
        return (
          c.status?.connection === "offline" ||
          c.status?.isOnline === false ||
          Boolean(c.status?.lastError) ||
          (c as any).hasIssue === true
        );
      });
    }

    for (const cam of scryptedList) {
      const brand = extractCameraBrand(cam);
      if (!map.has(brand)) map.set(brand, { scrypted: [], ha: [], cui: [] });
      map.get(brand)!.scrypted.push(cam);
    }

    let cuiList = cameraUiCameras;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      cuiList = cuiList.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (activeFilter === "paired") {
      cuiList = cuiList.filter((c) => c.isPaired === true);
    } else if (activeFilter === "unpaired") {
      cuiList = cuiList.filter((c) => c.homeKitEnabled && !c.isPaired);
    } else if (activeFilter === "unactivated") {
      cuiList = cuiList.filter((c) => !c.homeKitEnabled);
    } else if (activeFilter === "issues") {
      cuiList = cuiList.filter((c) => c.status === "offline");
    }

    for (const cam of cuiList) {
      const brand = extractCameraBrand(cam);
      if (!map.has(brand)) map.set(brand, { scrypted: [], ha: [], cui: [] });
      map.get(brand)!.cui.push(cam);
    }

    let haList = realHaCameraDevices;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      haList = haList.filter((d) => d.name.toLowerCase().includes(q));
    }

    if (activeFilter === "paired") {
      haList = haList.filter((d) =>
        d.entities.some((e) => e.homekitCamera?.isPaired || (e.exported && e.commissioned))
      );
    } else if (activeFilter === "unpaired") {
      haList = haList.filter((d) =>
        d.entities.some(
          (e) =>
            (e.exported || e.homekitCamera?.published) &&
            !e.homekitCamera?.isPaired &&
            !e.commissioned
        )
      );
    } else if (activeFilter === "unactivated") {
      haList = haList.filter(
        (d) =>
          !d.entities.some(
            (e) =>
              e.exported ||
              e.commissioned ||
              e.homekitCamera?.isPaired ||
              e.homekitCamera?.published
          )
      );
    } else if (activeFilter === "issues") {
      haList = haList.filter((d) => {
        const isCameraActive = d.entities.some(
          (e) =>
            e.exported ||
            e.commissioned ||
            e.homekitCamera?.published ||
            e.homekitCamera?.isPaired
        );
        if (!isCameraActive) return false;
        return d.entities.some(
          (e) =>
            e.hasIssue ||
            e.state === "unavailable" ||
            e.state === "unknown" ||
            e.state === "offline" ||
            (Array.isArray(e.logs) &&
              e.logs.length > 0 &&
              (e.exported || e.homekitCamera?.published))
        );
      });
    }

    for (const dev of haList) {
      const brand = extractCameraBrand(dev);
      if (!map.has(brand)) map.set(brand, { scrypted: [], ha: [], cui: [] });
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
      cui: map.get(brand)!.cui,
    }));
  }, [activeFilter, cameras, cameraUiCameras, realHaCameraDevices, searchQuery]);

  const totalVisibleCount = useMemo(() => {
    const cams = cameraBrandGroups.reduce(
      (acc, g) => acc + g.scrypted.length + g.ha.length + g.cui.length,
      0
    );
    return filteredDevices.length + cams;
  }, [cameraBrandGroups, filteredDevices]);

  const adaptHaDeviceToCameraRecord = useCallback((dev: DeviceRecord): CameraRecord => {
    const camEnt = dev.entities.find((e) => e.domain === "camera");
    const isNest =
      (dev.manufacturer || "").toLowerCase().includes("google") ||
      (dev.manufacturer || "").toLowerCase().includes("nest") ||
      (dev.name || "").toLowerCase().includes("nest") ||
      Boolean(camEnt?.entityId.toLowerCase().includes("nest"));

    const realSensors: CameraSensorRecord[] = dev.entities
      .filter((e) => e.domain === "binary_sensor")
      .map((e) => ({
        name: e.name || e.entityId,
        sensorId: e.entityId,
        type: (e.entityId.includes("doorbell") || e.name?.toLowerCase().includes("timbre")
          ? "doorbell"
          : "motion") as "motion" | "doorbell",
        enabled: true,
        state: e.state === "on",
      }));

    const realEntities: CameraRealEntity[] = dev.entities
      .filter(
        (e) =>
          e.domain === "binary_sensor" ||
          e.domain === "light" ||
          e.domain === "siren" ||
          e.domain === "switch" ||
          e.domain === "event"
      )
      .map((e) => ({
        id: e.entityId,
        domain: e.domain as "binary_sensor" | "light" | "siren" | "switch" | "event",
        name: e.name || e.entityId,
        type: (e.entityId.includes("doorbell") || e.name?.toLowerCase().includes("timbre")
          ? "doorbell"
          : e.domain === "light"
          ? "light"
          : e.domain === "siren"
          ? "siren"
          : e.domain === "switch"
          ? "switch"
          : "motion") as "motion" | "light" | "siren" | "doorbell" | "switch",
        state: e.state === "on",
        matterExported: Boolean(e.exported),
      }));

    const isPaired = dev.entities.some(
      (e) => e.homekitCamera?.isPaired || (e.exported && e.commissioned)
    );

    return {
      cameraId: camEnt?.entityId || dev.id,
      name: dev.name,
      manufacturer: dev.manufacturer || (isNest ? "Google" : "Home Assistant"),
      model: dev.model || (isNest ? "Nest Cam" : "Cámara IP"),
      serialNumber: dev.id,
      status: {
        connection: "online",
        isOnline: true,
      },
      sensors: realSensors,
      realEntities,
      identity: {
        homeKitPairingState: isPaired ? "paired" : "not_paired",
        homeKitSetupId: "HA01",
        homeKitPincode: "031-45-154",
      },
      source: {
        streamReference: {
          directUrl: (camEnt as any)?.stream_source || "",
        },
      },
    };
  }, []);

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
        {/* Top Bar with Brand, Status, and Actions */}
        <TopBar
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

          {/* Liquid Glass Interactive Control Center */}
          <ControlCenter
            stats={stats}
            activeFilter={activeFilter}
            onFilterChange={setActiveFilter}
            loading={loading}
            onRefresh={refreshAll}
            filteredCount={totalVisibleCount}
          />

          {/* Contextual Scrypted & Camera.UI Bar */}
          <FilterBar
            activeFilter={activeFilter}
            stats={stats}
            scryptedConfig={scryptedConfig}
            cameraUiConfig={cameraUiConfig}
            onOpenScryptedModal={() => setIsScryptedModalOpen(true)}
            onOpenCameraUiModal={() => setIsCameraUiModalOpen(true)}
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
            ) : (
              <>
                {cameraBrandGroups.map((group) => (
                  <CameraBrandGroup
                    key={group.brand}
                    brand={group.brand}
                    scryptedCameras={group.scrypted}
                    haCameras={group.ha}
                    cameraUiCameras={group.cui}
                    onConfigureCamera={(cam) => setSelectedCamera(cam)}
                    onConfigureHaDevice={(dev) => setSelectedCamera(adaptHaDeviceToCameraRecord(dev))}
                    onConfigureCameraUiCamera={(cam) => setSelectedCameraUiCamera(cam)}
                  />
                ))}

                {filteredDevices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    searchQuery={searchQuery}
                    onConfigure={() => setSelectedDevice(device)}
                  />
                ))}

                {cameraBrandGroups.length === 0 && filteredDevices.length === 0 && (
                  <div className="empty-state" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
                    <p>
                      {activeFilter === "cameras"
                        ? "No se encontraron cámaras configuradas."
                        : activeFilter === "mqtt"
                        ? "No se encontraron dispositivos MQTT configurados."
                        : activeFilter === "paired"
                        ? "No hay accesorios vinculados en Matter ni en HAP todavía."
                        : activeFilter === "unpaired"
                        ? "No hay accesorios pendientes de emparejar (todos los accesorios activos ya están vinculados)."
                        : activeFilter === "unactivated"
                        ? "No hay dispositivos inactivos disponibles."
                        : activeFilter === "issues"
                        ? "No hay incidencias registradas en este momento."
                        : "No hay dispositivos que coincidan con los filtros seleccionados."}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>
        </main>
      </div>

      {/* Unified Camera Configuration Modal (Scrypted & Camera.UI) */}
      {(selectedCamera || selectedCameraUiCamera) && (
        <CameraConfigModal
          camera={selectedCamera || selectedCameraUiCamera}
          onClose={() => {
            setSelectedCamera(null);
            setSelectedCameraUiCamera(null);
          }}
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

      {/* Camera.UI Connection Modal */}
      {isCameraUiModalOpen && (
        <CameraUiModal
          config={cameraUiConfig}
          onClose={() => setIsCameraUiModalOpen(false)}
          onRefresh={refreshAll}
          showToast={showToast}
        />
      )}

      {/* General Settings Modal (MQTT, Restart, Reset, Live Console) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        showToast={showToast}
        status={status}
        stats={stats}
        onRefresh={refreshAll}
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

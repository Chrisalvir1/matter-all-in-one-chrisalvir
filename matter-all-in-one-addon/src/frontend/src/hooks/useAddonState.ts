import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import {
  CameraRecord,
  CameraUiCameraItem,
  CameraUiConfigResponse,
  DeviceRecord,
  EntityRecord,
  ScryptedConfigResponse,
  StatusResponse,
} from "../types";

export type FilterType =
  | "all"
  | "iot"
  | "cameras"
  | "paired"
  | "unpaired"
  | "unactivated"
  | "mqtt"
  | "issues";

export function useAddonState() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [cameraUiCameras, setCameraUiCameras] = useState<CameraUiCameraItem[]>([]);
  const [scryptedConfig, setScryptedConfig] = useState<ScryptedConfigResponse | null>(null);
  const [cameraUiConfig, setCameraUiConfig] = useState<CameraUiConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const showToast = useCallback((text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => {
      setToastMessage((current) => (current?.text === text ? null : current));
    }, 4000);
  }, []);

  const refreshAll = useCallback(async () => {
    try {
      const [
        statusRes,
        devicesRes,
        camerasRes,
        scryptedRes,
        cameraUiRes,
        cameraUiCamsRes,
      ] = await Promise.allSettled([
        api.getStatus(),
        api.getDevices(),
        api.getCameras(),
        api.getScryptedConfig(),
        api.getCameraUiConfig(),
        api.getCameraUiCameras(),
      ]);

      if (statusRes.status === "fulfilled") setStatus(statusRes.value);
      if (devicesRes.status === "fulfilled") {
        const raw = devicesRes.value;
        const list = Array.isArray(raw) ? raw : (raw as any)?.entities || [];
        setEntities(list);
      }
      if (camerasRes.status === "fulfilled") {
        const raw = camerasRes.value;
        const list = Array.isArray(raw) ? raw : (raw as any)?.cameras || [];
        setCameras(list);
      }
      if (cameraUiCamsRes.status === "fulfilled") {
        const raw = cameraUiCamsRes.value;
        setCameraUiCameras(Array.isArray(raw) ? raw : []);
      }
      if (scryptedRes.status === "fulfilled") setScryptedConfig(scryptedRes.value);
      if (cameraUiRes.status === "fulfilled") setCameraUiConfig(cameraUiRes.value);
    } catch (err: any) {
      console.error("Error refreshing addon state:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load and periodic polling
  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // Server-Sent Events (SSE) listener
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: any = null;

    const connectSSE = () => {
      try {
        es = new EventSource("./api/custom/events");
        es.onmessage = (event) => {
          if (!event.data || event.data.startsWith(":")) return;
          try {
            const data = JSON.parse(event.data);
            if (
              data.type === "device_update" ||
              data.type === "camera_update" ||
              data.type === "state_change" ||
              data.type === "scrypted_status" ||
              data.type === "camera_pairing_updated" ||
              data.type === "cameraui_updated" ||
              data.type === "entity_state_changed"
            ) {
              refreshAll();
            }
          } catch {}
        };
        es.onerror = () => {
          es?.close();
          timer = setTimeout(connectSSE, 5000);
        };
      } catch {
        timer = setTimeout(connectSSE, 5000);
      }
    };

    connectSSE();
    return () => {
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [refreshAll]);

  // Group entities into physical devices
  const allDevices: DeviceRecord[] = useMemo(() => {
    const map = new Map<string, DeviceRecord>();
    for (const entity of entities) {
      const id = entity.compositeDeviceId
        ? `matter:${entity.compositeDeviceId}`
        : entity.device_id || `entity:${entity.entityId}`;

      if (!map.has(id)) {
        map.set(id, {
          id,
          name: entity.device_name || entity.name || entity.area_name || entity.domain,
          area: entity.area_name || "",
          manufacturer: entity.manufacturer || "",
          model: entity.model || "",
          entities: [],
        });
      }
      map.get(id)!.entities.push(entity);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [entities]);

  // Only suppress duplicate HA cameras if Scrypted is actively connected and reachable
  const isScryptedConnected =
    scryptedConfig?.connectionStatus === "connected" ||
    (status as any)?.scrypted?.connected === true;

  // Scrypted names and IDs to avoid duplicating HA camera representations
  const scryptedNames = useMemo(
    () =>
      isScryptedConnected
        ? new Set(cameras.map((c) => (c.name || "").toLowerCase().trim()))
        : new Set<string>(),
    [cameras, isScryptedConnected]
  );
  const scryptedIds = useMemo(
    () =>
      isScryptedConnected
        ? new Set(cameras.map((c) => String(c.cameraId).toLowerCase().trim()))
        : new Set<string>(),
    [cameras, isScryptedConnected]
  );

  // Real HA Camera devices
  const realHaCameraDevices = useMemo(() => {
    return allDevices.filter((device) =>
      device.entities.some(
        (entity) =>
          entity.domain === "camera" &&
          !entity.auxiliary &&
          !entity.entityId.includes("map") &&
          !entity.entityId.includes("radar") &&
          !entity.entityId.includes("screen") &&
          !scryptedNames.has((device.name || "").toLowerCase().trim()) &&
          !scryptedIds.has((device.id || "").toLowerCase().trim())
      )
    );
  }, [allDevices, scryptedNames, scryptedIds]);

  // Stats for Control Center and Filters
  const stats = useMemo(() => {
    const matterNodeKey = (e: EntityRecord) => e.compositeDeviceId || e.entityId;
    const exportedNodes = new Set(entities.filter((e) => e.exported).map(matterNodeKey)).size;
    const pairedNodes = new Set(entities.filter((e) => e.exported && e.commissioned).map(matterNodeKey)).size;
    const pendingNodes = new Set(entities.filter((e) => e.exported && !e.commissioned).map(matterNodeKey)).size;
    const exportedEntities = entities.filter((e) => e.exported).length;
    const pairedEntities = entities.filter((e) => e.exported && e.commissioned).length;

    const mqttCount = allDevices.filter((d) =>
      d.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."))
    ).length;

    const haCameraIds = new Set(realHaCameraDevices.map((d) => d.id));
    const scryptedTotal = cameras.length;
    const haCamsTotal = realHaCameraDevices.length;
    const camerauiTotal = cameraUiCameras.length;
    const totalCameras = scryptedTotal + haCamsTotal + camerauiTotal;
    const iotDevices = allDevices.filter((d) => !haCameraIds.has(d.id)).length;

    // Paired total includes all active paired accessories (Matter nodes + Scrypted HAP/Matter cameras + Camera.UI HAP)
    const scryptedPaired = cameras.filter(
      (c) => c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true
    ).length;
    const haCamsPaired = realHaCameraDevices.filter((d) =>
      d.entities.some((e) => e.exported && e.commissioned)
    ).length;
    const camerauiPaired = cameraUiCameras.filter((c) => c.isPaired).length;
    const pairedTotal = pairedNodes + scryptedPaired + camerauiPaired;

    // Unpaired total represents accessories actively exported for Matter/HomeKit but waiting to be commissioned
    const scryptedPending = cameras.filter(
      (c) =>
        Boolean(c.identity?.matterPairingCode) &&
        !(c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true)
    ).length;
    const camerauiPending = cameraUiCameras.filter((c) => c.homeKitEnabled && !c.isPaired).length;
    const unpairedTotal = pendingNodes + scryptedPending + camerauiPending;

    // Unactivated devices: discovered devices and cameras that are neither exported nor commissioned
    const unactivatedDevices = allDevices.filter(
      (d) => !d.entities.some((e) => e.exported || e.commissioned)
    ).length;
    const unactivatedScrypted = cameras.filter(
      (c) =>
        !(c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true) &&
        !Boolean(c.identity?.matterPairingCode)
    ).length;
    const unactivatedCameraUi = cameraUiCameras.filter((c) => !c.homeKitEnabled).length;
    const unactivatedTotal = unactivatedDevices + unactivatedScrypted + unactivatedCameraUi;

    // Issues detection across all ACTIVE (exported) HA, MQTT devices and Cameras
    const issuesDevices = allDevices.filter((d) => {
      return d.entities.some((e) => {
        if (!e.exported) return false;
        return (
          e.hasIssue ||
          e.state === "unavailable" ||
          e.state === "unknown" ||
          e.state === "offline"
        );
      });
    }).length;

    const issuesCameras = cameras.filter((c) => {
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
    }).length;

    const issuesCameraUi = cameraUiCameras.filter((c) => {
      return c.homeKitEnabled !== false && c.status === "offline";
    }).length;

    const issues = issuesDevices + issuesCameras + issuesCameraUi;

    return {
      totalDevices: iotDevices + totalCameras,
      rawDevicesCount: allDevices.length,
      iotDevices,
      exportedNodes,
      pairedNodes,
      pendingNodes,
      exportedEntities,
      pairedEntities,
      pairedTotal,
      unpairedTotal,
      unactivatedTotal,
      issues,
      mqttCount,
      scryptedTotal,
      scryptedPaired,
      camerauiTotal,
      camerauiPaired,
      haCamsTotal,
      haCamsPaired,
      totalCameras,
    };
  }, [entities, allDevices, cameras, realHaCameraDevices, cameraUiCameras]);

  return {
    status,
    entities,
    cameras,
    cameraUiCameras,
    allDevices,
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
  };
}

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../api/client";
import { CameraRecord, DeviceRecord, EntityRecord, ScryptedConfigResponse, StatusResponse } from "../types";

export type FilterType = "all" | "iot" | "cameras" | "paired" | "unpaired" | "unexported" | "mqtt" | "issues";

export function useAddonState() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [scryptedConfig, setScryptedConfig] = useState<ScryptedConfigResponse | null>(null);
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
      const [statusRes, devicesRes, camerasRes, scryptedRes] = await Promise.allSettled([
        api.getStatus(),
        api.getDevices(),
        api.getCameras(),
        api.getScryptedConfig(),
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
      if (scryptedRes.status === "fulfilled") setScryptedConfig(scryptedRes.value);
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
            if (data.type === "state_changed" && data.payload?.entityId) {
              const { entityId, state: newState, attributes: newAttrs } = data.payload;
              setEntities((prev) =>
                prev.map((e) =>
                  e.entityId === entityId
                    ? {
                        ...e,
                        state: newState ?? e.state,
                        attributes: { ...e.attributes, ...newAttrs },
                      }
                    : e
                )
              );
            } else if (
              data.type === "device_update" ||
              data.type === "camera_update" ||
              data.type === "state_change" ||
              data.type === "state_changed" ||
              data.type === "scrypted_status"
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

  // Scrypted names and IDs to avoid duplicating HA camera representations
  const scryptedNames = useMemo(
    () => new Set(cameras.map((c) => (c.name || "").toLowerCase().trim())),
    [cameras]
  );
  const scryptedIds = useMemo(
    () => new Set(cameras.map((c) => String(c.cameraId).toLowerCase().trim())),
    [cameras]
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
    const issues = allDevices.filter((d) => d.entities.some((e) => e.exported && e.hasIssue)).length;
    const mqttCount = allDevices.filter((d) =>
      d.entities.some((e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."))
    ).length;

    const scryptedTotal = cameras.length;
    const scryptedPaired = cameras.filter(
      (c) => c.identity?.homeKitPairingState === "paired" || c.bindingState?.matterCommissioned === true
    ).length;

    const haCamsTotal = realHaCameraDevices.length;
    const haCamsPaired = realHaCameraDevices.filter((d) =>
      d.entities.some((e) => e.exported && e.commissioned)
    ).length;

    const totalCameras = scryptedTotal + haCamsTotal;
    const iotDevices = allDevices.filter((d) => !d.entities.every((e) => e.domain === "camera")).length;
    const unexportedCount = allDevices.filter(
      (d) => !d.entities.every((e) => e.domain === "camera") && !d.entities.some((e) => e.exported)
    ).length;
    const pairedTotal = pairedNodes + scryptedPaired + haCamsPaired;
    const unpairedTotal = pendingNodes + (scryptedTotal - scryptedPaired) + (haCamsTotal - haCamsPaired);

    return {
      totalDevices: allDevices.length,
      iotDevices,
      unexportedCount,
      exportedNodes,
      pairedNodes,
      pendingNodes,
      pairedTotal,
      unpairedTotal,
      issues,
      mqttCount,
      scryptedTotal,
      scryptedPaired,
      haCamsTotal,
      haCamsPaired,
      totalCameras,
    };
  }, [entities, allDevices, cameras, realHaCameraDevices]);

  return {
    status,
    entities,
    cameras,
    allDevices,
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
  };
}

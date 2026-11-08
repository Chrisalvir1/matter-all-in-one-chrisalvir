import {
  cameraUiNeedsAttention,
  deviceNeedsAttention,
  scryptedNeedsAttention,
} from "../utils/accessory-issues";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

function hasCameraEntity(device: DeviceRecord) {
  return device.entities.some(isCameraEntity);
}

function isCameraEntity(entity: EntityRecord) {
  return (
    entity.domain === "camera" &&
    !entity.auxiliary &&
    !["map", "radar", "screen"].some((type) => entity.entityId.includes(type))
  );
}

export function useAddonState() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [entities, setEntities] = useState<EntityRecord[]>([]);
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [cameraUiCameras, setCameraUiCameras] = useState<CameraUiCameraItem[]>(
    [],
  );
  const [scryptedConfig, setScryptedConfig] =
    useState<ScryptedConfigResponse | null>(null);
  const [cameraUiConfig, setCameraUiConfig] =
    useState<CameraUiConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const refreshInFlight = useRef(false);
  const refreshRequested = useRef(false);
  const realtimeUpdates = useRef(
    new Map<string, { state: string; attributes: Record<string, unknown> }>(),
  );
  const [partialLoadErrors, setPartialLoadErrors] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const showToast = useCallback((text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => {
      setToastMessage((current) => (current?.text === text ? null : current));
    }, 4000);
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshRequested.current = true;
      return;
    }
    refreshInFlight.current = true;
    try {
      do {
        refreshRequested.current = false;
        realtimeUpdates.current.clear();
        const jobs = [
          api.getStatus().then(setStatus, (error) => {
            setStatus(null);
            throw error;
          }),
          api
            .getDevices()
            .then((raw) => {
              const list = Array.isArray(raw)
                ? raw
                : Array.isArray((raw as any)?.entities)
                  ? (raw as any).entities
                  : [];
              setEntities(
                list.map((item: EntityRecord) => {
                  const update = realtimeUpdates.current.get(item.entityId);
                  return update
                    ? {
                        ...item,
                        state: update.state,
                        attributes: {
                          ...item.attributes,
                          ...update.attributes,
                        },
                      }
                    : item;
                }),
              );
              setLoadError(null);
            })
            .catch((error) =>
              setLoadError(
                `No se pudieron cargar los dispositivos: ${error.message || error}`,
              ),
            )
            .finally(() => setLoading(false)),
          api
            .getCameras()
            .then((raw) =>
              setCameras(
                Array.isArray(raw) ? raw : (raw as any)?.cameras || [],
              ),
            ),
          api.getScryptedConfig().then(setScryptedConfig),
          api.getCameraUiConfig().then(setCameraUiConfig),
          api
            .getCameraUiCameras()
            .then((raw) => setCameraUiCameras(Array.isArray(raw) ? raw : [])),
        ];
        const results = await Promise.allSettled(jobs);
        const labels = [
          "Estado de Home Assistant",
          "Dispositivos",
          "Cámaras",
          "Configuración Scrypted",
          "Configuración Camera.UI",
          "Cámaras Camera.UI",
        ];
        setPartialLoadErrors(
          labels.filter((_, index) => results[index].status === "rejected"),
        );
      } while (refreshRequested.current);
    } finally {
      refreshInFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let stateFrame: number | undefined;
    const pendingStates = new Map<
      string,
      { state: string; attributes: Record<string, unknown> }
    >();
    let sseConnected = false;
    let everConnected = false;
    let disposed = false;
    const scheduleRefresh = () => {
      if (!refreshTimer)
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          void refreshAll();
        }, 1000);
    };
    void refreshAll();
    const fallbackPoll = setInterval(() => {
      if (!sseConnected) void refreshAll();
    }, 60000);
    const connectSSE = () => {
      if (disposed) return;
      try {
        es = new EventSource("./api/custom/events");
        es.onopen = () => {
          sseConnected = true;
          if (everConnected) scheduleRefresh();
          everConnected = true;
        };
        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "state_changed" && data.entityId) {
              const attributes = data.attributes || {};
              const previousUpdate = pendingStates.get(data.entityId);
              const update = {
                state: data.state,
                attributes: { ...previousUpdate?.attributes, ...attributes },
              };
              if (refreshInFlight.current) {
                const previous = realtimeUpdates.current.get(data.entityId);
                realtimeUpdates.current.set(data.entityId, {
                  state: update.state,
                  attributes: { ...previous?.attributes, ...attributes },
                });
              }
              pendingStates.set(data.entityId, update);
              if (stateFrame === undefined) {
                stateFrame = requestAnimationFrame(() => {
                  stateFrame = undefined;
                  const updates = new Map(pendingStates);
                  pendingStates.clear();
                  setEntities((previous) =>
                    previous.map((item) => {
                      const change = updates.get(item.entityId);
                      return change
                        ? {
                            ...item,
                            state: change.state,
                            attributes: {
                              ...item.attributes,
                              ...change.attributes,
                            },
                          }
                        : item;
                    }),
                  );
                });
              }
            } else if (
              [
                "device_update",
                "camera_update",
                "cameras_updated",
                "state_change",
                "scrypted_status",
                "camera_pairing_updated",
                "cameraui_updated",
                "entity_state_changed",
              ].includes(data.type)
            ) {
              scheduleRefresh();
            }
          } catch {
            /* malformed event; next refresh reconciles state */
          }
        };
        es.onerror = () => {
          sseConnected = false;
          es?.close();
          timer = setTimeout(connectSSE, 5000);
        };
      } catch {
        timer = setTimeout(connectSSE, 5000);
      }
    };
    connectSSE();
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      clearInterval(fallbackPoll);
      if (stateFrame !== undefined) cancelAnimationFrame(stateFrame);
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
          name:
            entity.device_name ||
            entity.name ||
            entity.area_name ||
            entity.domain,
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

  const scryptedIds = useMemo(
    () =>
      new Set(
        isScryptedConnected
          ? cameras.map((camera) =>
              String(camera.cameraId).toLowerCase().trim(),
            )
          : [],
      ),
    [cameras, isScryptedConnected],
  );

  // Real HA Camera devices (deduplicated against both Scrypted and Camera.UI cameras)
  const realHaCameraDevices = useMemo(() => {
    const cuiEntityIds = new Set<string>();
    for (const cam of cameraUiCameras) {
      if (Array.isArray(cam.realEntities)) {
        for (const re of cam.realEntities) {
          if (re.id) cuiEntityIds.add(re.id.toLowerCase().trim());
        }
      }
    }

    return allDevices.filter((device) =>
      device.entities.some(
        (entity) =>
          isCameraEntity(entity) &&
          !scryptedIds.has(entity.entityId.toLowerCase().trim()) &&
          !cuiEntityIds.has(entity.entityId.toLowerCase().trim()) &&
          !cuiEntityIds.has(device.id.toLowerCase().trim()),
      ),
    );
  }, [allDevices, scryptedIds, cameraUiCameras]);

  const iotDevices = useMemo(
    () => allDevices.filter((device) => !hasCameraEntity(device)),
    [allDevices],
  );

  // Stats for Control Center and Filters
  const stats = useMemo(() => {
    const matterNodeKey = (e: EntityRecord) =>
      e.compositeDeviceId || e.entityId;
    const exportedNodes = new Set(
      entities.filter((e) => e.exported).map(matterNodeKey),
    ).size;
    const pairedNodes = new Set(
      entities.filter((e) => e.exported && e.commissioned).map(matterNodeKey),
    ).size;
    const pendingNodes = new Set(
      entities.filter((e) => e.exported && !e.commissioned).map(matterNodeKey),
    ).size;
    const exportedEntities = entities.filter((e) => e.exported).length;
    const pairedEntities = entities.filter(
      (e) => e.exported && e.commissioned,
    ).length;

    const mqttCount = allDevices.filter((d) =>
      d.entities.some(
        (e) => e.origin === "mqtt" || e.entityId.startsWith("mqtt."),
      ),
    ).length;

    const scryptedTotal = cameras.length;
    const haCamsTotal = realHaCameraDevices.length;
    const camerauiTotal = cameraUiCameras.length;
    const totalCameras = scryptedTotal + haCamsTotal + camerauiTotal;

    const scryptedMatterPaired = cameras.filter(
      (c) => c.bindingState?.matterCommissioned === true,
    ).length;
    // HA camera entities are already included in pairedNodes above.
    const pairedMatterTotal = pairedNodes + scryptedMatterPaired;

    // Keep HAP accessories separate from Matter, including non-camera HAP profiles.
    const genericHapPaired = entities.filter(
      (e) => e.hapAccessory?.published && e.hapAccessory?.isPaired,
    ).length;
    const scryptedHapPaired = cameras.filter(
      (c) => c.identity?.homeKitPairingState === "paired",
    ).length;
    const haCamsHapPaired = realHaCameraDevices.filter((d) =>
      d.entities.some((e) => e.homekitCamera?.isPaired),
    ).length;
    const camerauiPaired = cameraUiCameras.filter((c) => c.isPaired).length;
    const pairedHapTotal =
      genericHapPaired + scryptedHapPaired + haCamsHapPaired + camerauiPaired;
    const pairedTotal = pairedMatterTotal + pairedHapTotal;

    // Unpaired total represents accessories actively exported for Matter/HomeKit but waiting to be commissioned
    const haCamsPending = realHaCameraDevices.filter((d) =>
      d.entities.some(
        (e) =>
          (e.exported || e.homekitCamera?.published) &&
          !e.homekitCamera?.isPaired &&
          !e.commissioned,
      ),
    ).length;
    const scryptedPending = cameras.filter(
      (c) =>
        Boolean(c.identity?.matterPairingCode) &&
        !(
          c.identity?.homeKitPairingState === "paired" ||
          c.bindingState?.matterCommissioned === true
        ),
    ).length;
    const camerauiPending = cameraUiCameras.filter(
      (c) => c.homeKitEnabled && !c.isPaired,
    ).length;
    const unpairedTotal =
      pendingNodes + scryptedPending + camerauiPending + haCamsPending;

    // Unactivated devices: discovered devices and cameras that are neither exported nor commissioned
    const unactivatedIotDevices = allDevices.filter(
      (d) =>
        !hasCameraEntity(d) &&
        !d.entities.some((e) => e.exported || e.commissioned),
    ).length;
    const unactivatedHaCameras = realHaCameraDevices.filter(
      (d) =>
        !d.entities.some(
          (e) =>
            e.exported ||
            e.commissioned ||
            e.homekitCamera?.isPaired ||
            e.homekitCamera?.published,
        ),
    ).length;
    const unactivatedScrypted = cameras.filter(
      (c) =>
        !(
          c.identity?.homeKitPairingState === "paired" ||
          c.bindingState?.matterCommissioned === true
        ) && !Boolean(c.identity?.matterPairingCode),
    ).length;
    const unactivatedCameraUi = cameraUiCameras.filter(
      (c) => !c.homeKitEnabled,
    ).length;
    const unactivatedTotal =
      unactivatedIotDevices +
      unactivatedHaCameras +
      unactivatedScrypted +
      unactivatedCameraUi;

    const issues =
      iotDevices.filter(deviceNeedsAttention).length +
      realHaCameraDevices.filter(deviceNeedsAttention).length +
      cameras.filter(scryptedNeedsAttention).length +
      cameraUiCameras.filter(cameraUiNeedsAttention).length;

    return {
      totalDevices: iotDevices.length + totalCameras,
      rawDevicesCount: allDevices.length,
      iotDevices: iotDevices.length,
      exportedNodes,
      pairedNodes,
      pairedMatterTotal,
      pairedHapTotal,
      pendingNodes,
      exportedEntities,
      pairedEntities,
      pairedTotal,
      unpairedTotal,
      unactivatedTotal,
      issues,
      mqttCount,
      scryptedTotal,
      scryptedPaired: scryptedMatterPaired + scryptedHapPaired,
      camerauiTotal,
      camerauiPaired,
      totalHapPaired: pairedHapTotal,
      haCamsTotal,
      haCamsPaired: haCamsHapPaired,
      totalCameras,
    };
  }, [
    entities,
    allDevices,
    cameras,
    realHaCameraDevices,
    cameraUiCameras,
    iotDevices,
  ]);

  return {
    status,
    entities,
    cameras,
    cameraUiCameras,
    allDevices,
    iotDevices,
    realHaCameraDevices,
    scryptedConfig,
    cameraUiConfig,
    loading,
    loadError,
    partialLoadErrors,
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

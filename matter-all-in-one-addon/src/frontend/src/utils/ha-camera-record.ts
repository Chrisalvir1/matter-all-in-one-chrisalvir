import type {
  DeviceRecord,
  CameraRecord,
  CameraSensorRecord,
  CameraRealEntity,
  EntityRecord,
} from "../types";

export function adaptHaDeviceToCameraRecord(dev: DeviceRecord): CameraRecord {
  const camEnt = dev.entities.find((e) => e.domain === "camera");
  const isNest =
    (dev.manufacturer || "").toLowerCase().includes("google") ||
    (dev.manufacturer || "").toLowerCase().includes("nest") ||
    (dev.name || "").toLowerCase().includes("nest") ||
    Boolean(camEnt?.entityId.toLowerCase().includes("nest"));

  const entityType = (e: EntityRecord): CameraRealEntity["type"] => {
    const text = `${e.entityId} ${e.name || ""}`.toLowerCase();
    if (["light", "siren", "switch"].includes(e.domain))
      return e.domain as "light" | "siren" | "switch";
    if (/doorbell|timbre/.test(text)) return "doorbell";
    const deviceClass = e.device_class || e.attributes?.device_class;
    if (
      e.domain === "binary_sensor" &&
      (deviceClass === "motion" ||
        /(?:^|[_.\s])(?:motion|movimiento)(?:$|[_.\s])/.test(text))
    )
      return "motion";
    return "other";
  };
  const realEntities: CameraRealEntity[] = dev.entities
    .filter((e) =>
      [
        "binary_sensor",
        "light",
        "siren",
        "switch",
        "event",
        "button",
        "sensor",
        "select",
        "number",
      ].includes(e.domain),
    )
    .filter(
      (e, index, all) =>
        all.findIndex((candidate) => candidate.entityId === e.entityId) ===
        index,
    )
    .map((e) => ({
      id: e.entityId,
      domain: e.domain as CameraRealEntity["domain"],
      name: e.name || e.entityId,
      type: entityType(e),
      state: e.state === "on",
      rawState: typeof e.state === "string" ? e.state : undefined,
      availability:
        e.availability === "stale"
          ? "stale"
          : e.state === "unavailable"
            ? "unavailable"
            : e.state === "unknown" || typeof e.state !== "string"
              ? "unknown"
              : "available",
      matterExported: Boolean(e.exported),
    }));
  const realSensors: CameraSensorRecord[] = realEntities
    .filter((e) => e.type === "motion" || e.type === "doorbell")
    .map((e) => ({
      sensorId: e.id,
      name: e.name,
      type: e.type as "motion" | "doorbell",
      enabled: true,
      state: e.state,
    }));

  const hap = camEnt?.homekitCamera;
  const online = Boolean(
    camEnt &&
    typeof camEnt.state === "string" &&
    !["unavailable", "unknown"].includes(camEnt.state) &&
    camEnt.availability !== "stale",
  );

  return {
    provider: "home_assistant",
    cameraId: camEnt?.entityId || dev.id,
    name: dev.name,
    manufacturer: dev.manufacturer || (isNest ? "Google" : "Home Assistant"),
    model: dev.model || (isNest ? "Nest Cam" : "Cámara IP"),
    serialNumber: dev.id,
    status: {
      connection:
        typeof camEnt?.state !== "string" || camEnt.state === "unknown"
          ? "unknown"
          : online
            ? "online"
            : "offline",
      cache: camEnt?.availability === "stale" ? "stale" : undefined,
      isOnline: online,
    },
    sensors: realSensors,
    realEntities,
    identity: {
      homeKitPairingState: hap?.isPaired ? "paired" : "not_paired",
      homeKitSetupId: hap?.setupId,
      homeKitPincode: hap?.pincode,
      homeKitSetupUri: hap?.setupUri,
      homeKitPort: hap?.port,
    },
    exportConfig: { homeKitEnabled: hap?.published === true },
    homekitStatus: hap,
    liveViewCapabilities: hap?.liveViewCapabilities,
    liveViewTelemetry: hap?.liveViewTelemetry,
    source: {
      deviceId: dev.id,
      streamReference: {
        directUrl: (camEnt as any)?.stream_source || "",
      },
    },
  };
}

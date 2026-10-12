import type {
  DeviceRecord,
  CameraRecord,
  CameraSensorRecord,
  CameraRealEntity,
} from "../types";

export function adaptHaDeviceToCameraRecord(dev: DeviceRecord): CameraRecord {
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
      type: (e.entityId.includes("doorbell") ||
      e.name?.toLowerCase().includes("timbre")
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
        e.domain === "event",
    )
    .map((e) => ({
      id: e.entityId,
      domain: e.domain as
        "binary_sensor" | "light" | "siren" | "switch" | "event",
      name: e.name || e.entityId,
      type: (e.entityId.includes("doorbell") ||
      e.name?.toLowerCase().includes("timbre")
        ? "doorbell"
        : e.domain === "light"
          ? "light"
          : e.domain === "siren"
            ? "siren"
            : e.domain === "switch"
              ? "switch"
              : "motion") as
        "motion" | "light" | "siren" | "doorbell" | "switch",
      state: e.state === "on",
      matterExported: Boolean(e.exported),
    }));

  const hap = camEnt?.homekitCamera;
  const online = Boolean(
    camEnt && !["unavailable", "unknown"].includes(camEnt.state),
  );

  return {
    provider: "home_assistant",
    cameraId: camEnt?.entityId || dev.id,
    name: dev.name,
    manufacturer: dev.manufacturer || (isNest ? "Google" : "Home Assistant"),
    model: dev.model || (isNest ? "Nest Cam" : "Cámara IP"),
    serialNumber: dev.id,
    status: {
      connection: online ? "online" : "offline",
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

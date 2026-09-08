import { CameraRecord, EntityRecord, ScryptedConfigResponse, StatusResponse } from "../types";

const API_BASE = "./api/custom";

// Base request wrapper with relative prefix (handles Home Assistant Ingress automatically)
export async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${API_BASE}${cleanEndpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let errorMsg = `Error ${res.status}: ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.error || data?.message) {
        errorMsg = data.error || data.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  getStatus: () => request<StatusResponse>("/status"),
  getDevices: () => request<EntityRecord[]>("/devices"),
  getCameras: () => request<CameraRecord[]>("/cameras"),
  getScryptedConfig: () => request<ScryptedConfigResponse>("/scrypted/config"),
  saveScryptedConfig: (data: any) => request("/scrypted/config", { method: "POST", body: JSON.stringify(data) }),
  deleteScryptedConfig: () => request("/scrypted/config", { method: "DELETE" }),
  testScryptedConnection: (data: any) => request("/scrypted/connection-test", { method: "POST", body: JSON.stringify(data) }),
  syncCameras: () => request<CameraRecord[]>("/scrypted/load-cameras", { method: "POST" }),

  verifyCameraStream: (cameraId: string, streamUrl: string) =>
    request<{ ok: boolean; status: string; validation?: any }>(
      `/cameras/${encodeURIComponent(cameraId)}/verify-stream`,
      {
        method: "POST",
        body: JSON.stringify({ streamUrl }),
      }
    ),

  diagnoseCameraStream: (cameraId: string, streamUrl: string) =>
    request<{ success: boolean; metrics?: any; camera?: any }>(
      `/cameras/${encodeURIComponent(cameraId)}/diagnose-stream`,
      {
        method: "POST",
        body: JSON.stringify({ streamUrl, timeoutMs: 7000 }),
      }
    ),

  saveCameraStreamUrl: (cameraId: string, streamUrl: string) =>
    request(`/cameras/${encodeURIComponent(cameraId)}/stream-url`, {
      method: "POST",
      body: JSON.stringify({ streamUrl }),
    }),

  saveCameraExportConfig: (cameraId: string, config: any) =>
    request(`/cameras/${encodeURIComponent(cameraId)}/export-config`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  resetCameraPairing: (scopedId: string) =>
    request<{ success: boolean; setupUri?: string; record?: any; error?: string }>(
      `/reset-camera-pairing/${encodeURIComponent(scopedId)}`,
      { method: "POST" }
    ),

  removeCamera: (cameraId: string) =>
    request(`/cameras/${encodeURIComponent(cameraId)}`, { method: "DELETE" }),

  toggleExport: (entityId: string, exported: boolean) =>
    request(`/${exported ? "register" : "unregister"}/${encodeURIComponent(entityId)}`, {
      method: "POST",
    }),

  toggleDeviceState: (entityId: string) =>
    request(`/entity-toggle/${encodeURIComponent(entityId)}`, {
      method: "POST",
    }),

  setDeviceProfile: (entityId: string, profile: string) =>
    request(`/device-profile/${encodeURIComponent(entityId)}`, {
      method: "POST",
      body: JSON.stringify({ profile }),
    }),

  reconnectAccessory: (nodeId: string) =>
    request(`/refresh-accessory/${encodeURIComponent(nodeId)}`, { method: "POST" }),

  removeFabric: (entityId: string, fabricIndex: number) =>
    request(`/remove-fabric/${encodeURIComponent(entityId)}/${fabricIndex}`, {
      method: "DELETE",
    }),

  openCommissioning: (entityId: string) =>
    request(`/open-commissioning/${encodeURIComponent(entityId)}`, { method: "POST" }),

  resetAccessory: (entityId: string) =>
    request(`/reset-accessory/${encodeURIComponent(entityId)}`, { method: "POST" }),

  getMqttConfig: () => request<any>("/mqtt-config"),

  saveMqttConfig: (data: any) =>
    request("/mqtt-config", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  restartService: () => request("/restart", { method: "POST" }),

  factoryReset: () => request("/factoryreset", { method: "POST" }),
};

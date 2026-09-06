import { CameraRecord, EntityRecord, ScryptedConfigResponse, StatusResponse } from "../types";

// Base request wrapper with relative prefix (handles Ingress automatically)
export async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
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
  getDevices: () => request<{ entities: EntityRecord[] }>("/devices"),
  getCameras: () => request<{ cameras: CameraRecord[] }>("/cameras"),
  getScryptedConfig: () => request<ScryptedConfigResponse>("/scrypted"),
  saveScryptedConfig: (data: any) => request("/scrypted", { method: "POST", body: JSON.stringify(data) }),
  testScryptedConnection: (data: any) => request("/scrypted/test", { method: "POST", body: JSON.stringify(data) }),
  syncCameras: () => request<{ cameras: CameraRecord[] }>("/scrypted/load-cameras", { method: "POST" }),
  
  verifyCameraStream: (cameraId: string, streamUrl: string) =>
    request<{ ok: boolean; status: string; validation?: any }>(`/cameras/${cameraId}/verify-stream`, {
      method: "POST",
      body: JSON.stringify({ streamUrl }),
    }),

  diagnoseCameraStream: (cameraId: string, streamUrl: string) =>
    request<{ success: boolean; metrics?: any; camera?: any }>(`/cameras/${cameraId}/diagnose-stream`, {
      method: "POST",
      body: JSON.stringify({ streamUrl, timeoutMs: 7000 }),
    }),

  saveCameraStreamUrl: (cameraId: string, streamUrl: string) =>
    request(`/cameras/${cameraId}/stream-url`, {
      method: "POST",
      body: JSON.stringify({ streamUrl }),
    }),

  saveCameraExportConfig: (cameraId: string, config: any) =>
    request(`/cameras/${cameraId}/export-config`, {
      method: "PUT",
      body: JSON.stringify(config),
    }),

  resetCameraPairing: (scopedId: string) =>
    request<{ success: boolean; setupUri?: string; record?: any; error?: string }>(
      `/reset-camera-pairing/${scopedId}`,
      { method: "POST" }
    ),

  removeCamera: (cameraId: string) => request(`/cameras/${cameraId}`, { method: "DELETE" }),

  toggleExport: (entityId: string, exported: boolean) =>
    request("/export", {
      method: "POST",
      body: JSON.stringify({ entityId, exported }),
    }),

  reconnectAccessory: (nodeId: string) =>
    request(`/refresh-accessory/${encodeURIComponent(nodeId)}`, { method: "POST" }),

  removeFabric: (fabricIndex: number) =>
    request(`/remove-fabric/${fabricIndex}`, { method: "DELETE" }),

  openCommissioning: (entityId: string) =>
    request(`/open-commissioning/${encodeURIComponent(entityId)}`, { method: "POST" }),

  restartService: () => request("/api/custom/restart", { method: "POST" }),
};

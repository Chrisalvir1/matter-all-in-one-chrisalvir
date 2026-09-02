import { MatterbridgeEndpoint } from "matterbridge";
import { MatterDeviceTypes } from "../../device-registry.js";
import { CameraSessionManager } from "../matter/camera-session-manager.js";
import { CameraWebRtcAdapter } from "../matter/camera-webrtc-adapter.js";
import { CameraEndpointBuilder } from "../matter/camera-endpoint.builder.js";
import type { CameraRecord, CameraSensorRecord } from "./scrypted-types.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";

export interface SensorBinding {
  cameraId: string;
  sensorId: string;
  sensorType: string;
  clusterId: number;
  attributeName: string;
  lastValue?: any;
  status: "active" | "pending" | "inactive";
  lastWarningAt?: number;
}

export class ScryptedMatterBridge {
  private static activeEndpoints = new Map<string, MatterbridgeEndpoint>();
  private static sessionManagers = new Map<string, CameraSessionManager>();
  private static adapters = new Map<string, CameraWebRtcAdapter>();
  private static sensorBindings = new Map<string, SensorBinding>();

  /**
   * Mounts a Matter Camera 1.5/1.6 endpoint with WebRTC clusters and integrated sensor clusters.
   */
  public static async mountCamera(
    platform: any,
    camera: CameraRecord,
  ): Promise<MatterbridgeEndpoint | null> {
    if (!camera.exportConfig.matterEnabled) {
      await this.unmountCamera(platform, camera.cameraId);
      return null;
    }

    // If this camera already has an active, registered endpoint, return it.
    // Never try to re-register an already-commissioned endpoint — that causes
    // "already registered" errors and leaves the endpoint in inactive state.
    const existing = this.activeEndpoints.get(camera.cameraId);
    if (existing) {
      const existingId = (existing as any).id;
      if (existingId !== undefined && existingId !== null) {
        // Update display name if it changed, but do NOT recreate the endpoint
        return existing;
      }
      // Endpoint exists but has no ID (registration failed previously) — remove and retry
      this.activeEndpoints.delete(camera.cameraId);
      this.sessionManagers.delete(camera.cameraId);
      this.adapters.delete(camera.cameraId);
    }

    // RULE: Never invent an RTSP URL from cameraId.
    // Use real directUrl only. If absent, stream is undefined — Matter endpoint
    // is still created (for metadata/control) but stream will not start.
    const directUrl = camera.source.streamReference?.directUrl;
    const streamVerified = Boolean(directUrl);

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: streamVerified,
      streamSourceType: directUrl ? "rtsp" : "unknown",
      videoCodec: "h264",
      hasAudio: streamVerified
        ? (camera.capabilities.observed?.hasAudio ?? false)
        : false,
      audioCodec: streamVerified ? "aac_lc" : "none",
      resolution: camera.capabilities.observed?.resolution || {
        width: 1920,
        height: 1080,
      },
      maxFps: camera.capabilities.observed?.fps || 30,
      strategy: streamVerified ? "passthrough_h264" : "unsupported",
      requiresTranscoding: false,
      snapshotSupported: true,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      hksvCapable:
        streamVerified && camera.exportConfig.hksvEnabledByDefault !== false,
    };

    const resolvedSource: ResolvedStreamSource = {
      sourceType: directUrl ? "rtsp" : "unknown",
      url: directUrl, // undefined when no real stream available
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      supportsPassthrough: streamVerified,
      requiresBridge: false,
      metadata: {
        isScrypted: true,
        scryptedCameraId: camera.cameraId,
        streamVerified,
        model: camera.displayModel || camera.model,
        manufacturer: camera.displayManufacturer,
      },
    };

    const sessionManager =
      this.sessionManagers.get(camera.cameraId) || new CameraSessionManager();
    this.sessionManagers.set(camera.cameraId, sessionManager);

    const adapter =
      this.adapters.get(camera.cameraId) ||
      new CameraWebRtcAdapter(
        platform,
        `scrypted.${camera.cameraId}`,
        capabilities,
        resolvedSource,
        sessionManager,
      );
    this.adapters.set(camera.cameraId, adapter);

    const endpoint = await CameraEndpointBuilder.build(
      platform,
      `scrypted.${camera.cameraId}`,
      MatterDeviceTypes.camera,
      capabilities,
      resolvedSource,
      sessionManager,
      adapter,
      camera.name,
    );

    // Integrate sensor clusters directly into the camera endpoint
    this.attachIntegratedSensorClusters(endpoint, camera);

    if (platform?.registerDevice) {
      try {
        await platform.registerDevice(endpoint);
        // Only store the endpoint in the active map after successful registration.
        // If registration fails (already registered), do not store so we don't
        // accumulate endpoints with undefined IDs that cause setAttribute errors.
        this.activeEndpoints.set(camera.cameraId, endpoint);
      } catch (err) {
        platform?.log?.warn?.(
          `[ScryptedMatterBridge][${camera.cameraId}] Registration failed (may already be registered): ${err}`,
        );
        // Do NOT set activeEndpoints — endpoint ID will be undefined, causing setAttribute errors
        return null;
      }
    } else {
      this.activeEndpoints.set(camera.cameraId, endpoint);
    }

    return endpoint;
  }

  public static async unmountCamera(
    platform: any,
    cameraId: string,
  ): Promise<void> {
    const existing = this.activeEndpoints.get(cameraId);
    if (existing) {
      if (platform?.unregisterDevice) {
        try {
          await platform.unregisterDevice(existing);
        } catch {}
      }
      this.activeEndpoints.delete(cameraId);
      this.sessionManagers.delete(cameraId);
      this.adapters.delete(cameraId);
      this.sensorBindings.delete(`${cameraId}:occupancy`);
      this.sensorBindings.delete(`${cameraId}:doorbell`);
    }
  }

  public static getEndpoint(
    cameraId: string,
  ): MatterbridgeEndpoint | undefined {
    return this.activeEndpoints.get(cameraId);
  }

  public static getSensorBinding(
    cameraId: string,
    sensorType: string,
  ): SensorBinding | undefined {
    return this.sensorBindings.get(`${cameraId}:${sensorType}`);
  }

  /**
   * Safely updates an attribute on a Matter endpoint only when all invariants are satisfied:
   * 1. Binding exists and is tracked.
   * 2. Endpoint exists and has an assigned integer ID (Number.isInteger).
   * 3. Endpoint is active on the node.
   * 4. Cluster and attribute exist on the endpoint.
   * 5. Value has actually changed (prevents redundant Matter broadcasts).
   */
  public static setSensorAttributeSafely(
    binding: SensorBinding | undefined,
    value: any,
    endpoint?: MatterbridgeEndpoint,
    log?: any,
  ): boolean {
    if (!binding) return false;

    const targetEndpoint =
      endpoint || this.activeEndpoints.get(binding.cameraId);
    if (!targetEndpoint) {
      binding.status = "inactive";
      return false;
    }

    const endpointId =
      (targetEndpoint as any).id ?? (targetEndpoint as any).number;
    if (
      endpointId === undefined ||
      endpointId === null ||
      !Number.isInteger(Number(endpointId))
    ) {
      binding.status = "pending";
      const now = Date.now();
      if (!binding.lastWarningAt || now - binding.lastWarningAt > 60000) {
        binding.lastWarningAt = now;
        log?.warn?.(
          `[ScryptedMatterBridge] Endpoint para sensor ${binding.sensorType} (cámara ${binding.cameraId}) está en estado inactivo/sin ID numérico. Omitiendo setAttribute para evitar errores de Matter.`,
        );
      }
      return false;
    }

    // Value change check
    if (binding.lastValue === value) {
      return true; // No-op, already at this state
    }

    // Check cluster presence
    const hasAttr =
      typeof (targetEndpoint as any).hasAttributeServer === "function"
        ? (targetEndpoint as any).hasAttributeServer(
            binding.clusterId,
            binding.attributeName,
          )
        : false;

    if (!hasAttr) {
      binding.status = "inactive";
      return false;
    }

    try {
      if (typeof (targetEndpoint as any).setAttribute === "function") {
        (targetEndpoint as any).setAttribute(
          binding.clusterId,
          binding.attributeName,
          value,
          log,
        );
        binding.lastValue = value;
        binding.status = "active";
        return true;
      }
    } catch (err: any) {
      binding.status = "inactive";
      const now = Date.now();
      if (!binding.lastWarningAt || now - binding.lastWarningAt > 60000) {
        binding.lastWarningAt = now;
        log?.warn?.(
          `[ScryptedMatterBridge] Error al actualizar sensor ${binding.sensorType} en cámara ${binding.cameraId}: ${err?.message || err}`,
        );
      }
      return false;
    }
    return false;
  }

  public static updateSensorState(
    cameraId: string,
    sensorType: string,
    value: any,
    log?: any,
  ): boolean {
    const binding = this.sensorBindings.get(`${cameraId}:${sensorType}`);
    const endpoint = this.activeEndpoints.get(cameraId);
    return this.setSensorAttributeSafely(binding, value, endpoint, log);
  }

  private static attachIntegratedSensorClusters(
    endpoint: MatterbridgeEndpoint,
    camera: CameraRecord,
  ): void {
    // Attach Real Occupancy Sensor Cluster (0x0406) only if genuine occupancy sensor exists
    const hasOccupancy = camera.sensors.some(
      (s: CameraSensorRecord) => s.type === "occupancy" && s.enabled,
    );
    if (hasOccupancy) {
      try {
        endpoint.createDefaultOccupancySensingClusterServer(false);
        this.sensorBindings.set(`${camera.cameraId}:occupancy`, {
          cameraId: camera.cameraId,
          sensorId: `${camera.cameraId}_occupancy`,
          sensorType: "occupancy",
          clusterId: 0x0406,
          attributeName: "occupancy",
          status: "pending",
        });
      } catch {}
    }

    // Attach Doorbell Cluster (0x0552 / BooleanState 0x0045) if doorbell sensor exists
    const hasDoorbell = camera.sensors.some(
      (s: CameraSensorRecord) => s.type === "doorbell" && s.enabled,
    );
    if (hasDoorbell) {
      try {
        endpoint.createDefaultBooleanStateClusterServer(false);
        this.sensorBindings.set(`${camera.cameraId}:doorbell`, {
          cameraId: camera.cameraId,
          sensorId: `${camera.cameraId}_doorbell`,
          sensorType: "doorbell",
          clusterId: 0x0045,
          attributeName: "stateValue",
          status: "pending",
        });
      } catch {}
    }
  }
}

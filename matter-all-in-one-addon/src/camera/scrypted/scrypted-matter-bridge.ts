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

export class ScryptedMatterBridge {
  private static activeEndpoints = new Map<string, MatterbridgeEndpoint>();
  private static sessionManagers = new Map<string, CameraSessionManager>();
  private static adapters = new Map<string, CameraWebRtcAdapter>();

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
    }
  }

  public static getEndpoint(
    cameraId: string,
  ): MatterbridgeEndpoint | undefined {
    return this.activeEndpoints.get(cameraId);
  }

  private static attachIntegratedSensorClusters(
    endpoint: MatterbridgeEndpoint,
    camera: CameraRecord,
  ): void {
    // Attach Motion Sensor Cluster (0x040D) if motion sensor exists
    const hasMotion = camera.sensors.some(
      (s: CameraSensorRecord) => s.type === "motion" && s.enabled,
    );
    if (hasMotion) {
      try {
        endpoint.createDefaultOccupancySensingClusterServer(false);
      } catch {}
    }

    // Attach Doorbell Cluster (0x0552) if doorbell sensor exists
    const hasDoorbell = camera.sensors.some(
      (s: CameraSensorRecord) => s.type === "doorbell" && s.enabled,
    );
    if (hasDoorbell) {
      try {
        endpoint.createDefaultBooleanStateClusterServer(false);
      } catch {}
    }
  }
}

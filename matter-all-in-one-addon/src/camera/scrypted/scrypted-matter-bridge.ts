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

    const streamUrl =
      camera.source.streamReference?.directUrl ||
      `rtsp://${camera.source.streamReference?.host || "127.0.0.1"}:8554/${camera.cameraId}`;

    const capabilities: CameraCapabilitiesInfo = {
      hasLiveStream: true,
      streamSourceType: "rtsp",
      videoCodec: "h264",
      hasAudio: camera.capabilities.observed?.hasAudio ?? true,
      audioCodec: "aac_lc",
      resolution: camera.capabilities.observed?.resolution || {
        width: 1920,
        height: 1080,
      },
      maxFps: camera.capabilities.observed?.fps || 30,
      strategy: "passthrough_h264",
      requiresTranscoding: false,
      snapshotSupported: true,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      hksvCapable: camera.exportConfig.hksvEnabledByDefault !== false,
    };

    const resolvedSource: ResolvedStreamSource = {
      sourceType: "rtsp",
      url: streamUrl,
      snapshotUrl: camera.source.snapshotReference?.directUrl,
      supportsPassthrough: true,
      requiresBridge: false,
      metadata: {
        isScrypted: true,
        scryptedCameraId: camera.cameraId,
        model: camera.model,
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
      } catch (err) {
        platform?.log?.warn?.(
          `[ScryptedMatterBridge][${camera.cameraId}] Registration deferred: ${err}`,
        );
      }
    }

    this.activeEndpoints.set(camera.cameraId, endpoint);
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

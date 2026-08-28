import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import { CameraAvStreamManagement, WebRtcTransportProvider } from "matterbridge/matter/clusters";
import { CameraAvStreamManagementServer, WebRtcTransportProviderServer } from "matterbridge/matter/behaviors";
import {
  MATTER_BRIDGE_VENDOR_ID,
  getMatterSerialNumber,
  getHaDeviceManufacturer,
  getHaDeviceModel,
} from "../../utils/matter-device-identity.js";
import type { CameraCapabilitiesInfo, ResolvedStreamSource } from "../camera-types.js";
import { CameraSessionManager } from "./camera-session-manager.js";
import { CameraWebRtcAdapter } from "./camera-webrtc-adapter.js";

export class CameraEndpointBuilder {
  public static async build(
    platform: any,
    entityId: string,
    deviceType: DeviceTypeDefinition,
    capabilities: CameraCapabilitiesInfo,
    streamSource: ResolvedStreamSource,
    sessionManager: CameraSessionManager,
    adapter: CameraWebRtcAdapter,
    friendlyName?: string,
  ): Promise<MatterbridgeEndpoint> {
    const rawName = friendlyName || entityId;
    const uniqueName = rawName.substring(0, 32).trim();

    const endpoint = new MatterbridgeEndpoint([deviceType], {
      id: entityId.replaceAll(".", "_"),
      mode: "server",
    });

    const manufacturer = getHaDeviceManufacturer(platform, entityId);
    const model = getHaDeviceModel(platform, entityId, "Camera");

    endpoint.deviceType = deviceType.code;
    endpoint.deviceName = uniqueName;
    endpoint.uniqueId = entityId.replaceAll(".", "_");
    endpoint.serialNumber = getMatterSerialNumber(platform, entityId);
    endpoint.vendorId = MATTER_BRIDGE_VENDOR_ID;
    endpoint.vendorName = manufacturer;
    endpoint.productId = 0x8000;
    endpoint.productName = model;

    endpoint.createDefaultBasicInformationClusterServer(
      uniqueName,
      endpoint.serialNumber,
      MATTER_BRIDGE_VENDOR_ID,
      manufacturer,
      0x8000,
      model,
    );

    // Define Custom Cluster Behavior Implementations
    class CustomCameraAvStreamManagementServer extends CameraAvStreamManagementServer.with(CameraAvStreamManagement.Feature.Video) {
      async videoStreamAllocate(request: any) {
        const session = sessionManager.allocateSession(request.streamUsage || 1);
        return { videoStreamId: session.videoStreamId || 1 };
      }
      async videoStreamDeallocate(request: any) {
        // deallocation logic
      }
      async setStreamPriorities(request: any) {
        // stream priorities
      }
    }

    class CustomWebRtcTransportProviderServer extends WebRtcTransportProviderServer {
      async solicitOffer(request: any) {
        return await adapter.handleSolicitOffer(request);
      }
      async provideOffer(request: any) {
        return await adapter.handleProvideOffer(request);
      }
      async provideAnswer(request: any) {
        // provideAnswer
      }
      async provideIceCandidates(request: any) {
        await adapter.handleProvideIceCandidates(request);
      }
      async endSession(request: any) {
        await adapter.handleEndSession(request);
      }
    }

    // Mount Camera AV Stream Management Server (0x0551)
    endpoint.behaviors.require(CustomCameraAvStreamManagementServer, {
      maxConcurrentEncoders: 1,
      maxEncodedPixelRate: capabilities.resolution.width * capabilities.resolution.height * capabilities.maxFps,
      videoSensorParams: {
        sensorWidth: capabilities.resolution.width,
        sensorHeight: capabilities.resolution.height,
        maxFps: capabilities.maxFps,
      },
      minViewportResolution: { width: 320, height: 240 },
      supportedStreamUsages: [1], // LiveStream
      allocatedVideoStreams: [],
      currentFrameRate: capabilities.maxFps,
      rateDistortionTradeOffPoints: [],
      viewport: { x1: 0, y1: 0, x2: capabilities.resolution.width, y2: capabilities.resolution.height },
      maxContentBufferSize: 1024 * 1024,
      maxNetworkBandwidth: 5000000,
      streamUsagePriorities: [1],
    });

    // Mount WebRTC Transport Provider Server (0x0553)
    endpoint.behaviors.require(CustomWebRtcTransportProviderServer, {
      currentSessions: [],
    });

    // Aprovision clusters
    endpoint.addRequiredClusterServers();

    return endpoint;
  }
}

import { MatterbridgeEndpoint, DeviceTypeDefinition } from "matterbridge";
import {
  CameraAvStreamManagement,
  WebRtcTransportProvider,
} from "matterbridge/matter/clusters";
import {
  CameraAvStreamManagementServer,
  WebRtcTransportProviderServer,
} from "matterbridge/matter/behaviors";
import {
  MATTER_BRIDGE_VENDOR_ID,
  getMatterSerialNumber,
  getHaDeviceManufacturer,
  getHaDeviceModel,
} from "../../utils/matter-device-identity.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";
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

    const isScrypted = Boolean(streamSource?.metadata?.isScrypted);
    const manufacturer = isScrypted
      ? "Matter all in one Chrisalvir"
      : getHaDeviceManufacturer(platform, entityId);
    const model = isScrypted
      ? (streamSource?.metadata?.model as string) || "Cámara IP"
      : getHaDeviceModel(platform, entityId, "Camera");
    const serialNumber = isScrypted
      ? ((streamSource?.metadata as any)?.serialNumber as string) ||
        entityId.replaceAll(".", "_")
      : getMatterSerialNumber(platform, entityId);

    endpoint.deviceType = deviceType.code;
    endpoint.deviceName = uniqueName;
    endpoint.uniqueId = entityId.replaceAll(".", "_");
    endpoint.serialNumber = serialNumber;
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

    const hasAudio = Boolean(capabilities.hasAudio);

    class CustomCameraAvStreamManagementServer extends CameraAvStreamManagementServer.with(
      CameraAvStreamManagement.Feature.Video,
    ) {
      async videoStreamAllocate(request: any) {
        const session = sessionManager.allocateSession(
          request.streamUsage ?? 3,
        );
        return { videoStreamId: session.videoStreamId || 1 };
      }
      async videoStreamDeallocate(_request: any) {
        // Safe deallocate
      }
      async audioStreamAllocate(request: any) {
        const session = sessionManager.allocateSession(
          request.streamUsage ?? 3,
        );
        return { audioStreamId: session.audioStreamId || 2 };
      }
      async audioStreamDeallocate(_request: any) {
        // Safe deallocate
      }
      async setStreamPriorities(_request: any) {
        // Accept stream priorities
      }
    }

    class CustomWebRtcTransportProviderServer extends WebRtcTransportProviderServer {
      async solicitOffer(request: any) {
        return await adapter.handleSolicitOffer(request, endpoint);
      }
      async provideOffer(request: any) {
        return await adapter.handleProvideOffer(request, endpoint);
      }
      async provideAnswer(request: any) {
        await adapter.handleProvideAnswer(request);
      }
      async provideIceCandidates(request: any) {
        await adapter.handleProvideIceCandidates(request);
      }
      async endSession(request: any) {
        await adapter.handleEndSession(request);
      }
    }

    const width = capabilities.resolution?.width || 1920;
    const height = capabilities.resolution?.height || 1080;
    const fps = capabilities.maxFps || 30;

    const avState: any = {
      maxConcurrentEncoders: 2,
      maxEncodedPixelRate: width * height * fps,
      videoSensorParams: {
        sensorWidth: width,
        sensorHeight: height,
        maxFps: fps,
      },
      minViewportResolution: { width: 320, height: 240 },
      supportedStreamUsages: [3], // StreamUsage.LiveView = 3
      allocatedVideoStreams: [],
      currentFrameRate: fps,
      rateDistortionTradeOffPoints: [
        {
          codec: 0, // VideoCodec.H264 = 0
          resolution: { width, height },
          minBitRate: 500000,
        },
      ],
      viewport: {
        x1: 0,
        y1: 0,
        x2: width,
        y2: height,
      },
      maxContentBufferSize: 1024 * 1024,
      maxNetworkBandwidth: 10000000,
      streamUsagePriorities: [3],
    };

    if (hasAudio) {
      avState.microphoneCapabilities = {
        maxNumberOfChannels: 2,
        supportedCodecs: [0], // AudioCodec.Opus = 0
        supportedSampleRates: [48000],
        supportedBitDepths: [16],
      };
      avState.allocatedAudioStreams = [];
    }

    // Mount Camera AV Stream Management Server (0x0551)
    endpoint.behaviors.require(CustomCameraAvStreamManagementServer, avState);

    // Mount WebRTC Transport Provider Server (0x0553)
    endpoint.behaviors.require(CustomWebRtcTransportProviderServer, {
      currentSessions: [],
    });

    // Provision standard clusters safely
    try {
      endpoint.addRequiredClusterServers();
    } catch (err) {
      platform?.log?.debug?.(
        `[CameraEndpointBuilder][${entityId}] Provisioning note: ${err}`,
      );
    }

    return endpoint;
  }
}

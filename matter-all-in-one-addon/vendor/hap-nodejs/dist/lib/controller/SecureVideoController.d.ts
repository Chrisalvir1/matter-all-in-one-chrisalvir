import { EventEmitter } from "events";
import { BufferActivityCommandRequest, BufferUploadCommandRequest, CameraRecordingPublishingPointValue, CameraSensorIntent, CameraSensorType, CameraZonesValue, CMAFError, RTPSRTPParameters, SFrameKeyData, StreamTierVideoCodec, AudioStreamTier, VideoStreamTier, WebRTCICECandidate, WebRTCOfferOptions, WebRTCProvideAnswerRequest, WebRTCReofferRequest, WebRTCUpdateSessionRequest } from "../camera/SecureVideoTypes";
import { RecordingManagement } from "../camera/RecordingManagement";
import { CameraBufferManagement, CameraCapabilities, CameraClientCertificateManagement, CameraGlobalOperatingMode, CameraKeyManagement, CameraMotionZones, CameraMultiTierRTPStreamManagement, CameraOperatingMode, CameraRecordingManagement, CameraWebRTCStreamManagement, DataStreamTransportManagement, Microphone, MotionSensor, Speaker } from "../definitions";
import { Service } from "../Service";
import { ResourceRequestReason } from "./CameraController";
import { ControllerIdentifier, ControllerServiceMap, SerializableController, SnapshotController, StateChangeDelegate } from "./Controller";
import type { CMAFMediaDescription } from "../camera/CMAFIngest";
import type { SecureVideoSnapshotHandler } from "../camera/HDSSnapshotTransport";
import type { CameraRecordingOptions, RecordingManagementState } from "../camera/RecordingManagement";
import type { CameraRecordingDelegate } from "./CameraController";
/**
 * @group Camera Secure Video
 */
export interface SecureVideoVideoTier extends VideoStreamTier {
    /** kbps */
    peakBitrate: number;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCSolicitOfferRequest {
    sessionIdentifier: string;
    options: WebRTCOfferOptions;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCOffer {
    sdpOffer: string;
    candidates?: WebRTCICECandidate[];
    sframe?: SFrameKeyData;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCReofferAnswer {
    sdpAnswer: string;
    sframe?: SFrameKeyData;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCStreamingDelegate {
    handleSolicitOffer(request: WebRTCSolicitOfferRequest): Promise<WebRTCOffer>;
    handleProvideAnswer(request: WebRTCProvideAnswerRequest): Promise<void>;
    handleReoffer(request: WebRTCReofferRequest): Promise<WebRTCReofferAnswer>;
    handleUpdateSession(request: WebRTCUpdateSessionRequest): Promise<void>;
    handleEndSession(sessionIdentifier: string): Promise<void>;
}
/**
 * @group Camera Secure Video
 */
export interface MultiTierPrepareStreamRequest {
    sessionIdentifier: string;
    addressVersion: "ipv4" | "ipv6";
    /** the controller address media is sent to */
    targetAddress: string;
    /** the accessory address on this connection */
    sourceAddress: string;
    controllerVideoPort: number;
    controllerAudioPort: number;
    video: RTPSRTPParameters;
    audio: RTPSRTPParameters;
}
/**
 * @group Camera Secure Video
 */
export interface MultiTierPrepareStreamResponse {
    /** overrides the accessory address in the response, defaults to the connection source address */
    addressOverride?: string;
    videoPort: number;
    audioPort: number;
    videoSSRC: number;
    audioSSRC: number;
    video: RTPSRTPParameters;
    audio: RTPSRTPParameters;
}
/**
 * @group Camera Secure Video
 */
export interface MultiTierStreamStartRequest {
    sessionIdentifier: string;
    /** identifier of the selected video tier from the advertised supported video stream tiers */
    videoTier: number;
    /** ssrc the accessory must use for the outgoing video stream */
    videoSSRC: number;
    audioTier?: number;
    audioSSRC?: number;
}
/**
 * @group Camera Secure Video
 */
export interface MultiTierRTPStreamingDelegate {
    prepareStream(request: MultiTierPrepareStreamRequest): Promise<MultiTierPrepareStreamResponse>;
    startStream(request: MultiTierStreamStartRequest): Promise<void>;
    stopStream(sessionIdentifier: string): Promise<void>;
}
/**
 * @group Camera Secure Video
 */
export interface CMAFRecordingDelegate {
    /**
     * Streams the clip as fMP4: the init segment first, then media fragments, until `request.signal` aborts or the
     * source ends. The controller seals every segment, builds the HLS playlists and uploads them to the publishing point.
     */
    streamClip(request: CMAFClipRequest): AsyncGenerator<CMAFSegment>;
    /** the HomeKit HomeHub signals recording activity windows */
    handleBufferActivity?(request: BufferActivityCommandRequest): void;
    updateRecordingActive?(active: boolean, audioActive: boolean): void;
    /** called with undefined when the controller clears the publishing point */
    updatePublishingPoint?(publishingPoint: CameraRecordingPublishingPointValue | undefined): void;
    updateClientCertificate?(installed: boolean): void;
    /**
     * the upload session ended, `error` is set when it failed (the HomeKit HomeHub gets the same as a CMAF error event);
     * `detail` names the failed request or transport error, or summarizes the playlist requests of a finished upload
     */
    handleUploadResult?(cmafSessionId: bigint, error?: CMAFError, detail?: string): void;
}
/**
 * @group Camera Secure Video
 */
export interface CMAFClipRequest {
    cmafSessionId: bigint;
    command: BufferUploadCommandRequest;
    /** aborted when the HomeKit HomeHub stops the upload */
    signal: AbortSignal;
}
/**
 * @group Camera Secure Video
 */
export interface CMAFSegment {
    type: "init" | "media";
    /** raw fMP4; the controller seals it before upload */
    data: Buffer;
    /** on the init segment: the actual media description for the HLS playlists, overriding the controller default */
    media?: CMAFMediaDescription;
    /** on the init segment: wall clock of the first media fragment, defaults to the start of the upload command */
    startedAt?: Date;
    /** media fragment duration in seconds, defaults to 2 */
    duration?: number;
    /** set on the last media fragment */
    last?: boolean;
}
/**
 * @group Camera Secure Video
 */
export interface SecureVideoControllerOptions {
    sensor: {
        /** stable uuid string, must not change across restarts */
        uuid: string;
        width: number;
        height: number;
        type?: CameraSensorType;
        intent?: CameraSensorIntent;
    };
    video: {
        codec: StreamTierVideoCodec;
        payloadType?: number;
        tiers: SecureVideoVideoTier[];
    };
    audio?: {
        payloadType?: number;
        tier: AudioStreamTier;
        /** adds the Speaker service so the Home app offers talkback, like `twoWayAudio` of the {@link CameraStreamingOptions} */
        twoWayAudio?: boolean;
    };
    webrtc: {
        delegate: WebRTCStreamingDelegate;
        maxSessions?: number;
    };
    rtp: {
        delegate: MultiTierRTPStreamingDelegate;
    };
    /**
     * Event recording over HDS, owned by the controller like a {@link CameraController} owns its {@link RecordingManagement}.
     * A HomeKit HomeHub analyses and records the HDS stream and locates the stream management services through its
     * data stream, so it is part of every secure video accessory. {@link EventTriggerOption.MOTION} is always advertised,
     * {@link CameraRecordingOptions.overrideEventTriggerOptions} adds further triggers.
     */
    recording: {
        options: CameraRecordingOptions;
        delegate: CameraRecordingDelegate;
    };
    /**
     * Accessory direct upload of clips to the CMAF publishing point. Adds the buffer, key and client certificate
     * management services; without it the HomeKit HomeHub records over HDS bulk send only.
     */
    ingest?: {
        delegate: CMAFRecordingDelegate;
        /** common name placed into the client certificate signing request */
        certificateCommonName?: string;
    };
    /** reuse an existing motion sensor instead of creating one */
    motionService?: Service;
    /**
     * Produces the JPEG snapshots of the camera. They are requested through the HAP image resource request (the
     * camera tile in the Home app) and, on iOS 27, over the HDS `ipcamera.snapshot` relay. Without it both are rejected.
     */
    snapshot?: SecureVideoSnapshotHandler;
}
/**
 * @group Camera Secure Video
 */
export interface SecureVideoIngestCredentials {
    publishingPoint?: CameraRecordingPublishingPointValue;
    /** PKCS#8 PEM */
    privateKey?: string;
    /** DER */
    clientCertificate?: Buffer;
    /** DER */
    ca?: Buffer;
    keys: {
        keyNumber: bigint;
        key: Buffer;
    }[];
    currentKeyNumber?: bigint;
}
/**
 * @group Camera Secure Video
 */
export interface SecureVideoControllerServiceMap extends ControllerServiceMap {
    capabilities?: CameraCapabilities;
    globalOperatingMode?: CameraGlobalOperatingMode;
    motionZones?: CameraMotionZones;
    multiTierStreamManagement?: CameraMultiTierRTPStreamManagement;
    webrtcStreamManagement?: CameraWebRTCStreamManagement;
    recordingManagement?: CameraRecordingManagement;
    cameraOperatingMode?: CameraOperatingMode;
    dataStreamTransportManagement?: DataStreamTransportManagement;
    bufferManagement?: CameraBufferManagement;
    keyManagement?: CameraKeyManagement;
    clientCertificateManagement?: CameraClientCertificateManagement;
    motionSensor?: MotionSensor;
    microphone?: Microphone;
    speaker?: Speaker;
}
/**
 * @group Camera Secure Video
 */
export interface SecureVideoControllerState {
    homeKitCameraActive: number;
    operatingModeIndicator: number;
    globalStreamingEnabled: boolean;
    webrtcStreamingEnabled: boolean;
    rtpStreamingEnabled: boolean;
    motionEnabled: boolean;
    motionZonesActive: number;
    zones?: string;
    recordingManagement?: RecordingManagementState;
    publishingPoint?: string;
    privateKey?: string;
    clientCertificate?: string;
    ca?: string;
    keys: {
        keyNumber: string;
        key: string;
    }[];
    currentKeyNumber?: string;
    eventSequenceNumber: string;
}
/**
 * @group Camera Secure Video
 */
export declare const enum SecureVideoControllerEvents {
    ZONES_CHANGED = "zones-changed",
    OPERATING_MODE_CHANGED = "operating-mode-changed"
}
/**
 * @group Camera Secure Video
 */
export declare interface SecureVideoController {
    on(event: "zones-changed", listener: (zones: CameraZonesValue | undefined, active: boolean) => void): this;
    on(event: "operating-mode-changed", listener: () => void): this;
    emit(event: "zones-changed", zones: CameraZonesValue | undefined, active: boolean): boolean;
    emit(event: "operating-mode-changed"): boolean;
}
/**
 * Implements the camera services of the HomeKit Secure Video Open Source Compatibility Guide (WebRTC streaming,
 * multi-tier RTP streaming and CMAF ingest recording). Media handling is left to the supplied delegates.
 *
 * @group Camera Secure Video
 */
export declare class SecureVideoController extends EventEmitter implements SerializableController<SecureVideoControllerServiceMap, SecureVideoControllerState>, SnapshotController<SecureVideoControllerServiceMap> {
    static readonly CONTROLLER_ID = "secure-video";
    capabilitiesService?: CameraCapabilities;
    globalOperatingModeService?: CameraGlobalOperatingMode;
    motionZonesService?: CameraMotionZones;
    multiTierStreamManagementService?: CameraMultiTierRTPStreamManagement;
    webrtcStreamManagementService?: CameraWebRTCStreamManagement;
    recordingManagement?: RecordingManagement;
    bufferManagementService?: CameraBufferManagement;
    keyManagementService?: CameraKeyManagement;
    clientCertificateManagementService?: CameraClientCertificateManagement;
    motionService?: Service;
    microphoneService?: Microphone;
    speakerService?: Speaker;
    private readonly options;
    private stateChangeDelegate?;
    private motionServiceExternallySupplied;
    private dataStreamManagement?;
    private snapshotTransport?;
    private cmafIngest?;
    private readonly externalCleanups;
    private readonly webrtcSessions;
    private readonly lastResponses;
    private readonly readHandlers;
    private events;
    private eventSequenceNumber;
    private zones?;
    private publishingPoint?;
    private privateKey?;
    private clientCertificate?;
    private ca?;
    private readonly keys;
    private currentKeyNumber?;
    constructor(options: SecureVideoControllerOptions);
    controllerId(): ControllerIdentifier;
    /** Whether the camera is enabled in HomeKit, mirrored from the {@link Characteristic.HomeKitCameraActive} of the global operating mode. */
    get homeKitCameraActive(): boolean;
    /** The recording management service, see {@link recordingManagement}. */
    get recordingManagementService(): Service | undefined;
    /** Whether recording is enabled by the user, mirrored from the {@link Characteristic.Active} of the recording management. */
    get recordingActive(): boolean;
    /** Whether audio recording is enabled by the user. */
    get recordingAudioActive(): boolean;
    /** The configured motion zones and whether zone based motion detection is active. */
    get motionZones(): {
        active: boolean;
        zones?: CameraZonesValue;
    };
    /** Identifiers of the currently active WebRTC streaming sessions. */
    get activeWebRTCSessions(): string[];
    /**
     * Whether streaming is currently allowed, honoring the global operating mode (camera active, streaming enabled and
     * not manually disabled). Pass a stream management service to additionally require its own streaming to be enabled.
     */
    streamingAllowed(service?: Service): boolean;
    /** Reports a motion state change by updating the motion sensor's {@link Characteristic.MotionDetected}. */
    setMotionDetected(active: boolean): void;
    private ingestCredentials;
    private ingestMediaDescription;
    /** Signals whether the CMAF ingest client certificate needs to be (re)issued by the HomeKit HomeHub. */
    setClientCertificateNeedsUpdate(needsUpdate: boolean): void;
    /** Ends the WebRTC streaming session with the given identifier and notifies the delegate. */
    endWebRTCSession(sessionIdentifier: string): Promise<void>;
    constructServices(): SecureVideoControllerServiceMap;
    initWithServices(serviceMap: SecureVideoControllerServiceMap): SecureVideoControllerServiceMap | void;
    configureServices(): void;
    private onExternalChange;
    private configureCMAFIngestServices;
    /**
     * @private
     */
    handleSnapshotRequest(height: number, width: number, accessoryName?: string, reason?: ResourceRequestReason): Promise<Buffer>;
    handleControllerRemoved(): void;
    handleFactoryReset(): void;
    serialize(): SecureVideoControllerState | undefined;
    deserialize(serialized: SecureVideoControllerState): void;
    setupStateChangeDelegate(delegate?: StateChangeDelegate): void;
    private buildServiceMap;
    private updateStatusActive;
    private updateWebRTCSessionCount;
    private pushEvent;
    private handleBufferEventCommand;
    private handleBufferUpload;
    private handleSetupEndpoints;
    private handleRTPStreamingControl;
    private handleSolicitOffer;
    private handleProvideAnswer;
    private handleReoffer;
    private handleUpdateSession;
    private handleWebRTCStreamingControl;
    private registerRead;
    private handleTLVWrite;
}
//# sourceMappingURL=SecureVideoController.d.ts.map
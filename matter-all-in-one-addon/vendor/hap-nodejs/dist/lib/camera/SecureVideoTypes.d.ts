/**
 * @group Camera Secure Video
 */
export declare const CAMERA_CAPABILITIES_VERSION = "17.99";
/**
 * @group Camera Secure Video
 */
export declare const enum StreamTierVideoCodec {
    H264 = 1,
    H265 = 2
}
/**
 * @group Camera Secure Video
 */
export declare const enum StreamTierAudioCodec {
    OPUS = 3
}
/**
 * @group Camera Secure Video
 */
export declare const enum CameraVideoQuality {
    HIGHEST = 1,
    HIGH = 2,
    MEDIUM = 3,
    LOW = 4
}
/**
 * @group Camera Secure Video
 */
export declare const enum StreamTierAudioSampleRate {
    KHZ_16 = 1,
    KHZ_24 = 2,
    KHZ_32 = 3,
    KHZ_48 = 4
}
/**
 * @group Camera Secure Video
 */
export declare const enum StreamTierAudioBitDepth {
    BITS_8 = 1,
    BITS_16 = 2,
    BITS_24 = 3
}
/**
 * @group Camera Secure Video
 */
export declare const enum CameraSensorType {
    UNKNOWN = 0,
    PRIMARY = 1,
    GENERIC = 255
}
/**
 * @group Camera Secure Video
 */
export declare const enum CameraSensorIntent {
    UNKNOWN = 0,
    MAIN = 1,
    PACKAGE = 2,
    GENERIC = 255
}
/**
 * @group Camera Secure Video
 */
export declare const enum RTPStreamingCommand {
    END = 1,
    START = 2
}
/**
 * @group Camera Secure Video
 */
export declare const enum RTPStreamingStatus {
    SUCCESS = 0,
    UNKNOWN_SESSION_IDENTIFIER = 1,
    NO_SUCH_STREAM = 2,
    BUSY = 3,
    ERROR = 4
}
/**
 * @group Camera Secure Video
 */
export declare const enum WebRTCSolicitOfferStatus {
    SUCCESS = 0,
    PRIVACY_MODE_ACTIVE = 1,
    ERROR = 2
}
/**
 * @group Camera Secure Video
 */
export declare const enum WebRTCStreamingStatus {
    SUCCESS = 0,
    UNKNOWN_SESSION_IDENTIFIER = 1,
    BUSY = 2,
    ERROR = 3
}
/**
 * @group Camera Secure Video
 */
export declare const enum WebRTCStreamingCommand {
    END = 1
}
/**
 * @group Camera Secure Video
 */
export declare const enum BufferUploadCommandType {
    START = 1,
    START_AND_STOP = 2,
    STOP = 3
}
/**
 * @group Camera Secure Video
 */
export declare const enum BufferUploadStopAction {
    PAUSE = 1,
    FINALIZE = 2
}
/**
 * @group Camera Secure Video
 */
export declare const enum BufferActivity {
    SHOULD_RECORD = 1,
    SHOULD_NOT_RECORD = 2
}
/**
 * @group Camera Secure Video
 */
export declare const enum BufferEventCommandType {
    QUERY = 1,
    ACKNOWLEDGE = 2
}
/**
 * @group Camera Secure Video
 */
export declare const enum CameraBufferEventType {
    CMAF_SESSION_START = 1,
    CMAF_SESSION_STOP = 2,
    MOTION = 3,
    CMAF_ERROR = 4
}
/**
 * @group Camera Secure Video
 */
export declare const enum CMAFError {
    NONE = 0,
    UNKNOWN = 1,
    CANNOT_FIND_HOST = 2,
    CERT_CONNECTION_FAILURE = 3,
    CANNOT_CERTIFY = 4,
    INVALID_STATE = 5,
    REQUIRES_RETRY = 6,
    NO_RESPONSE = 7,
    MAX_SESSION_TIME_EXCEEDED = 8,
    CANCELED = 9,
    MP4_ERROR = 10,
    CONNECTION_FAILED = 11,
    TIMEOUT = 12,
    OUT_OF_RESOURCES = 13,
    INVALID_DATA = 14,
    HTTP_BAD_REQUEST = 15,
    HTTP_INVALID_TOKEN = 16,
    HTTP_CAMERA_ZONE_DISABLED = 17,
    HTTP_MISMATCHED_TOKEN = 18,
    HTTP_NOT_FOUND = 19,
    HTTP_INIT_MISSING = 20,
    HTTP_UNSUPPORTED_MEDIA_TYPE = 21,
    HTTP_BLOCKED = 22,
    HTTP_CERTIFICATE_EXPIRED = 23,
    HTTP_INTERNAL_SERVER_ERROR = 24,
    HTTP_SERVICE_UNAVAILABLE = 25,
    HTTP_CAMERA_ZONE_DOES_NOT_EXIST = 26
}
/**
 * @group Camera Secure Video
 */
export declare const enum ZoneApplicationMethod {
    NORMAL = 1,
    INVERTED = 2
}
/**
 * @group Camera Secure Video
 */
export interface VideoStreamTier {
    identifier: number;
    quality: CameraVideoQuality;
    /** kbps */
    targetAverageBitrate: number;
    width: number;
    height: number;
    frameRate: number;
}
/**
 * @group Camera Secure Video
 */
export interface SupportedVideoStreamTiersValue {
    codec: StreamTierVideoCodec;
    payloadType: number;
    tiers: VideoStreamTier[];
}
/**
 * @group Camera Secure Video
 */
export interface AudioStreamTier {
    identifier: number;
    /** bits per second */
    targetAverageBitrate: number;
    sampleRate: StreamTierAudioSampleRate;
    bitDepth: StreamTierAudioBitDepth;
    packetTime: number;
    channels: number;
}
/**
 * @group Camera Secure Video
 */
export interface SupportedAudioStreamTiersValue {
    codec: StreamTierAudioCodec;
    payloadType: number;
    tiers: AudioStreamTier[];
}
/**
 * @group Camera Secure Video
 */
export interface CameraVideoStreamCapability {
    /** uuid string */
    identifier: string;
    quality: CameraVideoQuality;
    width: number;
    height: number;
    frameRate: number;
    /** kbps */
    averageBitrate: number;
    /** kbps */
    peakBitrate: number;
}
/**
 * @group Camera Secure Video
 */
export interface CameraSensorConfiguration {
    width: number;
    height: number;
    /** uuid string */
    sensorUUID: string;
    type: CameraSensorType;
    intent: CameraSensorIntent;
    videoStreams: CameraVideoStreamCapability[];
}
/**
 * @group Camera Secure Video
 */
export interface CameraCapabilitiesValue {
    version: number;
    sensors: CameraSensorConfiguration[];
}
/**
 * @group Camera Secure Video
 */
export interface RTPStreamingControlRequest {
    sessionIdentifier: string;
    command: RTPStreamingCommand;
    videoTier?: number;
    videoSSRC?: number;
    audioTier?: number;
    audioSSRC?: number;
}
/**
 * @group Camera Secure Video
 */
export interface RTPStreamAddress {
    version: "ipv4" | "ipv6";
    address: string;
    videoRTPPort: number;
    audioRTPPort: number;
}
/**
 * @group Camera Secure Video
 */
export interface RTPSRTPParameters {
    /** SRTP crypto suite, 0 = AES_CM_128_HMAC_SHA1_80 */
    cryptoSuite: number;
    masterKey: Buffer;
    masterSalt: Buffer;
}
/**
 * @group Camera Secure Video
 */
export interface RTPSetupEndpointsRequest {
    sessionIdentifier: string;
    controllerAddress: RTPStreamAddress;
    video: RTPSRTPParameters;
    audio: RTPSRTPParameters;
}
/**
 * @group Camera Secure Video
 */
export interface RTPSetupEndpointsResponse {
    sessionIdentifier: string;
    /** 0 = success, 1 = busy, 2 = error */
    status?: number;
    accessoryAddress: RTPStreamAddress;
    video: RTPSRTPParameters;
    audio: RTPSRTPParameters;
    videoSSRC: number;
    audioSSRC: number;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCOfferOptions {
    sframeEnabled: boolean;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCICECandidate {
    candidate: string;
    sdpMid?: string;
    sdpMLineIndex?: number;
}
/**
 * @group Camera Secure Video
 */
export interface SFrameKeyData {
    key: Buffer;
    kid: bigint;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCSolicitOfferResponse {
    sessionIdentifier?: string;
    sdpOffer?: string;
    candidates?: WebRTCICECandidate[];
    status: WebRTCSolicitOfferStatus;
    sframe?: SFrameKeyData;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCProvideAnswerRequest {
    sessionIdentifier: string;
    sdpAnswer: string;
    candidates: WebRTCICECandidate[];
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCStreamingControlRequest {
    sessionIdentifier: string;
    command: WebRTCStreamingCommand;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCReofferRequest {
    sessionIdentifier: string;
    sdpOffer: string;
    options?: WebRTCOfferOptions;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCReofferResponse {
    sessionIdentifier: string;
    sdpAnswer?: string;
    status: WebRTCStreamingStatus;
    sframe?: SFrameKeyData;
}
/**
 * @group Camera Secure Video
 */
export interface WebRTCUpdateSessionRequest {
    sessionIdentifier: string;
    receiveKeysToAdd: SFrameKeyData[];
    receiveKIDsToRemove: bigint[];
}
/**
 * @group Camera Secure Video
 */
export interface BufferUploadCommandRequest {
    sessionId: bigint;
    command: BufferUploadCommandType;
    start?: bigint;
    stop?: bigint;
    stopAction?: BufferUploadStopAction;
}
/**
 * @group Camera Secure Video
 */
export interface BufferActivityCommandRequest {
    /** NTP timestamp */
    start: bigint;
    /** milliseconds */
    duration: bigint;
    activity: BufferActivity;
}
/**
 * @group Camera Secure Video
 */
export interface BufferEventCommandRequest {
    command: BufferEventCommandType;
    sequenceNumber?: bigint;
    limit?: bigint;
}
/**
 * @group Camera Secure Video
 */
export type CameraBufferEvent = {
    sequenceNumber: bigint;
    type: CameraBufferEventType.CMAF_SESSION_START;
    cmafSessionId: bigint;
} | {
    sequenceNumber: bigint;
    type: CameraBufferEventType.CMAF_SESSION_STOP;
    cmafSessionId: bigint;
} | {
    sequenceNumber: bigint;
    type: CameraBufferEventType.MOTION;
    active: boolean;
} | {
    sequenceNumber: bigint;
    type: CameraBufferEventType.CMAF_ERROR;
    cmafSessionId: bigint;
    error: CMAFError;
};
/**
 * @group Camera Secure Video
 */
export interface CameraRecordingPublishingPointValue {
    url: string;
    /** DER encoded */
    serverCACertificates: Buffer[];
}
/**
 * @group Camera Secure Video
 */
export interface CameraKeyValue {
    key: Buffer;
    keyNumber: bigint;
}
/**
 * @group Camera Secure Video
 */
export interface CameraClientCertificateValue {
    /** DER encoded */
    clientCertificate: Buffer;
    /** DER encoded */
    ca?: Buffer;
}
/**
 * @group Camera Secure Video
 */
export interface CameraZonePolygon {
    /** uuid string */
    identifier: string;
    vertices: {
        x: number;
        y: number;
    }[];
}
/**
 * @group Camera Secure Video
 */
export interface CameraZoneData {
    method: ZoneApplicationMethod;
    polygons: CameraZonePolygon[];
}
/**
 * @group Camera Secure Video
 */
export interface CameraZonesValue {
    version: number;
    zones: CameraZoneData[];
}
/**
 * @group Camera Secure Video
 */
export declare function encodeSupportedVideoStreamTiers(value: SupportedVideoStreamTiersValue): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeSupportedVideoStreamTiers(buffer: Buffer): SupportedVideoStreamTiersValue;
/**
 * @group Camera Secure Video
 */
export declare function encodeSupportedAudioStreamTiers(value: SupportedAudioStreamTiersValue): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeSupportedAudioStreamTiers(buffer: Buffer): SupportedAudioStreamTiersValue;
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraCapabilities(value: CameraCapabilitiesValue): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeCameraCapabilities(buffer: Buffer): CameraCapabilitiesValue;
/**
 * @group Camera Secure Video
 */
export declare function encodeContributingSensors(sensorUUIDs: string[]): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function encodeSensorUUID(sensorUUID: string): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeRTPStreamingControl(buffer: Buffer): RTPStreamingControlRequest;
/**
 * @group Camera Secure Video
 */
export declare function encodeSessionStatus(sessionIdentifier: string | undefined, status: number): Buffer;
/**
 * The multi-tier RTP Setup Endpoints characteristic reuses the same TLV as the legacy HAP Setup Endpoints.
 *
 * @group Camera Secure Video
 */
export declare function decodeRTPSetupEndpoints(buffer: Buffer): RTPSetupEndpointsRequest;
/**
 * @group Camera Secure Video
 */
export declare function encodeRTPSetupEndpointsResponse(response: RTPSetupEndpointsResponse): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeWebRTCSolicitOffer(buffer: Buffer): WebRTCOfferOptions;
/**
 * @group Camera Secure Video
 */
export declare function encodeWebRTCSolicitOfferResponse(value: WebRTCSolicitOfferResponse): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeWebRTCProvideAnswer(buffer: Buffer): WebRTCProvideAnswerRequest;
/**
 * @group Camera Secure Video
 */
export declare function decodeWebRTCStreamingControl(buffer: Buffer): WebRTCStreamingControlRequest;
/**
 * @group Camera Secure Video
 */
export declare function decodeWebRTCReoffer(buffer: Buffer): WebRTCReofferRequest;
/**
 * @group Camera Secure Video
 */
export declare function encodeWebRTCReofferResponse(value: WebRTCReofferResponse): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeWebRTCUpdateSession(buffer: Buffer): WebRTCUpdateSessionRequest;
/**
 * @group Camera Secure Video
 */
export declare function decodeBufferUploadCommand(buffer: Buffer): BufferUploadCommandRequest;
/**
 * @group Camera Secure Video
 */
export declare function encodeBufferUploadCommandResponse(clipId: bigint): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeBufferActivityCommand(buffer: Buffer): BufferActivityCommandRequest;
/**
 * @group Camera Secure Video
 */
export declare function decodeBufferEventCommand(buffer: Buffer): BufferEventCommandRequest;
/**
 * @group Camera Secure Video
 */
export declare function encodeBufferEventCommandResponse(events: CameraBufferEvent[]): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeBufferEventCommandResponse(buffer: Buffer): CameraBufferEvent[];
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraRecordingPublishingPoint(value: CameraRecordingPublishingPointValue): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeCameraRecordingPublishingPoint(buffer: Buffer): CameraRecordingPublishingPointValue;
/**
 * @group Camera Secure Video
 */
export declare function decodeCameraKey(buffer: Buffer): CameraKeyValue;
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraKeyID(keyId: bigint): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeCameraClientCSRRequest(buffer: Buffer): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraClientCSRResponse(csr: Buffer, nonceSignature: Buffer): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraClientCertificate(value: CameraClientCertificateValue): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeCameraClientCertificate(buffer: Buffer): CameraClientCertificateValue;
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraClientCertificateStatus(needsUpdate: boolean): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function encodeCameraZones(value: CameraZonesValue): Buffer;
/**
 * @group Camera Secure Video
 */
export declare function decodeCameraZones(buffer: Buffer): CameraZonesValue;
//# sourceMappingURL=SecureVideoTypes.d.ts.map
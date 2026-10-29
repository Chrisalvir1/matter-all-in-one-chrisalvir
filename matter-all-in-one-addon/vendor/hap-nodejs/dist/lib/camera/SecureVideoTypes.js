"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZoneApplicationMethod = exports.CMAFError = exports.CameraBufferEventType = exports.BufferEventCommandType = exports.BufferActivity = exports.BufferUploadStopAction = exports.BufferUploadCommandType = exports.WebRTCStreamingCommand = exports.WebRTCStreamingStatus = exports.WebRTCSolicitOfferStatus = exports.RTPStreamingStatus = exports.RTPStreamingCommand = exports.CameraSensorIntent = exports.CameraSensorType = exports.StreamTierAudioBitDepth = exports.StreamTierAudioSampleRate = exports.CameraVideoQuality = exports.StreamTierAudioCodec = exports.StreamTierVideoCodec = exports.CAMERA_CAPABILITIES_VERSION = void 0;
exports.encodeSupportedVideoStreamTiers = encodeSupportedVideoStreamTiers;
exports.decodeSupportedVideoStreamTiers = decodeSupportedVideoStreamTiers;
exports.encodeSupportedAudioStreamTiers = encodeSupportedAudioStreamTiers;
exports.decodeSupportedAudioStreamTiers = decodeSupportedAudioStreamTiers;
exports.encodeCameraCapabilities = encodeCameraCapabilities;
exports.decodeCameraCapabilities = decodeCameraCapabilities;
exports.encodeContributingSensors = encodeContributingSensors;
exports.encodeSensorUUID = encodeSensorUUID;
exports.decodeRTPStreamingControl = decodeRTPStreamingControl;
exports.encodeSessionStatus = encodeSessionStatus;
exports.decodeRTPSetupEndpoints = decodeRTPSetupEndpoints;
exports.encodeRTPSetupEndpointsResponse = encodeRTPSetupEndpointsResponse;
exports.decodeWebRTCSolicitOffer = decodeWebRTCSolicitOffer;
exports.encodeWebRTCSolicitOfferResponse = encodeWebRTCSolicitOfferResponse;
exports.decodeWebRTCProvideAnswer = decodeWebRTCProvideAnswer;
exports.decodeWebRTCStreamingControl = decodeWebRTCStreamingControl;
exports.decodeWebRTCReoffer = decodeWebRTCReoffer;
exports.encodeWebRTCReofferResponse = encodeWebRTCReofferResponse;
exports.decodeWebRTCUpdateSession = decodeWebRTCUpdateSession;
exports.decodeBufferUploadCommand = decodeBufferUploadCommand;
exports.encodeBufferUploadCommandResponse = encodeBufferUploadCommandResponse;
exports.decodeBufferActivityCommand = decodeBufferActivityCommand;
exports.decodeBufferEventCommand = decodeBufferEventCommand;
exports.encodeBufferEventCommandResponse = encodeBufferEventCommandResponse;
exports.decodeBufferEventCommandResponse = decodeBufferEventCommandResponse;
exports.encodeCameraRecordingPublishingPoint = encodeCameraRecordingPublishingPoint;
exports.decodeCameraRecordingPublishingPoint = decodeCameraRecordingPublishingPoint;
exports.decodeCameraKey = decodeCameraKey;
exports.encodeCameraKeyID = encodeCameraKeyID;
exports.decodeCameraClientCSRRequest = decodeCameraClientCSRRequest;
exports.encodeCameraClientCSRResponse = encodeCameraClientCSRResponse;
exports.encodeCameraClientCertificate = encodeCameraClientCertificate;
exports.decodeCameraClientCertificate = decodeCameraClientCertificate;
exports.encodeCameraClientCertificateStatus = encodeCameraClientCertificateStatus;
exports.encodeCameraZones = encodeCameraZones;
exports.decodeCameraZones = decodeCameraZones;
const tslib_1 = require("tslib");
const uuid = tslib_1.__importStar(require("../util/uuid"));
const DELIMITER = Buffer.from([0x00, 0x00]);
/**
 * @group Camera Secure Video
 */
exports.CAMERA_CAPABILITIES_VERSION = "17.99";
/**
 * @group Camera Secure Video
 */
var StreamTierVideoCodec;
(function (StreamTierVideoCodec) {
    StreamTierVideoCodec[StreamTierVideoCodec["H264"] = 1] = "H264";
    StreamTierVideoCodec[StreamTierVideoCodec["H265"] = 2] = "H265";
})(StreamTierVideoCodec || (exports.StreamTierVideoCodec = StreamTierVideoCodec = {}));
/**
 * @group Camera Secure Video
 */
var StreamTierAudioCodec;
(function (StreamTierAudioCodec) {
    StreamTierAudioCodec[StreamTierAudioCodec["OPUS"] = 3] = "OPUS";
})(StreamTierAudioCodec || (exports.StreamTierAudioCodec = StreamTierAudioCodec = {}));
/**
 * @group Camera Secure Video
 */
var CameraVideoQuality;
(function (CameraVideoQuality) {
    CameraVideoQuality[CameraVideoQuality["HIGHEST"] = 1] = "HIGHEST";
    CameraVideoQuality[CameraVideoQuality["HIGH"] = 2] = "HIGH";
    CameraVideoQuality[CameraVideoQuality["MEDIUM"] = 3] = "MEDIUM";
    CameraVideoQuality[CameraVideoQuality["LOW"] = 4] = "LOW";
})(CameraVideoQuality || (exports.CameraVideoQuality = CameraVideoQuality = {}));
/**
 * @group Camera Secure Video
 */
var StreamTierAudioSampleRate;
(function (StreamTierAudioSampleRate) {
    StreamTierAudioSampleRate[StreamTierAudioSampleRate["KHZ_16"] = 1] = "KHZ_16";
    StreamTierAudioSampleRate[StreamTierAudioSampleRate["KHZ_24"] = 2] = "KHZ_24";
    StreamTierAudioSampleRate[StreamTierAudioSampleRate["KHZ_32"] = 3] = "KHZ_32";
    StreamTierAudioSampleRate[StreamTierAudioSampleRate["KHZ_48"] = 4] = "KHZ_48";
})(StreamTierAudioSampleRate || (exports.StreamTierAudioSampleRate = StreamTierAudioSampleRate = {}));
/**
 * @group Camera Secure Video
 */
var StreamTierAudioBitDepth;
(function (StreamTierAudioBitDepth) {
    StreamTierAudioBitDepth[StreamTierAudioBitDepth["BITS_8"] = 1] = "BITS_8";
    StreamTierAudioBitDepth[StreamTierAudioBitDepth["BITS_16"] = 2] = "BITS_16";
    StreamTierAudioBitDepth[StreamTierAudioBitDepth["BITS_24"] = 3] = "BITS_24";
})(StreamTierAudioBitDepth || (exports.StreamTierAudioBitDepth = StreamTierAudioBitDepth = {}));
/**
 * @group Camera Secure Video
 */
var CameraSensorType;
(function (CameraSensorType) {
    CameraSensorType[CameraSensorType["UNKNOWN"] = 0] = "UNKNOWN";
    CameraSensorType[CameraSensorType["PRIMARY"] = 1] = "PRIMARY";
    CameraSensorType[CameraSensorType["GENERIC"] = 255] = "GENERIC";
})(CameraSensorType || (exports.CameraSensorType = CameraSensorType = {}));
/**
 * @group Camera Secure Video
 */
var CameraSensorIntent;
(function (CameraSensorIntent) {
    CameraSensorIntent[CameraSensorIntent["UNKNOWN"] = 0] = "UNKNOWN";
    CameraSensorIntent[CameraSensorIntent["MAIN"] = 1] = "MAIN";
    CameraSensorIntent[CameraSensorIntent["PACKAGE"] = 2] = "PACKAGE";
    CameraSensorIntent[CameraSensorIntent["GENERIC"] = 255] = "GENERIC";
})(CameraSensorIntent || (exports.CameraSensorIntent = CameraSensorIntent = {}));
/**
 * @group Camera Secure Video
 */
var RTPStreamingCommand;
(function (RTPStreamingCommand) {
    RTPStreamingCommand[RTPStreamingCommand["END"] = 1] = "END";
    RTPStreamingCommand[RTPStreamingCommand["START"] = 2] = "START";
})(RTPStreamingCommand || (exports.RTPStreamingCommand = RTPStreamingCommand = {}));
/**
 * @group Camera Secure Video
 */
var RTPStreamingStatus;
(function (RTPStreamingStatus) {
    RTPStreamingStatus[RTPStreamingStatus["SUCCESS"] = 0] = "SUCCESS";
    RTPStreamingStatus[RTPStreamingStatus["UNKNOWN_SESSION_IDENTIFIER"] = 1] = "UNKNOWN_SESSION_IDENTIFIER";
    RTPStreamingStatus[RTPStreamingStatus["NO_SUCH_STREAM"] = 2] = "NO_SUCH_STREAM";
    RTPStreamingStatus[RTPStreamingStatus["BUSY"] = 3] = "BUSY";
    RTPStreamingStatus[RTPStreamingStatus["ERROR"] = 4] = "ERROR";
})(RTPStreamingStatus || (exports.RTPStreamingStatus = RTPStreamingStatus = {}));
/**
 * @group Camera Secure Video
 */
var WebRTCSolicitOfferStatus;
(function (WebRTCSolicitOfferStatus) {
    WebRTCSolicitOfferStatus[WebRTCSolicitOfferStatus["SUCCESS"] = 0] = "SUCCESS";
    WebRTCSolicitOfferStatus[WebRTCSolicitOfferStatus["PRIVACY_MODE_ACTIVE"] = 1] = "PRIVACY_MODE_ACTIVE";
    WebRTCSolicitOfferStatus[WebRTCSolicitOfferStatus["ERROR"] = 2] = "ERROR";
})(WebRTCSolicitOfferStatus || (exports.WebRTCSolicitOfferStatus = WebRTCSolicitOfferStatus = {}));
/**
 * @group Camera Secure Video
 */
var WebRTCStreamingStatus;
(function (WebRTCStreamingStatus) {
    WebRTCStreamingStatus[WebRTCStreamingStatus["SUCCESS"] = 0] = "SUCCESS";
    WebRTCStreamingStatus[WebRTCStreamingStatus["UNKNOWN_SESSION_IDENTIFIER"] = 1] = "UNKNOWN_SESSION_IDENTIFIER";
    WebRTCStreamingStatus[WebRTCStreamingStatus["BUSY"] = 2] = "BUSY";
    WebRTCStreamingStatus[WebRTCStreamingStatus["ERROR"] = 3] = "ERROR";
})(WebRTCStreamingStatus || (exports.WebRTCStreamingStatus = WebRTCStreamingStatus = {}));
/**
 * @group Camera Secure Video
 */
var WebRTCStreamingCommand;
(function (WebRTCStreamingCommand) {
    WebRTCStreamingCommand[WebRTCStreamingCommand["END"] = 1] = "END";
})(WebRTCStreamingCommand || (exports.WebRTCStreamingCommand = WebRTCStreamingCommand = {}));
/**
 * @group Camera Secure Video
 */
var BufferUploadCommandType;
(function (BufferUploadCommandType) {
    BufferUploadCommandType[BufferUploadCommandType["START"] = 1] = "START";
    BufferUploadCommandType[BufferUploadCommandType["START_AND_STOP"] = 2] = "START_AND_STOP";
    BufferUploadCommandType[BufferUploadCommandType["STOP"] = 3] = "STOP";
})(BufferUploadCommandType || (exports.BufferUploadCommandType = BufferUploadCommandType = {}));
/**
 * @group Camera Secure Video
 */
var BufferUploadStopAction;
(function (BufferUploadStopAction) {
    BufferUploadStopAction[BufferUploadStopAction["PAUSE"] = 1] = "PAUSE";
    BufferUploadStopAction[BufferUploadStopAction["FINALIZE"] = 2] = "FINALIZE";
})(BufferUploadStopAction || (exports.BufferUploadStopAction = BufferUploadStopAction = {}));
/**
 * @group Camera Secure Video
 */
var BufferActivity;
(function (BufferActivity) {
    BufferActivity[BufferActivity["SHOULD_RECORD"] = 1] = "SHOULD_RECORD";
    BufferActivity[BufferActivity["SHOULD_NOT_RECORD"] = 2] = "SHOULD_NOT_RECORD";
})(BufferActivity || (exports.BufferActivity = BufferActivity = {}));
/**
 * @group Camera Secure Video
 */
var BufferEventCommandType;
(function (BufferEventCommandType) {
    BufferEventCommandType[BufferEventCommandType["QUERY"] = 1] = "QUERY";
    BufferEventCommandType[BufferEventCommandType["ACKNOWLEDGE"] = 2] = "ACKNOWLEDGE";
})(BufferEventCommandType || (exports.BufferEventCommandType = BufferEventCommandType = {}));
/**
 * @group Camera Secure Video
 */
var CameraBufferEventType;
(function (CameraBufferEventType) {
    CameraBufferEventType[CameraBufferEventType["CMAF_SESSION_START"] = 1] = "CMAF_SESSION_START";
    CameraBufferEventType[CameraBufferEventType["CMAF_SESSION_STOP"] = 2] = "CMAF_SESSION_STOP";
    CameraBufferEventType[CameraBufferEventType["MOTION"] = 3] = "MOTION";
    CameraBufferEventType[CameraBufferEventType["CMAF_ERROR"] = 4] = "CMAF_ERROR";
})(CameraBufferEventType || (exports.CameraBufferEventType = CameraBufferEventType = {}));
/**
 * @group Camera Secure Video
 */
var CMAFError;
(function (CMAFError) {
    CMAFError[CMAFError["NONE"] = 0] = "NONE";
    CMAFError[CMAFError["UNKNOWN"] = 1] = "UNKNOWN";
    CMAFError[CMAFError["CANNOT_FIND_HOST"] = 2] = "CANNOT_FIND_HOST";
    CMAFError[CMAFError["CERT_CONNECTION_FAILURE"] = 3] = "CERT_CONNECTION_FAILURE";
    CMAFError[CMAFError["CANNOT_CERTIFY"] = 4] = "CANNOT_CERTIFY";
    CMAFError[CMAFError["INVALID_STATE"] = 5] = "INVALID_STATE";
    CMAFError[CMAFError["REQUIRES_RETRY"] = 6] = "REQUIRES_RETRY";
    CMAFError[CMAFError["NO_RESPONSE"] = 7] = "NO_RESPONSE";
    CMAFError[CMAFError["MAX_SESSION_TIME_EXCEEDED"] = 8] = "MAX_SESSION_TIME_EXCEEDED";
    CMAFError[CMAFError["CANCELED"] = 9] = "CANCELED";
    CMAFError[CMAFError["MP4_ERROR"] = 10] = "MP4_ERROR";
    CMAFError[CMAFError["CONNECTION_FAILED"] = 11] = "CONNECTION_FAILED";
    CMAFError[CMAFError["TIMEOUT"] = 12] = "TIMEOUT";
    CMAFError[CMAFError["OUT_OF_RESOURCES"] = 13] = "OUT_OF_RESOURCES";
    CMAFError[CMAFError["INVALID_DATA"] = 14] = "INVALID_DATA";
    CMAFError[CMAFError["HTTP_BAD_REQUEST"] = 15] = "HTTP_BAD_REQUEST";
    CMAFError[CMAFError["HTTP_INVALID_TOKEN"] = 16] = "HTTP_INVALID_TOKEN";
    CMAFError[CMAFError["HTTP_CAMERA_ZONE_DISABLED"] = 17] = "HTTP_CAMERA_ZONE_DISABLED";
    CMAFError[CMAFError["HTTP_MISMATCHED_TOKEN"] = 18] = "HTTP_MISMATCHED_TOKEN";
    CMAFError[CMAFError["HTTP_NOT_FOUND"] = 19] = "HTTP_NOT_FOUND";
    CMAFError[CMAFError["HTTP_INIT_MISSING"] = 20] = "HTTP_INIT_MISSING";
    CMAFError[CMAFError["HTTP_UNSUPPORTED_MEDIA_TYPE"] = 21] = "HTTP_UNSUPPORTED_MEDIA_TYPE";
    CMAFError[CMAFError["HTTP_BLOCKED"] = 22] = "HTTP_BLOCKED";
    CMAFError[CMAFError["HTTP_CERTIFICATE_EXPIRED"] = 23] = "HTTP_CERTIFICATE_EXPIRED";
    CMAFError[CMAFError["HTTP_INTERNAL_SERVER_ERROR"] = 24] = "HTTP_INTERNAL_SERVER_ERROR";
    CMAFError[CMAFError["HTTP_SERVICE_UNAVAILABLE"] = 25] = "HTTP_SERVICE_UNAVAILABLE";
    CMAFError[CMAFError["HTTP_CAMERA_ZONE_DOES_NOT_EXIST"] = 26] = "HTTP_CAMERA_ZONE_DOES_NOT_EXIST";
})(CMAFError || (exports.CMAFError = CMAFError = {}));
/**
 * @group Camera Secure Video
 */
var ZoneApplicationMethod;
(function (ZoneApplicationMethod) {
    ZoneApplicationMethod[ZoneApplicationMethod["NORMAL"] = 1] = "NORMAL";
    ZoneApplicationMethod[ZoneApplicationMethod["INVERTED"] = 2] = "INVERTED";
})(ZoneApplicationMethod || (exports.ZoneApplicationMethod = ZoneApplicationMethod = {}));
function readUIntLE(buffer) {
    let result = 0n;
    for (let i = buffer.length - 1; i >= 0; i--) {
        result = (result << 8n) | BigInt(buffer[i]);
    }
    return result;
}
class TLVReader {
    entries = [];
    constructor(buffer) {
        let index = 0;
        let afterDelimiter = false;
        let last;
        while (index < buffer.length) {
            if (index + 2 > buffer.length) {
                throw new Error("TLV decode failure: incomplete type/length header");
            }
            const type = buffer[index];
            const length = buffer[index + 1];
            if (index + 2 + length > buffer.length) {
                throw new Error(`TLV decode failure: declared length ${length} exceeds remaining buffer`);
            }
            const value = buffer.subarray(index + 2, index + 2 + length);
            index += 2 + length;
            if (type === 0 && length === 0) {
                afterDelimiter = true;
                continue;
            }
            // a full 255 byte fragment continues into the next entry of the same type
            if (last && !afterDelimiter && last.type === type && last.lastLength === 255) {
                last.value = Buffer.concat([last.value, value]);
                last.lastLength = length;
                continue;
            }
            last = { type, value, afterDelimiter, lastLength: length };
            this.entries.push(last);
            afterDelimiter = false;
        }
    }
    has(type) {
        return this.entries.some(entry => entry.type === type);
    }
    buffer(type) {
        return this.entries.find(entry => entry.type === type)?.value;
    }
    buffers(type) {
        return this.entries.filter(entry => entry.type === type).map(entry => entry.value);
    }
    string(type) {
        return this.buffer(type)?.toString("utf8");
    }
    number(type) {
        const value = this.buffer(type);
        return value && value.length ? Number(readUIntLE(value)) : undefined;
    }
    bigint(type) {
        const value = this.buffer(type);
        return value && value.length ? readUIntLE(value) : undefined;
    }
    boolean(type) {
        const value = this.buffer(type);
        return value && value.length ? value[0] !== 0 : undefined;
    }
    uuid(type) {
        const value = this.buffer(type);
        return value && value.length === 16 ? uuid.unparse(value) : undefined;
    }
    required(value, name) {
        if (value === undefined) {
            throw new Error(`TLV decode failure: missing ${name}`);
        }
        return value;
    }
}
function item(type, value) {
    if (value === undefined) {
        return Buffer.alloc(0);
    }
    const parts = [];
    let offset = 0;
    do {
        const chunk = value.subarray(offset, offset + 255);
        parts.push(Buffer.from([type, chunk.length]), chunk);
        offset += 255;
    } while (offset < value.length);
    return Buffer.concat(parts);
}
function list(type, values) {
    const parts = [];
    values.forEach((value, index) => {
        if (index > 0) {
            parts.push(DELIMITER);
        }
        parts.push(item(type, value));
    });
    return Buffer.concat(parts);
}
function u8(value) {
    return Buffer.from([value & 0xff]);
}
function u16(value) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value);
    return buffer;
}
function u32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value >>> 0);
    return buffer;
}
function u64(value) {
    const buffer = Buffer.alloc(8);
    buffer.writeBigUInt64LE(BigInt.asUintN(64, value));
    return buffer;
}
function bool(value) {
    return Buffer.from([value ? 1 : 0]);
}
function str(value) {
    return value === undefined ? undefined : Buffer.from(value, "utf8");
}
function uuidBuffer(value) {
    return uuid.write(value);
}
/**
 * @group Camera Secure Video
 */
function encodeSupportedVideoStreamTiers(value) {
    return Buffer.concat([
        item(1, u8(value.codec)),
        item(2, u8(value.payloadType)),
        list(3, value.tiers.map(tier => Buffer.concat([
            item(1, u32(tier.identifier)),
            item(2, u8(tier.quality)),
            item(3, u32(tier.targetAverageBitrate)),
            item(4, u16(tier.width)),
            item(5, u16(tier.height)),
            item(6, u8(tier.frameRate)),
        ]))),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeSupportedVideoStreamTiers(buffer) {
    const reader = new TLVReader(buffer);
    return {
        codec: reader.required(reader.number(1), "codec"),
        payloadType: reader.required(reader.number(2), "payload type"),
        tiers: reader.buffers(3).map(entry => {
            const tier = new TLVReader(entry);
            return {
                identifier: tier.required(tier.number(1), "tier identifier"),
                quality: tier.required(tier.number(2), "tier quality"),
                targetAverageBitrate: tier.required(tier.number(3), "tier bitrate"),
                width: tier.required(tier.number(4), "tier width"),
                height: tier.required(tier.number(5), "tier height"),
                frameRate: tier.required(tier.number(6), "tier frame rate"),
            };
        }),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeSupportedAudioStreamTiers(value) {
    return Buffer.concat([
        item(1, u8(value.codec)),
        item(2, u8(value.payloadType)),
        list(3, value.tiers.map(tier => Buffer.concat([
            item(1, u32(tier.identifier)),
            item(2, u32(tier.targetAverageBitrate)),
            item(3, u8(tier.sampleRate)),
            item(4, u8(tier.bitDepth)),
            item(5, u8(tier.packetTime)),
            item(6, u8(tier.channels)),
        ]))),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeSupportedAudioStreamTiers(buffer) {
    const reader = new TLVReader(buffer);
    return {
        codec: reader.required(reader.number(1), "codec"),
        payloadType: reader.required(reader.number(2), "payload type"),
        tiers: reader.buffers(3).map(entry => {
            const tier = new TLVReader(entry);
            return {
                identifier: tier.required(tier.number(1), "tier identifier"),
                targetAverageBitrate: tier.required(tier.number(2), "tier bitrate"),
                sampleRate: tier.required(tier.number(3), "tier sample rate"),
                bitDepth: tier.required(tier.number(4), "tier bit depth"),
                packetTime: tier.required(tier.number(5), "tier packet time"),
                channels: tier.required(tier.number(6), "tier channels"),
            };
        }),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeCameraCapabilities(value) {
    const sensors = value.sensors.map(sensor => Buffer.concat([
        item(1, Buffer.concat([item(1, u16(sensor.width)), item(2, u16(sensor.height))])),
        item(2, uuidBuffer(sensor.sensorUUID)),
        item(3, u8(sensor.type)),
        item(4, u8(sensor.intent)),
        list(5, sensor.videoStreams.map(stream => Buffer.concat([
            item(1, uuidBuffer(stream.identifier)),
            item(2, u8(stream.quality)),
            item(3, u16(stream.width)),
            item(4, u16(stream.height)),
            item(5, u8(stream.frameRate)),
            item(6, u32(stream.averageBitrate)),
            item(7, u32(stream.peakBitrate)),
        ]))),
    ]));
    return Buffer.concat([
        item(1, u8(value.version)),
        item(2, list(1, sensors)),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeCameraCapabilities(buffer) {
    const reader = new TLVReader(buffer);
    const sensors = new TLVReader(reader.buffer(2) ?? Buffer.alloc(0));
    return {
        version: reader.required(reader.number(1), "version"),
        sensors: sensors.buffers(1).map(entry => {
            const sensor = new TLVReader(entry);
            const dimensions = new TLVReader(sensor.required(sensor.buffer(1), "sensor dimensions"));
            return {
                width: dimensions.required(dimensions.number(1), "sensor width"),
                height: dimensions.required(dimensions.number(2), "sensor height"),
                sensorUUID: sensor.required(sensor.uuid(2), "sensor uuid"),
                type: sensor.number(3) ?? 0 /* CameraSensorType.UNKNOWN */,
                intent: sensor.number(4) ?? 0 /* CameraSensorIntent.UNKNOWN */,
                videoStreams: sensor.buffers(5).map(streamEntry => {
                    const stream = new TLVReader(streamEntry);
                    return {
                        identifier: stream.required(stream.uuid(1), "stream identifier"),
                        quality: stream.required(stream.number(2), "stream quality"),
                        width: stream.required(stream.number(3), "stream width"),
                        height: stream.required(stream.number(4), "stream height"),
                        frameRate: stream.required(stream.number(5), "stream frame rate"),
                        averageBitrate: stream.required(stream.number(6), "stream average bitrate"),
                        peakBitrate: stream.required(stream.number(7), "stream peak bitrate"),
                    };
                }),
            };
        }),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeContributingSensors(sensorUUIDs) {
    return list(1, sensorUUIDs.map(sensorUUID => item(1, uuidBuffer(sensorUUID))));
}
/**
 * @group Camera Secure Video
 */
function encodeSensorUUID(sensorUUID) {
    return uuidBuffer(sensorUUID);
}
/**
 * @group Camera Secure Video
 */
function decodeRTPStreamingControl(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionIdentifier: reader.required(reader.uuid(1), "session identifier"),
        command: reader.required(reader.number(2), "command"),
        videoTier: reader.number(3),
        videoSSRC: reader.number(4),
        audioTier: reader.number(5),
        audioSSRC: reader.number(6),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeSessionStatus(sessionIdentifier, status) {
    return Buffer.concat([
        sessionIdentifier ? item(1, uuidBuffer(sessionIdentifier)) : Buffer.alloc(0),
        item(2, u8(status)),
    ]);
}
function decodeRTPAddress(buffer) {
    const reader = new TLVReader(buffer);
    return {
        version: reader.number(1) === 1 ? "ipv6" : "ipv4",
        address: reader.required(reader.string(2), "address"),
        videoRTPPort: reader.required(reader.number(3), "video rtp port"),
        audioRTPPort: reader.required(reader.number(4), "audio rtp port"),
    };
}
function encodeRTPAddress(address) {
    return Buffer.concat([
        item(1, u8(address.version === "ipv6" ? 1 : 0)),
        item(2, str(address.address)),
        item(3, u16(address.videoRTPPort)),
        item(4, u16(address.audioRTPPort)),
    ]);
}
function decodeSRTPParameters(buffer) {
    const reader = new TLVReader(buffer);
    return {
        cryptoSuite: reader.number(1) ?? 0,
        masterKey: reader.buffer(2) ?? Buffer.alloc(0),
        masterSalt: reader.buffer(3) ?? Buffer.alloc(0),
    };
}
function encodeSRTPParameters(parameters) {
    return Buffer.concat([
        item(1, u8(parameters.cryptoSuite)),
        item(2, parameters.masterKey),
        item(3, parameters.masterSalt),
    ]);
}
/**
 * The multi-tier RTP Setup Endpoints characteristic reuses the same TLV as the legacy HAP Setup Endpoints.
 *
 * @group Camera Secure Video
 */
function decodeRTPSetupEndpoints(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionIdentifier: reader.required(reader.uuid(1), "session identifier"),
        controllerAddress: decodeRTPAddress(reader.required(reader.buffer(3), "controller address")),
        video: decodeSRTPParameters(reader.required(reader.buffer(4), "video srtp parameters")),
        audio: decodeSRTPParameters(reader.required(reader.buffer(5), "audio srtp parameters")),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeRTPSetupEndpointsResponse(response) {
    return Buffer.concat([
        item(1, uuidBuffer(response.sessionIdentifier)),
        item(2, u8(response.status ?? 0)),
        item(3, encodeRTPAddress(response.accessoryAddress)),
        item(4, encodeSRTPParameters(response.video)),
        item(5, encodeSRTPParameters(response.audio)),
        item(6, u32(response.videoSSRC)),
        item(7, u32(response.audioSSRC)),
    ]);
}
function decodeOfferOptions(buffer) {
    if (!buffer) {
        return undefined;
    }
    return { sframeEnabled: new TLVReader(buffer).boolean(1) ?? false };
}
function encodeCandidate(candidate) {
    return Buffer.concat([
        item(1, str(candidate.candidate)),
        item(2, str(candidate.sdpMid)),
        candidate.sdpMLineIndex !== undefined ? item(3, u16(candidate.sdpMLineIndex)) : Buffer.alloc(0),
    ]);
}
function decodeCandidate(buffer) {
    const reader = new TLVReader(buffer);
    return {
        candidate: reader.required(reader.string(1), "candidate"),
        sdpMid: reader.string(2),
        sdpMLineIndex: reader.number(3),
    };
}
function encodeSFrameKey(key) {
    return Buffer.concat([item(1, key.key), item(2, u64(key.kid))]);
}
function decodeSFrameKey(buffer) {
    const reader = new TLVReader(buffer);
    return {
        key: reader.required(reader.buffer(1), "sframe key"),
        kid: reader.required(reader.bigint(2), "sframe kid"),
    };
}
/**
 * @group Camera Secure Video
 */
function decodeWebRTCSolicitOffer(buffer) {
    const reader = new TLVReader(buffer);
    return decodeOfferOptions(reader.buffer(1)) ?? { sframeEnabled: false };
}
/**
 * @group Camera Secure Video
 */
function encodeWebRTCSolicitOfferResponse(value) {
    return Buffer.concat([
        value.sessionIdentifier ? item(1, uuidBuffer(value.sessionIdentifier)) : Buffer.alloc(0),
        item(2, str(value.sdpOffer)),
        list(3, (value.candidates ?? []).map(encodeCandidate)),
        item(4, u8(value.status)),
        value.sframe ? item(5, encodeSFrameKey(value.sframe)) : Buffer.alloc(0),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeWebRTCProvideAnswer(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionIdentifier: reader.required(reader.uuid(1), "session identifier"),
        sdpAnswer: reader.required(reader.string(2), "sdp answer"),
        candidates: reader.buffers(3).map(decodeCandidate),
    };
}
/**
 * @group Camera Secure Video
 */
function decodeWebRTCStreamingControl(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionIdentifier: reader.required(reader.uuid(1), "session identifier"),
        command: reader.required(reader.number(2), "command"),
    };
}
/**
 * @group Camera Secure Video
 */
function decodeWebRTCReoffer(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionIdentifier: reader.required(reader.uuid(1), "session identifier"),
        sdpOffer: reader.required(reader.string(2), "sdp offer"),
        options: decodeOfferOptions(reader.buffer(3)),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeWebRTCReofferResponse(value) {
    return Buffer.concat([
        item(1, uuidBuffer(value.sessionIdentifier)),
        item(2, str(value.sdpAnswer)),
        item(3, u8(value.status)),
        value.sframe ? item(4, encodeSFrameKey(value.sframe)) : Buffer.alloc(0),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeWebRTCUpdateSession(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionIdentifier: reader.required(reader.uuid(1), "session identifier"),
        receiveKeysToAdd: reader.buffers(2).map(decodeSFrameKey),
        receiveKIDsToRemove: reader.buffers(3).map(entry => {
            const kid = new TLVReader(entry);
            return kid.required(kid.bigint(1), "sframe kid");
        }),
    };
}
/**
 * @group Camera Secure Video
 */
function decodeBufferUploadCommand(buffer) {
    const reader = new TLVReader(buffer);
    return {
        sessionId: reader.required(reader.bigint(1), "session id"),
        command: reader.required(reader.number(2), "command"),
        start: reader.bigint(3),
        stop: reader.bigint(4),
        stopAction: reader.number(5),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeBufferUploadCommandResponse(clipId) {
    return item(1, u64(clipId));
}
/**
 * @group Camera Secure Video
 */
function decodeBufferActivityCommand(buffer) {
    const reader = new TLVReader(buffer);
    return {
        start: reader.required(reader.bigint(1), "start"),
        duration: reader.required(reader.bigint(2), "duration"),
        activity: reader.required(reader.number(3), "activity"),
    };
}
/**
 * @group Camera Secure Video
 */
function decodeBufferEventCommand(buffer) {
    const reader = new TLVReader(buffer);
    return {
        command: reader.required(reader.number(1), "command"),
        sequenceNumber: reader.bigint(2),
        limit: reader.bigint(3),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeBufferEventCommandResponse(events) {
    return list(1, events.map(event => {
        let payload;
        switch (event.type) {
            case 1 /* CameraBufferEventType.CMAF_SESSION_START */:
                payload = item(3, item(1, u64(event.cmafSessionId)));
                break;
            case 2 /* CameraBufferEventType.CMAF_SESSION_STOP */:
                payload = item(4, item(1, u64(event.cmafSessionId)));
                break;
            case 3 /* CameraBufferEventType.MOTION */:
                payload = item(5, item(1, bool(event.active)));
                break;
            case 4 /* CameraBufferEventType.CMAF_ERROR */:
                payload = item(6, Buffer.concat([item(1, u64(event.cmafSessionId)), item(2, u8(event.error))]));
                break;
        }
        return Buffer.concat([item(1, u64(event.sequenceNumber)), item(2, u8(event.type)), payload]);
    }));
}
/**
 * @group Camera Secure Video
 */
function decodeBufferEventCommandResponse(buffer) {
    const reader = new TLVReader(buffer);
    return reader.buffers(1).map(entry => {
        const event = new TLVReader(entry);
        const sequenceNumber = event.required(event.bigint(1), "sequence number");
        const type = event.required(event.number(2), "event type");
        switch (type) {
            case 1 /* CameraBufferEventType.CMAF_SESSION_START */:
            case 2 /* CameraBufferEventType.CMAF_SESSION_STOP */: {
                const session = new TLVReader(event.required(event.buffer(type === 1 /* CameraBufferEventType.CMAF_SESSION_START */ ? 3 : 4), "cmaf session"));
                return { sequenceNumber, type, cmafSessionId: session.required(session.bigint(1), "cmaf session id") };
            }
            case 3 /* CameraBufferEventType.MOTION */: {
                const motion = new TLVReader(event.required(event.buffer(5), "motion"));
                return { sequenceNumber, type, active: motion.boolean(1) ?? false };
            }
            case 4 /* CameraBufferEventType.CMAF_ERROR */: {
                const error = new TLVReader(event.required(event.buffer(6), "cmaf error"));
                return {
                    sequenceNumber,
                    type,
                    cmafSessionId: error.required(error.bigint(1), "cmaf session id"),
                    error: error.number(2) ?? 1 /* CMAFError.UNKNOWN */,
                };
            }
            default:
                throw new Error(`TLV decode failure: unknown buffer event type ${type}`);
        }
    });
}
/**
 * @group Camera Secure Video
 */
function encodeCameraRecordingPublishingPoint(value) {
    return Buffer.concat([
        item(1, str(value.url)),
        list(2, value.serverCACertificates.map(certificate => item(1, certificate))),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeCameraRecordingPublishingPoint(buffer) {
    const reader = new TLVReader(buffer);
    return {
        url: reader.required(reader.string(1), "url"),
        serverCACertificates: reader.buffers(2)
            .map(entry => new TLVReader(entry).buffer(1))
            .filter((certificate) => !!certificate),
    };
}
/**
 * @group Camera Secure Video
 */
function decodeCameraKey(buffer) {
    const reader = new TLVReader(buffer);
    return {
        key: reader.required(reader.buffer(1), "key"),
        keyNumber: reader.required(reader.bigint(2), "key number"),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeCameraKeyID(keyId) {
    return item(1, u64(keyId));
}
/**
 * @group Camera Secure Video
 */
function decodeCameraClientCSRRequest(buffer) {
    const reader = new TLVReader(buffer);
    return reader.required(reader.buffer(1), "nonce");
}
/**
 * @group Camera Secure Video
 */
function encodeCameraClientCSRResponse(csr, nonceSignature) {
    return Buffer.concat([item(1, csr), item(2, nonceSignature)]);
}
/**
 * @group Camera Secure Video
 */
function encodeCameraClientCertificate(value) {
    return Buffer.concat([item(1, value.clientCertificate), item(2, value.ca)]);
}
/**
 * @group Camera Secure Video
 */
function decodeCameraClientCertificate(buffer) {
    const reader = new TLVReader(buffer);
    return {
        clientCertificate: reader.required(reader.buffer(1), "client certificate"),
        ca: reader.buffer(2),
    };
}
/**
 * @group Camera Secure Video
 */
function encodeCameraClientCertificateStatus(needsUpdate) {
    return item(1, bool(needsUpdate));
}
/**
 * @group Camera Secure Video
 */
function encodeCameraZones(value) {
    const zones = value.zones.map(zone => Buffer.concat([
        item(1, u8(zone.method)),
        list(3, zone.polygons.map(polygon => {
            const vertices = Buffer.alloc(polygon.vertices.length * 4);
            polygon.vertices.forEach((vertex, index) => {
                vertices.writeUInt16LE(vertex.x, index * 4);
                vertices.writeUInt16LE(vertex.y, index * 4 + 2);
            });
            return Buffer.concat([item(1, uuidBuffer(polygon.identifier)), item(3, vertices)]);
        })),
    ]));
    return Buffer.concat([
        item(1, u8(value.version)),
        list(2, zones),
    ]);
}
/**
 * @group Camera Secure Video
 */
function decodeCameraZones(buffer) {
    const reader = new TLVReader(buffer);
    return {
        version: reader.required(reader.number(1), "zone data version"),
        zones: reader.buffers(2).map(entry => {
            const zone = new TLVReader(entry);
            return {
                method: zone.number(1) ?? 1 /* ZoneApplicationMethod.NORMAL */,
                polygons: zone.buffers(3).map(polygonEntry => {
                    const polygon = new TLVReader(polygonEntry);
                    const vertexData = polygon.buffer(3) ?? Buffer.alloc(0);
                    const vertices = [];
                    for (let offset = 0; offset + 4 <= vertexData.length; offset += 4) {
                        vertices.push({ x: vertexData.readUInt16LE(offset), y: vertexData.readUInt16LE(offset + 2) });
                    }
                    return { identifier: polygon.uuid(1) ?? "", vertices };
                }),
            };
        }),
    };
}
//# sourceMappingURL=SecureVideoTypes.js.map
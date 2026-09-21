"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureVideoController = exports.SecureVideoControllerEvents = void 0;
const tslib_1 = require("tslib");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const debug_1 = tslib_1.__importDefault(require("debug"));
const events_1 = require("events");
const SecureVideoTypes_1 = require("../camera/SecureVideoTypes");
const CMAFIngest_1 = require("../camera/CMAFIngest");
const SecureVideoCredentials_1 = require("../camera/SecureVideoCredentials");
const HDSSnapshotTransport_1 = require("../camera/HDSSnapshotTransport");
const RecordingManagement_1 = require("../camera/RecordingManagement");
const Characteristic_1 = require("../Characteristic");
const datastream_1 = require("../datastream");
const Service_1 = require("../Service");
const hapStatusError_1 = require("../util/hapStatusError");
const uuid = tslib_1.__importStar(require("../util/uuid"));
const debug = (0, debug_1.default)("HAP-NodeJS:SecureVideo:Controller");
const MAX_QUEUED_EVENTS = 256;
const DEFAULT_MAX_WEBRTC_SESSIONS = 6;
// same budget as the image resource request of the CameraController (8s slow warning + 17s abort)
const SNAPSHOT_TIMEOUT_MS = 25000;
function setupEndpointsError(sessionIdentifier) {
    const emptySRTP = { cryptoSuite: 0, masterKey: Buffer.alloc(0), masterSalt: Buffer.alloc(0) };
    return {
        sessionIdentifier,
        status: 2,
        accessoryAddress: { version: "ipv4", address: "0.0.0.0", videoRTPPort: 0, audioRTPPort: 0 },
        video: emptySRTP,
        audio: emptySRTP,
        videoSSRC: 0,
        audioSSRC: 0,
    };
}
/**
 * @group Camera Secure Video
 */
var SecureVideoControllerEvents;
(function (SecureVideoControllerEvents) {
    SecureVideoControllerEvents["ZONES_CHANGED"] = "zones-changed";
    SecureVideoControllerEvents["OPERATING_MODE_CHANGED"] = "operating-mode-changed";
})(SecureVideoControllerEvents || (exports.SecureVideoControllerEvents = SecureVideoControllerEvents = {}));
/**
 * Implements the camera services of the HomeKit Secure Video Open Source Compatibility Guide (WebRTC streaming,
 * multi-tier RTP streaming and CMAF ingest recording). Media handling is left to the supplied delegates.
 *
 * @group Camera Secure Video
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class SecureVideoController extends events_1.EventEmitter {
    static CONTROLLER_ID = "secure-video";
    capabilitiesService;
    globalOperatingModeService;
    motionZonesService;
    multiTierStreamManagementService;
    webrtcStreamManagementService;
    recordingManagement;
    bufferManagementService;
    keyManagementService;
    clientCertificateManagementService;
    motionService;
    microphoneService;
    speakerService;
    options;
    stateChangeDelegate;
    motionServiceExternallySupplied = false;
    dataStreamManagement;
    snapshotTransport;
    cmafIngest;
    externalCleanups = [];
    webrtcSessions = new Map();
    lastResponses = new Map();
    readHandlers = new Set();
    events = [];
    eventSequenceNumber = 0n;
    zones;
    publishingPoint;
    privateKey;
    clientCertificate;
    ca;
    keys = new Map();
    currentKeyNumber;
    constructor(options) {
        super();
        this.options = options;
    }
    controllerId() {
        return SecureVideoController.CONTROLLER_ID;
    }
    /** Whether the camera is enabled in HomeKit, mirrored from the {@link Characteristic.HomeKitCameraActive} of the global operating mode. */
    get homeKitCameraActive() {
        return !!this.globalOperatingModeService?.getCharacteristic(Characteristic_1.Characteristic.HomeKitCameraActive).value;
    }
    /** The recording management service, see {@link recordingManagement}. */
    get recordingManagementService() {
        return this.recordingManagement?.recordingManagementService;
    }
    /** Whether recording is enabled by the user, mirrored from the {@link Characteristic.Active} of the recording management. */
    get recordingActive() {
        return !!this.recordingManagementService?.getCharacteristic(Characteristic_1.Characteristic.Active).value;
    }
    /** Whether audio recording is enabled by the user. */
    get recordingAudioActive() {
        return !!this.recordingManagementService?.getCharacteristic(Characteristic_1.Characteristic.RecordingAudioActive).value;
    }
    /** The configured motion zones and whether zone based motion detection is active. */
    get motionZones() {
        return {
            active: !!this.motionZonesService?.getCharacteristic(Characteristic_1.Characteristic.Active).value,
            zones: this.zones,
        };
    }
    /** Identifiers of the currently active WebRTC streaming sessions. */
    get activeWebRTCSessions() {
        return [...this.webrtcSessions.keys()];
    }
    /**
     * Whether streaming is currently allowed, honoring the global operating mode (camera active, streaming enabled and
     * not manually disabled). Pass a stream management service to additionally require its own streaming to be enabled.
     */
    streamingAllowed(service) {
        if (!this.homeKitCameraActive) {
            return false;
        }
        if (!this.globalOperatingModeService?.getCharacteristic(Characteristic_1.Characteristic.StreamingEnabled).value) {
            return false;
        }
        if (this.globalOperatingModeService.testCharacteristic(Characteristic_1.Characteristic.ManuallyDisabled)
            && this.globalOperatingModeService.getCharacteristic(Characteristic_1.Characteristic.ManuallyDisabled).value) {
            return false;
        }
        return !service || !!service.getCharacteristic(Characteristic_1.Characteristic.StreamingEnabled).value;
    }
    /** Reports a motion state change by updating the motion sensor's {@link Characteristic.MotionDetected}. */
    setMotionDetected(active) {
        this.motionService?.updateCharacteristic(Characteristic_1.Characteristic.MotionDetected, active);
    }
    ingestCredentials() {
        return {
            publishingPoint: this.publishingPoint,
            privateKey: this.privateKey?.export({ type: "pkcs8", format: "pem" }).toString(),
            clientCertificate: this.clientCertificate,
            ca: this.ca,
            keys: [...this.keys.entries()].map(([keyNumber, key]) => ({ keyNumber, key })),
            currentKeyNumber: this.currentKeyNumber,
        };
    }
    ingestMediaDescription() {
        const tiers = this.options.video.tiers;
        const top = tiers.reduce((best, tier) => (tier.width * tier.height > best.width * best.height ? tier : best), tiers[0]);
        const codecs = this.options.video.codec === 2 /* StreamTierVideoCodec.H265 */ ? "hvc1.1.6.L120.B0" : "avc1.640028";
        return {
            codecs,
            width: top?.width ?? 1920,
            height: top?.height ?? 1080,
            bitrate: (top?.targetAverageBitrate ?? 1700) * 1000,
        };
    }
    /** Signals whether the CMAF ingest client certificate needs to be (re)issued by the HomeKit HomeHub. */
    setClientCertificateNeedsUpdate(needsUpdate) {
        this.clientCertificateManagementService?.updateCharacteristic(Characteristic_1.Characteristic.CameraClientCertificateStatus, (0, SecureVideoTypes_1.encodeCameraClientCertificateStatus)(needsUpdate).toString("base64"));
    }
    /** Ends the WebRTC streaming session with the given identifier and notifies the delegate. */
    async endWebRTCSession(sessionIdentifier) {
        if (!this.webrtcSessions.delete(sessionIdentifier)) {
            return;
        }
        this.updateWebRTCSessionCount();
        await this.options.webrtc.delegate.handleEndSession(sessionIdentifier);
    }
    constructServices() {
        return this.buildServiceMap({}).serviceMap;
    }
    initWithServices(serviceMap) {
        const result = this.buildServiceMap(serviceMap);
        if (result.updated) {
            return result.serviceMap;
        }
    }
    configureServices() {
        const { sensor, video, audio } = this.options;
        const sensorUUID = (0, SecureVideoTypes_1.encodeSensorUUID)(sensor.uuid).toString("base64");
        const videoTiers = (0, SecureVideoTypes_1.encodeSupportedVideoStreamTiers)({
            codec: video.codec,
            payloadType: video.payloadType ?? 99,
            tiers: video.tiers,
        }).toString("base64");
        const audioTiers = audio
            ? (0, SecureVideoTypes_1.encodeSupportedAudioStreamTiers)({ codec: 3 /* StreamTierAudioCodec.OPUS */, payloadType: audio.payloadType ?? 110, tiers: [audio.tier] }).toString("base64")
            : "";
        const capabilities = this.capabilitiesService;
        capabilities.setCharacteristic(Characteristic_1.Characteristic.Version, SecureVideoTypes_1.CAMERA_CAPABILITIES_VERSION);
        this.registerRead(capabilities.getCharacteristic(Characteristic_1.Characteristic.CameraCapabilitiesConfiguration), () => (0, SecureVideoTypes_1.encodeCameraCapabilities)({
            version: 1,
            sensors: [{
                    width: sensor.width,
                    height: sensor.height,
                    sensorUUID: sensor.uuid,
                    type: sensor.type ?? 1 /* CameraSensorType.PRIMARY */,
                    intent: sensor.intent ?? 1 /* CameraSensorIntent.MAIN */,
                    videoStreams: video.tiers.map(tier => ({
                        identifier: uuid.generate(`${sensor.uuid}:tier:${tier.identifier}`),
                        quality: tier.quality,
                        width: tier.width,
                        height: tier.height,
                        frameRate: tier.frameRate,
                        averageBitrate: tier.targetAverageBitrate,
                        peakBitrate: tier.peakBitrate,
                    })),
                }],
        }).toString("base64"));
        const operatingMode = this.globalOperatingModeService;
        for (const characteristic of [Characteristic_1.Characteristic.HomeKitCameraActive, Characteristic_1.Characteristic.StreamingEnabled, Characteristic_1.Characteristic.CameraOperatingModeIndicator]) {
            operatingMode.getCharacteristic(characteristic).on("change" /* CharacteristicEventTypes.CHANGE */, () => {
                this.updateStatusActive();
                this.emit("operating-mode-changed" /* SecureVideoControllerEvents.OPERATING_MODE_CHANGED */);
                this.stateChangeDelegate?.();
            });
        }
        if (operatingMode.testCharacteristic(Characteristic_1.Characteristic.ManuallyDisabled)) {
            operatingMode.getCharacteristic(Characteristic_1.Characteristic.ManuallyDisabled).on("change" /* CharacteristicEventTypes.CHANGE */, () => this.updateStatusActive());
        }
        const zones = this.motionZonesService;
        zones.setCharacteristic(Characteristic_1.Characteristic.Version, SecureVideoTypes_1.CAMERA_CAPABILITIES_VERSION);
        zones.getCharacteristic(Characteristic_1.Characteristic.Active).on("change" /* CharacteristicEventTypes.CHANGE */, () => {
            this.emit("zones-changed" /* SecureVideoControllerEvents.ZONES_CHANGED */, this.zones, this.motionZones.active);
            this.stateChangeDelegate?.();
        });
        this.registerRead(zones.getCharacteristic(Characteristic_1.Characteristic.CameraZones), () => this.zones ? (0, SecureVideoTypes_1.encodeCameraZones)(this.zones).toString("base64") : "");
        this.handleTLVWrite(zones.getCharacteristic(Characteristic_1.Characteristic.CameraZones), value => {
            this.zones = value.length ? (0, SecureVideoTypes_1.decodeCameraZones)(value) : undefined;
            this.emit("zones-changed" /* SecureVideoControllerEvents.ZONES_CHANGED */, this.zones, this.motionZones.active);
            this.stateChangeDelegate?.();
            return undefined;
        });
        const rtp = this.multiTierStreamManagementService;
        rtp.setCharacteristic(Characteristic_1.Characteristic.SensorUUID, sensorUUID);
        rtp.setCharacteristic(Characteristic_1.Characteristic.SupportedVideoStreamTiers, videoTiers);
        rtp.setCharacteristic(Characteristic_1.Characteristic.SupportedAudioStreamTiers, audioTiers);
        // SRTP_CRYPTO_SUITE: AES_CM_128_HMAC_SHA1_80
        rtp.setCharacteristic(Characteristic_1.Characteristic.SupportedRTPConfiguration, Buffer.from([0x02, 0x01, 0x00]).toString("base64"));
        rtp.getCharacteristic(Characteristic_1.Characteristic.StreamingEnabled).on("change" /* CharacteristicEventTypes.CHANGE */, () => this.updateStatusActive());
        this.handleTLVWrite(rtp.getCharacteristic(Characteristic_1.Characteristic.SetupEndpoints), (value, connection) => this.handleSetupEndpoints(value, connection));
        this.handleTLVWrite(rtp.getCharacteristic(Characteristic_1.Characteristic.RTPStreamingControl), value => this.handleRTPStreamingControl(value));
        const webrtc = this.webrtcStreamManagementService;
        // A HomeKit HomeHub finds one stream management service through the other's linked services when
        // setting up a remote stream; a shared sensor uuid alone does not establish the association.
        webrtc.addLinkedService(rtp);
        rtp.addLinkedService(webrtc);
        webrtc.setCharacteristic(Characteristic_1.Characteristic.SensorUUID, sensorUUID);
        webrtc.setCharacteristic(Characteristic_1.Characteristic.WebRTCSupportedVideoStreamTiers, videoTiers);
        webrtc.setCharacteristic(Characteristic_1.Characteristic.WebRTCSupportedAudioStreamTiers, audioTiers);
        webrtc.setCharacteristic(Characteristic_1.Characteristic.WebRTCNumberOfActiveSessions, 0);
        this.handleTLVWrite(webrtc.getCharacteristic(Characteristic_1.Characteristic.WebRTCSolicitOffer), value => this.handleSolicitOffer(value));
        this.handleTLVWrite(webrtc.getCharacteristic(Characteristic_1.Characteristic.WebRTCProvideAnswer), value => this.handleProvideAnswer(value));
        this.handleTLVWrite(webrtc.getCharacteristic(Characteristic_1.Characteristic.WebRTCReoffer), value => this.handleReoffer(value));
        this.handleTLVWrite(webrtc.getCharacteristic(Characteristic_1.Characteristic.WebRTCUpdateSession), value => this.handleUpdateSession(value));
        this.handleTLVWrite(webrtc.getCharacteristic(Characteristic_1.Characteristic.WebRTCStreamingControl), value => this.handleWebRTCStreamingControl(value));
        const recordingManagement = this.recordingManagement;
        this.dataStreamManagement = recordingManagement.dataStreamManagement;
        const dataStreamService = this.dataStreamManagement.getService();
        // A HomeKit HomeHub locates the stream management services through the recording data stream they link to.
        rtp.addLinkedService(dataStreamService);
        webrtc.addLinkedService(dataStreamService);
        if (this.options.snapshot) {
            // iOS 27 fetches snapshots for the secure video services over HDS instead of the legacy image resource
            this.snapshotTransport = new HDSSnapshotTransport_1.HDSSnapshotTransport(this.dataStreamManagement, this.options.snapshot, () => this.homeKitCameraActive);
        }
        const recording = recordingManagement.recordingManagementService;
        for (const characteristic of [Characteristic_1.Characteristic.Active, Characteristic_1.Characteristic.RecordingAudioActive]) {
            this.onExternalChange(recording.getCharacteristic(characteristic), () => {
                this.options.ingest?.delegate.updateRecordingActive?.(this.recordingActive, this.recordingAudioActive);
                this.stateChangeDelegate?.();
            });
        }
        if (this.options.ingest) {
            this.configureCMAFIngestServices();
        }
        if (!this.motionServiceExternallySupplied && this.motionService) {
            this.motionService.setCharacteristic(Characteristic_1.Characteristic.StatusActive, true);
        }
        if (this.motionService) {
            recording.addLinkedService(this.motionService);
            recordingManagement.sensorServices.push(this.motionService);
            this.onExternalChange(this.motionService.getCharacteristic(Characteristic_1.Characteristic.MotionEnabled), () => this.stateChangeDelegate?.());
            this.onExternalChange(this.motionService.getCharacteristic(Characteristic_1.Characteristic.MotionDetected), change => {
                if (change.oldValue === change.newValue) {
                    return;
                }
                const active = !!change.newValue;
                this.motionService.updateCharacteristic(Characteristic_1.Characteristic.ContributingSensors, (0, SecureVideoTypes_1.encodeContributingSensors)(active ? [this.options.sensor.uuid] : []).toString("base64"));
                this.pushEvent({ type: 3 /* CameraBufferEventType.MOTION */, active });
            });
        }
        this.updateStatusActive();
    }
    onExternalChange(characteristic, listener) {
        characteristic.on("change" /* CharacteristicEventTypes.CHANGE */, listener);
        this.externalCleanups.push(() => characteristic.removeListener("change" /* CharacteristicEventTypes.CHANGE */, listener));
    }
    configureCMAFIngestServices() {
        this.cmafIngest = new CMAFIngest_1.CMAFIngest(this.options.ingest.delegate, {
            sensorUUID: this.options.sensor.uuid,
            media: this.ingestMediaDescription(),
            credentials: () => this.ingestCredentials(),
            reportSessionStart: cmafSessionId => this.pushEvent({ type: 1 /* CameraBufferEventType.CMAF_SESSION_START */, cmafSessionId }),
            reportSessionStop: (cmafSessionId, detail) => {
                this.pushEvent({ type: 2 /* CameraBufferEventType.CMAF_SESSION_STOP */, cmafSessionId });
                this.options.ingest?.delegate.handleUploadResult?.(cmafSessionId, undefined, detail);
            },
            reportError: (cmafSessionId, error, detail) => {
                this.pushEvent({ type: 4 /* CameraBufferEventType.CMAF_ERROR */, cmafSessionId, error });
                this.options.ingest?.delegate.handleUploadResult?.(cmafSessionId, error, detail);
            },
        });
        const buffer = this.bufferManagementService;
        buffer.setCharacteristic(Characteristic_1.Characteristic.BufferEventSequenceNumber, Number(this.eventSequenceNumber & 0xffffffffn));
        this.handleTLVWrite(buffer.getCharacteristic(Characteristic_1.Characteristic.BufferUploadCommand), value => this.handleBufferUpload(value));
        this.handleTLVWrite(buffer.getCharacteristic(Characteristic_1.Characteristic.BufferActivityCommand), value => {
            const request = (0, SecureVideoTypes_1.decodeBufferActivityCommand)(value);
            debug("buffer activity %o", request);
            this.options.ingest?.delegate.handleBufferActivity?.(request);
            return undefined;
        });
        this.handleTLVWrite(buffer.getCharacteristic(Characteristic_1.Characteristic.BufferEventCommand), value => this.handleBufferEventCommand(value));
        this.registerRead(buffer.getCharacteristic(Characteristic_1.Characteristic.CameraRecordingPublishingPoint), () => this.publishingPoint ? (0, SecureVideoTypes_1.encodeCameraRecordingPublishingPoint)(this.publishingPoint).toString("base64") : "");
        this.handleTLVWrite(buffer.getCharacteristic(Characteristic_1.Characteristic.CameraRecordingPublishingPoint), value => {
            this.publishingPoint = value.length ? (0, SecureVideoTypes_1.decodeCameraRecordingPublishingPoint)(value) : undefined;
            this.options.ingest?.delegate.updatePublishingPoint?.(this.publishingPoint);
            this.stateChangeDelegate?.();
            return undefined;
        });
        const keys = this.keyManagementService;
        this.registerRead(keys.getCharacteristic(Characteristic_1.Characteristic.CameraKeyID), () => this.currentKeyNumber !== undefined ? (0, SecureVideoTypes_1.encodeCameraKeyID)(this.currentKeyNumber).toString("base64") : "");
        this.handleTLVWrite(keys.getCharacteristic(Characteristic_1.Characteristic.CameraKey), value => {
            if (!value.length) {
                this.keys.clear();
                this.currentKeyNumber = undefined;
                this.stateChangeDelegate?.();
                return undefined;
            }
            const { key, keyNumber } = (0, SecureVideoTypes_1.decodeCameraKey)(value);
            this.keys.set(keyNumber, key);
            this.currentKeyNumber = keyNumber;
            keys.getCharacteristic(Characteristic_1.Characteristic.CameraKeyID).sendEventNotification((0, SecureVideoTypes_1.encodeCameraKeyID)(keyNumber).toString("base64"));
            this.stateChangeDelegate?.();
            return undefined;
        });
        const certificates = this.clientCertificateManagementService;
        certificates.setCharacteristic(Characteristic_1.Characteristic.CameraClientCertificateStatus, (0, SecureVideoTypes_1.encodeCameraClientCertificateStatus)(!this.clientCertificate).toString("base64"));
        this.handleTLVWrite(certificates.getCharacteristic(Characteristic_1.Characteristic.CameraClientCSR), value => {
            const nonce = (0, SecureVideoTypes_1.decodeCameraClientCSRRequest)(value);
            this.privateKey ??= (0, SecureVideoCredentials_1.generateClientKey)();
            const commonName = this.options.ingest?.certificateCommonName ?? this.options.sensor.uuid;
            const { csr, nonceSignature } = (0, SecureVideoCredentials_1.createClientCSR)(this.privateKey, commonName, nonce);
            this.stateChangeDelegate?.();
            return (0, SecureVideoTypes_1.encodeCameraClientCSRResponse)(csr, nonceSignature);
        });
        this.registerRead(certificates.getCharacteristic(Characteristic_1.Characteristic.CameraClientCertificate), () => this.clientCertificate
            ? (0, SecureVideoTypes_1.encodeCameraClientCertificate)({ clientCertificate: this.clientCertificate, ca: this.ca }).toString("base64")
            : "");
        this.handleTLVWrite(certificates.getCharacteristic(Characteristic_1.Characteristic.CameraClientCertificate), value => {
            const { clientCertificate, ca } = value.length ? (0, SecureVideoTypes_1.decodeCameraClientCertificate)(value) : { clientCertificate: undefined, ca: undefined };
            this.clientCertificate = clientCertificate;
            this.ca = ca;
            this.setClientCertificateNeedsUpdate(!clientCertificate);
            this.options.ingest?.delegate.updateClientCertificate?.(!!clientCertificate);
            this.stateChangeDelegate?.();
            return undefined;
        });
    }
    /**
     * @private
     */
    handleSnapshotRequest(height, width, accessoryName, reason) {
        const snapshot = this.options.snapshot;
        if (!snapshot) {
            return Promise.reject(-70409 /* HAPStatus.RESOURCE_DOES_NOT_EXIST */);
        }
        const operatingMode = this.recordingManagement?.operatingModeService;
        if (!this.homeKitCameraActive || !operatingMode?.getCharacteristic(Characteristic_1.Characteristic.HomeKitCameraActive).value) {
            debug("[%s] rejecting snapshot as the HomeKit camera is disabled", accessoryName);
            return Promise.reject(-70412 /* HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE */);
        }
        if (!operatingMode.getCharacteristic(Characteristic_1.Characteristic.EventSnapshotsActive).value) {
            if (reason == null) {
                return Promise.reject(-70401 /* HAPStatus.INSUFFICIENT_PRIVILEGES */);
            }
            else if (reason === 1 /* ResourceRequestReason.EVENT */) {
                debug("[%s] rejecting snapshot as event snapshots are disabled", accessoryName);
                return Promise.reject(-70412 /* HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE */);
            }
        }
        if (!operatingMode.getCharacteristic(Characteristic_1.Characteristic.PeriodicSnapshotsActive).value) {
            if (reason == null) {
                return Promise.reject(-70401 /* HAPStatus.INSUFFICIENT_PRIVILEGES */);
            }
            else if (reason === 0 /* ResourceRequestReason.PERIODIC */) {
                debug("[%s] rejecting snapshot as periodic snapshots are disabled", accessoryName);
                return Promise.reject(-70412 /* HAPStatus.NOT_ALLOWED_IN_CURRENT_STATE */);
            }
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                debug("[%s] the snapshot handler did not respond within %dms", accessoryName, SNAPSHOT_TIMEOUT_MS);
                reject(-70408 /* HAPStatus.OPERATION_TIMED_OUT */);
            }, SNAPSHOT_TIMEOUT_MS);
            timeout.unref();
            snapshot({ height, width, reason }).then(buffer => {
                clearTimeout(timeout);
                resolve(buffer);
            }, error => {
                clearTimeout(timeout);
                debug("[%s] error getting snapshot: %s", accessoryName, error instanceof Error ? error.message : error);
                reject(-70402 /* HAPStatus.SERVICE_COMMUNICATION_FAILURE */);
            });
        });
    }
    handleControllerRemoved() {
        this.handleFactoryReset();
        this.snapshotTransport?.destroy();
        this.snapshotTransport = undefined;
        this.cmafIngest?.destroy();
        this.cmafIngest = undefined;
        this.recordingManagement?.destroy();
        this.recordingManagement = undefined;
        for (const cleanup of this.externalCleanups) {
            cleanup();
        }
        this.externalCleanups.length = 0;
        this.removeAllListeners();
    }
    handleFactoryReset() {
        for (const sessionIdentifier of [...this.webrtcSessions.keys()]) {
            this.endWebRTCSession(sessionIdentifier).catch(error => debug("failed to end session %s: %s", sessionIdentifier, error));
        }
        this.recordingManagement?.handleFactoryReset();
        this.events = [];
        this.eventSequenceNumber = 0n;
        this.zones = undefined;
        this.publishingPoint = undefined;
        this.privateKey = undefined;
        this.clientCertificate = undefined;
        this.ca = undefined;
        this.keys.clear();
        this.currentKeyNumber = undefined;
        this.lastResponses.clear();
    }
    serialize() {
        const operatingMode = this.globalOperatingModeService;
        return {
            homeKitCameraActive: Number(operatingMode?.getCharacteristic(Characteristic_1.Characteristic.HomeKitCameraActive).value ?? 1),
            operatingModeIndicator: Number(operatingMode?.getCharacteristic(Characteristic_1.Characteristic.CameraOperatingModeIndicator).value ?? 1),
            globalStreamingEnabled: !!operatingMode?.getCharacteristic(Characteristic_1.Characteristic.StreamingEnabled).value,
            webrtcStreamingEnabled: !!this.webrtcStreamManagementService?.getCharacteristic(Characteristic_1.Characteristic.StreamingEnabled).value,
            rtpStreamingEnabled: !!this.multiTierStreamManagementService?.getCharacteristic(Characteristic_1.Characteristic.StreamingEnabled).value,
            motionEnabled: !!this.motionService?.getCharacteristic(Characteristic_1.Characteristic.MotionEnabled).value,
            motionZonesActive: Number(this.motionZonesService?.getCharacteristic(Characteristic_1.Characteristic.Active).value ?? 0),
            zones: this.zones ? (0, SecureVideoTypes_1.encodeCameraZones)(this.zones).toString("base64") : undefined,
            recordingManagement: this.recordingManagement?.serialize(),
            publishingPoint: this.publishingPoint ? (0, SecureVideoTypes_1.encodeCameraRecordingPublishingPoint)(this.publishingPoint).toString("base64") : undefined,
            privateKey: this.privateKey?.export({ type: "pkcs8", format: "pem" }).toString(),
            clientCertificate: this.clientCertificate?.toString("base64"),
            ca: this.ca?.toString("base64"),
            keys: [...this.keys.entries()].map(([keyNumber, key]) => ({ keyNumber: keyNumber.toString(), key: key.toString("base64") })),
            currentKeyNumber: this.currentKeyNumber?.toString(),
            eventSequenceNumber: this.eventSequenceNumber.toString(),
        };
    }
    deserialize(serialized) {
        const operatingMode = this.globalOperatingModeService;
        operatingMode?.updateCharacteristic(Characteristic_1.Characteristic.HomeKitCameraActive, serialized.homeKitCameraActive);
        operatingMode?.updateCharacteristic(Characteristic_1.Characteristic.CameraOperatingModeIndicator, serialized.operatingModeIndicator);
        operatingMode?.updateCharacteristic(Characteristic_1.Characteristic.StreamingEnabled, serialized.globalStreamingEnabled);
        this.webrtcStreamManagementService?.updateCharacteristic(Characteristic_1.Characteristic.StreamingEnabled, serialized.webrtcStreamingEnabled);
        this.multiTierStreamManagementService?.updateCharacteristic(Characteristic_1.Characteristic.StreamingEnabled, serialized.rtpStreamingEnabled);
        this.motionService?.updateCharacteristic(Characteristic_1.Characteristic.MotionEnabled, serialized.motionEnabled);
        this.motionZonesService?.updateCharacteristic(Characteristic_1.Characteristic.Active, serialized.motionZonesActive);
        if (serialized.recordingManagement) {
            this.recordingManagement?.deserialize(serialized.recordingManagement);
        }
        this.zones = serialized.zones ? (0, SecureVideoTypes_1.decodeCameraZones)(Buffer.from(serialized.zones, "base64")) : undefined;
        this.publishingPoint = serialized.publishingPoint
            ? (0, SecureVideoTypes_1.decodeCameraRecordingPublishingPoint)(Buffer.from(serialized.publishingPoint, "base64"))
            : undefined;
        this.privateKey = serialized.privateKey ? crypto_1.default.createPrivateKey(serialized.privateKey) : undefined;
        this.clientCertificate = serialized.clientCertificate ? Buffer.from(serialized.clientCertificate, "base64") : undefined;
        this.ca = serialized.ca ? Buffer.from(serialized.ca, "base64") : undefined;
        this.keys.clear();
        for (const { keyNumber, key } of serialized.keys ?? []) {
            this.keys.set(BigInt(keyNumber), Buffer.from(key, "base64"));
        }
        this.currentKeyNumber = serialized.currentKeyNumber !== undefined ? BigInt(serialized.currentKeyNumber) : undefined;
        this.eventSequenceNumber = BigInt(serialized.eventSequenceNumber ?? "0");
        this.bufferManagementService?.updateCharacteristic(Characteristic_1.Characteristic.BufferEventSequenceNumber, Number(this.eventSequenceNumber & 0xffffffffn));
        this.setClientCertificateNeedsUpdate(!this.clientCertificate);
        this.updateStatusActive();
    }
    setupStateChangeDelegate(delegate) {
        this.stateChangeDelegate = delegate;
        this.recordingManagement?.setupStateChangeDelegate(delegate);
    }
    buildServiceMap(existing) {
        const serviceMap = { ...existing };
        let updated = false;
        function ensure(key, create) {
            if (!serviceMap[key]) {
                serviceMap[key] = create();
                updated = true;
            }
            return serviceMap[key];
        }
        this.capabilitiesService = ensure("capabilities", () => new Service_1.Service.CameraCapabilities("", ""));
        this.globalOperatingModeService = ensure("globalOperatingMode", () => {
            const service = new Service_1.Service.CameraGlobalOperatingMode("", "");
            service.setCharacteristic(Characteristic_1.Characteristic.HomeKitCameraActive, Characteristic_1.Characteristic.HomeKitCameraActive.ON);
            service.setCharacteristic(Characteristic_1.Characteristic.StreamingEnabled, true);
            service.setCharacteristic(Characteristic_1.Characteristic.CameraOperatingModeIndicator, Characteristic_1.Characteristic.CameraOperatingModeIndicator.ENABLE);
            service.setCharacteristic(Characteristic_1.Characteristic.ThirdPartyCameraActive, Characteristic_1.Characteristic.ThirdPartyCameraActive.ON);
            return service;
        });
        this.motionZonesService = ensure("motionZones", () => new Service_1.Service.CameraMotionZones("", ""));
        this.multiTierStreamManagementService = ensure("multiTierStreamManagement", () => {
            const service = new Service_1.Service.CameraMultiTierRTPStreamManagement("", "");
            service.setCharacteristic(Characteristic_1.Characteristic.StreamingEnabled, true);
            return service;
        });
        this.webrtcStreamManagementService = ensure("webrtcStreamManagement", () => {
            const service = new Service_1.Service.CameraWebRTCStreamManagement("", "");
            service.setCharacteristic(Characteristic_1.Characteristic.StreamingEnabled, true);
            return service;
        });
        const { recording } = this.options;
        const eventTriggers = new Set([1 /* EventTriggerOption.MOTION */, ...(recording.options.overrideEventTriggerOptions ?? [])]);
        if (serviceMap.recordingManagement && serviceMap.cameraOperatingMode && serviceMap.dataStreamTransportManagement) {
            this.recordingManagement = new RecordingManagement_1.RecordingManagement(recording.options, recording.delegate, eventTriggers, {
                recordingManagement: serviceMap.recordingManagement,
                operatingMode: serviceMap.cameraOperatingMode,
                dataStreamManagement: new datastream_1.DataStreamManagement(serviceMap.dataStreamTransportManagement),
            });
        }
        else {
            this.recordingManagement = new RecordingManagement_1.RecordingManagement(recording.options, recording.delegate, eventTriggers);
            serviceMap.recordingManagement = this.recordingManagement.recordingManagementService;
            serviceMap.cameraOperatingMode = this.recordingManagement.operatingModeService;
            serviceMap.dataStreamTransportManagement = this.recordingManagement.dataStreamManagement.getService();
            updated = true;
        }
        const recordingService = this.recordingManagement.recordingManagementService;
        if (!recordingService.testCharacteristic(Characteristic_1.Characteristic.RecordingAudioActive)) {
            recordingService.addCharacteristic(Characteristic_1.Characteristic.RecordingAudioActive);
        }
        // the buffer, key and certificate management services signal a CMAF accessory-direct-upload camera to the
        // HomeKit HomeHub. They are only added when an ingest delegate is supplied; without them the hub records
        // over the classic HDS bulk-send path.
        if (this.options.ingest) {
            this.bufferManagementService = ensure("bufferManagement", () => new Service_1.Service.CameraBufferManagement("", ""));
            this.keyManagementService = ensure("keyManagement", () => new Service_1.Service.CameraKeyManagement("", ""));
            this.clientCertificateManagementService = ensure("clientCertificateManagement", () => new Service_1.Service.CameraClientCertificateManagement("", ""));
        }
        else {
            for (const key of ["bufferManagement", "keyManagement", "clientCertificateManagement"]) {
                if (serviceMap[key]) {
                    delete serviceMap[key];
                    updated = true;
                }
            }
        }
        if (this.options.audio) {
            this.microphoneService = ensure("microphone", () => {
                const service = new Service_1.Service.Microphone("", "");
                service.setCharacteristic(Characteristic_1.Characteristic.Volume, 100);
                return service;
            });
        }
        else if (serviceMap.microphone) {
            delete serviceMap.microphone;
            updated = true;
        }
        if (this.options.audio?.twoWayAudio) {
            this.speakerService = ensure("speaker", () => {
                const service = new Service_1.Service.Speaker("", "");
                service.setCharacteristic(Characteristic_1.Characteristic.Volume, 100);
                return service;
            });
        }
        else if (serviceMap.speaker) {
            delete serviceMap.speaker;
            updated = true;
        }
        if (this.options.motionService) {
            this.motionService = this.options.motionService;
            this.motionServiceExternallySupplied = true;
            if (serviceMap.motionSensor) {
                delete serviceMap.motionSensor;
                updated = true;
            }
        }
        else {
            this.motionService = ensure("motionSensor", () => new Service_1.Service.MotionSensor("", ""));
        }
        for (const characteristic of [Characteristic_1.Characteristic.ContributingSensors, Characteristic_1.Characteristic.MotionEnabled]) {
            if (!this.motionService.testCharacteristic(characteristic)) {
                this.motionService.addCharacteristic(characteristic);
            }
        }
        if (!serviceMap.motionSensor || this.motionServiceExternallySupplied) {
            this.motionService.setCharacteristic(Characteristic_1.Characteristic.MotionEnabled, true);
        }
        return { serviceMap, updated };
    }
    updateStatusActive() {
        const rtp = this.multiTierStreamManagementService;
        rtp?.updateCharacteristic(Characteristic_1.Characteristic.StatusActive, this.streamingAllowed(rtp));
    }
    updateWebRTCSessionCount() {
        this.webrtcStreamManagementService?.updateCharacteristic(Characteristic_1.Characteristic.WebRTCNumberOfActiveSessions, Math.min(255, this.webrtcSessions.size));
    }
    pushEvent(event) {
        this.eventSequenceNumber += 1n;
        const queued = { ...event, sequenceNumber: this.eventSequenceNumber };
        this.events.push(queued);
        if (this.events.length > MAX_QUEUED_EVENTS) {
            this.events.splice(0, this.events.length - MAX_QUEUED_EVENTS);
        }
        debug("queued buffer event %o", queued);
        this.bufferManagementService?.updateCharacteristic(Characteristic_1.Characteristic.BufferEventSequenceNumber, Number(this.eventSequenceNumber & 0xffffffffn));
        this.stateChangeDelegate?.();
    }
    handleBufferEventCommand(value) {
        const request = (0, SecureVideoTypes_1.decodeBufferEventCommand)(value);
        debug("buffer event command %o", request);
        if (request.command === 2 /* BufferEventCommandType.ACKNOWLEDGE */) {
            const acknowledged = request.sequenceNumber ?? this.eventSequenceNumber;
            this.events = this.events.filter(event => event.sequenceNumber > acknowledged);
            return (0, SecureVideoTypes_1.encodeBufferEventCommandResponse)([]);
        }
        const from = request.sequenceNumber ?? 0n;
        const limit = request.limit && request.limit > 0n ? Number(request.limit) : this.events.length;
        return (0, SecureVideoTypes_1.encodeBufferEventCommandResponse)(this.events.filter(event => event.sequenceNumber >= from).slice(0, limit));
    }
    handleBufferUpload(value) {
        const request = (0, SecureVideoTypes_1.decodeBufferUploadCommand)(value);
        debug("buffer upload command %o", request);
        if (!this.cmafIngest) {
            throw new hapStatusError_1.HapStatusError(-70409 /* HAPStatus.RESOURCE_DOES_NOT_EXIST */);
        }
        return (0, SecureVideoTypes_1.encodeBufferUploadCommandResponse)(this.cmafIngest.handleUploadCommand(request));
    }
    async handleSetupEndpoints(value, connection) {
        const request = (0, SecureVideoTypes_1.decodeRTPSetupEndpoints)(value);
        debug("setup endpoints %o", request);
        const delegate = this.options.rtp.delegate;
        if (!connection) {
            return (0, SecureVideoTypes_1.encodeRTPSetupEndpointsResponse)(setupEndpointsError(request.sessionIdentifier));
        }
        const version = request.controllerAddress.version;
        const sourceAddress = connection.getLocalAddress(version);
        try {
            const response = await delegate.prepareStream({
                sessionIdentifier: request.sessionIdentifier,
                addressVersion: version,
                targetAddress: request.controllerAddress.address,
                sourceAddress,
                controllerVideoPort: request.controllerAddress.videoRTPPort,
                controllerAudioPort: request.controllerAddress.audioRTPPort,
                video: request.video,
                audio: request.audio,
            });
            return (0, SecureVideoTypes_1.encodeRTPSetupEndpointsResponse)({
                sessionIdentifier: request.sessionIdentifier,
                status: 0,
                accessoryAddress: {
                    version,
                    address: response.addressOverride ?? sourceAddress,
                    videoRTPPort: response.videoPort,
                    audioRTPPort: response.audioPort,
                },
                video: response.video,
                audio: response.audio,
                videoSSRC: response.videoSSRC,
                audioSSRC: response.audioSSRC,
            });
        }
        catch (error) {
            debug("setup endpoints failed: %s", error);
            return (0, SecureVideoTypes_1.encodeRTPSetupEndpointsResponse)(setupEndpointsError(request.sessionIdentifier));
        }
    }
    async handleRTPStreamingControl(value) {
        const request = (0, SecureVideoTypes_1.decodeRTPStreamingControl)(value);
        debug("rtp streaming control %o", request);
        const delegate = this.options.rtp.delegate;
        try {
            if (request.command === 2 /* RTPStreamingCommand.START */) {
                if (!this.streamingAllowed(this.multiTierStreamManagementService)) {
                    return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 4 /* RTPStreamingStatus.ERROR */);
                }
                await delegate.startStream({
                    sessionIdentifier: request.sessionIdentifier,
                    videoTier: request.videoTier ?? 0,
                    videoSSRC: request.videoSSRC ?? 0,
                    audioTier: request.audioTier,
                    audioSSRC: request.audioSSRC,
                });
            }
            else {
                await delegate.stopStream(request.sessionIdentifier);
            }
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 0 /* RTPStreamingStatus.SUCCESS */);
        }
        catch (error) {
            debug("rtp streaming control failed: %s", error);
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 4 /* RTPStreamingStatus.ERROR */);
        }
    }
    async handleSolicitOffer(value) {
        const options = (0, SecureVideoTypes_1.decodeWebRTCSolicitOffer)(value);
        const delegate = this.options.webrtc.delegate;
        if (!this.streamingAllowed(this.webrtcStreamManagementService)) {
            const status = !this.homeKitCameraActive ? 1 /* WebRTCSolicitOfferStatus.PRIVACY_MODE_ACTIVE */ : 2 /* WebRTCSolicitOfferStatus.ERROR */;
            return (0, SecureVideoTypes_1.encodeWebRTCSolicitOfferResponse)({ status });
        }
        if (this.webrtcSessions.size >= (this.options.webrtc.maxSessions ?? DEFAULT_MAX_WEBRTC_SESSIONS)) {
            return (0, SecureVideoTypes_1.encodeWebRTCSolicitOfferResponse)({ status: 2 /* WebRTCSolicitOfferStatus.ERROR */ });
        }
        const sessionIdentifier = uuid.unparse(crypto_1.default.randomBytes(16));
        this.webrtcSessions.set(sessionIdentifier, { sessionIdentifier, answered: false });
        this.updateWebRTCSessionCount();
        try {
            const offer = await delegate.handleSolicitOffer({ sessionIdentifier, options });
            return (0, SecureVideoTypes_1.encodeWebRTCSolicitOfferResponse)({
                sessionIdentifier,
                sdpOffer: offer.sdpOffer,
                candidates: offer.candidates,
                status: 0 /* WebRTCSolicitOfferStatus.SUCCESS */,
                sframe: offer.sframe,
            });
        }
        catch (error) {
            debug("solicit offer failed: %s", error);
            this.webrtcSessions.delete(sessionIdentifier);
            this.updateWebRTCSessionCount();
            return (0, SecureVideoTypes_1.encodeWebRTCSolicitOfferResponse)({ status: 2 /* WebRTCSolicitOfferStatus.ERROR */ });
        }
    }
    async handleProvideAnswer(value) {
        const request = (0, SecureVideoTypes_1.decodeWebRTCProvideAnswer)(value);
        const session = this.webrtcSessions.get(request.sessionIdentifier);
        if (!session) {
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 1 /* WebRTCStreamingStatus.UNKNOWN_SESSION_IDENTIFIER */);
        }
        try {
            await this.options.webrtc.delegate.handleProvideAnswer(request);
            session.answered = true;
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 0 /* WebRTCStreamingStatus.SUCCESS */);
        }
        catch (error) {
            debug("provide answer failed: %s", error);
            await this.endWebRTCSession(request.sessionIdentifier).catch(() => undefined);
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 3 /* WebRTCStreamingStatus.ERROR */);
        }
    }
    async handleReoffer(value) {
        const request = (0, SecureVideoTypes_1.decodeWebRTCReoffer)(value);
        if (!this.webrtcSessions.has(request.sessionIdentifier)) {
            return (0, SecureVideoTypes_1.encodeWebRTCReofferResponse)({ sessionIdentifier: request.sessionIdentifier, status: 1 /* WebRTCStreamingStatus.UNKNOWN_SESSION_IDENTIFIER */ });
        }
        try {
            const answer = await this.options.webrtc.delegate.handleReoffer(request);
            return (0, SecureVideoTypes_1.encodeWebRTCReofferResponse)({
                sessionIdentifier: request.sessionIdentifier,
                sdpAnswer: answer.sdpAnswer,
                status: 0 /* WebRTCStreamingStatus.SUCCESS */,
                sframe: answer.sframe,
            });
        }
        catch (error) {
            debug("reoffer failed: %s", error);
            return (0, SecureVideoTypes_1.encodeWebRTCReofferResponse)({ sessionIdentifier: request.sessionIdentifier, status: 3 /* WebRTCStreamingStatus.ERROR */ });
        }
    }
    async handleUpdateSession(value) {
        const request = (0, SecureVideoTypes_1.decodeWebRTCUpdateSession)(value);
        if (!this.webrtcSessions.has(request.sessionIdentifier)) {
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 1 /* WebRTCStreamingStatus.UNKNOWN_SESSION_IDENTIFIER */);
        }
        try {
            await this.options.webrtc.delegate.handleUpdateSession(request);
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 0 /* WebRTCStreamingStatus.SUCCESS */);
        }
        catch (error) {
            debug("update session failed: %s", error);
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 3 /* WebRTCStreamingStatus.ERROR */);
        }
    }
    async handleWebRTCStreamingControl(value) {
        const request = (0, SecureVideoTypes_1.decodeWebRTCStreamingControl)(value);
        if (!this.webrtcSessions.has(request.sessionIdentifier)) {
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 1 /* WebRTCStreamingStatus.UNKNOWN_SESSION_IDENTIFIER */);
        }
        try {
            await this.endWebRTCSession(request.sessionIdentifier);
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 0 /* WebRTCStreamingStatus.SUCCESS */);
        }
        catch (error) {
            debug("end session failed: %s", error);
            return (0, SecureVideoTypes_1.encodeSessionStatus)(request.sessionIdentifier, 3 /* WebRTCStreamingStatus.ERROR */);
        }
    }
    registerRead(characteristic, read) {
        this.readHandlers.add(characteristic.UUID);
        characteristic.onGet(() => this.lastResponses.get(characteristic.UUID) ?? read());
    }
    handleTLVWrite(characteristic, handler) {
        const name = characteristic.displayName;
        if (!this.readHandlers.has(characteristic.UUID)) {
            characteristic.onGet(() => this.lastResponses.get(characteristic.UUID) ?? "");
        }
        characteristic.onSet(async (value, _context, connection) => {
            let response;
            try {
                response = await handler(Buffer.from(String(value), "base64"), connection);
            }
            catch (error) {
                if (error instanceof hapStatusError_1.HapStatusError) {
                    throw error;
                }
                debug("%s write failed: %s", name, error);
                throw new hapStatusError_1.HapStatusError(-70410 /* HAPStatus.INVALID_VALUE_IN_REQUEST */);
            }
            if (response === undefined) {
                return;
            }
            const encoded = response.toString("base64");
            this.lastResponses.set(characteristic.UUID, encoded);
            // Setup Endpoints has no write-response permission, the controller reads the result back instead
            if (!characteristic.props.perms.includes("wr" /* Perms.WRITE_RESPONSE */)) {
                return;
            }
            return encoded;
        });
    }
}
exports.SecureVideoController = SecureVideoController;
//# sourceMappingURL=SecureVideoController.js.map
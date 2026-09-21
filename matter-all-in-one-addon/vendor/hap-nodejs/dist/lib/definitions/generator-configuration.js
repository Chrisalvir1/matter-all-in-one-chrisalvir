"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceSinceInformation = exports.CharacteristicSinceInformation = exports.ServiceManualAdditions = exports.ServiceCharacteristicConfigurationOverrides = exports.ServiceDeprecatedNames = exports.ServiceNameOverrides = exports.CharacteristicManualAdditions = exports.CharacteristicOverriding = exports.CharacteristicClassAdditions = exports.CharacteristicValidValuesOverride = exports.CharacteristicDeprecatedNames = exports.CharacteristicNameOverrides = exports.CharacteristicHidden = void 0;
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
var PropertyId;
(function (PropertyId) {
    PropertyId[PropertyId["NOTIFY"] = 1] = "NOTIFY";
    PropertyId[PropertyId["READ"] = 2] = "READ";
    PropertyId[PropertyId["WRITE"] = 4] = "WRITE";
    PropertyId[PropertyId["BROADCAST"] = 8] = "BROADCAST";
    PropertyId[PropertyId["ADDITIONAL_AUTHORIZATION"] = 16] = "ADDITIONAL_AUTHORIZATION";
    PropertyId[PropertyId["TIMED_WRITE"] = 32] = "TIMED_WRITE";
    PropertyId[PropertyId["HIDDEN"] = 64] = "HIDDEN";
    PropertyId[PropertyId["WRITE_RESPONSE"] = 128] = "WRITE_RESPONSE";
})(PropertyId || (PropertyId = {}));
exports.CharacteristicHidden = new Set([
    "service-signature", // BLE
]);
exports.CharacteristicNameOverrides = new Map([
    ["air-quality", "Air Quality"],
    ["app-matching-identifier", "App Matching Identifier"],
    ["density.voc", "VOC Density"],
    ["filter.reset-indication", "Reset Filter Indication"], // Filter Reset Change Indication
    ["light-level.current", "Current Ambient Light Level"],
    ["network-client-control", "Network Client Profile Control"],
    ["on", "On"],
    ["selected-stream-configuration", "Selected RTP Stream Configuration"],
    ["service-label-index", "Service Label Index"],
    ["service-label-namespace", "Service Label Namespace"],
    ["setup-stream-endpoint", "Setup Endpoints"],
    ["snr", "Signal To Noise Ratio"],
    ["supported-target-configuration", "Target Control Supported Configuration"],
    ["target-list", "Target Control List"],
    ["water-level", "Water Level"],
]);
// keep in mind that the displayName will change
exports.CharacteristicDeprecatedNames = new Map([]);
exports.CharacteristicValidValuesOverride = new Map([
    ["camera-operating-mode-indicator", { "0": "Disable", "1": "Enable" }],
    ["closed-captions", { "0": "Disabled", "1": "Enabled" }],
    ["event-snapshots-active", { "0": "Disable", "1": "Enable" }],
    ["homekit-camera-active", { "0": "Off", "1": "On" }],
    ["input-device-type", { "0": "Other", "1": "TV", "2": "Recording", "3": "Tuner", "4": "Playback", "5": "Audio System" }],
    ["input-source-type", { "0": "Other", "1": "Home Screen", "2": "Tuner", "3": "HDMI", "4": "Composite Video", "5": "S Video",
            "6": "Component Video", "7": "DVI", "8": "AirPlay", "9": "USB", "10": "Application" }],
    ["managed-network-enable", { "0": "Disabled", "1": "Enabled" }],
    ["manually-disabled", { "0": "Enabled", "1": "Disabled" }],
    ["media-state.current", { "0": "Play", "1": "Pause", "2": "Stop", "4": "LOADING", "5": "Interrupted" }],
    ["media-state.target", { "0": "Play", "1": "Pause", "2": "Stop" }],
    ["periodic-snapshots-active", { "0": "Disable", "1": "Enable" }],
    ["picture-mode", { "0": "Other", "1": "Standard", "2": "Calibrated", "3": "Calibrated Dark", "4": "Vivid", "5": "Game", "6": "Computer", "7": "Custom" }],
    ["power-mode-selection", { "0": "Show", "1": "Hide" }],
    ["recording-audio-active", { "0": "Disable", "1": "Enable" }],
    ["remote-key", { "0": "Rewind", "1": "Fast Forward", "2": "Next Track", "3": "Previous Track", "4": "Arrow Up", "5": "Arrow Down",
            "6": "Arrow Left", "7": "Arrow Right", "8": "Select", "9": "Back", "10": "Exit", "11": "Play Pause", "15": "Information" }],
    ["router-status", { "0": "Ready", "1": "Not Ready" }],
    ["security-system.alarm-type", { "0": "No Alarm", "1": "Unknown" }],
    ["siri-input-type", { "0": "Push Button Triggered Apple TV" }],
    ["sleep-discovery-mode", { "0": "Not Discoverable", "1": "Always Discoverable" }],
    ["third-party-camera-active", { "0": "Off", "1": "On" }],
    ["visibility-state.current", { "0": "Shown", "1": "Hidden" }],
    ["visibility-state.target", { "0": "Shown", "1": "Hidden" }],
    ["volume-control-type", { "0": "None", "1": "Relative", "2": "Relative With Current", "3": "Absolute" }],
    ["volume-selector", { "0": "Increment", "1": "Decrement" }],
    ["wifi-satellite-status", { "0": "Unknown", "1": "Connected", "2": "Not Connected" }],
]);
exports.CharacteristicClassAdditions = new Map([]);
exports.CharacteristicOverriding = new Map([
    ["rotation.speed", generated => {
            generated.units = "percentage";
        }],
    ["temperature.current", generated => {
            generated.minValue = -270;
        }],
    ["characteristic-value-transition-control", generated => {
            generated.properties |= 128 /* PropertyId.WRITE_RESPONSE */;
        }],
    ["setup-data-stream-transport", generated => {
            generated.properties |= 128 /* PropertyId.WRITE_RESPONSE */;
        }],
    ["data-stream-hap-transport", generated => {
            generated.properties |= 128 /* PropertyId.WRITE_RESPONSE */;
        }],
    ["lock-mechanism.last-known-action", generated => {
            (0, assert_1.default)(generated.maxValue === 8, "LockLastKnownAction seems to have changed in metadata!");
            generated.maxValue = 10;
            generated.validValues["9"] = "SECURED_PHYSICALLY";
            generated.validValues["10"] = "UNSECURED_PHYSICALLY";
        }],
    ["configured-name", generated => {
            // the write permission on the configured name characteristic is actually optional and should only be supported
            // if a HomeKit controller should be able to change the name (e.g. for a TV Input).
            // As of legacy compatibility we just add that permission and tackle that problem later in a TVController (or something).
            generated.properties |= 4 /* PropertyId.WRITE */;
        }],
    ["is-configured", generated => {
            // write permission on is configured is optional (out of history it was present with HAP-NodeJS)
            // if the HomeKit controller is able to change the configured state, it can be set to write.
            generated.properties |= 4 /* PropertyId.WRITE */;
        }],
    ["display-order", generated => {
            // write permission on display order is optional (out of history it was present with HAP-NodeJS)
            // if the HomeKit controller is able to change the configured state, it can be set to write.
            generated.properties |= 4 /* PropertyId.WRITE */;
        }],
    ["button-event", generated => {
            generated.adminOnlyAccess = [2 /* Access.NOTIFY */];
        }],
    ["target-list", generated => {
            generated.adminOnlyAccess = [0 /* Access.READ */, 1 /* Access.WRITE */];
        }],
    ["slat.state.current", generated => {
            generated.maxValue = 2;
        }],
    ["event-snapshots-active", generated => {
            generated.format = "uint8";
            generated.minValue = 0;
            generated.maxValue = 1;
            generated.properties &= ~32 /* PropertyId.TIMED_WRITE */;
        }],
    ["homekit-camera-active", generated => {
            generated.format = "uint8";
            generated.minValue = 0;
            generated.maxValue = 1;
            generated.properties &= ~32 /* PropertyId.TIMED_WRITE */;
        }],
    ["periodic-snapshots-active", generated => {
            generated.format = "uint8";
            generated.properties &= ~32 /* PropertyId.TIMED_WRITE */;
        }],
    ["third-party-camera-active", generated => {
            generated.format = "uint8";
        }],
    ["input-device-type", generated => {
            // @ts-expect-error: undefined access
            generated.validValues[6] = null;
        }],
    ["pairing-features", generated => {
            generated.properties &= ~4 /* PropertyId.WRITE */;
        }],
    ["picture-mode", generated => {
            // @ts-expect-error: undefined access
            generated.validValues[8] = null;
            // @ts-expect-error: undefined access
            generated.validValues[9] = null;
            // @ts-expect-error: undefined access
            generated.validValues[10] = null;
            // @ts-expect-error: undefined access
            generated.validValues[11] = null;
            // @ts-expect-error: undefined access
            generated.validValues[12] = null;
            // @ts-expect-error: undefined access
            generated.validValues[13] = null;
        }],
    ["remote-key", generated => {
            // @ts-expect-error: undefined access
            generated.validValues[12] = null;
            // @ts-expect-error: undefined access
            generated.validValues[13] = null;
            // @ts-expect-error: undefined access
            generated.validValues[14] = null;
            // @ts-expect-error: undefined access
            generated.validValues[16] = null;
        }],
    ["service-label-namespace", generated => {
            generated.maxValue = 1;
        }],
    ["siri-input-type", generated => {
            generated.maxValue = 0;
        }],
    ["visibility-state.current", generated => {
            generated.maxValue = 1;
        }],
    ["active-identifier", generated => {
            generated.minValue = undefined;
        }],
    ["identifier", generated => {
            generated.minValue = undefined;
        }],
    ["access-code-control-point", generated => {
            generated.properties |= 128 /* PropertyId.WRITE_RESPONSE */;
        }],
    ["nfc-access-control-point", generated => {
            generated.properties |= 128 /* PropertyId.WRITE_RESPONSE */;
        }],
]);
exports.CharacteristicManualAdditions = new Map([
    ["diagonal-field-of-view", {
            id: "diagonal-field-of-view",
            UUID: "00000224-0000-1000-8000-0026BB765291",
            name: "Diagonal Field Of View",
            className: "DiagonalFieldOfView",
            since: "13.2",
            format: "float",
            units: "arcdegrees",
            properties: 3, // notify, paired read
            minValue: 0,
            maxValue: 360,
        }],
    ["version", {
            id: "version",
            UUID: "00000037-0000-1000-8000-0026BB765291",
            name: "Version",
            className: "Version",
            format: "string",
            properties: 2, // paired read
            maxLength: 64,
        }],
    ["crypto-hash", {
            id: "crypto-hash",
            UUID: "00000250-0000-1000-8000-0026BB765291",
            name: "Crypto Hash",
            className: "CryptoHash",
            since: "14.0",
            format: "tlv8",
            properties: 132, // write (4) + write_response (128)
        }],
    ["relay-control-point", {
            id: "relay-control-point",
            UUID: "0000005E-0000-1000-8000-0026BB765291",
            name: "Relay Control Point",
            className: "RelayControlPoint",
            deprecatedNotice: "Removed",
            format: "tlv8",
            properties: 7, // read, write, notify
        }],
    ["relay-enabled", {
            id: "relay-enabled",
            UUID: "0000005B-0000-1000-8000-0026BB765291",
            name: "Relay Enabled",
            className: "RelayEnabled",
            deprecatedNotice: "Removed",
            format: "bool",
            properties: 7, // read, write, notify
        }],
    ["relay-state", {
            id: "relay-state",
            UUID: "0000005C-0000-1000-8000-0026BB765291",
            name: "Relay State",
            className: "RelayState",
            deprecatedNotice: "Removed",
            format: "uint8",
            properties: 3, // read, notify
            stepValue: 1,
            minValue: 0,
            maxValue: 5,
        }],
    ["tap-type", {
            id: "tap-type",
            UUID: "0000022F-0000-1000-8000-0026BB765291",
            name: "Tap Type",
            className: "TapType",
            deprecatedNotice: "Removed",
            format: "uint16",
            properties: 2, // read
        }],
    ["token", {
            id: "token",
            UUID: "00000231-0000-1000-8000-0026BB765291",
            name: "Token",
            className: "Token",
            deprecatedNotice: "Removed",
            format: "data",
            properties: 4, // write
        }],
    ["tunnel-connection-timeout", {
            id: "tunnel-connection-timeout",
            UUID: "00000061-0000-1000-8000-0026BB765291",
            name: "Tunnel Connection Timeout",
            className: "TunnelConnectionTimeout",
            deprecatedNotice: "Removed",
            format: "int",
            properties: 7, // read, write, notify
        }],
    ["tunneled-accessory-advertising", {
            id: "tunneled-accessory-advertising",
            UUID: "00000060-0000-1000-8000-0026BB765291",
            name: "Tunneled Accessory Advertising",
            className: "TunneledAccessoryAdvertising",
            deprecatedNotice: "Removed",
            format: "bool",
            properties: 7, // read, write, notify
        }],
    ["tunneled-accessory-connected", {
            id: "tunneled-accessory-connected",
            UUID: "00000059-0000-1000-8000-0026BB765291",
            name: "Tunneled Accessory Connected",
            className: "TunneledAccessoryConnected",
            deprecatedNotice: "Removed",
            format: "bool",
            properties: 7, // read, write, notify
        }],
    ["tunneled-accessory-state-number", {
            id: "tunneled-accessory-state-number",
            UUID: "00000058-0000-1000-8000-0026BB765291",
            name: "Tunneled Accessory State Number",
            className: "TunneledAccessoryStateNumber",
            deprecatedNotice: "Removed",
            format: "int",
            properties: 3, // read, notify
        }],
    ["sensor-uuid", {
            id: "sensor-uuid",
            UUID: "0000805B-0000-1000-8000-0026BB765291",
            name: "Sensor UUID",
            className: "SensorUUID",
            since: "27",
            format: "data",
            properties: 2, // read
        }],
    ["motion-enabled", {
            id: "motion-enabled",
            UUID: "00008087-0000-1000-8000-0026BB765291",
            name: "Motion Enabled",
            className: "MotionEnabled",
            since: "27",
            format: "bool",
            properties: 39, // notify, read, write, timed write
            adminOnlyAccess: [1 /* Access.WRITE */],
        }],
    ["supported-video-stream-tiers", {
            id: "supported-video-stream-tiers",
            UUID: "00008043-0000-1000-8000-0026BB765291",
            name: "Supported Video Stream Tiers",
            className: "SupportedVideoStreamTiers",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
    ["supported-audio-stream-tiers", {
            id: "supported-audio-stream-tiers",
            UUID: "00008044-0000-1000-8000-0026BB765291",
            name: "Supported Audio Stream Tiers",
            className: "SupportedAudioStreamTiers",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
    ["camera-capabilities", {
            id: "camera-capabilities",
            UUID: "00008011-0000-1000-8000-0026BB765291",
            name: "Camera Capabilities",
            className: "CameraCapabilitiesConfiguration",
            since: "27",
            format: "tlv8",
            properties: 2, // read
        }],
    ["contributing-sensors", {
            id: "contributing-sensors",
            UUID: "00008086-0000-1000-8000-0026BB765291",
            name: "Contributing Sensors",
            className: "ContributingSensors",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
    ["camera-key", {
            id: "camera-key",
            UUID: "00008051-0000-1000-8000-0026BB765291",
            name: "Camera Key",
            className: "CameraKey",
            since: "27",
            format: "tlv8",
            properties: 36, // write, timed write
        }],
    ["camera-key-id", {
            id: "camera-key-id",
            UUID: "00008052-0000-1000-8000-0026BB765291",
            name: "Camera Key ID",
            className: "CameraKeyID",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
    ["camera-buffer-command", {
            id: "camera-buffer-command",
            UUID: "00008013-0000-1000-8000-0026BB765291",
            name: "Buffer Upload Command",
            className: "BufferUploadCommand",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["camera-activity-command", {
            id: "camera-activity-command",
            UUID: "00008017-0000-1000-8000-0026BB765291",
            name: "Buffer Activity Command",
            className: "BufferActivityCommand",
            since: "27",
            format: "tlv8",
            properties: 4, // write
        }],
    ["camera-buffer-event-command", {
            id: "camera-buffer-event-command",
            UUID: "00008014-0000-1000-8000-0026BB765291",
            name: "Buffer Event Command",
            className: "BufferEventCommand",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["camera-buffer-event-sequence-number", {
            id: "camera-buffer-event-sequence-number",
            UUID: "00008015-0000-1000-8000-0026BB765291",
            name: "Buffer Event Sequence Number",
            className: "BufferEventSequenceNumber",
            since: "27",
            format: "uint32",
            properties: 3, // notify, read
        }],
    ["camera-recording-publishing-point", {
            id: "camera-recording-publishing-point",
            UUID: "00008016-0000-1000-8000-0026BB765291",
            name: "Camera Recording Publishing Point",
            className: "CameraRecordingPublishingPoint",
            since: "27",
            format: "tlv8",
            properties: 6, // read, write
        }],
    ["camera-zones", {
            id: "camera-zones",
            UUID: "00008022-0000-1000-8000-0026BB765291",
            name: "Camera Zones",
            className: "CameraZones",
            since: "27",
            format: "tlv8",
            properties: 6, // read, write
        }],
    ["streaming-enabled", {
            id: "streaming-enabled",
            UUID: "00008041-0000-1000-8000-0026BB765291",
            name: "Streaming Enabled",
            className: "StreamingEnabled",
            since: "27",
            format: "bool",
            properties: 39, // notify, read, write, timed write
            adminOnlyAccess: [1 /* Access.WRITE */],
        }],
    ["rtp-streaming-control", {
            id: "rtp-streaming-control",
            UUID: "00008045-0000-1000-8000-0026BB765291",
            name: "RTP Streaming Control",
            className: "RTPStreamingControl",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["webrtc-solicit-offer", {
            id: "webrtc-solicit-offer",
            UUID: "00008053-0000-1000-8000-0026BB765291",
            name: "WebRTC Solicit Offer",
            className: "WebRTCSolicitOffer",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["webrtc-provide-answer", {
            id: "webrtc-provide-answer",
            UUID: "00008054-0000-1000-8000-0026BB765291",
            name: "WebRTC Provide Answer",
            className: "WebRTCProvideAnswer",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["webrtc-streaming-control", {
            id: "webrtc-streaming-control",
            UUID: "00008056-0000-1000-8000-0026BB765291",
            name: "WebRTC Streaming Control",
            className: "WebRTCStreamingControl",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["webrtc-number-of-active-sessions", {
            id: "webrtc-number-of-active-sessions",
            UUID: "00008057-0000-1000-8000-0026BB765291",
            name: "WebRTC Number Of Active Sessions",
            className: "WebRTCNumberOfActiveSessions",
            since: "27",
            format: "uint8",
            properties: 3, // notify, read
            minValue: 0,
            maxValue: 255,
        }],
    ["webrtc-reoffer", {
            id: "webrtc-reoffer",
            UUID: "00008058-0000-1000-8000-0026BB765291",
            name: "WebRTC Reoffer",
            className: "WebRTCReoffer",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["webrtc-update-session", {
            id: "webrtc-update-session",
            UUID: "0000805C-0000-1000-8000-0026BB765291",
            name: "WebRTC Update Session",
            className: "WebRTCUpdateSession",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["webrtc-supported-video-stream-tiers", {
            id: "webrtc-supported-video-stream-tiers",
            UUID: "00008059-0000-1000-8000-0026BB765291",
            name: "WebRTC Supported Video Stream Tiers",
            className: "WebRTCSupportedVideoStreamTiers",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
    ["webrtc-supported-audio-stream-tiers", {
            id: "webrtc-supported-audio-stream-tiers",
            UUID: "0000805A-0000-1000-8000-0026BB765291",
            name: "WebRTC Supported Audio Stream Tiers",
            className: "WebRTCSupportedAudioStreamTiers",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
    ["camera-client-csr", {
            id: "camera-client-csr",
            UUID: "00008081-0000-1000-8000-0026BB765291",
            name: "Camera Client CSR",
            className: "CameraClientCSR",
            since: "27",
            format: "tlv8",
            properties: 134, // read, write, write response
        }],
    ["camera-client-certificate", {
            id: "camera-client-certificate",
            UUID: "00008082-0000-1000-8000-0026BB765291",
            name: "Camera Client Certificate",
            className: "CameraClientCertificate",
            since: "27",
            format: "tlv8",
            properties: 38, // read, write, timed write
        }],
    ["camera-client-certificate-status", {
            id: "camera-client-certificate-status",
            UUID: "00008083-0000-1000-8000-0026BB765291",
            name: "Camera Client Certificate Status",
            className: "CameraClientCertificateStatus",
            since: "27",
            format: "tlv8",
            properties: 3, // notify, read
        }],
]);
exports.ServiceNameOverrides = new Map([
    ["accessory-information", "Accessory Information"],
    ["camera-rtp-stream-management", "Camera RTP Stream Management"],
    ["fanv2", "Fanv2"],
    ["service-label", "Service Label"],
    ["smart-speaker", "Smart Speaker"],
    ["speaker", "Television Speaker"], // has some additional accessories
    ["nfc-access", "NFC Access"],
]);
exports.ServiceDeprecatedNames = new Map([]);
exports.ServiceCharacteristicConfigurationOverrides = new Map([
    ["accessory-information", { addedRequired: ["firmware.revision"], removedOptional: ["firmware.revision"] }],
    ["camera-operating-mode", { addedOptional: ["diagonal-field-of-view"] }],
    ["sensor.motion", { addedOptional: ["contributing-sensors", "motion-enabled"] }],
]);
exports.ServiceManualAdditions = new Map([
    ["og-speaker", {
            id: "og-speaker",
            UUID: "00000113-0000-1000-8000-0026BB765291",
            name: "Speaker",
            className: "Speaker",
            since: "10",
            requiredCharacteristics: ["mute"],
            optionalCharacteristics: ["active", "volume"],
        }],
    ["cloud-relay", {
            id: "cloud-relay",
            UUID: "0000005A-0000-1000-8000-0026BB765291",
            name: "Cloud Relay",
            className: "CloudRelay",
            deprecatedNotice: "Removed",
            requiredCharacteristics: [
                "relay-control-point",
                "relay-state",
                "relay-enabled",
            ],
        }],
    ["tap-management", {
            id: "tap-management",
            UUID: "0000022E-0000-1000-8000-0026BB765291",
            name: "Tap Management",
            className: "TapManagement",
            deprecatedNotice: "Removed",
            requiredCharacteristics: [
                "active",
                "crypto-hash",
                "tap-type",
                "token",
            ],
        }],
    ["tunnel", {
            id: "tunnel",
            UUID: "00000056-0000-1000-8000-0026BB765291",
            name: "Tunnel",
            className: "Tunnel",
            deprecatedNotice: "Removed",
            requiredCharacteristics: [
                "accessory.identifier",
                "tunnel-connection-timeout",
                "tunneled-accessory-advertising",
                "tunneled-accessory-connected",
                "tunneled-accessory-state-number",
            ],
        }],
    ["camera-capabilities", {
            id: "camera-capabilities",
            UUID: "00008010-0000-1000-8000-0026BB765291",
            name: "Camera Capabilities",
            className: "CameraCapabilities",
            since: "27",
            requiredCharacteristics: ["version", "camera-capabilities"],
            optionalCharacteristics: ["manually-disabled"],
        }],
    ["camera-global-operating-mode", {
            id: "camera-global-operating-mode",
            UUID: "00008032-0000-1000-8000-0026BB765291",
            name: "Camera Global Operating Mode",
            className: "CameraGlobalOperatingMode",
            since: "27",
            requiredCharacteristics: ["homekit-camera-active", "streaming-enabled", "camera-operating-mode-indicator"],
            optionalCharacteristics: ["manually-disabled", "night-vision", "third-party-camera-active"],
        }],
    ["camera-motion-zones", {
            id: "camera-motion-zones",
            UUID: "00008021-0000-1000-8000-0026BB765291",
            name: "Camera Motion Zones",
            className: "CameraMotionZones",
            since: "27",
            requiredCharacteristics: ["version", "active", "camera-zones"],
        }],
    ["camera-buffer-management", {
            id: "camera-buffer-management",
            UUID: "00008000-0000-1000-8000-0026BB765291",
            name: "Camera Buffer Management",
            className: "CameraBufferManagement",
            since: "27",
            requiredCharacteristics: [
                "camera-buffer-command", "camera-activity-command", "camera-buffer-event-command", "camera-buffer-event-sequence-number",
                "camera-recording-publishing-point",
            ],
        }],
    ["camera-multi-tier-rtp-stream-management", {
            id: "camera-multi-tier-rtp-stream-management",
            UUID: "00008031-0000-1000-8000-0026BB765291",
            name: "Camera Multi-Tier RTP Stream Management",
            className: "CameraMultiTierRTPStreamManagement",
            since: "27",
            requiredCharacteristics: [
                "streaming-enabled", "status-active", "supported-video-stream-tiers", "supported-audio-stream-tiers", "supported-rtp-configuration",
                "setup-stream-endpoint", "rtp-streaming-control", "sensor-uuid",
            ],
        }],
    ["camera-webrtc-stream-management", {
            id: "camera-webrtc-stream-management",
            UUID: "00008033-0000-1000-8000-0026BB765291",
            name: "Camera WebRTC Stream Management",
            className: "CameraWebRTCStreamManagement",
            since: "27",
            requiredCharacteristics: [
                "webrtc-solicit-offer", "webrtc-provide-answer", "webrtc-streaming-control", "webrtc-number-of-active-sessions", "webrtc-reoffer",
                "webrtc-update-session", "webrtc-supported-video-stream-tiers", "webrtc-supported-audio-stream-tiers", "streaming-enabled", "sensor-uuid",
            ],
        }],
    ["camera-key-management", {
            id: "camera-key-management",
            UUID: "00008050-0000-1000-8000-0026BB765291",
            name: "Camera Key Management",
            className: "CameraKeyManagement",
            since: "27",
            requiredCharacteristics: ["camera-key", "camera-key-id"],
        }],
    ["camera-client-certificate-management", {
            id: "camera-client-certificate-management",
            UUID: "00008080-0000-1000-8000-0026BB765291",
            name: "Camera Client Certificate Management",
            className: "CameraClientCertificateManagement",
            since: "27",
            requiredCharacteristics: ["camera-client-csr", "camera-client-certificate", "camera-client-certificate-status"],
        }],
]);
exports.CharacteristicSinceInformation = new Map([
    ["activity-interval", "14"],
    ["cca-energy-detect-threshold", "14"],
    ["cca-signal-detect-threshold", "14"],
    ["characteristic-value-active-transition-count", "14"],
    ["characteristic-value-transition-control", "14"],
    ["current-transport", "14"],
    ["data-stream-hap-transport", "14"],
    ["data-stream-hap-transport-interrupt", "14"],
    ["event-retransmission-maximum", "14"],
    ["event-transmission-counters", "14"],
    ["heart-beat", "14"],
    ["mac-retransmission-maximum", "14"],
    ["mac-retransmission-counters", "14"],
    ["operating-state-response", "14"],
    ["ping", "14"],
    ["receiver-sensitivity", "14"],
    ["rssi", "14"],
    ["setup-transfer-transport", "13.4"],
    ["sleep-interval", "14"],
    ["snr", "14"],
    ["supported-characteristic-value-transition-configuration", "14"],
    ["supported-diagnostics-snapshot", "14"],
    ["supported-transfer-transport-configuration", "13.4"],
    ["transmit-power", "14"],
    ["transmit-power-maximum", "14"],
    ["transfer-transport-management", "13.4"],
    ["video-analysis-active", "14"],
    ["wake-configuration", "13.4"],
    ["wifi-capabilities", "14"],
    ["wifi-configuration-control", "14"],
    ["access-code-control-point", "15"],
    ["access-code-supported-configuration", "15"],
    ["configuration-state", "15"],
    ["hardware-finish", "15"],
    ["nfc-access-control-point", "15"],
    ["nfc-access-supported-configuration", "15"],
]);
exports.ServiceSinceInformation = new Map([
    ["outlet", "13"],
    ["access-code", "15"],
    ["nfc-access", "15"],
]);
//# sourceMappingURL=generator-configuration.js.map
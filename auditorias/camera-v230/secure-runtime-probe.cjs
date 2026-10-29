// Isolated construction only. Never publishes an accessory or opens pairing.
const assert = require('node:assert/strict');
const path = require('node:path');
const reference = process.env.MIAO_REFERENCE_ROOT;
if (!reference) throw new Error('Set MIAO_REFERENCE_ROOT to the audited v0.6.30 checkout');
const hap = require(path.join(reference, 'vendor/hap-nodejs'));
const unavailable = async () => { throw new Error('Media intentionally outside this construction probe'); };
const rtp = { prepareStream: unavailable, startStream: unavailable, stopStream: async () => {} };
const webrtc = { handleSolicitOffer: unavailable, handleProvideAnswer: async () => {}, handleReoffer: unavailable, handleUpdateSession: async () => {}, handleEndSession: async () => {} };
const recorder = { updateRecordingActive() {}, updateRecordingConfiguration() {}, async *handleRecordingStreamRequest() {}, closeRecordingStream() {} };
const controller = new hap.SecureVideoController({
  sensor: { uuid: hap.uuid.generate('miao-isolated-runtime-probe-sensor'), width: 1920, height: 1080, type: 1, intent: 1 },
  video: { codec: 2, payloadType: 99, tiers: [{ identifier: 1, quality: 2, targetAverageBitrate: 1800, peakBitrate: 2000, width: 1920, height: 1080, frameRate: 15 }] },
  audio: { payloadType: 111, twoWayAudio: false, tier: { identifier: 1, targetAverageBitrate: 24000, sampleRate: 1, bitDepth: 2, packetTime: 20, channels: 1 } },
  webrtc: { delegate: webrtc, maxSessions: 6 }, rtp: { delegate: rtp },
  recording: { delegate: recorder, options: { prebufferLength: 8000, mediaContainerConfiguration: { type: 0, fragmentLength: 4000 }, video: { type: 0, parameters: { profiles: [1], levels: [0, 1, 2] }, resolutions: [[1920,1080,15]] }, audio: { codecs: [{ type: 0, audioChannels: 1, samplerate: [5] }] } } },
  snapshot: async () => Buffer.from([0xff,0xd8,0xff,0xd9]),
});
const accessory = new hap.Accessory('Isolated contract probe', hap.uuid.generate('miao-isolated-runtime-probe-accessory'));
try {
  accessory.configureController(controller);
  const services = ['CameraOperatingMode','DataStreamTransportManagement','CameraWebRTCStreamManagement','CameraMultiTierRTPStreamManagement'].map(name => ({ name, present: !!accessory.getService(hap.Service[name]) }));
  for (const service of services) assert.equal(service.present, true, service.name);
  assert.equal(accessory.getService(hap.Service.Speaker), undefined);
  console.log(JSON.stringify({ scope: 'reference fork only; NOT the MIAO production runtime', version: hap.HAPLibraryVersion(), services, speakerAdvertised: false, published: false }));
} finally { accessory.removeController(controller); }

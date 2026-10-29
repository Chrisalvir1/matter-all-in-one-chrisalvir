import * as ffmpegHelper from "../src/camera/homekit/ffmpeg-helper.js";
import { CameraSourceAdapter } from "../src/camera/source-adapter.js";
import { SecureVideoSFrame } from "../src/camera/homekit/hevc/sframe.js";
import { SFrameRtpPacketizer } from "../src/camera/homekit/hevc/sframe-rtp.js";
import { describe, expect, it, vi } from "vitest";
import { createSocket, type Socket } from "node:dgram";
import { once } from "node:events";
import {
  RtpHeader,
  RtpPacket,
  SrtpSession,
  SrtcpSession,
  RTCPeerConnection,
  RTCRtpCodecParameters,
  RTCRtpHeaderExtensionParameters,
} from "werift";
import { routeAddress } from "../src/camera/homekit/route-address.js";
import { RtpDatagramRelay } from "../src/camera/homekit/rtp-relay.js";
import { MultiTierRtpDelegate } from "../src/camera/homekit/hevc/multi-tier-rtp.js";
import { WebRtcSessionManager } from "../src/camera/homekit/hevc/webrtc-session.js";
const bind = async (s: Socket) => {
  s.bind(0, "127.0.0.1");
  await once(s, "listening");
  return (s.address() as { port: number }).port;
};
const receive = async (s: Socket) =>
  (
    await once(s, "message", { signal: AbortSignal.timeout(2000) })
  )[0] as Buffer;
const key = Buffer.alloc(16, 0x51),
  salt = Buffer.alloc(14, 0x31);
const keys = {
  localMasterKey: key,
  localMasterSalt: salt,
  remoteMasterKey: key,
  remoteMasterSalt: salt,
};
const packet = (sequenceNumber: number) =>
  new RtpPacket(
    new RtpHeader({
      version: 2,
      payloadType: 99,
      sequenceNumber,
      ssrc: 123,
      timestamp: 90000,
      marker: true,
    }),
    Buffer.from([2, 1, 7]),
  );
const caps: any = {
  videoCodec: "hevc",
  audioCodec: "pcm_mulaw",
  hasAudio: true,
  hasLiveStream: true,
  resolution: { width: 1920, height: 1080 },
  maxFps: 15,
};
const source: any = {
  url: "rtsp://127.0.0.1:8554/synthetic",
  sourceType: "rtsp",
  supportsPassthrough: true,
};
const tier: any = {
  identifier: 1,
  quality: 2,
  width: 1920,
  height: 1080,
  frameRate: 15,
  targetAverageBitrate: 1800,
  peakBitrate: 2000,
};
describe("local RTP routing and authenticated contracts", () => {
  it("uses actual loopback route and rejects invalid target", async () => {
    expect(await routeAddress("127.0.0.1", 5000)).toBe("127.0.0.1");
    await expect(routeAddress("bad-target", 5000)).rejects.toThrow();
  });
  it("relays exact SRTP bytes, reports first packet once and returns RTCP feedback", async () => {
    const controller = createSocket("udp4"),
      producer = createSocket("udp4");
    const port = await bind(controller);
    await bind(producer);
    const first = vi.fn();
    const relay = await RtpDatagramRelay.create("127.0.0.1", port, first);
    try {
      const tx = new SrtpSession({ profile: 1, keys }),
        rx = new SrtpSession({ profile: 1, keys });
      for (const seq of [65535, 0, 1]) {
        const p = packet(seq),
          cipher = tx.encrypt(p.payload, p.header);
        const pending = receive(controller);
        producer.send(cipher, relay.inputPort, "127.0.0.1");
        const wire = await pending;
        expect(wire.equals(cipher)).toBe(true);
        expect(rx.decrypt(wire).equals(p.serialize())).toBe(true);
      }
      expect(first).toHaveBeenCalledTimes(1);
      const report = Buffer.from(
        "80c800060000007b0000000100000002000000030000000400000005",
        "hex",
      );
      const reports = receive(controller);
      producer.send(report, relay.inputPort, "127.0.0.1");
      expect((await reports).equals(report)).toBe(true);
      const feedback = receive(producer);
      controller.send(report, relay.outputPort, "127.0.0.1");
      expect((await feedback).equals(report)).toBe(true);
    } finally {
      relay.close();
      relay.close();
      controller.close();
      producer.close();
    }
  });

  it("rejects wrong SRTP keys and altered authentication tags", () => {
    const tx = new SrtpSession({ profile: 1, keys }),
      p = packet(10),
      wire = tx.encrypt(p.payload, p.header);
    const bad = Buffer.from(wire);
    bad[bad.length - 1] ^= 1;
    expect(() => new SrtpSession({ profile: 1, keys }).decrypt(bad)).toThrow();
    expect(() =>
      new SrtpSession({
        profile: 1,
        keys: { ...keys, remoteMasterKey: Buffer.alloc(16, 2) },
      }).decrypt(wire),
    ).toThrow();
  });
  it("authenticates SRTCP and rejects tampering", () => {
    const tx = new SrtcpSession({ profile: 1, keys }),
      rx = new SrtcpSession({ profile: 1, keys });
    const report = Buffer.from(
      "80c800060000007b0000000100000002000000030000000400000005",
      "hex",
    );
    const encrypted = tx.encrypt(report);
    const tampered = Buffer.from(encrypted);
    tampered[tampered.length - 1] ^= 1;
    expect(() => rx.decrypt(tampered)).toThrow();
    expect(rx.decrypt(encrypted).equals(report)).toBe(true);
  });
  it("prepares actual multi-tier ports, preserves caller key ownership and closes twice", async () => {
    const d = new MultiTierRtpDelegate({}, "camera.fixture", caps, source, {
      videoTiers: [tier],
      audioTier: { identifier: 1 } as any,
      videoPayloadType: 99,
      audioPayloadType: 110,
    });
    const request: any = {
      sessionIdentifier: "test",
      targetAddress: "127.0.0.1",
      sourceAddress: "127.0.0.1",
      addressVersion: "ipv4",
      controllerVideoPort: 5000,
      controllerAudioPort: 5002,
      video: { cryptoSuite: 0, masterKey: key, masterSalt: salt },
      audio: { cryptoSuite: 0, masterKey: key, masterSalt: salt },
    };
    const response = await d.prepareStream(request);
    expect(response.addressOverride).toBe("127.0.0.1");
    expect(response.videoPort).toBeGreaterThan(0);
    await expect(d.prepareStream(request)).rejects.toThrow();
    await expect(
      d.startStream({
        sessionIdentifier: "test",
        videoTier: 9,
        videoSSRC: 123,
      }),
    ).rejects.toThrow("tier");
    await d.stopStream("test");
    await d.stopAll();
    expect(key.every((v) => v === 0x51)).toBe(true);
    expect(d.isStreaming).toBe(false);
  });
  it("cannot close a replacement session when an older source allocation completes late", async () => {
    const d = new MultiTierRtpDelegate({}, "camera.fixture", caps, source, {
      videoTiers: [tier],
      audioTier: { identifier: 1 } as any,
      videoPayloadType: 99,
      audioPayloadType: 110,
    });
    const request: any = {
      sessionIdentifier: "generation",
      targetAddress: "127.0.0.1",
      sourceAddress: "127.0.0.1",
      addressVersion: "ipv4",
      controllerVideoPort: 5000,
      controllerAudioPort: 5002,
      video: { cryptoSuite: 0, masterKey: key, masterSalt: salt },
      audio: { cryptoSuite: 0, masterKey: key, masterSalt: salt },
    };
    const binary = vi
      .spyOn(ffmpegHelper, "resolveFfmpegPath")
      .mockReturnValue("synthetic-ffmpeg-not-spawned");
    let finish!: (value: any) => void;
    const resolution = vi
      .spyOn(CameraSourceAdapter.prototype, "resolveSession")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    try {
      await d.prepareStream(request);
      const starting = d.startStream({
        sessionIdentifier: "generation",
        videoTier: 1,
        videoSSRC: 123,
      });
      await d.stopStream("generation");
      const replacement = await d.prepareStream(request);
      finish(source);
      await expect(starting).rejects.toThrow(
        "stopped during source resolution",
      );
      expect(d.isStreaming).toBe(true);
      expect(replacement.video.masterKey.some((v) => v !== 0)).toBe(true);
    } finally {
      binary.mockRestore();
      resolution.mockRestore();
      await d.stopAll();
    }
  });
  it("creates a real werift HEVC/Opus offer and closes all peer resources", async () => {
    const d = new WebRtcSessionManager(
      {
        log: {
          debug: (message: string) => {
            if (
              process.env.MIAO_CAMERA_TEST_METRICS &&
              message.includes("offerGatheringMs=")
            )
              console.info("AUDIT_CAMERA_ICE", message);
          },
        },
      },
      "camera.fixture",
      caps,
      source,
      [tier],
    );
    try {
      const offer = await d.handleSolicitOffer({
        sessionIdentifier: "offer",
        options: { sframeEnabled: true },
      });
      expect(offer.sdpOffer).toContain("H265/90000");
      expect(offer.sdpOffer.includes("opus/48000/2")).toBe(true);
      expect(offer.sframe?.key.length).toBe(32);
      expect(offer.sdpOffer).toContain("a=sendonly");
      await expect(
        d.handleSolicitOffer({
          sessionIdentifier: "offer",
          options: { sframeEnabled: true },
        }),
      ).rejects.toThrow();
    } finally {
      await d.closeAll();
    }
    expect(d.isStreaming).toBe(false);
  }, 10000);
  it("negotiates actual ICE/DTLS answer, key updates and reoffer without opening a camera", async () => {
    const d = new WebRtcSessionManager({}, "camera.fixture", caps, source, [
      tier,
    ]);
    const media = vi
      .spyOn(d as any, "startMediaPipeline")
      .mockResolvedValue(undefined);
    const remote = new RTCPeerConnection({
      codecs: {
        video: [
          new RTCRtpCodecParameters({
            mimeType: "video/H265",
            clockRate: 90000,
            payloadType: 99,
          }),
        ],
        audio: [
          new RTCRtpCodecParameters({
            mimeType: "audio/opus",
            clockRate: 48000,
            channels: 2,
            payloadType: 110,
          }),
        ],
      },
      headerExtensions: {
        video: [
          new RTCRtpHeaderExtensionParameters({
            id: 1,
            uri: "urn:ietf:params:rtp-hdrext:sdes:rtp-stream-id",
          }),
        ],
      },
      iceServers: [],
      iceUseIpv6: false,
    });
    const received: Buffer[] = [];
    let delivered!: (value: Buffer) => void;
    const frameReceived = new Promise<Buffer>((resolve) => {
      delivered = resolve;
    });
    remote.onTrack.subscribe((track) => {
      if (track.kind === "video")
        track.onReceiveRtp.subscribe((packet) => {
          received.push(packet.payload.subarray(1));
          if (packet.header.marker) delivered(Buffer.concat(received));
        });
    });
    try {
      const offer = await d.handleSolicitOffer({
        sessionIdentifier: "dtls",
        options: { sframeEnabled: true },
      });
      expect(offer.sdpOffer.includes("a=rid:tier1 send")).toBe(true);
      expect(offer.sdpOffer.includes("a=simulcast:send tier1")).toBe(true);
      expect(offer.sdpOffer.includes("a=fingerprint:sha-256")).toBe(true);
      await remote.setRemoteDescription({ type: "offer", sdp: offer.sdpOffer });
      const answer = await remote.createAnswer();
      await remote.setLocalDescription(answer);
      await d.handleProvideAnswer({
        sessionIdentifier: "dtls",
        sdpAnswer: remote.localDescription!.sdp,
        candidates: [],
      });
      await vi.waitFor(() => expect(remote.connectionState).toBe("connected"), {
        timeout: 8000,
        interval: 20,
      });
      await vi.waitFor(() => expect(media).toHaveBeenCalledTimes(1), {
        timeout: 1000,
        interval: 10,
      });
      const session = (d as any).sessions.get("dtls");
      const plaintext = Buffer.alloc(2500, 0x45);
      const protectedFrame = session.sframe
        .videoStream(session.videoSsrc)
        .protectFrame(plaintext);
      const packetizer = new SFrameRtpPacketizer({
        ssrc: session.videoSsrc,
        payloadType: 99,
        maxPayload: 1200,
      });
      for (const packet of packetizer.packetize(protectedFrame, 90000, true))
        session.vtrack.writeRtp(packet);
      const receiver = new SecureVideoSFrame(true);
      receiver.addReceiveKeys([offer.sframe!]);
      try {
        const ciphertext = await Promise.race([
          frameReceived,
          new Promise<never>((_, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Synthetic DTLS frame timed out")),
              2000,
            );
            timer.unref();
          }),
        ]);
        expect(
          receiver
            .unprotectFrame(ciphertext, session.videoSsrc, "video")
            .equals(plaintext),
        ).toBe(true);
      } finally {
        receiver.close();
      }
      await d.handleUpdateSession({
        sessionIdentifier: "dtls",
        receiveKeysToAdd: [{ kid: 5n, key: Buffer.alloc(32, 1) }],
        receiveKIDsToRemove: [],
      });
      await d.handleUpdateSession({
        sessionIdentifier: "dtls",
        receiveKeysToAdd: [],
        receiveKIDsToRemove: [5n],
      });
      const reoffer = await remote.createOffer();
      await remote.setLocalDescription(reoffer);
      const reanswer = await d.handleReoffer({
        sessionIdentifier: "dtls",
        sdpOffer: remote.localDescription!.sdp,
      });
      await remote.setRemoteDescription({
        type: "answer",
        sdp: reanswer.sdpAnswer,
      });
      expect(remote.connectionState).toBe("connected");
    } finally {
      await d.closeAll();
      await remote.close();
    }
  }, 15000);
});

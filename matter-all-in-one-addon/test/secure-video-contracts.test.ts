import { describe, expect, it } from "vitest";
import { RtpHeader, RtpPacket } from "werift";
import {
  decodeHeader,
  deriveKeys,
  encodeHeader,
  open,
  seal,
  SecureVideoSFrame,
  SFrameCipherSuite,
} from "../src/camera/homekit/hevc/sframe.js";
import {
  HevcAccessUnitAssembler,
  SFrameRtpPacketizer,
} from "../src/camera/homekit/hevc/sframe-rtp.js";
import { HevcBootstrapGate } from "../src/camera/homekit/hevc/bootstrap.js";
const rtp = (payload: Buffer, seq = 0, marker = true, timestamp = 90000) =>
  new RtpPacket(
    new RtpHeader({
      version: 2,
      payloadType: 99,
      sequenceNumber: seq,
      timestamp,
      ssrc: 123,
      marker,
    }),
    payload,
  );
const nal = (type: number) => Buffer.from([type << 1, 1, 0xaa]);
const ap = (...units: Buffer[]) =>
  Buffer.concat([
    Buffer.from([96, 1]),
    ...units.flatMap((n) => {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(n.length);
      return [b, n];
    }),
  ]);
describe("SFrame independent contracts", () => {
  it("matches RFC 9605 GCM vector including external metadata", () => {
    const suite = SFrameCipherSuite.AES_128_GCM_SHA256_128;
    const keys = deriveKeys(
      Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"),
      0x123n,
      suite,
    );
    const metadata = Buffer.from("IETF SFrame WG"),
      plain = Buffer.from("draft-ietf-sframe-enc");
    const encrypted = seal(
      keys,
      suite,
      encodeHeader(0x123n, 0x4567n),
      plain,
      0x4567n,
      metadata,
    );
    expect(encrypted.toString("hex")).toBe(
      "9901234567b7412c2513a1b66dbb48841bbaf17f598751176ad847681a69c6d0b091c07018ce4adb34eb",
    );
    expect(open(keys, suite, encrypted, metadata).equals(plain)).toBe(true);
  });
  it.each([Buffer.alloc(0), Buffer.from([0xff]), Buffer.from([0x88, 1])])(
    "rejects truncated headers",
    (b) => expect(() => decodeHeader(b)).toThrow(),
  );
  it.each([-1n, 1n << 64n])("bounds key IDs and counters", (n) => {
    expect(() => encodeHeader(n, 0n)).toThrow();
    expect(() => encodeHeader(0n, n)).toThrow();
  });
  it("authenticates, rejects replay, separates SSRC and removes rotated keys", () => {
    const sender = new SecureVideoSFrame(true),
      receiver = new SecureVideoSFrame(true);
    receiver.addReceiveKeys([sender.senderKey!]);
    const stream = sender.videoStream(123);
    expect(sender.videoStream(123)).toBe(stream);
    const packet = stream.protectFrame(Buffer.from("frame"));
    const corrupt = Buffer.from(packet);
    corrupt[corrupt.length - 1] ^= 1;
    expect(() => receiver.unprotectFrame(corrupt, 123, "video")).toThrow();
    expect(() => receiver.unprotectFrame(packet, 124, "video")).toThrow();
    expect(() => receiver.unprotectFrame(packet, 123, "audio")).toThrow();
    expect(receiver.unprotectFrame(packet, 123, "video").toString()).toBe(
      "frame",
    );
    expect(() => receiver.unprotectFrame(packet, 123, "video")).toThrow(
      "replay",
    );
    receiver.removeReceiveKeys([sender.senderKey!.kid]);
    expect(() =>
      receiver.unprotectFrame(
        stream.protectFrame(Buffer.from("new")),
        123,
        "video",
      ),
    ).toThrow("Unknown");
    receiver.close();
    sender.close();
    sender.close();
    expect(() => stream.protectFrame(Buffer.alloc(1))).toThrow("closed");
    expect(sender.senderKey!.key.every((v) => v === 0)).toBe(true);
  });
  it("preserves plaintext and offers no group key when SFrame is disabled", () => {
    const state = new SecureVideoSFrame(false),
      frame = Buffer.from("synthetic media");
    expect(state.senderKey).toBeUndefined();
    expect(state.videoStream(1).protectFrame(frame)).toBe(frame);
    expect(state.audioStream(2).protectFrame(frame)).toBe(frame);
    state.close();
  });
  it("supports reordered audio within bounded replay window", () => {
    const s = new SecureVideoSFrame(true),
      r = new SecureVideoSFrame(true);
    r.addReceiveKeys([s.senderKey!]);
    const packets = Array.from({ length: 66 }, () =>
      s.audioStream(5).protectFrame(Buffer.from("audio")),
    );
    expect(r.unprotectFrame(packets[65], 5, "audio").toString()).toBe("audio");
    expect(r.unprotectFrame(packets[64], 5, "audio").toString()).toBe("audio");
    expect(() => r.unprotectFrame(packets[0], 5, "audio")).toThrow("replay");
    s.close();
    r.close();
  });
});
describe("HEVC RTP and bootstrap contracts", () => {
  it("reassembles an AP and gates until VPS/SPS/PPS plus IRAP", () => {
    const gate = new HevcBootstrapGate();
    expect(gate.push(rtp(nal(1)).serialize())).toEqual([]);
    const packet = rtp(ap(nal(32), nal(33), nal(34), nal(19)), 1).serialize();
    expect(gate.push(packet)).toEqual([packet]);
    expect(gate.ready).toBe(true);
    expect(gate.push(rtp(nal(1), 2).serialize())).toHaveLength(1);
  });
  it("reassembles FU across sequence rollover and drops missing fragments", () => {
    const assembler = new HevcAccessUnitAssembler();
    expect(
      assembler.push(rtp(Buffer.from([98, 1, 0x80 | 19, 0xaa]), 65535, false)),
    ).toBeUndefined();
    const unit = assembler.push(rtp(Buffer.from([98, 1, 0x40 | 19, 0xbb]), 0));
    expect(unit?.data.subarray(4)).toEqual(Buffer.from([38, 1, 0xaa, 0xbb]));
    assembler.push(rtp(Buffer.from([98, 1, 0x80 | 19, 0xaa]), 5, false));
    expect(
      assembler.push(rtp(Buffer.from([98, 1, 0x40 | 19, 0xbb]), 7)),
    ).toBeUndefined();
  });
  it("rejects malformed AP and incomplete FU", () => {
    const a = new HevcAccessUnitAssembler();
    expect(a.push(rtp(Buffer.from([96, 1, 0, 20, 2])))).toBeUndefined();
    expect(
      a.push(rtp(Buffer.from([98, 1, 0x80 | 19, 0xaa]), 1)),
    ).toBeUndefined();
  });
  it("packetizes ciphertext within MTU with markers and continuous sequence", () => {
    const p = new SFrameRtpPacketizer({
      ssrc: 123,
      payloadType: 99,
      maxPayload: 1200,
    });
    const packets = p.packetize(Buffer.alloc(3000, 7), 90000, true);
    expect(packets).toHaveLength(3);
    expect(packets.every((p) => p.payload.length <= 1200)).toBe(true);
    expect(packets.map((p) => p.payload[0])).toEqual([0x80, 0, 0x40]);
    expect(packets.map((p) => p.header.marker)).toEqual([false, false, true]);
    expect(
      (packets[1].header.sequenceNumber -
        packets[0].header.sequenceNumber +
        65536) %
        65536,
    ).toBe(1);
  });
});

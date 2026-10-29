import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { SFrameKeyData } from "./types.js";

// SFrame end-to-end media protection for WebRTC remote path (RFC 9605)
export enum SFrameCipherSuite {
  AES_128_CTR_HMAC_SHA256_80 = 0x0001,
  AES_128_GCM_SHA256_128 = 0x0004,
  AES_256_GCM_SHA512_128 = 0x0005,
  AES_256_CTR_HMAC_SHA512_80 = 0x0006,
  AES_256_CTR_HMAC_SHA512_64 = 0x0007,
  AES_256_CTR_HMAC_SHA512_32 = 0x0008,
}

const VIDEO_SUITE = SFrameCipherSuite.AES_256_CTR_HMAC_SHA512_80;
const AUDIO_SUITE = SFrameCipherSuite.AES_256_CTR_HMAC_SHA512_32;

interface SuiteParams {
  nk: number;
  nka: number;
  nn: number;
  nt: number;
  aead: "gcm" | "ctr-hmac";
  hash: "sha256" | "sha512";
  baseKeyLength: number;
}

const SUITES: Record<SFrameCipherSuite, SuiteParams> = {
  [SFrameCipherSuite.AES_128_CTR_HMAC_SHA256_80]: {
    nk: 48,
    nka: 16,
    nn: 12,
    nt: 10,
    aead: "ctr-hmac",
    hash: "sha256",
    baseKeyLength: 16,
  },
  [SFrameCipherSuite.AES_128_GCM_SHA256_128]: {
    nk: 16,
    nka: 0,
    nn: 12,
    nt: 16,
    aead: "gcm",
    hash: "sha256",
    baseKeyLength: 16,
  },
  [SFrameCipherSuite.AES_256_GCM_SHA512_128]: {
    nk: 32,
    nka: 0,
    nn: 12,
    nt: 16,
    aead: "gcm",
    hash: "sha512",
    baseKeyLength: 32,
  },
  [SFrameCipherSuite.AES_256_CTR_HMAC_SHA512_80]: {
    nk: 96,
    nka: 32,
    nn: 12,
    nt: 10,
    aead: "ctr-hmac",
    hash: "sha512",
    baseKeyLength: 32,
  },
  [SFrameCipherSuite.AES_256_CTR_HMAC_SHA512_64]: {
    nk: 96,
    nka: 32,
    nn: 12,
    nt: 8,
    aead: "ctr-hmac",
    hash: "sha512",
    baseKeyLength: 32,
  },
  [SFrameCipherSuite.AES_256_CTR_HMAC_SHA512_32]: {
    nk: 96,
    nka: 32,
    nn: 12,
    nt: 4,
    aead: "ctr-hmac",
    hash: "sha512",
    baseKeyLength: 32,
  },
};

export interface DerivedKeys {
  key: Buffer;
  salt: Buffer;
}

function beBytes(value: bigint, length: number): Buffer {
  const out = Buffer.alloc(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function minBytes(value: bigint): Buffer {
  if (value === 0n) {
    return Buffer.alloc(1);
  }
  const bytes: number[] = [];
  let v = value;
  while (v > 0n) {
    bytes.unshift(Number(v & 0xffn));
    v >>= 8n;
  }
  return Buffer.from(bytes);
}

function assertUint64(value: bigint): void {
  if (value < 0n || value > 0xffffffffffffffffn)
    throw new Error("SFrame integer out of range");
}
const RTP_STREAM_LABEL = Buffer.from("SFrame 1.0 RTP Stream");

export function deriveStreamBaseKey(key: Buffer, ssrc: number): Buffer {
  const salt = Buffer.alloc(4);
  salt.writeUInt32BE(ssrc >>> 0);
  return Buffer.from(hkdfSync("sha512", key, salt, RTP_STREAM_LABEL, 64));
}

export function deriveKeys(
  baseKey: Buffer,
  kid: bigint,
  suite: SFrameCipherSuite,
): DerivedKeys {
  const params = SUITES[suite];
  const suffix = Buffer.concat([beBytes(kid, 8), beBytes(BigInt(suite), 2)]);
  const keyLabel = Buffer.concat([
    Buffer.from("SFrame 1.0 Secret key "),
    suffix,
  ]);
  const saltLabel = Buffer.concat([
    Buffer.from("SFrame 1.0 Secret salt "),
    suffix,
  ]);
  const empty = Buffer.alloc(0);
  return {
    key: Buffer.from(
      hkdfSync(params.hash, baseKey, empty, keyLabel, params.nk),
    ),
    salt: Buffer.from(
      hkdfSync(params.hash, baseKey, empty, saltLabel, params.nn),
    ),
  };
}

export function encodeHeader(kid: bigint, ctr: bigint): Buffer {
  assertUint64(kid);
  assertUint64(ctr);
  let config = 0;
  const extra: Buffer[] = [];

  if (kid <= 7n) {
    config |= Number(kid) << 4;
  } else {
    const kidBytes = minBytes(kid);
    config |= 0x80 | ((kidBytes.length - 1) << 4);
    extra.push(kidBytes);
  }

  if (ctr <= 7n) {
    config |= Number(ctr);
  } else {
    const ctrBytes = minBytes(ctr);
    config |= 0x08 | (ctrBytes.length - 1);
    extra.push(ctrBytes);
  }

  return Buffer.concat([Buffer.from([config]), ...extra]);
}

function nonce(salt: Buffer, ctr: bigint): Buffer {
  const counter = beBytes(ctr, salt.length);
  const out = Buffer.alloc(salt.length);
  for (let i = 0; i < salt.length; i++) {
    out[i] = salt[i] ^ counter[i];
  }
  return out;
}

export function seal(
  keys: DerivedKeys,
  suite: SFrameCipherSuite,
  header: Buffer,
  plaintext: Buffer,
  ctr: bigint,
  metadata = Buffer.alloc(0),
): Buffer {
  const params = SUITES[suite];
  const iv = nonce(keys.salt, ctr);
  const aad = Buffer.concat([header, metadata]);

  if (params.aead === "gcm") {
    const cipher = createCipheriv(
      keys.key.length === 32 ? "aes-256-gcm" : "aes-128-gcm",
      keys.key,
      iv,
    );
    cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([header, ct, cipher.getAuthTag()]);
  }

  const encKey = keys.key.subarray(0, params.nka);
  const authKey = keys.key.subarray(params.nka);
  const counter = Buffer.concat([iv, Buffer.alloc(4)]);
  const cipher = createCipheriv(
    encKey.length === 32 ? "aes-256-ctr" : "aes-128-ctr",
    encKey,
    counter,
  );
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = computeCtrTag(authKey, aad, ct, iv, params);
  return Buffer.concat([header, ct, tag]);
}

function computeCtrTag(
  authKey: Buffer,
  aad: Buffer,
  ct: Buffer,
  iv: Buffer,
  params: SuiteParams,
): Buffer {
  const lengths = Buffer.alloc(24);
  lengths.writeBigUInt64BE(BigInt(aad.length), 0);
  lengths.writeBigUInt64BE(BigInt(ct.length), 8);
  lengths.writeBigUInt64BE(BigInt(params.nt), 16);
  const hmac = createHmac(params.hash, authKey);
  hmac.update(Buffer.concat([lengths, iv, aad, ct]));
  return hmac.digest().subarray(0, params.nt);
}

export function decodeHeader(buffer: Buffer): {
  header: Buffer;
  kid: bigint;
  ctr: bigint;
  offset: number;
} {
  if (!buffer.length) throw new Error("Missing SFrame header");
  const config = buffer[0];
  let offset = 1;

  let kid: bigint;
  if (config & 0x80) {
    const len = ((config >> 4) & 0x07) + 1;
    if (offset + len > buffer.length)
      throw new Error("Truncated SFrame header");
    kid = BigInt(
      `0x${buffer.subarray(offset, offset + len).toString("hex") || "0"}`,
    );
    if (kid <= 7n || buffer[offset] === 0)
      throw new Error("Non-canonical SFrame key ID");
    offset += len;
  } else {
    kid = BigInt((config >> 4) & 0x07);
  }

  let ctr: bigint;
  if (config & 0x08) {
    const len = (config & 0x07) + 1;
    if (offset + len > buffer.length)
      throw new Error("Truncated SFrame header");
    ctr = BigInt(
      `0x${buffer.subarray(offset, offset + len).toString("hex") || "0"}`,
    );
    if (ctr <= 7n || buffer[offset] === 0)
      throw new Error("Non-canonical SFrame counter");
    offset += len;
  } else {
    ctr = BigInt(config & 0x07);
  }

  return { header: buffer.subarray(0, offset), kid, ctr, offset };
}

export function open(
  keys: DerivedKeys,
  suite: SFrameCipherSuite,
  packet: Buffer,
  metadata = Buffer.alloc(0),
): Buffer {
  const { header, ctr, offset } = decodeHeader(packet);
  const params = SUITES[suite];
  if (!params || packet.length < offset + params.nt)
    throw new Error("Invalid SFrame ciphertext");
  const ct = packet.subarray(offset, -params.nt),
    tag = packet.subarray(-params.nt);
  const iv = nonce(keys.salt, ctr),
    aad = Buffer.concat([header, metadata]);
  if (params.aead === "gcm") {
    const decipher = createDecipheriv(
      keys.key.length === 32 ? "aes-256-gcm" : "aes-128-gcm",
      keys.key,
      iv,
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
  const expected = computeCtrTag(
    keys.key.subarray(params.nka),
    aad,
    ct,
    iv,
    params,
  );
  if (!timingSafeEqual(tag, expected))
    throw new Error("SFrame authentication failed");
  const encKey = keys.key.subarray(0, params.nka);
  const decipher = createDecipheriv(
    encKey.length === 32 ? "aes-256-ctr" : "aes-128-ctr",
    encKey,
    Buffer.concat([iv, Buffer.alloc(4)]),
  );
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

export class SecureVideoSFrame {
  public readonly senderKey?: SFrameKeyData;
  private readonly receiveKeys = new Map<bigint, Buffer>();
  private readonly streams = new Map<string, SFrameStream>();
  private closed = false;
  constructor(private enabled: boolean) {
    if (enabled) this.senderKey = { key: randomBytes(32), kid: 0x100n };
  }
  public videoStream(ssrc: number): SFrameStream {
    return this.stream(ssrc, VIDEO_SUITE);
  }
  public audioStream(ssrc: number): SFrameStream {
    return this.stream(ssrc, AUDIO_SUITE);
  }
  public addReceiveKeys(keys: SFrameKeyData[]): void {
    if (this.closed) throw new Error("SFrame closed");
    for (const { kid, key } of keys) {
      assertUint64(kid);
      if (key.length !== 32) throw new Error("Invalid SFrame group key");
    }
    for (const { kid, key } of keys) {
      this.removeReceiveKeys([kid]);
      this.receiveKeys.set(kid, Buffer.from(key));
    }
  }
  public removeReceiveKeys(kids: bigint[]): void {
    for (const kid of kids) {
      this.receiveKeys.get(kid)?.fill(0);
      this.receiveKeys.delete(kid);
      for (const [id, stream] of this.streams)
        if (id.startsWith(`r:${kid}:`)) {
          stream.close();
          this.streams.delete(id);
        }
    }
  }
  public unprotectFrame(
    packet: Buffer,
    ssrc: number,
    kind: "video" | "audio",
  ): Buffer {
    if (this.closed) throw new Error("SFrame closed");
    if (!this.enabled) return packet;
    const { kid } = decodeHeader(packet),
      key = this.receiveKeys.get(kid);
    if (!key) throw new Error("Unknown SFrame key");
    const suite = kind === "video" ? VIDEO_SUITE : AUDIO_SUITE,
      id = `r:${kid}:${ssrc}:${suite}`;
    let stream = this.streams.get(id);
    if (!stream) {
      stream = new SFrameStream(
        deriveKeys(deriveStreamBaseKey(key, ssrc), kid, suite),
        suite,
        kid,
      );
      this.streams.set(id, stream);
    }
    return stream.unprotectFrame(packet);
  }
  public close(): void {
    if (this.closed) return;
    this.closed = true;
    this.senderKey?.key.fill(0);
    this.removeReceiveKeys([...this.receiveKeys.keys()]);
    for (const stream of this.streams.values()) stream.close();
    this.streams.clear();
  }
  private stream(ssrc: number, suite: SFrameCipherSuite): SFrameStream {
    if (this.closed) throw new Error("SFrame closed");
    const id = `s:${ssrc}:${suite}`;
    let stream = this.streams.get(id);
    if (!stream) {
      stream =
        this.enabled && this.senderKey
          ? new SFrameStream(
              deriveKeys(
                deriveStreamBaseKey(this.senderKey.key, ssrc),
                this.senderKey.kid,
                suite,
              ),
              suite,
              this.senderKey.kid,
            )
          : new SFrameStream();
      this.streams.set(id, stream);
    }
    return stream;
  }
}
export class SFrameStream {
  private counter = 0n;
  private highest = -1n;
  private replay = 0n;
  private closed = false;
  constructor(
    private keys?: DerivedKeys,
    private suite: SFrameCipherSuite = VIDEO_SUITE,
    private kid = 0n,
  ) {}
  public protectFrame(plaintext: Buffer): Buffer {
    if (this.closed) throw new Error("SFrame closed");
    if (!this.keys) return plaintext;
    assertUint64(this.counter);
    const ctr = this.counter++;
    return seal(
      this.keys,
      this.suite,
      encodeHeader(this.kid, ctr),
      plaintext,
      ctr,
    );
  }
  public unprotectFrame(packet: Buffer): Buffer {
    if (this.closed) throw new Error("SFrame closed");
    if (!this.keys) return packet;
    const { kid, ctr } = decodeHeader(packet);
    if (kid !== this.kid) throw new Error("Unexpected SFrame key");
    const delta = this.highest - ctr;
    if (delta >= 64n || (delta >= 0n && this.replay & (1n << delta)))
      throw new Error("SFrame replay");
    const plaintext = open(this.keys, this.suite, packet);
    if (ctr > this.highest) {
      const advance = ctr - this.highest;
      this.replay =
        ((advance >= 64n ? 0n : this.replay << advance) | 1n) &
        0xffffffffffffffffn;
      this.highest = ctr;
    } else this.replay |= 1n << delta;
    return plaintext;
  }
  public close(): void {
    this.closed = true;
    this.keys?.key.fill(0);
    this.keys?.salt.fill(0);
  }
}

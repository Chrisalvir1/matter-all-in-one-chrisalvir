import assert from "assert";
import crypto from "crypto";
import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import hkdf from "futoin-hkdf";
import tweetnacl, { BoxKeyPair } from "tweetnacl";
import { HAPEncryption } from "./eventedhttp";

export type HapCryptoProviderName = "NATIVE" | "PORTABLE" | "UNAVAILABLE";

export interface HapCryptoProvider {
  readonly name: Exclude<HapCryptoProviderName, "UNAVAILABLE">;
  seal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData;
  open(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer;
}

function normalizeNonce(nonce: Buffer): Buffer {
  // Preserve HAP-NodeJS 2.2.3 behavior: short nonces are left-padded with zeroes.
  if (nonce.length < 12) nonce = Buffer.concat([Buffer.alloc(12 - nonce.length), nonce]);
  if (nonce.length !== 12) throw new RangeError("ChaCha20-Poly1305 requires a 12-byte nonce");
  return nonce;
}

export class NativeChaCha20Poly1305Provider implements HapCryptoProvider {
  readonly name = "NATIVE" as const;
  seal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData {
    const cipher = crypto.createCipheriv("chacha20-poly1305", key, normalizeNonce(nonce), { authTagLength: 16 });
    if (aad !== null) cipher.setAAD(aad, { plaintextLength: plaintext.length });
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { ciphertext, authTag: cipher.getAuthTag() };
  }
  open(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer {
    if (authTag.length !== 16) throw new RangeError("ChaCha20-Poly1305 requires a 16-byte authentication tag");
    const decipher = crypto.createDecipheriv("chacha20-poly1305", key, normalizeNonce(nonce), { authTagLength: 16 });
    if (aad !== null) decipher.setAAD(aad, { plaintextLength: ciphertext.length });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}

export class PortableChaCha20Poly1305Provider implements HapCryptoProvider {
  readonly name = "PORTABLE" as const;
  seal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData {
    const sealed = chacha20poly1305(key, normalizeNonce(nonce), aad ?? undefined).encrypt(plaintext);
    return { ciphertext: Buffer.from(sealed.subarray(0, -16)), authTag: Buffer.from(sealed.subarray(-16)) };
  }
  open(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer {
    if (authTag.length !== 16) throw new RangeError("ChaCha20-Poly1305 requires a 16-byte authentication tag");
    const sealed = Buffer.concat([ciphertext, authTag]);
    return Buffer.from(chacha20poly1305(key, normalizeNonce(nonce), aad ?? undefined).decrypt(sealed));
  }
}

function selectCryptoProvider(): HapCryptoProvider | undefined {
  const preference = process.env.HOMEKIT4K_HAP_CRYPTO_PROVIDER ?? "auto";
  if (!["auto", "native", "portable", "off"].includes(preference)) {
    throw new Error("HOMEKIT4K_HAP_CRYPTO_PROVIDER must be auto, native, portable or off");
  }
  if (preference === "off") return undefined;
  const nativeAvailable = crypto.getCiphers().includes("chacha20-poly1305");
  if (preference === "native") return nativeAvailable ? new NativeChaCha20Poly1305Provider() : undefined;
  if (preference === "portable") return new PortableChaCha20Poly1305Provider();
  return nativeAvailable ? new NativeChaCha20Poly1305Provider() : new PortableChaCha20Poly1305Provider();
}

const cryptoProvider = selectCryptoProvider();
export function getCryptoProviderName(): HapCryptoProviderName { return cryptoProvider?.name ?? "UNAVAILABLE"; }
function requireCryptoProvider(): HapCryptoProvider {
  if (!cryptoProvider) throw new Error("No permitted ChaCha20-Poly1305 provider is available in this runtime");
  return cryptoProvider;
}

/**
 * @group Cryptography
 */
export function generateCurve25519KeyPair(): BoxKeyPair {
  return tweetnacl.box.keyPair();
}

/**
 * @group Cryptography
 */
export function generateCurve25519SharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array {
  return tweetnacl.scalarMult(priKey, pubKey);
}

/**
 * @group Cryptography
 */
export function HKDF(hashAlg: string, salt: Buffer, ikm: Buffer, info: Buffer, size: number): Buffer {
  return hkdf(ikm, size, { hash: hashAlg, salt: salt, info: info });
}


const MAX_UINT32 = 0x00000000FFFFFFFF;
const MAX_INT53 = 0x001FFFFFFFFFFFFF;

function uintHighLow(number: number) {
  assert(number > -1 && number <= MAX_INT53, "number out of range");
  assert(Math.floor(number) === number, "number must be an integer");
  let high = 0;
  const signbit = number & 0xFFFFFFFF;
  const low = signbit < 0 ? (number & 0x7FFFFFFF) + 0x80000000 : signbit;
  if (number > MAX_UINT32) {
    high = (number - low) / (MAX_UINT32 + 1);
  }
  return [high, low];
}

/**
 * @group Utils
 */
export function writeUInt64LE (number: number, buffer: Buffer, offset = 0): void {
  const hl = uintHighLow(number);
  buffer.writeUInt32LE(hl[1], offset);
  buffer.writeUInt32LE(hl[0], offset + 4);
}

//Security Layer Enc/Dec

/**
 * @group Cryptography
 */
export function chacha20_poly1305_decryptAndVerify(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer {
  return requireCryptoProvider().open(key, nonce, aad, ciphertext, authTag);
}

/**
 * @group Cryptography
 */
export interface EncryptedData {
  ciphertext: Buffer;
  authTag: Buffer;
}

/**
 * @group Cryptography
 */
export function chacha20_poly1305_encryptAndSeal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData {
  return requireCryptoProvider().seal(key, nonce, aad, plaintext);
}

/**
 * @group Cryptography
 */
export function layerEncrypt(data: Buffer, encryption: HAPEncryption): Buffer {
  return layerEncryptWithProvider(data, encryption, requireCryptoProvider());
}

export function layerEncryptWithProvider(data: Buffer, encryption: HAPEncryption, provider: HapCryptoProvider): Buffer {
  const chunks: Buffer[] = [];
  const total = data.length;
  for (let offset = 0; offset < total; ) {
    const length = Math.min(total - offset, 0x400);
    const leLength = Buffer.alloc(2);
    leLength.writeUInt16LE(length,0);

    const nonce = Buffer.alloc(8);
    writeUInt64LE(encryption.accessoryToControllerCount++, nonce, 0);

    const encrypted = provider.seal(encryption.accessoryToControllerKey, nonce, leLength, data.subarray(offset, offset + length));
    offset += length;

    chunks.push(leLength, encrypted.ciphertext, encrypted.authTag);
  }
  return Buffer.concat(chunks);
}

/**
 * @group Cryptography
 */
export function layerDecrypt(packet: Buffer, encryption: HAPEncryption): Buffer {
  return layerDecryptWithProvider(packet, encryption, requireCryptoProvider());
}

export function layerDecryptWithProvider(packet: Buffer, encryption: HAPEncryption, provider: HapCryptoProvider): Buffer {
  if (encryption.incompleteFrame) {
    packet = Buffer.concat([encryption.incompleteFrame, packet]);
    encryption.incompleteFrame = undefined;
  }

  const chunks: Buffer[] = [];
  const total = packet.length;

  for (let offset = 0; offset < total;) {
    const realDataLength = packet.subarray(offset, offset + 2).readUInt16LE(0);

    const availableDataLength = total - offset - 2 - 16;
    if (realDataLength > availableDataLength) { // Fragmented packet
      encryption.incompleteFrame = packet.subarray(offset);
      break;
    }

    const nonce = Buffer.alloc(8);
    writeUInt64LE(encryption.controllerToAccessoryCount++, nonce, 0);

    const plaintext = provider.open(
      encryption.controllerToAccessoryKey,
      nonce,
      packet.subarray(offset,offset+2),
      packet.subarray(offset + 2, offset + 2 + realDataLength),
      packet.subarray(offset + 2 + realDataLength, offset + 2 + realDataLength + 16),
    );
    chunks.push(plaintext);
    offset += (18 + realDataLength);
  }

  return Buffer.concat(chunks);
}

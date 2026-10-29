import { BoxKeyPair } from "tweetnacl";
import { HAPEncryption } from "./eventedhttp";
/**
 * @group Cryptography
 */
export declare function generateCurve25519KeyPair(): BoxKeyPair;
/**
 * @group Cryptography
 */
export declare function generateCurve25519SharedSecKey(priKey: Uint8Array, pubKey: Uint8Array): Uint8Array;
/**
 * @group Cryptography
 */
export declare function HKDF(hashAlg: string, salt: Buffer, ikm: Buffer, info: Buffer, size: number): Buffer;
/**
 * @group Utils
 */
export declare function writeUInt64LE(number: number, buffer: Buffer, offset?: number): void;
/**
 * @group Cryptography
 */
export declare function chacha20_poly1305_decryptAndVerify(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer;
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
export declare function chacha20_poly1305_encryptAndSeal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData;
/**
 * @group Cryptography
 */
export declare function layerEncrypt(data: Buffer, encryption: HAPEncryption): Buffer;
/**
 * @group Cryptography
 */
export declare function layerDecrypt(packet: Buffer, encryption: HAPEncryption): Buffer;
//# sourceMappingURL=hapCrypto.d.ts.map

export type HapCryptoProviderName = "NATIVE" | "PORTABLE" | "UNAVAILABLE";
export interface HapCryptoProvider { readonly name: "NATIVE" | "PORTABLE"; seal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData; open(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer; }
export declare class NativeChaCha20Poly1305Provider implements HapCryptoProvider { readonly name: "NATIVE"; seal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData; open(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer; }
export declare class PortableChaCha20Poly1305Provider implements HapCryptoProvider { readonly name: "PORTABLE"; seal(key: Buffer, nonce: Buffer, aad: Buffer | null, plaintext: Buffer): EncryptedData; open(key: Buffer, nonce: Buffer, aad: Buffer | null, ciphertext: Buffer, authTag: Buffer): Buffer; }
export declare function getCryptoProviderName(): HapCryptoProviderName;
export declare function layerEncryptWithProvider(data: Buffer, encryption: HAPEncryption, provider: HapCryptoProvider): Buffer;
export declare function layerDecryptWithProvider(packet: Buffer, encryption: HAPEncryption, provider: HapCryptoProvider): Buffer;

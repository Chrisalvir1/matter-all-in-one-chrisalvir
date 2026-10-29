"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortableChaCha20Poly1305Provider = exports.NativeChaCha20Poly1305Provider = void 0;
exports.getCryptoProviderName = getCryptoProviderName;
exports.generateCurve25519KeyPair = generateCurve25519KeyPair;
exports.generateCurve25519SharedSecKey = generateCurve25519SharedSecKey;
exports.HKDF = HKDF;
exports.writeUInt64LE = writeUInt64LE;
exports.chacha20_poly1305_decryptAndVerify = chacha20_poly1305_decryptAndVerify;
exports.chacha20_poly1305_encryptAndSeal = chacha20_poly1305_encryptAndSeal;
exports.layerEncrypt = layerEncrypt;
exports.layerEncryptWithProvider = layerEncryptWithProvider;
exports.layerDecrypt = layerDecrypt;
exports.layerDecryptWithProvider = layerDecryptWithProvider;
const tslib_1 = require("tslib");
const assert_1 = tslib_1.__importDefault(require("assert"));
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const chacha_js_1 = require("@noble/ciphers/chacha.js");
const futoin_hkdf_1 = tslib_1.__importDefault(require("futoin-hkdf"));
const tweetnacl_1 = tslib_1.__importDefault(require("tweetnacl"));
function normalizeNonce(nonce) {
    // Preserve HAP-NodeJS 2.2.3 behavior: short nonces are left-padded with zeroes.
    if (nonce.length < 12)
        nonce = Buffer.concat([Buffer.alloc(12 - nonce.length), nonce]);
    if (nonce.length !== 12)
        throw new RangeError("ChaCha20-Poly1305 requires a 12-byte nonce");
    return nonce;
}
class NativeChaCha20Poly1305Provider {
    name = "NATIVE";
    seal(key, nonce, aad, plaintext) {
        const cipher = crypto_1.default.createCipheriv("chacha20-poly1305", key, normalizeNonce(nonce), { authTagLength: 16 });
        if (aad !== null)
            cipher.setAAD(aad, { plaintextLength: plaintext.length });
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        return { ciphertext, authTag: cipher.getAuthTag() };
    }
    open(key, nonce, aad, ciphertext, authTag) {
        if (authTag.length !== 16)
            throw new RangeError("ChaCha20-Poly1305 requires a 16-byte authentication tag");
        const decipher = crypto_1.default.createDecipheriv("chacha20-poly1305", key, normalizeNonce(nonce), { authTagLength: 16 });
        if (aad !== null)
            decipher.setAAD(aad, { plaintextLength: ciphertext.length });
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    }
}
exports.NativeChaCha20Poly1305Provider = NativeChaCha20Poly1305Provider;
class PortableChaCha20Poly1305Provider {
    name = "PORTABLE";
    seal(key, nonce, aad, plaintext) {
        const sealed = (0, chacha_js_1.chacha20poly1305)(key, normalizeNonce(nonce), aad ?? undefined).encrypt(plaintext);
        return { ciphertext: Buffer.from(sealed.subarray(0, -16)), authTag: Buffer.from(sealed.subarray(-16)) };
    }
    open(key, nonce, aad, ciphertext, authTag) {
        if (authTag.length !== 16)
            throw new RangeError("ChaCha20-Poly1305 requires a 16-byte authentication tag");
        const sealed = Buffer.concat([ciphertext, authTag]);
        return Buffer.from((0, chacha_js_1.chacha20poly1305)(key, normalizeNonce(nonce), aad ?? undefined).decrypt(sealed));
    }
}
exports.PortableChaCha20Poly1305Provider = PortableChaCha20Poly1305Provider;
function selectCryptoProvider() {
    const preference = process.env.HOMEKIT4K_HAP_CRYPTO_PROVIDER ?? "auto";
    if (!["auto", "native", "portable", "off"].includes(preference)) {
        throw new Error("HOMEKIT4K_HAP_CRYPTO_PROVIDER must be auto, native, portable or off");
    }
    if (preference === "off")
        return undefined;
    const nativeAvailable = crypto_1.default.getCiphers().includes("chacha20-poly1305");
    if (preference === "native")
        return nativeAvailable ? new NativeChaCha20Poly1305Provider() : undefined;
    if (preference === "portable")
        return new PortableChaCha20Poly1305Provider();
    return nativeAvailable ? new NativeChaCha20Poly1305Provider() : new PortableChaCha20Poly1305Provider();
}
const cryptoProvider = selectCryptoProvider();
function getCryptoProviderName() { return cryptoProvider?.name ?? "UNAVAILABLE"; }
function requireCryptoProvider() {
    if (!cryptoProvider)
        throw new Error("No permitted ChaCha20-Poly1305 provider is available in this runtime");
    return cryptoProvider;
}
/**
 * @group Cryptography
 */
function generateCurve25519KeyPair() {
    return tweetnacl_1.default.box.keyPair();
}
/**
 * @group Cryptography
 */
function generateCurve25519SharedSecKey(priKey, pubKey) {
    return tweetnacl_1.default.scalarMult(priKey, pubKey);
}
/**
 * @group Cryptography
 */
function HKDF(hashAlg, salt, ikm, info, size) {
    return (0, futoin_hkdf_1.default)(ikm, size, { hash: hashAlg, salt: salt, info: info });
}
const MAX_UINT32 = 0x00000000FFFFFFFF;
const MAX_INT53 = 0x001FFFFFFFFFFFFF;
function uintHighLow(number) {
    (0, assert_1.default)(number > -1 && number <= MAX_INT53, "number out of range");
    (0, assert_1.default)(Math.floor(number) === number, "number must be an integer");
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
function writeUInt64LE(number, buffer, offset = 0) {
    const hl = uintHighLow(number);
    buffer.writeUInt32LE(hl[1], offset);
    buffer.writeUInt32LE(hl[0], offset + 4);
}
//Security Layer Enc/Dec
/**
 * @group Cryptography
 */
function chacha20_poly1305_decryptAndVerify(key, nonce, aad, ciphertext, authTag) {
    return requireCryptoProvider().open(key, nonce, aad, ciphertext, authTag);
}
/**
 * @group Cryptography
 */
function chacha20_poly1305_encryptAndSeal(key, nonce, aad, plaintext) {
    return requireCryptoProvider().seal(key, nonce, aad, plaintext);
}
/**
 * @group Cryptography
 */
function layerEncrypt(data, encryption) {
    return layerEncryptWithProvider(data, encryption, requireCryptoProvider());
}
function layerEncryptWithProvider(data, encryption, provider) {
    const chunks = [];
    const total = data.length;
    for (let offset = 0; offset < total;) {
        const length = Math.min(total - offset, 0x400);
        const leLength = Buffer.alloc(2);
        leLength.writeUInt16LE(length, 0);
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
function layerDecrypt(packet, encryption) {
    return layerDecryptWithProvider(packet, encryption, requireCryptoProvider());
}
function layerDecryptWithProvider(packet, encryption, provider) {
    if (encryption.incompleteFrame) {
        packet = Buffer.concat([encryption.incompleteFrame, packet]);
        encryption.incompleteFrame = undefined;
    }
    const chunks = [];
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
        const plaintext = provider.open(encryption.controllerToAccessoryKey, nonce, packet.subarray(offset, offset + 2), packet.subarray(offset + 2, offset + 2 + realDataLength), packet.subarray(offset + 2 + realDataLength, offset + 2 + realDataLength + 16));
        chunks.push(plaintext);
        offset += (18 + realDataLength);
    }
    return Buffer.concat(chunks);
}
//# sourceMappingURL=hapCrypto.js.map
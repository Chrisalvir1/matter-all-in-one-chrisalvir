"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateClientKey = generateClientKey;
exports.createClientCSR = createClientCSR;
const tslib_1 = require("tslib");
const crypto_1 = tslib_1.__importDefault(require("crypto"));
const OID_COMMON_NAME = Buffer.from([0x06, 0x03, 0x55, 0x04, 0x03]);
// 1.2.840.10045.4.3.2
const OID_ECDSA_WITH_SHA256 = Buffer.from([0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x04, 0x03, 0x02]);
function derLength(length) {
    if (length < 0x80) {
        return Buffer.from([length]);
    }
    const bytes = [];
    for (let value = length; value > 0; value >>= 8) {
        bytes.unshift(value & 0xff);
    }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function der(tag, ...content) {
    const body = Buffer.concat(content);
    return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}
/**
 * @group Camera Secure Video
 */
function generateClientKey() {
    return crypto_1.default.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey;
}
/**
 * Builds a PKCS#10 certificate signing request for the given EC key and signs the controller nonce with the same key
 * (ECDSA-SHA256, r and s concatenated).
 *
 * @group Camera Secure Video
 */
function createClientCSR(privateKey, commonName, nonce) {
    const publicKey = crypto_1.default.createPublicKey(privateKey).export({ type: "spki", format: "der" });
    const subject = der(0x30, der(0x31, der(0x30, OID_COMMON_NAME, der(0x0c, Buffer.from(commonName, "utf8")))));
    const info = der(0x30, der(0x02, Buffer.from([0x00])), subject, publicKey, der(0xa0));
    const signature = crypto_1.default.sign("sha256", info, privateKey);
    const csr = der(0x30, info, der(0x30, OID_ECDSA_WITH_SHA256), der(0x03, Buffer.from([0x00]), signature));
    return {
        csr,
        // raw r and s, the hub rejects DER encoded signatures
        nonceSignature: crypto_1.default.sign("sha256", nonce, { key: privateKey, dsaEncoding: "ieee-p1363" }),
    };
}
//# sourceMappingURL=SecureVideoCredentials.js.map
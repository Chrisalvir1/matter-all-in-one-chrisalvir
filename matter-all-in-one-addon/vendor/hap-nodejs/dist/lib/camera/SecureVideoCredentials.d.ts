import { KeyObject } from "crypto";
/**
 * @group Camera Secure Video
 */
export interface CameraClientCSRValue {
    csr: Buffer;
    nonceSignature: Buffer;
}
/**
 * @group Camera Secure Video
 */
export declare function generateClientKey(): KeyObject;
/**
 * Builds a PKCS#10 certificate signing request for the given EC key and signs the controller nonce with the same key
 * (ECDSA-SHA256, r and s concatenated).
 *
 * @group Camera Secure Video
 */
export declare function createClientCSR(privateKey: KeyObject, commonName: string, nonce: Buffer): CameraClientCSRValue;
//# sourceMappingURL=SecureVideoCredentials.d.ts.map
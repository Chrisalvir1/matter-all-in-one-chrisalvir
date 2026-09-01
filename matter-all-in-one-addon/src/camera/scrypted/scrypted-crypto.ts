import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { EncryptedSecret } from "./scrypted-types.js";

export class ScryptedCrypto {
  private static keyPath =
    process.env.SCRYPTED_KEY_PATH || "/data/encryption-key.bin";
  private static cachedKey: Buffer | null = null;

  /**
   * Overrides key file path (used primarily for test isolation).
   */
  public static setKeyPath(customPath: string): void {
    this.keyPath = customPath;
    this.cachedKey = null;
  }

  /**
   * Retrieves the persistent 256-bit installation key or creates one randomly on first boot.
   */
  public static async getOrCreateInstallationKey(): Promise<Buffer> {
    if (this.cachedKey) return this.cachedKey;

    try {
      const existing = await fs.readFile(this.keyPath);
      if (existing.length === 32) {
        this.cachedKey = existing;
        return existing;
      }
    } catch {
      // Key does not exist yet; will generate below
    }

    const newKey = crypto.randomBytes(32);
    try {
      const dir = path.dirname(this.keyPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(this.keyPath, newKey, { mode: 0o600 });
      this.cachedKey = newKey;
      return newKey;
    } catch {
      // If /data is not writable (e.g. constrained test environment), fall back to local directory
      const fallbackPath = path.resolve("./data/encryption-key.bin");
      await fs.mkdir(path.dirname(fallbackPath), { recursive: true });
      await fs.writeFile(fallbackPath, newKey, { mode: 0o600 });
      this.keyPath = fallbackPath;
      this.cachedKey = newKey;
      return newKey;
    }
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM with purpose-bound Additional Authenticated Data (AAD).
   */
  public static async encrypt(
    plaintext: string,
    purpose: string,
  ): Promise<EncryptedSecret> {
    const key = await this.getOrCreateInstallationKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    cipher.setAAD(Buffer.from(purpose, "utf8"));
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      purpose,
      version: 1,
    };
  }

  /**
   * Decrypts an EncryptedSecret using AES-256-GCM and verifies purpose authenticity.
   */
  public static async decrypt(
    secret: EncryptedSecret,
    expectedPurpose: string,
  ): Promise<string> {
    if (secret.purpose !== expectedPurpose) {
      throw new Error(
        `Crypto purpose mismatch: expected ${expectedPurpose}, got ${secret.purpose}`,
      );
    }

    const key = await this.getOrCreateInstallationKey();
    const iv = Buffer.from(secret.iv, "base64");
    const authTag = Buffer.from(secret.authTag, "base64");
    const ciphertext = Buffer.from(secret.ciphertext, "base64");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(expectedPurpose, "utf8"));
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }
}

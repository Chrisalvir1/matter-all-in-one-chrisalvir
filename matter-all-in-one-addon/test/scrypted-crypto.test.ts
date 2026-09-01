import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { ScryptedCrypto } from "../src/camera/scrypted/scrypted-crypto.js";

describe("ScryptedCrypto AES-256-GCM suite", () => {
  const tempKeyPath = path.join(os.tmpdir(), `test-key-${Date.now()}.bin`);

  beforeEach(async () => {
    ScryptedCrypto.setKeyPath(tempKeyPath);
    try {
      await fs.unlink(tempKeyPath);
    } catch {}
  });

  it("generates a 256-bit installation key file on first run", async () => {
    const key = await ScryptedCrypto.getOrCreateInstallationKey();
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);

    const stat = await fs.stat(tempKeyPath);
    expect(stat.size).toBe(32);
  });

  it("encrypts and decrypts secret tokens cleanly with matching purpose", async () => {
    const token = "scrypted_secret_api_token_1234567890";
    const encrypted = await ScryptedCrypto.encrypt(token, "scrypted_auth");

    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(encrypted.purpose).toBe("scrypted_auth");

    const decrypted = await ScryptedCrypto.decrypt(encrypted, "scrypted_auth");
    expect(decrypted).toBe(token);
  });

  it("rejects decryption if purpose does not match (purpose isolation)", async () => {
    const token = "scrypted_token_xyz";
    const encrypted = await ScryptedCrypto.encrypt(token, "scrypted_auth");

    await expect(
      ScryptedCrypto.decrypt(encrypted, "nas_credentials"),
    ).rejects.toThrow(/purpose mismatch/);
  });

  it("detects tampering with ciphertext or authTag", async () => {
    const token = "tamper_test_token";
    const encrypted = await ScryptedCrypto.encrypt(token, "scrypted_auth");

    // Alter ciphertext
    const tampered = {
      ...encrypted,
      ciphertext: Buffer.from("corrupted_payload").toString("base64"),
    };

    await expect(
      ScryptedCrypto.decrypt(tampered, "scrypted_auth"),
    ).rejects.toThrow();
  });
});

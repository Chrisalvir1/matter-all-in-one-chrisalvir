import { describe, expect, it, vi } from "vitest";
import { createScryptedRuntimeConnection } from "../src/camera/scrypted/scrypted-runtime-connector.js";

describe("Scrypted runtime connector", () => {
  it("marks a connection successful after fetching discovery data", async () => {
    const connection = createScryptedRuntimeConnection(
      vi.fn().mockResolvedValue({ devices: [{ id: "cam-1" }] }),
    );

    const payload = await connection.fetchDiscovery();
    expect(payload.devices).toHaveLength(1);
    expect(connection.connected).toBe(true);
  });

  it("marks a connection disconnected when fetching fails", async () => {
    const connection = createScryptedRuntimeConnection(
      vi.fn().mockRejectedValue(new Error("offline")),
    );

    await expect(connection.fetchDiscovery()).rejects.toThrow("offline");
    expect(connection.connected).toBe(false);
  });
});

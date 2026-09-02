import { describe, expect, it, vi } from "vitest";
import { ScryptedDiscoveryProvider } from "../src/camera/scrypted/scrypted-discovery-provider.js";
import { ScryptedRuntimeFacade } from "../src/camera/scrypted/scrypted-runtime-facade.js";
import { createScryptedRuntimeConnection } from "../src/camera/scrypted/scrypted-runtime-connector.js";

describe("ScryptedDiscoveryProvider", () => {
  it("refreshes the facade through an injected source", async () => {
    const facade = new ScryptedRuntimeFacade();
    const source = vi.fn().mockResolvedValue({
      devices: [{ id: "cam-1", name: "Entrada", type: "Camera" }],
    });
    const provider = new ScryptedDiscoveryProvider(facade, source);

    const snapshot = await provider.refresh();
    expect(source).toHaveBeenCalledOnce();
    expect(snapshot.connected).toBe(true);
    expect(snapshot.cameras).toHaveLength(1);
  });

  it("marks the facade disconnected when the source fails", async () => {
    const facade = new ScryptedRuntimeFacade();
    const provider = new ScryptedDiscoveryProvider(
      facade,
      vi.fn().mockRejectedValue(new Error("offline")),
    );

    const snapshot = await provider.refresh();
    expect(snapshot.connected).toBe(false);
    expect(snapshot.cameras).toHaveLength(0);
  });

  it("refreshes the facade through an injected runtime connection", async () => {
    const facade = new ScryptedRuntimeFacade();
    const connection = createScryptedRuntimeConnection(
      vi.fn().mockResolvedValue({
        devices: [
          { id: "cam-conn-1", name: "Patio Connection", type: "Camera" },
        ],
      }),
    );
    const provider = new ScryptedDiscoveryProvider(facade, connection);

    const snapshot = await provider.refresh();
    expect(provider.connection.connected).toBe(true);
    expect(snapshot.connected).toBe(true);
    expect(snapshot.cameras).toHaveLength(1);
    expect(snapshot.cameras[0].normalized.name).toBe("Patio Connection");
  });

  it("marks the facade and connection disconnected when runtime connection fails", async () => {
    const facade = new ScryptedRuntimeFacade();
    const connection = createScryptedRuntimeConnection(
      vi.fn().mockRejectedValue(new Error("connection failed")),
    );
    const provider = new ScryptedDiscoveryProvider(facade, connection);

    const snapshot = await provider.refresh();
    expect(provider.connection.connected).toBe(false);
    expect(snapshot.connected).toBe(false);
    expect(snapshot.cameras).toHaveLength(0);
  });
});

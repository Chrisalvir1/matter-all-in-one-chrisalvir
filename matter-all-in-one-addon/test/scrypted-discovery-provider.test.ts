import { describe, expect, it, vi } from "vitest";
import { ScryptedDiscoveryProvider } from "../src/camera/scrypted/scrypted-discovery-provider.js";
import { ScryptedRuntimeFacade } from "../src/camera/scrypted/scrypted-runtime-facade.js";

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
});

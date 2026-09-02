import { describe, expect, it } from "vitest";
import { adaptScryptedClientDiscovery } from "../src/camera/scrypted/scrypted-client-discovery-adapter.js";
import { ScryptedRuntimeFacade } from "../src/camera/scrypted/scrypted-runtime-facade.js";

describe("Scrypted client discovery adapter", () => {
  it("accepts a devices response", () => {
    const facade = new ScryptedRuntimeFacade();
    const snapshot = adaptScryptedClientDiscovery(facade, {
      devices: [{ id: "cam-1", name: "Entrada", type: "Camera" }],
    });
    expect(snapshot.cameras).toHaveLength(1);
    expect(snapshot.cameras[0].normalized.name).toBe("Entrada");
  });

  it("accepts a cameras response without retaining transport fields", () => {
    const facade = new ScryptedRuntimeFacade();
    const snapshot = adaptScryptedClientDiscovery(facade, {
      cameras: [
        {
          id: "cam-2",
          name: "Patio",
          type: "Camera",
          rtsp: "rtsp://private",
          ffmpeg: { command: "ffmpeg" },
        },
      ],
    });
    expect(snapshot.cameras).toHaveLength(1);
    expect(snapshot.cameras[0].normalized).not.toHaveProperty("rtsp");
  });
});

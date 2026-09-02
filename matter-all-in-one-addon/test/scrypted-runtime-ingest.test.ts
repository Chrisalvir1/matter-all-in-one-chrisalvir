import { describe, expect, it } from "vitest";
import { ScryptedRuntimeFacade } from "../src/camera/scrypted/scrypted-runtime-facade.js";
import { ingestScryptedDiscoveryPayload } from "../src/camera/scrypted/scrypted-runtime-ingest.js";

describe("Scrypted runtime ingest", () => {
  it("accepts discovery metadata while discarding media transport fields", () => {
    const facade = new ScryptedRuntimeFacade();
    const snapshot = ingestScryptedDiscoveryPayload(facade, {
      devices: [
        {
          id: "cam-1",
          name: "Entrada",
          manufacturer: "Ring",
          type: "Camera",
          rtspUrl: "rtsp://should-not-be-retained",
          webrtcSession: "secret-session",
          ffmpeg: "-i input",
        },
      ],
    });

    expect(snapshot.cameras).toHaveLength(1);
    expect(snapshot.cameras[0].normalized.name).toBe("Entrada");
    expect(snapshot.cameras[0].normalized).not.toHaveProperty("rtspUrl");
    expect(snapshot.cameras[0].normalized).not.toHaveProperty("webrtcSession");
    expect(snapshot.cameras[0].normalized).not.toHaveProperty("ffmpeg");
  });

  it("ignores malformed devices", () => {
    const facade = new ScryptedRuntimeFacade();
    const snapshot = ingestScryptedDiscoveryPayload(facade, {
      devices: [null, {}, { id: "" }, { id: "cam-1" }],
    });
    expect(snapshot.cameras).toHaveLength(1);
  });
});

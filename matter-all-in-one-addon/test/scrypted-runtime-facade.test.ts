import { describe, expect, it } from "vitest";
import { ScryptedRuntimeFacade } from "../src/camera/scrypted/scrypted-runtime-facade.js";

describe("ScryptedRuntimeFacade", () => {
  it("exposes normalized cameras without opening a media pipeline", () => {
    const facade = new ScryptedRuntimeFacade();
    facade.setConnectionState(true);
    const snapshot = facade.ingestDevices([
      {
        id: "cam-1",
        name: "Entrada",
        manufacturer: "Ring",
        type: "Camera",
        sensors: [{ id: "motion" }],
      },
    ]);

    expect(snapshot.connected).toBe(true);
    expect(snapshot.cameras).toHaveLength(1);
    expect(snapshot.cameras[0].card.source).toBe("scrypted");
    expect(snapshot.policy.matterCameraEnabled).toBe(false);
    expect(snapshot.policy.nvrEnabled).toBe(false);
  });

  it("clears discovered cameras when discovery is disabled", () => {
    const facade = new ScryptedRuntimeFacade();
    const snapshot = facade.ingestDevices([]);
    expect(snapshot.cameras).toHaveLength(0);
  });
});

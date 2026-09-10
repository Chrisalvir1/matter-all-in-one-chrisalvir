import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const frontendSrcPath = new URL("../src/frontend/src/", import.meta.url);
const frontendPath = new URL("../src/frontend/", import.meta.url);

describe("frontend accessibility contract", () => {
  it("keeps React modals structured and accessible", async () => {
    const deviceModal = await readFile(
      new URL("components/DeviceModal.tsx", frontendSrcPath),
      "utf8",
    );
    const cameraModal = await readFile(
      new URL("components/CameraConfigModal.tsx", frontendSrcPath),
      "utf8",
    );
    expect(deviceModal).toContain('id="device-modal"');
    expect(deviceModal).toContain('role="dialog"');
    expect(deviceModal).toContain('aria-modal="true"');
    expect(cameraModal).toContain('role="dialog"');
    expect(cameraModal).toContain('aria-modal="true"');
  });

  it("synchronizes modal styling and backdrop", async () => {
    const stylesheet = await readFile(
      new URL("style.css", frontendPath),
      "utf8",
    );
    expect(stylesheet).toMatch(/\.modal-backdrop/);
  });

  it("provides per-accessory Matter recovery controls and an explicit diagnostics state", async () => {
    const deviceModal = await readFile(
      new URL("components/DeviceModal.tsx", frontendSrcPath),
      "utf8",
    );
    const apiClient = await readFile(
      new URL("api/client.ts", frontendSrcPath),
      "utf8",
    );
    expect(deviceModal).toContain('id="reconnect-accessory-button"');
    expect(deviceModal).toContain('id="regenerate-code-button"');
    expect(deviceModal).toContain('id="reset-accessory-button"');
    expect(apiClient).toContain("/refresh-accessory/");
    expect(deviceModal).toContain("Sin errores registrados para este accesorio.");
    expect(deviceModal).toContain("selectedEntity?.logs");
    expect(deviceModal).toContain('id="fabrics-section"');
    expect(deviceModal).toContain("Desconectar de");
    expect(deviceModal).toContain('id="multi-admin-hint"');
    expect(apiClient).toContain("/open-commissioning/");
    expect(deviceModal).toContain("Modo Multi-Admin Abierto");
  });

  it("integrates Apple Home dynamic icons, artwork, and unexported filter", async () => {
    const deviceCard = await readFile(
      new URL("components/DeviceCard.tsx", frontendSrcPath),
      "utf8",
    );
    const filterBar = await readFile(
      new URL("components/FilterBar.tsx", frontendSrcPath),
      "utf8",
    );
    const appleHomeIcon = await readFile(
      new URL("components/AppleHomeIcon.tsx", frontendSrcPath),
      "utf8",
    );
    const deviceCardArt = await readFile(
      new URL("components/DeviceCardArt.tsx", frontendSrcPath),
      "utf8",
    );

    // DeviceCard must use AppleHomeIcon and DeviceCardArt instead of raw emojis
    expect(deviceCard).toContain("<AppleHomeIcon");
    expect(deviceCard).toContain("<DeviceCardArt");
    expect(deviceCard).not.toContain('return "💡"');
    expect(deviceCard).toContain("NO EXPORTADO");

    // FilterBar must have unexported filter
    expect(filterBar).toContain("NO EXPORTADOS (HA)");
    expect(filterBar).toContain("unexportedCount");

    // AppleHomeIcon must support animated fan blades and lighting glows
    expect(appleHomeIcon).toContain("fan-blades");
    expect(appleHomeIcon).toContain("fanDurationSec");
    expect(appleHomeIcon).toContain("bulbGlow");

    // DeviceCardArt must support day/night modes and dark gradient backdrop
    expect(deviceCardArt).toContain("card-art-backdrop");
    expect(deviceCardArt).toContain("breezeGrad");
  });
});

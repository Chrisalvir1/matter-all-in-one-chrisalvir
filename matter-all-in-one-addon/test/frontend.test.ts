import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const frontendPath = new URL("../src/frontend/", import.meta.url);

describe("frontend accessibility contract", () => {
  it("keeps inactive dialogs out of the accessibility tree", async () => {
    const html = await readFile(new URL("index.html", frontendPath), "utf8");
    expect(html).toMatch(/id="device-modal"[^>]*hidden/);
    expect(html).toMatch(/id="settings-modal"[^>]*hidden/);
    expect(html).toMatch(/id="confirm-modal"[^>]*hidden/);
  });

  it("synchronizes modal visibility with its hidden state", async () => {
    const script = await readFile(new URL("script.js", frontendPath), "utf8");
    const stylesheet = await readFile(
      new URL("style.css", frontendPath),
      "utf8",
    );
    expect(script).toContain("modal.hidden = !open;");
    expect(stylesheet).toMatch(
      /\.modal-backdrop\[hidden\]\s*\{\s*display:\s*none;/,
    );
  });

  it("provides per-accessory Matter recovery controls and an explicit diagnostics state", async () => {
    const html = await readFile(new URL("index.html", frontendPath), "utf8");
    const script = await readFile(new URL("script.js", frontendPath), "utf8");
    expect(html).toContain('id="reconnect-accessory-button"');
    expect(html).toContain('id="regenerate-code-button"');
    expect(html).toContain('id="reset-accessory-button"');
    expect(script).toContain("/refresh-accessory/");
    expect(script).toContain("Sin errores registrados para este accesorio.");
    expect(script).toContain("entity.logs");
    expect(html).toContain('id="fabrics-section"');
    expect(script).toContain("/remove-fabric/");
    expect(script).toContain("Desconectar de");
    expect(script).toMatch(
      /entity\.compositeDeviceId\s*\?\s*`matter:\$\{entity\.compositeDeviceId\}`/,
    );
    expect(html).toContain('id="multi-admin-hint"');
    expect(script).toContain("/open-commissioning/");
    expect(script).toContain("Modo Multi-Admin Abierto");
  });
});

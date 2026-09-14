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

  it("unifies command center into interactive liquid glass tabs with exact labeling", async () => {
    const controlCenter = await readFile(
      new URL("components/ControlCenter.tsx", frontendSrcPath),
      "utf8",
    );
    const filterBar = await readFile(
      new URL("components/FilterBar.tsx", frontendSrcPath),
      "utf8",
    );
    const stylesheet = await readFile(
      new URL("style.css", frontendPath),
      "utf8",
    );

    // Verified exact requested naming: 'MATTER ACTIVO SIN EMPAREJAR'
    expect(controlCenter).toContain("MATTER ACTIVO SIN EMPAREJAR");
    expect(controlCenter).toContain("liquid-control-center");
    expect(controlCenter).toContain('role="tablist"');
    expect(controlCenter).toContain('id={`tab-${card.id}`}');
    expect(controlCenter).toContain('id: "all"');
    expect(controlCenter).toContain('id: "unpaired"');
    expect(controlCenter).toContain('id: "issues"');

    // Verified Liquid Glass styling
    expect(stylesheet).toContain(".liquid-control-center");
    expect(stylesheet).toContain(".glass-card-tab");
    expect(stylesheet).toContain("backdrop-filter: blur(24px)");

    // Verified FilterBar no longer has redundant filter chips
    expect(filterBar).not.toContain("filter-chip");
    expect(filterBar).toContain("scrypted-header-bar");
  });

  it("provides an expansive horizontal Liquid Glass service settings modal with full live log console", async () => {
    const settingsModal = await readFile(
      new URL("components/SettingsModal.tsx", frontendSrcPath),
      "utf8",
    );
    const stylesheet = await readFile(
      new URL("style.css", frontendPath),
      "utf8",
    );

    // Wide horizontal layout with dual columns
    expect(settingsModal).toContain("modal-settings-wide");
    expect(settingsModal).toContain("settings-grid-layout");
    expect(settingsModal).toContain("settings-left-col");
    expect(settingsModal).toContain("settings-right-col");

    // Live terminal & severity filters
    expect(settingsModal).toContain("glass-terminal-wrapper");
    expect(settingsModal).toContain("terminal-search-box");
    expect(settingsModal).toContain("pill-error");
    expect(settingsModal).toContain("pill-warn");
    expect(settingsModal).toContain("pill-info");
    expect(settingsModal).toContain("handleClearLogs");
    expect(settingsModal).toContain("autoScroll");

    // Liquid glass styles for modal-settings-wide and terminal
    expect(stylesheet).toContain(".modal-settings-wide");
    expect(stylesheet).toContain(".glass-terminal-wrapper");
    expect(stylesheet).toContain(".terminal-line.line-error");
    expect(stylesheet).toContain(".terminal-line.line-warn");
    expect(stylesheet).toContain(".terminal-line.line-info");
  });

  it("differentiates QR styling: HAP with yellow house icon and black code, Matter monochrome, and Multi-Admin glowing glass", async () => {
    const qrDisplay = await readFile(
      new URL("components/QRCodeDisplay.tsx", frontendSrcPath),
      "utf8",
    );
    const cameraModal = await readFile(
      new URL("components/CameraConfigModal.tsx", frontendSrcPath),
      "utf8",
    );
    const deviceModal = await readFile(
      new URL("components/DeviceModal.tsx", frontendSrcPath),
      "utf8",
    );
    const stylesheet = await readFile(
      new URL("style.css", frontendPath),
      "utf8",
    );

    // QRCodeDisplay component contract
    expect(qrDisplay).toContain('export type QRVariant = "hap-homekit" | "matter-badge" | "multi-admin-glass"');
    expect(qrDisplay).toContain("homekit-house-icon-yellow");
    expect(qrDisplay).toContain("matter-house-icon-mono");
    expect(qrDisplay).toContain("multi-admin-sparkle-icon");
    expect(qrDisplay).toContain("code-black");
    expect(qrDisplay).toContain("code-cyan");
    expect(qrDisplay).toContain("box-homekit");
    expect(qrDisplay).toContain("box-matter");
    expect(qrDisplay).toContain("box-multi-admin");

    // CameraConfigModal passes hap-homekit variant and pinCode
    expect(cameraModal).toContain('variant={activeTab === "homekit" ? "hap-homekit" : "matter-badge"}');
    expect(cameraModal).toContain("pinCode={activeTab === \"homekit\" ? pinCode : undefined}");

    // DeviceModal toggles between matter-badge and multi-admin-glass
    expect(deviceModal).toContain('variant={multiAdminOpen ? "multi-admin-glass" : "matter-badge"}');

    // CSS contract for HAP (yellow house icon, black code), Matter (monochrome), and Multi-Admin (cyan glass)
    expect(stylesheet).toContain(".qr-badge-card");
    expect(stylesheet).toContain(".qr-card-homekit-badge");
    expect(stylesheet).toContain(".qr-card-matter-badge");
    expect(stylesheet).toContain(".homekit-house-icon-yellow");
    expect(stylesheet).toContain("color: #f59e0b;");
    expect(stylesheet).toContain(".matter-house-icon-mono");
    expect(stylesheet).toContain(".multi-admin-sparkle-icon");
    expect(stylesheet).toContain(".manual-code-display.code-black");
    expect(stylesheet).toContain(".manual-code-display.code-cyan");
    expect(stylesheet).toContain(".qr-frame.qr-frame-clean");
  });
});




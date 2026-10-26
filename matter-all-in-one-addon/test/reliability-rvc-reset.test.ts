import { it, vi, expect } from "vitest";
import {
  setupTest,
  resetTest,
  createTestEnvironment,
  destroyTestEnvironment,
  createServerNode,
  addDevice,
} from "matterbridge/test-utils/vitest";
import { VacuumEntity } from "../src/entities/vacuum.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
it("inspect and initialize actual RVC implementation under strict validation", async () => {
  await setupTest("AuditRvcReset");
  await createTestEnvironment("strict");
  let server: any;
  try {
    [server] = await createServerNode(5592, 0x0074 as any);
    const p: any = {
      matterbridge: { matterbridgeVersion: "3.11.0" },
      log: Object.fromEntries(
        ["debug", "info", "notice", "warn", "error"].map((k) => [k, vi.fn()]),
      ),
      ha: {
        callService: async () => {},
        hassEntities: new Map(),
        hassDevices: new Map(),
        hassStates: new Map(),
      },
    };
    const v = new VacuumEntity(
      p,
      {
        entity_id: "vacuum.audit",
        state: "docked",
        attributes: { friendly_name: "AuditRvc", battery_level: 70 },
      } as any,
      MatterDeviceTypes.roboticVacuumCleaner,
    );
    const ep: any = await v.createEndpoint();
    const before = {
      deviceTypes: Array.from(ep.deviceTypes.keys()),
      descriptor: ep.behaviors.optionsFor(ep.behaviors.supported.descriptor),
      behaviors: Object.keys(ep.behaviors.supported),
    };
    const initialized = await addDevice(server, ep);
    expect(initialized).toBe(true);
    expect(
      ep.state.descriptor.deviceTypeList.map((d: any) => d.deviceType),
    ).toContain(0x0074);
    expect(
      ep.state.descriptor.deviceTypeList.map((d: any) => d.deviceType),
    ).not.toContain(0x0011);
    expect(ep.state.descriptor.serverList).toContain(0x002f);
    expect(ep.behaviors.supported.rvcCleanMode).toBeUndefined();
    await server.start();
    const beforeCode = (server.state as any).commissioning?.pairingCodes
      ?.qrPairingCode;
    await server.erase();
    const afterCode = (server.state as any).commissioning?.pairingCodes
      ?.qrPairingCode;
    expect(beforeCode).toBeTruthy();
    expect(afterCode).toBeTruthy();
    expect(afterCode).not.toBe(beforeCode);
    expect(server.lifecycle.isOnline).toBe(true);
    expect(ep.lifecycle.isReady).toBe(true);
    expect(
      ep.state.descriptor.deviceTypeList.map((d: any) => d.deviceType),
    ).toContain(0x0074);
    expect(
      ep.state.descriptor.deviceTypeList.map((d: any) => d.deviceType),
    ).not.toContain(0x0011);
    process.stdout.write(
      "AUDIT_RVC_REAL " +
        JSON.stringify({
          before,
          initialized,
          descriptor: initialized ? ep.state.descriptor : undefined,
        }) +
        "\n",
    );
  } finally {
    if (server?.lifecycle?.isReady) await server.close();
    await destroyTestEnvironment();
    resetTest();
  }
}, 15000);

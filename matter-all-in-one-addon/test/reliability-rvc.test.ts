import { it, vi, expect } from "vitest";
import {
  setupTest,
  resetTest,
  createTestEnvironment,
  destroyTestEnvironment,
  createServerNode,
  flushServerNode,
  addDevice,
} from "matterbridge/test-utils/vitest";
import { VacuumEntity } from "../src/entities/vacuum.entity.js";
import { MatterDeviceTypes } from "../src/device-registry.js";
it("inspect and initialize actual RVC implementation under strict validation", async () => {
  await setupTest("AuditRvc241");
  await createTestEnvironment("strict");
  try {
    const [server] = await createServerNode(5591, 0x0074 as any);
    const selectorId = "select.audit_modo_de_limpieza";
    const entityId = "vacuum.audit";
    const p: any = {
      matterbridge: { matterbridgeVersion: "3.11.0" },
      nodeIdentities: {
        get: () => "ROBOTINA",
        pin: (_id: string, name: string) => name,
      },
      log: Object.fromEntries(
        ["debug", "info", "notice", "warn", "error"].map((k) => [k, vi.fn()]),
      ),
      ha: {
        callService: async () => {},
        hassEntities: new Map([
          [entityId, { id: "vacuum-entry", device_id: "robotina-device" }],
          [selectorId, { id: "select-entry", device_id: "robotina-device" }],
        ]),
        hassDevices: new Map(),
        hassStates: new Map([
          [
            selectorId,
            {
              entity_id: selectorId,
              state: "chargego",
              attributes: {
                options: [
                  "standby",
                  "random",
                  "wall_follow",
                  "spiral",
                  "chargego",
                ],
              },
            },
          ],
        ]),
      },
    };
    const v = new VacuumEntity(
      p,
      {
        entity_id: entityId,
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
    expect(
      ep.state.descriptor.deviceTypeList.map((d: any) => d.deviceType),
    ).toContain(0x0074);
    expect(ep.behaviors.supported.rvcCleanMode).toBeDefined();
    expect(ep.behaviors.supported.powerSource).toBeDefined();
    expect(
      ep.behaviors.optionsFor(ep.behaviors.supported.rvcCleanMode)
        .supportedModes,
    ).toHaveLength(3);
    expect(
      ep.behaviors.optionsFor(ep.behaviors.supported.rvcCleanMode).currentMode,
    ).toBe(2);
    expect(ep.state.descriptor.serverList).toContain(0x002f);
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
    await flushServerNode();
    await destroyTestEnvironment();
    (resetTest as any)?.();
  }
}, 15000);

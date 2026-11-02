import { expect, it } from "vitest";
import { loadBridgeProtocol } from "../src/utils/matter-protocol.js";

it("uses the bridge's protocol service identities rather than a second installation", async () => {
  const expected = await import("@matter/protocol");
  const actual = await loadBridgeProtocol();
  expect(actual.DeviceCommissioner).toBe(expected.DeviceCommissioner);
  expect(actual.FabricManager).toBe(expected.FabricManager);
  expect(actual.DeviceCommissioner).toBeTypeOf("function");
  expect(actual.FabricManager).toBeTypeOf("function");
});

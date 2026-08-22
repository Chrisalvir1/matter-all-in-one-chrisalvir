import { afterEach, describe, expect, it } from "vitest";
import net, { type Server, type Socket } from "node:net";
import { HomeAssistant } from "../src/homeAssistant.js";

/** Returns true when the OS allows binding a TCP server on loopback. */
async function canBindLoopback(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.listen(0, "127.0.0.1", () => s.close(() => resolve(true)));
  });
}

describe("HomeAssistant connection recovery", () => {
  let server: Server | undefined;
  const sockets = new Set<Socket>();

  afterEach(async () => {
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server?.listening) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    server = undefined;
  });

  it("abandons a half-open WebSocket handshake instead of blocking reconnects", async (ctx) => {
    if (!(await canBindLoopback())) {
      ctx.skip();
      return;
    }
    server = net.createServer((socket) => sockets.add(socket));
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("TCP test server did not expose a port");

    const ha = new HomeAssistant(
      `ws://127.0.0.1:${address.port}`,
      "test-token",
      0,
      0,
      undefined,
      false,
      0.05,
    );
    ha.on("error", () => undefined);

    await expect(ha.connect()).rejects.toThrow("connection timed out");
    expect(ha.connected).toBe(false);
  });

  it("propagates snapshot failures so an incomplete recovery is not reported as healthy", async () => {
    const ha = new HomeAssistant("ws://127.0.0.1:1", "test-token", 0, 0);
    await expect(ha.fetchData()).rejects.toThrow(
      "not connected to Home Assistant",
    );
  });

  it("serializes service calls targeting the same device ID to prevent BLE collisions", async () => {
    const ha = new HomeAssistant("ws://127.0.0.1:8123", "test-token", 0, 0);
    // Populate mock entities map
    ha.hassEntities.set("fan.ble_fan", {
      id: "ent-1",
      entity_id: "fan.ble_fan",
      device_id: "dev-ble-combo",
    } as any);
    ha.hassEntities.set("light.ble_light", {
      id: "ent-2",
      entity_id: "light.ble_light",
      device_id: "dev-ble-combo",
    } as any);
    ha.hassEntities.set("switch.other", {
      id: "ent-3",
      entity_id: "switch.other",
      device_id: "dev-other",
    } as any);

    const executionOrder: string[] = [];
    (ha as any).connected = true;
    (ha as any).ws = { readyState: 1, send: () => {} };

    // Mock request to record order and simulate async completion
    (ha as any).request = async (req: any) => {
      const target = req.target?.entity_id;
      executionOrder.push(`start:${target}`);
      await new Promise((r) => setTimeout(r, 20));
      executionOrder.push(`end:${target}`);
      return { success: true, result: { context: {}, response: {} } };
    };

    // Dispatch fan and light commands simultaneously (same device) and switch command (different device)
    const pFan = ha.callService("fan", "turn_on", "fan.ble_fan");
    const pLight = ha.callService("light", "turn_on", "light.ble_light");
    const pOther = ha.callService("switch", "turn_on", "switch.other");

    await Promise.all([pFan, pLight, pOther]);

    // Verify that fan and light executed strictly in series (start:fan -> end:fan -> start:light -> end:light)
    const fanStartIndex = executionOrder.indexOf("start:fan.ble_fan");
    const fanEndIndex = executionOrder.indexOf("end:fan.ble_fan");
    const lightStartIndex = executionOrder.indexOf("start:light.ble_light");
    const lightEndIndex = executionOrder.indexOf("end:light.ble_light");

    expect(fanStartIndex).toBeLessThan(fanEndIndex);
    expect(fanEndIndex).toBeLessThan(lightStartIndex);
    expect(lightStartIndex).toBeLessThan(lightEndIndex);
  });

  it("recovers the BLE device queue after a failed service call", async () => {
    const ha = new HomeAssistant("ws://127.0.0.1:8123", "test-token", 0, 0);
    ha.hassEntities.set("fan.ble_fan", {
      id: "ent-1",
      entity_id: "fan.ble_fan",
      device_id: "dev-ble-combo",
    } as any);

    let calls = 0;
    (ha as any).request = async () => {
      calls++;
      if (calls === 1) throw new Error("BLE service timeout");
      return { success: true, result: { context: {}, response: {} } };
    };

    await expect(
      ha.callService("fan", "turn_on", "fan.ble_fan"),
    ).rejects.toThrow("BLE service timeout");
    await expect(
      ha.callService("fan", "turn_off", "fan.ble_fan"),
    ).resolves.toEqual({
      context: {},
      response: {},
    });
  });
});

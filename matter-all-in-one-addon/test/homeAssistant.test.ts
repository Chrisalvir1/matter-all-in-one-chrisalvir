import { afterEach, describe, expect, it } from 'vitest';
import net, { type Server, type Socket } from 'node:net';
import { HomeAssistant } from '../src/homeAssistant.js';

/** Returns true when the OS allows binding a TCP server on loopback. */
async function canBindLoopback(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(false));
    s.listen(0, '127.0.0.1', () => s.close(() => resolve(true)));
  });
}

describe('HomeAssistant connection recovery', () => {
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

  it('abandons a half-open WebSocket handshake instead of blocking reconnects', async (ctx) => {
    if (!(await canBindLoopback())) {
      ctx.skip();
      return;
    }
    server = net.createServer((socket) => sockets.add(socket));
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('TCP test server did not expose a port');

    const ha = new HomeAssistant(`ws://127.0.0.1:${address.port}`, 'test-token', 0, 0, undefined, false, 0.05);
    ha.on('error', () => undefined);

    await expect(ha.connect()).rejects.toThrow('connection timed out');
    expect(ha.connected).toBe(false);
  });

  it('propagates snapshot failures so an incomplete recovery is not reported as healthy', async () => {
    const ha = new HomeAssistant('ws://127.0.0.1:1', 'test-token', 0, 0);
    await expect(ha.fetchData()).rejects.toThrow('not connected to Home Assistant');
  });
});

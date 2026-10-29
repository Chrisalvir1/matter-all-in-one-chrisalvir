import { createSocket } from "node:dgram";
import { isIP } from "node:net";
/** UDP connect asks the kernel for its route without sending a packet. */
export async function routeAddress(
  target: string,
  port: number,
): Promise<string> {
  const address = target.startsWith("::ffff:") ? target.slice(7) : target;
  const family = isIP(address.split("%")[0]);
  if (!family || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid controller endpoint");
  const socket = createSocket(family === 4 ? "udp4" : "udp6");
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.connect(port, address, resolve);
    });
    const local = socket.address();
    if (typeof local === "string") throw new Error("No controller route");
    return local.address;
  } finally {
    try {
      socket.close();
    } catch {}
  }
}

import { createSocket, type Socket } from "node:dgram";
import { routeAddress } from "./route-address.js";
/** A bounded transparent RTP/RTCP relay. It never stores packets or credentials. */
export class RtpDatagramRelay {
  readonly input: Socket = createSocket("udp4");
  readonly output: Socket;
  readonly address: string;
  inputPort = 0;
  outputPort = 0;
  private rtcpProducerPort?: number;
  private closed = false;
  private first = false;
  private constructor(
    readonly target: string,
    readonly port: number,
    address: string,
    readonly onFirst?: () => void,
    readonly transform?: (packet: Buffer) => Buffer[],
    readonly feedback?: (packet: Buffer) => Buffer | undefined,
    readonly onFailure?: (error: Error) => void,
  ) {
    this.address = address;
    this.output = createSocket(address.includes(":") ? "udp6" : "udp4");
  }
  static async create(
    target: string,
    port: number,
    onFirst?: () => void,
    transform?: (packet: Buffer) => Buffer[],
    feedback?: (packet: Buffer) => Buffer | undefined,
    onFailure?: (error: Error) => void,
  ) {
    target = target.startsWith("::ffff:") ? target.slice(7) : target;
    const relay = new RtpDatagramRelay(
      target,
      port,
      await routeAddress(target, port),
      onFirst,
      transform,
      feedback,
      onFailure,
    );
    const bind = (socket: Socket, address: string) =>
      new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind(0, address, () => {
          socket.removeListener("error", reject);
          resolve();
        });
      });
    try {
      await bind(relay.input, "127.0.0.1");
      await bind(relay.output, relay.address);
      const input = relay.input.address(),
        output = relay.output.address();
      if (typeof input === "string" || typeof output === "string")
        throw new Error("RTP socket unavailable");
      relay.inputPort = input.port;
      relay.outputPort = output.port;
      relay.input.on("message", (packet, remote) => {
        if (relay.closed || packet.length < 8) return;
        const rtcp = packet[1] >= 192 && packet[1] <= 223;
        if (rtcp) relay.rtcpProducerPort = remote.port;
        let packets: Buffer[];
        try {
          packets = relay.transform ? relay.transform(packet) : [packet];
        } catch {
          return;
        }
        for (const value of packets)
          relay.output.send(value, relay.port, relay.target, (error) => {
            if (error) {
              relay.onFailure?.(new Error("RTP socket send failed"));
              relay.close();
              return;
            }
            if (!rtcp && !relay.first) {
              relay.first = true;
              relay.onFirst?.();
            }
          });
      });
      relay.output.on("message", (packet) => {
        if (relay.closed || !relay.rtcpProducerPort) return;
        try {
          const value = relay.feedback ? relay.feedback(packet) : packet;
          if (value)
            relay.input.send(
              value,
              relay.rtcpProducerPort,
              "127.0.0.1",
              () => {},
            );
        } catch {
          /* Authentication failure is discarded before forwarding. */
        }
      });
      for (const socket of [relay.input, relay.output]) {
        socket.on("error", () => {
          relay.onFailure?.(new Error("RTP socket failure"));
          relay.close();
        });
        socket.unref();
      }
      return relay;
    } catch (error) {
      relay.close();
      throw error;
    }
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const socket of [this.input, this.output]) {
      socket.removeAllListeners("message");
      try {
        socket.close();
      } catch {}
    }
  }
}

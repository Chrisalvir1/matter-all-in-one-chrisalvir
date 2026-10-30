import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
const f = vi.hoisted(() => ({
  client: undefined as any,
  pc: undefined as any,
}));
vi.mock("mqtt", () => ({ connectAsync: vi.fn(async () => f.client) }));
vi.mock("werift", () => {
  class Signal {
    handlers: Function[] = [];
    subscribe(fn: Function) {
      this.handlers.push(fn);
    }
    emit(...a: unknown[]) {
      this.handlers.forEach((fn) => fn(...a));
    }
  }
  return {
    RTCRtpCodecParameters: class {
      constructor(values: any) {
        Object.assign(this, values);
      }
    },
    MediaStreamTrack: class {
      stop = vi.fn();
      writeRtp = vi.fn();
    },
    RTCPeerConnection: class {
      onTrack = new Signal();
      onIceCandidate = new Signal();
      connectionStateChange = new Signal();
      connectionState = "new";
      localDescription = { type: "offer", sdp: "offer-with-secret" };
      setRemoteDescription = vi.fn(async () => {});
      addIceCandidate = vi.fn(async () => {});
      constructor() {
        f.pc = this;
      }
      addTransceiver() {}
      async createOffer() {
        return this.localDescription;
      }
      async setLocalDescription() {}
      async close() {
        this.connectionStateChange.emit("closed");
      }
    },
  };
});
import {
  TuyaWebRtcSession,
  type TuyaWebRtcBundle,
} from "../src/camera/tuya-webrtc-session.js";
const bundle: TuyaWebRtcBundle = {
  deviceId: "device",
  auth: "secret",
  motoId: "moto",
  audioAttributes: { call_mode: [1, 2], hardware_capability: [1, 2] },
  iceServers: [],
  mqtt: {
    url: "ssl://broker.invalid:8883",
    username: "user",
    password: "secret",
    client_id: "id",
    source_topic: { ipc: "/av/u/controller" },
    sink_topic: { ipc: "/av/moto/moto_id/u/{device_id}" },
    expire_time: 120,
  },
};
function broker() {
  const client = new EventEmitter() as any;
  client.connected = true;
  client.publishAsync = vi.fn(async () => {});
  client.subscribeAsync = vi.fn(async () => [{ qos: 1 }]);
  client.end = vi.fn();
  f.client = client;
  return client;
}
describe("Tuya WebRTC signaling", () => {
  it("subscribes before sending the authenticated offer and filters other sessions", async () => {
    const client = broker();
    const session = new TuyaWebRtcSession(bundle);
    await session.start();
    const [topic, body] = client.publishAsync.mock.calls[0];
    const offer = JSON.parse(body);
    expect(topic).toBe("/av/moto/moto/u/device");
    expect(offer.data.header.from).toBe("controller");
    expect(offer.data.msg).toMatchObject({ mode: "webrtc", auth: "secret" });
    client.emit(
      "message",
      "topic",
      Buffer.from(
        JSON.stringify({
          data: {
            header: { from: "device", sessionid: "unrelated", type: "answer" },
            msg: { sdp: "bad" },
          },
        }),
      ),
    );
    expect(f.pc.setRemoteDescription).not.toHaveBeenCalled();
    client.emit(
      "message",
      "topic",
      Buffer.from(
        JSON.stringify({
          data: {
            header: {
              from: "device",
              sessionid: offer.data.header.sessionid,
              type: "answer",
            },
            msg: { sdp: "answer" },
          },
        }),
      ),
    );
    await Promise.resolve();
    expect(f.pc.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "answer",
    });
    await session.close();
    await session.close();
    expect(client.end).toHaveBeenCalledOnce();
    expect(
      JSON.parse(client.publishAsync.mock.calls.at(-1)[1]).data.header.type,
    ).toBe("disconnect");
  });
  it("refuses to promise return audio without the actual capability", async () => {
    const session = new TuyaWebRtcSession({
      ...bundle,
      audioAttributes: { call_mode: [1], hardware_capability: [1] },
    });
    await expect(session.start()).rejects.toThrow("two-way audio");
  });
  it("bounds close when the Tuya broker is already disconnected", async () => {
    const client = broker();
    const session = new TuyaWebRtcSession(bundle);
    await session.start();
    client.connected = false;
    await session.close();
    expect(client.end).toHaveBeenCalledOnce();
    expect(client.publishAsync).toHaveBeenCalledOnce();
  });
});

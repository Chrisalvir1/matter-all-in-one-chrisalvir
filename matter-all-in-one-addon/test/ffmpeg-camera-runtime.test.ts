import { SrtpSession, SrtcpSession } from "werift";
import { describe, it, expect, vi } from "vitest";
import { existsSync } from "node:fs";
import { createSocket } from "node:dgram";
import { spawn } from "node:child_process";
const binary =
  process.env.MIAO_TEST_FFMPEG ||
  "/Applications/camera.ui.app/Contents/Resources/app/node_modules/node-av/binary/ffmpeg";
describe("real FFmpeg camera runtime (synthetic local inputs only)", () => {
  it.runIf(existsSync(binary))(
    "functionally encodes AAC-ELD and H264 rather than trusting encoder lists",
    async () => {
      const helper = await vi.importActual<
        typeof import("../src/camera/homekit/ffmpeg-helper.js")
      >("../src/camera/homekit/ffmpeg-helper.js");
      const policy = await vi.importActual<
        typeof import("../src/camera/homekit/media-policy.js")
      >("../src/camera/homekit/media-policy.js");
      const before = process.env.FFMPEG_PATH;
      try {
        process.env.FFMPEG_PATH = binary;
        expect(helper.supportsFdkAac()).toBe(true);
        expect(policy.verifiedH264Encoder(binary)).toMatch(
          /libx264|h264_videotoolbox/,
        );
      } finally {
        if (before === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = before;
      }
    },
  );
  it.runIf(existsSync(binary))(
    "emits mono AAC-ELD RTP clocked at 24k with 480-sample packets",
    async () => {
      const key = Buffer.alloc(16, 0x51),
        salt = Buffer.alloc(14, 0x31);
      const keys = {
        localMasterKey: key,
        localMasterSalt: salt,
        remoteMasterKey: key,
        remoteMasterSalt: salt,
      };
      const receiver = new SrtpSession({ profile: 1, keys });
      const rtcp = new SrtcpSession({ profile: 1, keys });
      const reports: Buffer[] = [];
      const socket = createSocket("udp4"),
        packets: Buffer[] = [];
      socket.on("message", (p) => {
        if (p.length > 12 && p[1] !== 200 && p[1] !== 201)
          packets.push(receiver.decrypt(p));
        else if (p.length > 12) reports.push(rtcp.decrypt(p));
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("error", reject);
        socket.bind(0, "127.0.0.1", resolve);
      });
      const address = socket.address();
      if (typeof address === "string") throw new Error("UDP bind failed");
      const child = spawn(
        binary,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-re",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=24000",
          "-t",
          "1",
          "-c:a",
          "libfdk_aac",
          "-profile:a",
          "aac_eld",
          "-frame_length",
          "480",
          "-ac",
          "1",
          "-ar",
          "24000",
          "-b:a",
          "48k",
          "-flags:a",
          "+global_header",
          "-f",
          "rtp",
          "-max_delay",
          "0",
          "-flush_packets",
          "1",
          "-payload_type",
          "110",
          "-ssrc",
          "1234",
          "-srtp_out_suite",
          "AES_CM_128_HMAC_SHA1_80",
          "-srtp_out_params",
          Buffer.concat([key, salt]).toString("base64"),
          `srtp://127.0.0.1:${address.port}?rtcpport=${address.port}&pkt_size=188`,
        ],
        { stdio: "ignore" },
      );
      try {
        const code = await new Promise<number | null>((resolve, reject) => {
          const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            reject(new Error("Encoder timed out"));
          }, 5000);
          child.once("error", (e) => {
            clearTimeout(timeout);
            reject(e);
          });
          child.once("close", (code) => {
            clearTimeout(timeout);
            resolve(code);
          });
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(code).toBe(0);
        expect(packets.length).toBeGreaterThan(40);
        expect(reports.length).toBeGreaterThan(0);
        expect(reports[0][1]).toBe(200);
        expect(
          packets.every(
            (p) => (p[1] & 127) === 110 && p.readUInt32BE(8) === 1234,
          ),
        ).toBe(true);
        expect(
          new Set(packets.map((p) => p.readUInt32BE(4))).size,
        ).toBeGreaterThan(40);
        for (let i = 1; i < packets.length; i++) {
          expect(
            (packets[i].readUInt16BE(2) - packets[i - 1].readUInt16BE(2)) &
              65535,
          ).toBe(1);
          expect(
            (packets[i].readUInt32BE(4) - packets[i - 1].readUInt32BE(4)) >>> 0,
          ).toBeOneOf([0, 480]);
        }
      } finally {
        child.kill("SIGKILL");
        socket.close();
      }
    },
  );
});

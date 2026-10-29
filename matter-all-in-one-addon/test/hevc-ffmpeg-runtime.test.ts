import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { SrtpSession, RtpPacket } from "werift";
import { MultiTierRtpDelegate } from "../src/camera/homekit/hevc/multi-tier-rtp.js";
import { Fmp4Segmenter } from "../src/camera/homekit/fmp4-parser.js";
const binary =
  "/Applications/camera.ui.app/Contents/Resources/app/node_modules/node-av/binary/ffmpeg";
describe("native HEVC engine with a local synthetic source", () => {
  it.runIf(existsSync(binary))(
    "sends authenticated HEVC RTP and HDS fMP4 from one actual FFmpeg reader",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "miao-hevc-")),
        file = join(dir, "source.mp4"),
        before = process.env.FFMPEG_PATH;
      const controller = createSocket("udp4"),
        key = Buffer.alloc(16, 0x45),
        salt = Buffer.alloc(14, 0x73);
      const caps: any = {
        videoCodec: "hevc",
        hasAudio: true,
        audioCodec: "aac_lc",
        audioSampleRate: 48000,
        audioChannels: 1,
        resolution: { width: 64, height: 64 },
        maxFps: 15,
      };
      const audioController = createSocket("udp4");
      const d = new MultiTierRtpDelegate(
        {},
        "camera.synthetic",
        caps,
        {
          url: file,
          sourceType: "rtsp",
          supportsPassthrough: true,
          requiresBridge: false,
        },
        {
          videoTiers: [
            { identifier: 1, width: 64, height: 64, frameRate: 15 } as any,
          ],
          audioTier: { identifier: 1 } as any,
          videoPayloadType: 99,
          audioPayloadType: 110,
        },
      );
      try {
        const generated = spawnSync(
          binary,
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=64x64:rate=15",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=440:sample_rate=48000",
            "-t",
            "12",
            "-c:v",
            "libx265",
            "-x265-params",
            "pools=1:keyint=30:log-level=error",
            "-tag:v",
            "hvc1",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "1",
            file,
          ],
          { timeout: 15000, stdio: "ignore" },
        );
        expect(generated.status).toBe(0);
        process.env.FFMPEG_PATH = binary;
        controller.bind(0, "127.0.0.1");
        await once(controller, "listening");
        const port = (controller.address() as { port: number }).port;
        audioController.bind(0, "127.0.0.1");
        await once(audioController, "listening");
        const audioPort = (audioController.address() as { port: number }).port;
        const rx = new SrtpSession({
          profile: 1,
          keys: {
            localMasterKey: key,
            localMasterSalt: salt,
            remoteMasterKey: key,
            remoteMasterSalt: salt,
          },
        });
        const packets: RtpPacket[] = [];
        const audioPackets: RtpPacket[] = [];
        audioController.on("message", (p) => {
          if ((p[1] & 127) === 110)
            audioPackets.push(RtpPacket.deSerialize(rx.decrypt(p)));
        });
        controller.on("message", (p) => {
          if ((p[1] & 127) === 99)
            packets.push(RtpPacket.deSerialize(rx.decrypt(p)));
        });
        const parser = new Fmp4Segmenter();
        let init: Buffer | undefined;
        const fragments: Buffer[] = [];
        parser.on("initialization", (b) => {
          init = b;
        });
        parser.on("fragment", (f) => fragments.push(f.data));
        d.on("recording-data", (b) => parser.push(b));
        await d.prepareStream({
          sessionIdentifier: "actual",
          addressVersion: "ipv4",
          targetAddress: "127.0.0.1",
          sourceAddress: "127.0.0.1",
          controllerVideoPort: port,
          controllerAudioPort: audioPort,
          video: { cryptoSuite: 0, masterKey: key, masterSalt: salt },
          audio: { cryptoSuite: 0, masterKey: key, masterSalt: salt },
        });
        const ended = once(d, "session-end", {
          signal: AbortSignal.timeout(10000),
        });
        await d.startStream({
          sessionIdentifier: "actual",
          videoTier: 1,
          videoSSRC: 1234,
          audioTier: 1,
          audioSSRC: 4321,
        });
        await ended;
        await new Promise((r) => setTimeout(r, 30));
        expect(packets.length).toBeGreaterThan(20);
        expect(audioPackets.length).toBeGreaterThan(20);
        expect(audioPackets.every((p) => p.header.ssrc === 4321)).toBe(true);
        for (let i = 1; i < audioPackets.length; i++)
          expect(
            (audioPackets[i].header.timestamp -
              audioPackets[i - 1].header.timestamp) >>>
              0,
          ).toBe(960);
        const timing = d.getStartupDiagnostics().recent[0].timing;
        expect(timing?.stages.T5).toBeGreaterThan(0);
        expect(timing?.stages.T6).toBeGreaterThan(0);
        if (process.env.MIAO_CAMERA_TEST_METRICS)
          console.info("AUDIT_CAMERA_STARTUP", JSON.stringify(timing));
        expect(packets.every((p) => p.header.ssrc === 1234)).toBe(true);
        expect(init?.includes(Buffer.from("hvc1"))).toBe(true);
        expect(init?.includes(Buffer.from("mp4a"))).toBe(true);
        expect(fragments.length).toBeGreaterThanOrEqual(2);
        const decoded = spawnSync(
          binary,
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-progress",
            "pipe:1",
            "-f",
            "null",
            "-",
          ],
          { input: Buffer.concat([init!, ...fragments]), timeout: 10000 },
        );
        expect(decoded.status).toBe(0);
        expect(decoded.stdout.toString()).toContain("progress=end");
        expect(
          fragments.every(
            (f) =>
              f.includes(Buffer.from("moof")) &&
              f.includes(Buffer.from("mdat")) &&
              f.includes(Buffer.from("tfdt")) &&
              f.includes(Buffer.from("trun")),
          ),
        ).toBe(true);
      } finally {
        await d.stopAll();
        try {
          audioController.close();
        } catch {}
        try {
          controller.close();
        } catch {}
        if (before === undefined) delete process.env.FFMPEG_PATH;
        else process.env.FFMPEG_PATH = before;
        rmSync(dir, { recursive: true, force: true });
      }
    },
    20000,
  );
});

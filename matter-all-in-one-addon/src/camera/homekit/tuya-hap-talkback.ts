import { createSocket, type Socket } from "node:dgram";
import { isIP } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import {
  AudioStreamingCodecType,
  type StartStreamRequest,
} from "@homebridge/hap-nodejs";
import { resolveFfmpegPath } from "./ffmpeg-helper.js";
import {
  TuyaWebRtcSession,
  type TuyaWebRtcBundle,
} from "../tuya-webrtc-session.js";

/** SRTP from Casa -> in-memory SDP/FFmpeg -> PCMU RTP -> Tuya WebRTC. */
export class TuyaHapTalkback {
  private static readonly MAX_QUEUED_RTP_PACKETS = 300;
  private static readonly MAX_QUEUED_RTP_AGE_MS = 6000;
  private input?: Socket;
  private output?: Socket;
  private loopbackSender = createSocket("udp4");
  private decoder?: ChildProcess;
  private peer?: TuyaWebRtcSession;
  private stopped = false;
  private starting = false;
  private outboundFlushTimer?: NodeJS.Timeout;
  private lastOutboundTimestamp?: number;
  private audio?: StartStreamRequest["audio"];
  private inboundQueue: Array<{ packet: Buffer; receivedAt: number }> = [];
  private outboundQueue: Array<{ packet: Buffer; receivedAt: number }> = [];
  private inboundDropped = 0;
  private outboundDropped = 0;
  private decoderOutputPackets = 0;
  private decoderExitCode?: number | null;
  receivedPackets = 0;
  forwardedPackets = 0;
  constructor(
    private readonly address: string,
    private readonly keySalt: Buffer,
    private readonly allocate: () => Promise<TuyaWebRtcBundle>,
    private readonly notice: (message: string) => void,
  ) {}
  async prepare(): Promise<number> {
    const family = isIP(this.address.split("%")[0]) === 6 ? "udp6" : "udp4";
    const input = createSocket(family);
    this.input = input;
    input.on("error", () => {
      this.notice("Return audio socket failed");
      this.close();
    });
    await new Promise<void>((resolve, reject) => {
      input.once("error", reject);
      input.bind(
        0,
        family === "udp6"
          ? "::"
          : this.address === "127.0.0.1"
            ? "127.0.0.1"
            : "0.0.0.0",
        () => {
          input.off("error", reject);
          resolve();
        },
      );
    });
    input.on("message", (bytes) => {
      if (this.stopped || !this.audio) return;
      this.pushRtp(bytes);
    });
    const local = input.address();
    return typeof local === "string" ? 0 : local.port;
  }
  /** Called only with authenticated, decrypted RTP by the Matter peer. */
  pushRtp(bytes: Buffer): void {
    if (
      this.stopped ||
      !this.audio ||
      bytes.length < 12 ||
      bytes[0] >> 6 !== 2 ||
      (bytes[1] >= 192 && bytes[1] <= 223) ||
      (bytes[1] & 127) !== this.audio.pt
    )
      return;
    this.receivedPackets++;
    if (!this.starting) {
      this.starting = true;
      void this.start().catch((err) => {
        this.notice(`Tuya return audio could not start: ${err?.message || err}`);
        this.close();
      });
    }
    if (this.decoderPort) {
      this.sendToDecoder(bytes);
    } else {
      this.inboundQueue.push({
        packet: Buffer.from(bytes),
        receivedAt: Date.now(),
      });
      this.trimQueue(this.inboundQueue, "inbound");
    }
  }
  configure(audio: StartStreamRequest["audio"]): void {
    this.audio = audio;
    if (!this.starting && !this.stopped) {
      this.starting = true;
      void this.start().catch((err) => {
        this.notice(`Tuya return audio could not start: ${err?.message || err}`);
        this.close();
      });
    }
  }
  private decoderPort?: number;
  private async start(): Promise<void> {
    const bundle = await this.allocate();
    if (this.stopped) return;
    const peer = new TuyaWebRtcSession(bundle);
    this.peer = peer;
    peer.on("closed", () => this.close());
    peer.on("failure", () => {
      this.notice("Tuya return audio connection failed");
      this.close();
    });
    peer.on("state", (state) => {
      if (state === "connected") {
        this.notice("Tuya return audio connected");
        this.flushOutboundQueue();
      }
    });
    const output = createSocket("udp4");
    this.output = output;
    output.on("error", () => this.close());
    await new Promise<void>((resolve) => output.bind(0, "127.0.0.1", resolve));
    if (this.stopped) {
      output.close();
      return;
    }
    output.on("message", (bytes) => {
      if (this.stopped) return;
      this.decoderOutputPackets++;
      if (
        !this.outboundQueue.length &&
        !this.outboundFlushTimer &&
        peer.sendAudioRtp(bytes)
      ) {
        this.forwardedPackets++;
        return;
      }
      this.outboundQueue.push({
        packet: Buffer.from(bytes),
        receivedAt: Date.now(),
      });
      this.trimQueue(this.outboundQueue, "outbound");
    });
    const outAddress = output.address();
    if (typeof outAddress === "string")
      throw new Error("Missing RTP output port");
    const reservation = createSocket("udp4");
    await new Promise<void>((resolve) =>
      reservation.bind(0, "127.0.0.1", resolve),
    );
    const local = reservation.address();
    if (typeof local === "string") throw new Error("Missing decoder port");
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    if (this.stopped) return;
    const audio = this.audio!;
    const opus = audio.codec === AudioStreamingCodecType.OPUS;
    const sampleRate = Number(audio.sample_rate) * 1000;
    if (
      !(opus ? [16000, 24000, 48000] : [16000, 24000]).includes(sampleRate) ||
      !(opus ? [1, 2] : [1]).includes(Number(audio.channel || 1))
    )
      throw new Error("Unsupported return audio format");
    const config = sampleRate === 24000 ? "F8EC212C00BC00" : "F8F0212C00BC00";
    const lines = [
      "v=0",
      "o=- 0 0 IN IP4 127.0.0.1",
      "s=Return audio",
      "c=IN IP4 127.0.0.1",
      "t=0 0",
      `m=audio ${local.port} ${this.keySalt.length ? "RTP/SAVP" : "RTP/AVP"} ${audio.pt}`,
      `a=rtpmap:${audio.pt} ${opus ? "opus" : "MPEG4-GENERIC"}/${sampleRate}/${audio.channel || 1}`,
      "a=rtcp-mux",
      ...(opus
        ? []
        : [
            `a=fmtp:${audio.pt} profile-level-id=1;mode=AAC-hbr;sizelength=13;indexlength=3;indexdeltalength=3;config=${config}`,
          ]),
      ...(this.keySalt.length
        ? [
            `a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:${this.keySalt.toString("base64")}`,
          ]
        : []),
    ];
    const ffmpeg = resolveFfmpegPath();
    if (!ffmpeg) throw new Error("No audio decoder");
    this.decoder = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "pipe,udp,rtp,crypto",
        "-f",
        "sdp",
        "-i",
        "pipe:0",
        "-vn",
        "-c:a",
        "pcm_mulaw",
        "-ar",
        "8000",
        "-ac",
        "1",
        "-payload_type",
        "0",
        "-f",
        "rtp",
        `rtp://127.0.0.1:${outAddress.port}?pkt_size=200`,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let decoderError = "";
    this.decoder.stderr?.on("data", (chunk: Buffer) => {
      // Keep diagnostics useful without ever exposing an SDP key or a source URL.
      decoderError = `${decoderError}${chunk.toString()}`.slice(-512);
    });
    this.decoder.on("error", (error) => {
      this.notice(`Return audio decoder failed (${error.name})`);
      this.close();
    });
    this.decoder.on("close", (code) => {
      this.decoderExitCode = code;
      if (!this.stopped && code !== 0) {
        const reason = /decoder|codec|invalid|error/i.test(decoderError)
          ? "decode-error"
          : "process-exit";
        this.notice(`Return audio decoder stopped (${reason}, exit=${code})`);
      }
      this.close();
    });
    this.decoder.stdin?.on("error", () => this.close());
    this.decoder.stdin?.end(lines.join("\r\n") + "\r\n");
    this.decoderPort = local.port;
    this.flushInboundQueue();
    await peer.start();
  }

  private sendToDecoder(packet: Buffer): void {
    if (!this.decoderPort || this.stopped) return;
    this.loopbackSender.send(packet, this.decoderPort, "127.0.0.1", (err) => {
      if (err) this.notice(`Loopback send failed: ${err.message}`);
    });
  }

  private trimQueue(
    queue: Array<{ packet: Buffer; receivedAt: number }>,
    direction: "inbound" | "outbound",
  ): void {
    const cutoff = Date.now() - TuyaHapTalkback.MAX_QUEUED_RTP_AGE_MS;
    while (
      queue.length &&
      (queue[0].receivedAt < cutoff ||
        queue.length > TuyaHapTalkback.MAX_QUEUED_RTP_PACKETS)
    ) {
      queue.shift();
      if (direction === "inbound") this.inboundDropped++;
      else this.outboundDropped++;
    }
  }

  private flushInboundQueue(): void {
    this.trimQueue(this.inboundQueue, "inbound");
    for (const entry of this.inboundQueue) this.sendToDecoder(entry.packet);
    this.inboundQueue = [];
  }

  private flushOutboundQueue(): void {
    const peer = this.peer;
    if (!peer || this.stopped || this.outboundFlushTimer) return;
    this.trimQueue(this.outboundQueue, "outbound");
    const entry = this.outboundQueue.shift();
    if (!entry) return;
    const timestamp = entry.packet.length >= 8
      ? entry.packet.readUInt32BE(4)
      : undefined;
    const timestampDelta =
      timestamp === undefined || this.lastOutboundTimestamp === undefined
        ? 0
        : (timestamp - this.lastOutboundTimestamp) >>> 0;
    const delayMs = timestampDelta
      ? Math.max(10, Math.min(60, Math.round((timestampDelta / 8000) * 1000)))
      : 0;
    const send = () => {
      this.outboundFlushTimer = undefined;
      if (this.stopped) return;
      if (peer.sendAudioRtp(entry.packet)) this.forwardedPackets++;
      else this.outboundDropped++;
      if (timestamp !== undefined) this.lastOutboundTimestamp = timestamp;
      this.flushOutboundQueue();
    };
    if (delayMs === 0) send();
    else {
      this.outboundFlushTimer = setTimeout(send, delayMs);
      this.outboundFlushTimer.unref?.();
    }
  }

  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.notice(
      `Tuya return audio summary received=${this.receivedPackets} decoded=${this.decoderOutputPackets} forwarded=${this.forwardedPackets} dropped=${this.inboundDropped + this.outboundDropped}${this.decoderExitCode === undefined ? "" : ` decoderExit=${this.decoderExitCode}`}`,
    );
    this.inboundQueue = [];
    this.outboundQueue = [];
    if (this.outboundFlushTimer) clearTimeout(this.outboundFlushTimer);
    this.outboundFlushTimer = undefined;
    this.decoderPort = undefined;
    this.decoder?.kill("SIGKILL");
    try {
      this.input?.close();
    } catch {}
    try {
      this.loopbackSender?.close();
    } catch {}
    try {
      this.output?.close();
    } catch {}
    void this.peer?.close();
  }
}

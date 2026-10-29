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
  private input?: Socket;
  private output?: Socket;
  private decoder?: ChildProcess;
  private peer?: TuyaWebRtcSession;
  private stopped = false;
  private starting = false;
  private audio?: StartStreamRequest["audio"];
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
    input.on("message", (bytes, remote) => {
      if (
        this.stopped ||
        !this.audio ||
        remote.address.replace(/^::ffff:/, "") !==
          this.address.replace(/^::ffff:/, "")
      )
        return;
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
      void this.start().catch(() => {
        this.notice("Tuya return audio could not start");
        this.close();
      });
    }
    if (this.decoderPort)
      this.input?.send(bytes, this.decoderPort, "127.0.0.1");
  }
  configure(audio: StartStreamRequest["audio"]): void {
    this.audio = audio;
  }
  private decoderPort?: number;
  private async start(): Promise<void> {
    const bundle = await this.allocate();
    if (this.stopped) return;
    const peer = new TuyaWebRtcSession(bundle);
    this.peer = peer;
    peer.on("failure", () => {
      this.notice("Tuya return audio connection failed");
      this.close();
    });
    peer.on("state", (state) => {
      if (state === "connected") this.notice("Tuya return audio connected");
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
      if (!this.stopped) {
        if (peer.sendAudioRtp(bytes)) this.forwardedPackets++;
      }
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
        ...(opus ? [] : ["-c:a", "libfdk_aac"]),
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
      { stdio: ["pipe", "ignore", "ignore"] },
    );
    this.decoder.on("error", () => {
      this.notice("Return audio decoder failed");
      this.close();
    });
    this.decoder.on("close", () => this.close());
    this.decoder.stdin?.on("error", () => this.close());
    this.decoder.stdin?.end(lines.join("\r\n") + "\r\n");
    this.decoderPort = local.port;
    await peer.start();
  }
  close(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.decoderPort = undefined;
    this.decoder?.kill("SIGKILL");
    try {
      this.input?.close();
    } catch {}
    try {
      this.output?.close();
    } catch {}
    void this.peer?.close();
  }
}

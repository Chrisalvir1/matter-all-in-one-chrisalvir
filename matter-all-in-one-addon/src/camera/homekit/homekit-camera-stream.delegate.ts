import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import {
  AudioStreamingCodecType,
  AudioStreamingSamplerate,
  CameraController,
  CameraStreamingDelegate,
  H264Level,
  H264Profile,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  ReconfigureStreamRequest,
  SnapshotRequest,
  SnapshotRequestCallback,
  SRTPCryptoSuites,
  StartStreamRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  StreamingRequest,
} from "hap-nodejs";
import { spawn, type ChildProcess } from "node:child_process";
import dgram from "node:dgram";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
} from "../camera-types.js";
import {
  getFfmpegVersion,
  resolveFfmpegPath,
  sanitizeUrlCredentials,
  supportsFdkAac,
} from "./ffmpeg-helper.js";

export interface HomeKitStreamSession {
  sessionId: string;
  process?: ChildProcess;
  targetAddress: string;
  videoPort: number;
  localVideoPort: number;
  videoSsrc: number;
  videoCryptoSuite: SRTPCryptoSuites;
  videoKeySalt: Buffer;
  audioPort?: number;
  localAudioPort?: number;
  audioSsrc?: number;
  audioCryptoSuite?: SRTPCryptoSuites;
  audioKeySalt?: Buffer;
  retried?: boolean;
  pipeController?: AbortController;
}

const FALLBACK_JPEG_BUFFER = Buffer.from(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAPTGF2YzYwLjMuMTAwAP/bAEMACAYGBwYHCAgICAgICQkJCgoKCQkJCQoKCgoKCgwMDAoKCgoKCgoMDAwMDQ4NDQ0MDQ4ODw8PEhIRERUVFRkZH//EAEwAAQEAAAAAAAAAAAAAAAAAAAAHAQEBAAAAAAAAAAAAAAAAAAAAARABAAAAAAAAAAAAAAAAAAAAABEBAAAAAAAAAAAAAAAAAAAAAP/AABEIAPABQAMBIgACEQADEQD/2gAMAwEAAhEDEQA/AI2AoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=",
  "base64",
);

function isJpeg(buffer: Buffer): boolean {
  return (
    buffer.length > 128 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  );
}

function convertImageToJpeg(
  inputBuffer: Buffer,
  width?: number,
  height?: number,
): Promise<Buffer | null> {
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) return Promise.resolve(null);
  return new Promise<Buffer | null>((resolve) => {
    const scaleFilter =
      width && height
        ? `scale=w='min(${width},iw)':h='min(${height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`
        : undefined;
    const args = [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
    ];
    if (scaleFilter) {
      args.push("-vf", scaleFilter);
    }
    args.push("-f", "image2", "-c:v", "mjpeg", "-q:v", "3", "pipe:1");

    const proc = spawn(ffmpegPath, args, {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      resolve(null);
    }, 2000);

    proc.stdout?.on("data", (c: Buffer) => chunks.push(c));
    proc.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    proc.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        const out = Buffer.concat(chunks);
        if (isJpeg(out) && out.length > 256) {
          resolve(out);
          return;
        }
      }
      resolve(null);
    });

    try {
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write(inputBuffer);
        proc.stdin.end();
      }
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

function formatHost(address: string): string {
  // Strip IPv6 interface identifier like %en0 or %eth0 if present
  let cleanAddr = address;
  const pct = cleanAddr.indexOf("%");
  if (pct !== -1) {
    cleanAddr = cleanAddr.substring(0, pct);
  }
  // Strip IPv4-mapped IPv6 prefix (::ffff:192.168.x.x -> 192.168.x.x)
  cleanAddr = cleanAddr.replace(/^::ffff:/i, "");
  if (!cleanAddr.includes(":")) return cleanAddr;
  return cleanAddr.startsWith("[") ? cleanAddr : `[${cleanAddr}]`;
}

function suiteName(suite: SRTPCryptoSuites): string {
  return suite === SRTPCryptoSuites.AES_CM_256_HMAC_SHA1_80
    ? "AES_CM_256_HMAC_SHA1_80"
    : "AES_CM_128_HMAC_SHA1_80";
}

function h264Profile(profile: H264Profile): string {
  if (profile === H264Profile.HIGH) return "high";
  if (profile === H264Profile.MAIN) return "main";
  return "baseline";
}

function h264Level(level: H264Level): string {
  if (level === H264Level.LEVEL4_0) return "4.0";
  if (level === H264Level.LEVEL3_2) return "3.2";
  return "3.1";
}

export class HomeKitCameraStreamingDelegate
  extends EventEmitter
  implements CameraStreamingDelegate
{
  private readonly activeSessions = new Map<string, HomeKitStreamSession>();
  private lastSnapshotBuffer: Buffer = FALLBACK_JPEG_BUFFER;

  public get isStreaming(): boolean {
    return this.activeSessions.size > 0;
  }

  private isTakingSnapshot = false;
  private lastSnapshotTime = 0;

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly capabilities: CameraCapabilitiesInfo,
    private readonly streamSource: ResolvedStreamSource,
  ) {
    super();
    this.loadPersistedSnapshot();
  }

  private loadPersistedSnapshot(): void {
    try {
      const snapPath = `/data/snapshots/${this.entityId.replaceAll(".", "_")}.jpg`;
      if (fsSync.existsSync(snapPath)) {
        const buf = fsSync.readFileSync(snapPath);
        if (isJpeg(buf) && buf.length > 2048) {
          this.lastSnapshotBuffer = buf;
          this.lastSnapshotTime = Date.now();
        }
      }
    } catch {}
  }

  private async persistSnapshotToDisk(buffer: Buffer): Promise<void> {
    try {
      const dir = "/data/snapshots";
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }
      const snapPath = `${dir}/${this.entityId.replaceAll(".", "_")}.jpg`;
      await fs.writeFile(snapPath, buffer);
    } catch {}
  }

  public async handleSnapshotRequest(
    request: SnapshotRequest,
    callback: SnapshotRequestCallback,
  ): Promise<void> {
    const started = Date.now();
    let completed = false;
    const finish = (source: string, buffer: Buffer): void => {
      this.isTakingSnapshot = false;
      if (completed) return;
      completed = true;
      const selected =
        isJpeg(buffer) && buffer.length > 2048
          ? buffer
          : this.lastSnapshotBuffer;
      if (isJpeg(selected) && selected !== FALLBACK_JPEG_BUFFER) {
        this.lastSnapshotBuffer = selected;
        this.lastSnapshotTime = Date.now();
        void this.persistSnapshotToDisk(selected);
      }
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] Snapshot source=${source} bytes=${selected.length} duration=${Date.now() - started}ms validJpeg=${isJpeg(selected)}`,
      );
      callback(undefined, selected);
    };

    // NEVER open a competing RTSP connection while live viewing is active.
    // Cameras like Tapo allow max 2 RTSP connections; opening a 3rd connection kills the live stream.
    if (this.activeSessions.size > 0) {
      finish("active-session-protect", this.lastSnapshotBuffer);
      return;
    }

    // If a live stream is actively running, reuse last snapshot immediately to avoid RTSP socket contention
    if (
      this.activeSessions.size > 0 &&
      this.lastSnapshotBuffer &&
      this.lastSnapshotBuffer !== FALLBACK_JPEG_BUFFER
    ) {
      finish("cached-active-stream", this.lastSnapshotBuffer);
      return;
    }

    const now = Date.now();
    if (
      this.lastSnapshotBuffer &&
      this.lastSnapshotBuffer !== FALLBACK_JPEG_BUFFER &&
      (this.isTakingSnapshot || now - this.lastSnapshotTime < 5000)
    ) {
      finish("cached-session-guard", this.lastSnapshotBuffer);
      return;
    }

    this.isTakingSnapshot = true;

    try {
      let haEntityToQuery: string | undefined = this.entityId.startsWith("camera.")
        ? this.entityId
        : undefined;

      if (!haEntityToQuery && this.platform?.ha?.hassStates) {
        const cleanName = this.entityId.replace(/^scrypted\./, "").toLowerCase();
        const cameraModel = (this.streamSource.metadata?.model || "").toLowerCase();
        for (const [id, state] of this.platform.ha.hassStates.entries()) {
          if (!id.startsWith("camera.")) continue;
          const fn = (state.attributes?.friendly_name || "").toLowerCase();
          if (
            id.includes(cleanName) ||
            fn.includes(cleanName) ||
            (cameraModel && fn.includes(cameraModel))
          ) {
            haEntityToQuery = id;
            break;
          }
        }
      }

      if (
        haEntityToQuery &&
        this.platform?.ha?.fetchSnapshot &&
        typeof this.platform.ha.fetchSnapshot === "function"
      ) {
        try {
          const buffer = await this.platform.ha.fetchSnapshot(haEntityToQuery);
          if (buffer && isJpeg(buffer) && buffer.length > 512) {
            finish("ha-fetch-snapshot", buffer);
            return;
          } else if (buffer && isPng(buffer)) {
            const converted = await convertImageToJpeg(buffer, request.width, request.height);
            if (converted) {
              finish("ha-fetch-png-converted", converted);
              return;
            }
          }
        } catch {}
      }

      const snapshotUrl = this.streamSource.snapshotUrl;
      if (snapshotUrl?.startsWith("http://") || snapshotUrl?.startsWith("https://")) {
        try {
          const headers: Record<string, string> = {};
          const token =
            this.platform?.ha?.getAccessToken?.() ||
            this.platform?.ha?.wsAccessToken;
          if (token) {
            headers["Authorization"] = `Bearer ${token}`;
          }
          const response = await fetch(snapshotUrl, {
            headers,
            signal: AbortSignal.timeout(2500),
          });
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            if (isJpeg(buffer) && buffer.length > 512) {
              finish("http-snapshot", buffer);
              return;
            } else if (isPng(buffer)) {
              const converted = await convertImageToJpeg(buffer, request.width, request.height);
              if (converted) {
                finish("http-png-converted", converted);
                return;
              }
            }
          }
        } catch (error) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] Snapshot HTTP failed: ${String(error)}`,
          );
        }
      }

      const ffmpegPath = resolveFfmpegPath();
      const sourceUrl = this.getCleanSourceUrl();
      if (!ffmpegPath || !sourceUrl) {
        finish("fallback-no-source", this.lastSnapshotBuffer);
        return;
      }

      const args = ["-hide_banner", "-loglevel", "error"];
      if (sourceUrl.startsWith("rtsp://")) {
        args.push(
          "-probesize",
          "32768",
          "-analyzeduration",
          "0",
          "-rtsp_transport",
          "tcp",
          "-fflags",
          "+nobuffer+flush_packets",
          "-flags",
          "low_delay",
        );
      } else if (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
        args.push(
          "-probesize",
          "32768",
          "-analyzeduration",
          "0",
          "-fflags",
          "+nobuffer+flush_packets",
          "-flags",
          "low_delay",
        );
        const token =
          this.platform?.ha?.getAccessToken?.() ||
          this.platform?.ha?.wsAccessToken;
        if (token) {
          args.push("-headers", `Authorization: Bearer ${token}\r\n`);
        }
      }
      args.push(
        "-i",
        sourceUrl,
        "-frames:v",
        "1",
        "-vf",
        `scale=w='min(${request.width},iw)':h='min(${request.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
        "-f",
        "image2",
        "-q:v",
        "3",
        "pipe:1",
      );

      const process = spawn(ffmpegPath, args, {
        stdio: ["ignore", "pipe", "ignore"],
      });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        try {
          process.kill("SIGKILL");
        } catch {}
        finish("fallback-timeout", this.lastSnapshotBuffer);
      }, 3000);
      process.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      process.once("error", () => {
        clearTimeout(timer);
        finish("fallback-ffmpeg-error", this.lastSnapshotBuffer);
      });
      process.once("close", () => {
        clearTimeout(timer);
        const buffer = Buffer.concat(chunks);
        finish(
          isJpeg(buffer) && buffer.length > 2048
            ? "ffmpeg"
            : "fallback-invalid-jpeg",
          buffer,
        );
      });
    } catch (error) {
      this.platform?.log?.warn?.(
        `[HomeKitCamera][${this.entityId}] Snapshot fatal error: ${String(error)}`,
      );
      finish("fatal-error", this.lastSnapshotBuffer);
    }
  }

  public prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): void {
    void this.prepareStreamAsync(request, callback);
  }

  private async prepareStreamAsync(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): Promise<void> {
    try {
      const localVideoPort = await this.allocateUdpPort([
        request.video.port,
      ]);
      const localAudioPort = request.audio
        ? await this.allocateUdpPort([request.audio.port, localVideoPort])
        : undefined;
      const session: HomeKitStreamSession = {
        sessionId: request.sessionID,
        targetAddress: request.targetAddress,
        videoPort: request.video.port,
        localVideoPort,
        videoSsrc: CameraController.generateSynchronisationSource(),
        videoCryptoSuite: request.video.srtpCryptoSuite,
        videoKeySalt: Buffer.concat([
          request.video.srtp_key,
          request.video.srtp_salt,
        ]),
      };
      if (request.audio && localAudioPort) {
        session.audioPort = request.audio.port;
        session.localAudioPort = localAudioPort;
        session.audioSsrc = CameraController.generateSynchronisationSource();
        session.audioCryptoSuite = request.audio.srtpCryptoSuite;
        session.audioKeySalt = Buffer.concat([
          request.audio.srtp_key,
          request.audio.srtp_salt,
        ]);
      }
      this.activeSessions.set(request.sessionID, session);

      const response: PrepareStreamResponse = {
        video: {
          port: localVideoPort,
          ssrc: session.videoSsrc,
          srtp_key: request.video.srtp_key,
          srtp_salt: request.video.srtp_salt,
        },
      };
      if (request.audio && localAudioPort) {
        response.audio = {
          port: localAudioPort,
          ssrc: session.audioSsrc!,
          srtp_key: request.audio.srtp_key,
          srtp_salt: request.audio.srtp_salt,
        };
      }
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] HAP SetupEndpoints session=${request.sessionID} remote=${request.targetAddress}:${request.video.port} localVideoRTCP=${localVideoPort} videoSSRC=${session.videoSsrc}${localAudioPort ? ` localAudioRTCP=${localAudioPort} audioSSRC=${session.audioSsrc}` : ""}`,
      );
      callback(undefined, response);
    } catch (error) {
      callback(error as Error);
    }
  }

  private allocateUdpPort(excluded: number[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket("udp4");
      socket.once("error", (error) => {
        try {
          socket.close();
        } catch {}
        reject(error);
      });
      socket.bind(0, "0.0.0.0", () => {
        const address = socket.address();
        const port = typeof address === "string" ? 0 : address.port;
        socket.close(() => {
          if (!port || excluded.includes(port)) {
            void this.allocateUdpPort(excluded).then(resolve, reject);
          } else {
            resolve(port);
          }
        });
      });
    });
  }

  public handleStreamRequest(
    request: StreamingRequest,
    callback: StreamRequestCallback,
  ): void {
    if (request.type === StreamRequestTypes.START) {
      const session = this.activeSessions.get(request.sessionID);
      if (!session) {
        callback(new Error(`Session ${request.sessionID} was not prepared`));
        return;
      }
      void this.startStream(session, request as StartStreamRequest, callback);
      return;
    }
    if (request.type === StreamRequestTypes.RECONFIGURE) {
      const video = (request as ReconfigureStreamRequest).video;
      this.platform?.log?.notice?.(
        `[HomeKitCamera][${this.entityId}] HAP RECONFIGURE ${video.width}x${video.height}@${video.fps}`,
      );
      callback();
      return;
    }
    this.stopStream(request.sessionID);
    callback();
  }

  private getCleanSourceUrl(): string | undefined {
    let url = this.streamSource.url;
    if (!url) return undefined;
    const hashIdx = url.indexOf("#");
    if (hashIdx !== -1) {
      url = url.substring(0, hashIdx);
    }
    // Replace localhost with 127.0.0.1 to avoid IPv6 connection issues in FFmpeg
    url = url.replace(/^(rtsps?|https?):\/\/localhost(?=[:/])/i, "$1://127.0.0.1");
    return url;
  }

  private async startStream(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    callback: StreamRequestCallback,
  ): Promise<void> {
    const ffmpegPath = resolveFfmpegPath();
    const sourceUrl = this.getCleanSourceUrl();
    if (!ffmpegPath || !sourceUrl) {
      callback(new Error("FFmpeg or RTSP source is unavailable"));
      return;
    }

    const video = request.video;
    const fps = Math.max(1, Math.min(video.fps || 30, 60));
    // HomeKit on iOS can request default low bitrates (e.g. 299k).
    // Ensure a high-fidelity floor: at least 3500k-5000k for 2K (Tapo/Wyze), 6000k-8000k for 4K.
    const qualityFloor =
      video.width >= 3840
        ? 6000
        : video.width >= 2304
          ? 3500
          : video.width >= 1920
            ? 2500
            : 1500;
    const maxBitrateCap =
      video.width >= 3840
        ? 12000
        : video.width >= 2304
          ? 6000
          : video.width >= 1920
            ? 4000
            : 2500;
    const bitrate = Math.max(
      qualityFloor,
      Math.min(video.max_bit_rate || 2500, maxBitrateCap),
    );
    const mtu = video.mtu || 1378;
    const host = formatHost(session.targetAddress);
    const videoUrl =
      `srtp://${host}:${session.videoPort}` +
      `?rtcpport=${session.videoPort}&localrtcpport=${session.localVideoPort}&pkt_size=${mtu}`;

    this.emit("session-start", session.sessionId);
    let callbackSettled = false;
    const settle = (error?: Error): void => {
      if (callbackSettled) return;
      callbackSettled = true;
      callback(error);
    };
    this.spawnFfmpegProcess(session, request, settle, false);
  }

  private spawnFfmpegProcess(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    settle: (error?: Error) => void,
    forceTranscode = false,
  ): void {
    const ffmpegPath = resolveFfmpegPath() || "ffmpeg";
    const sourceUrl = this.getCleanSourceUrl();
    const video = request.video;
    const fps = Math.max(1, Math.min(video.fps || 30, 60));
    const mtu = video.mtu || 1378;

    const args = this.buildStreamArgs(session, request, forceTranscode);

    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] HAP START ${video.width}x${video.height}@${fps} transcode=${forceTranscode} profile=${h264Profile(video.profile)} level=${h264Level(video.level)} mtu=${mtu} source=${sanitizeUrlCredentials(sourceUrl || "")} ffmpeg=${ffmpegPath} ${getFfmpegVersion(ffmpegPath) || "unknown"}`,
    );

    const isHaProxyStream =
      this.streamSource.sourceType === "ha_proxy" ||
      this.streamSource.sourceType === "mjpeg" ||
      Boolean(
        sourceUrl &&
          (sourceUrl.includes("/api/camera_proxy_stream/") ||
            sourceUrl.includes("/api/camera_proxy/")),
      );

    try {
      const process = spawn(ffmpegPath, args, {
        stdio: [isHaProxyStream ? "pipe" : "ignore", "ignore", "pipe"],
      });
      session.process = process;
      if (isHaProxyStream && sourceUrl) {
        this.startHaCameraProxyPipe(session, process, sourceUrl);
      }
      let stderr = "";
      process.stderr?.on("data", (chunk: Buffer) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-6000);
      });
      const guard = setTimeout(() => {
        if (process.exitCode === null && !process.killed) {
          this.platform?.log?.notice?.(
            `[HomeKitCamera][${this.entityId}] HAP START callback success; FFmpeg active session=${session.sessionId}`,
          );
          settle();
        } else {
          settle(new Error("FFmpeg exited during HAP startup"));
        }
      }, 1000);
      process.once("error", (error) => {
        clearTimeout(guard);
        settle(error);
      });
      process.once("close", (code) => {
        clearTimeout(guard);
        session.process = undefined;
        this.platform?.log?.warn?.(
          `[HomeKitCamera][${this.entityId}] FFmpeg closed code=${code} ${stderr.trim()}`,
        );

        // Automatic fallback recovery: if initial attempt failed (e.g. missing audio track or incompatible passthrough),
        // retry immediately with safe transcoding and/or silent audio fallback
        if (code !== 0 && !session.retried && this.activeSessions.has(session.sessionId)) {
          session.retried = true;
          const isAudioFailure =
            stderr.includes("matches no streams") ||
            stderr.includes("0:a:0") ||
            stderr.includes("does not contain any stream") ||
            stderr.includes("Output file #1");

          if (isAudioFailure) {
            this.capabilities.hasAudio = false;
          }

          let retryTranscode = forceTranscode;
          if (
            !isAudioFailure &&
            (stderr.includes("dump_extra") ||
              stderr.includes("extradata") ||
              stderr.includes("codec") ||
              stderr.includes("Error") ||
              !forceTranscode)
          ) {
            retryTranscode = true;
          }

          this.platform?.log?.notice?.(
            `[HomeKitCamera][${this.entityId}] Retrying stream with safe fallback: forceTranscode=${retryTranscode} hasAudio=${this.capabilities.hasAudio}`,
          );
          this.spawnFfmpegProcess(session, request, settle, retryTranscode);
          return;
        }

        settle(new Error(`FFmpeg exited during HAP startup (code ${code})`));
        if (this.activeSessions.size === 0) {
          this.emit("session-end");
        }
      });
    } catch (error) {
      settle(error as Error);
    }
  }

  public buildStreamArgs(
    session: HomeKitStreamSession,
    request: StartStreamRequest,
    forceTranscode = false,
  ): string[] {
    const sourceUrl = this.getCleanSourceUrl();
    if (!sourceUrl) {
      return [];
    }
    const video = request.video;
    const fps = Math.max(1, Math.min(video.fps || 30, 60));
    const mtu = video.mtu || 1378;
    const host = formatHost(session.targetAddress);
    const videoUrl =
      `srtp://${host}:${session.videoPort}` +
      `?rtcpport=${session.videoPort}&pkt_size=${mtu}`;

    const isHaProxyStream =
      this.streamSource.sourceType === "ha_proxy" ||
      this.streamSource.sourceType === "mjpeg" ||
      Boolean(
        sourceUrl &&
          (sourceUrl.includes("/api/camera_proxy_stream/") ||
            sourceUrl.includes("/api/camera_proxy/")),
      );

    const args: string[] = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-protocol_whitelist",
      "pipe,udp,rtp,file,crypto,srtp,tcp,tls,http,https,lavfi",
    ];

    if (isHaProxyStream) {
      args.push("-f", "image2pipe", "-c:v", "png", "-r", "15", "-i", "pipe:0");
    } else if (sourceUrl.startsWith("rtsp://") || sourceUrl.startsWith("rtsps://")) {
      args.push(
        "-rtsp_transport",
        "tcp",
        "-timeout",
        "5000000",
        "-fflags",
        "+nobuffer+flush_packets+discardcorrupt",
        "-flags",
        "low_delay",
        "-probesize",
        "131072",
        "-analyzeduration",
        "200000",
        "-i",
        sourceUrl,
      );
    } else if (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) {
      args.push(
        "-reconnect",
        "1",
        "-reconnect_at_eof",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "2",
        "-rw_timeout",
        "10000000",
        "-probesize",
        "131072",
        "-analyzeduration",
        "200000",
        "-fflags",
        "+nobuffer+flush_packets+discardcorrupt",
        "-flags",
        "low_delay",
        "-max_delay",
        "200000",
      );
      if (sourceUrl.startsWith("https://")) {
        args.push("-tls_verify", "0");
      }
      if (this.streamSource.metadata?.scryptedToken) {
        const sToken = String(this.streamSource.metadata.scryptedToken).trim();
        if (sToken) {
          args.push(
            "-headers",
            `Authorization: ${sToken.startsWith("Bearer ") ? sToken : `Bearer ${sToken}`}\r\n`,
          );
        }
      }
      args.push("-i", sourceUrl);
    } else {
      args.push("-i", sourceUrl);
    }

    const hasAudioRequested = Boolean(
      request.audio &&
      session.audioPort &&
      session.localAudioPort &&
      session.audioSsrc &&
      session.audioKeySalt
    );
    const needsSilentAudio =
      hasAudioRequested &&
      (isHaProxyStream || this.capabilities.hasAudio === false);

    const sampleRate =
      request.audio?.sample_rate === AudioStreamingSamplerate.KHZ_24
        ? 24000
        : 16000;

    if (needsSilentAudio) {
      args.push(
        "-f",
        "lavfi",
        "-i",
        `anullsrc=channel_layout=mono:sample_rate=${sampleRate}`,
      );
    }

    const isSupportedPassthroughCodec =
      (this.capabilities.videoCodec || "h264").toLowerCase() === "h264" ||
      (this.capabilities.videoCodec || "").toLowerCase() === "hevc" ||
      (this.capabilities.videoCodec || "").toLowerCase() === "h265";

    const canPassthrough =
      !forceTranscode &&
      !isHaProxyStream &&
      isSupportedPassthroughCodec &&
      (this.capabilities.strategy === "passthrough_h264" ||
        this.capabilities.strategy === "passthrough_hevc" ||
        this.streamSource.supportsPassthrough ||
        !this.capabilities.requiresTranscoding);

    if (canPassthrough) {
      const isHevcCodec =
        (this.capabilities.videoCodec || "").toLowerCase() === "hevc" ||
        (this.capabilities.videoCodec || "").toLowerCase() === "h265" ||
        this.capabilities.strategy === "passthrough_hevc";

      // Pure passthrough remuxing without transcoding CPU overhead (native 4K, 2K, 1080p, 720p @ max fps)
      // Pure -c:v copy for HEVC and H.264 matching Camera.UI native behavior
      const videoPassArgs: string[] = [
        "-map", "0:v:0",
        "-an",
        "-c:v", "copy",
        "-f", "rtp",
        "-payload_type", String(video.pt || 99),
        "-ssrc", String(session.videoSsrc),
        "-srtp_out_suite", suiteName(session.videoCryptoSuite),
        "-srtp_out_params", session.videoKeySalt.toString("base64"),
        videoUrl,
      ];
      args.push(...videoPassArgs);
    } else {
      // High-fidelity transcoding fallback for HEVC / MJPEG / incompatible formats
      const videoBitrate =
        video.width >= 3840
          ? 8000
          : video.width >= 2560
            ? 5000
            : video.width >= 1920
              ? 3500
              : 2000;

      args.push(
        "-map",
        "0:v:0",
        "-an",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        h264Profile(video.profile),
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-bf",
        "0",
        "-crf",
        "18",
        "-threads",
        "0",
        "-vf",
        `scale=w='min(${video.width},iw)':h='min(${video.height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
        "-r",
        String(fps),
        "-g",
        String(fps),
        "-keyint_min",
        String(fps),
        "-b:v",
        `${videoBitrate}k`,
        "-maxrate",
        `${videoBitrate}k`,
        "-bufsize",
        `${videoBitrate * 2}k`,
        "-f",
        "rtp",
        "-payload_type",
        String(video.pt || 99),
        "-ssrc",
        String(session.videoSsrc),
        "-srtp_out_suite",
        suiteName(session.videoCryptoSuite),
        "-srtp_out_params",
        session.videoKeySalt.toString("base64"),
        videoUrl,
      );
    }

    if (
      hasAudioRequested &&
      session.audioKeySalt &&
      session.audioSsrc &&
      request.audio
    ) {
      const audioUrl =
        `srtp://${host}:${session.audioPort}` +
        `?rtcpport=${session.audioPort}&pkt_size=188`;
      const isOpus = request.audio.codec === AudioStreamingCodecType.OPUS;
      const hasFdk = supportsFdkAac();
      const audioBitrate = Math.min(request.audio.max_bit_rate || 24, 24);

      if (needsSilentAudio) {
        args.push(
          "-map",
          "1:a:0",
          "-vn",
        );
      } else {
        args.push(
          "-map",
          "0:a:0?",
          "-vn",
        );
      }

      if (isOpus) {
        // HomeKit explicitly negotiated OPUS — use it
        args.push(
          "-c:a",
          "libopus",
          "-application",
          "lowdelay",
          "-frame_duration",
          "20",
          "-packet_loss",
          "5",
        );
      } else if (hasFdk) {
        // libfdk_aac: best quality AAC-ELD encoder (premium, low-delay)
        args.push(
          "-c:a",
          "libfdk_aac",
          "-profile:a",
          "aac_eld",
          "-flags",
          "+global_header",
        );
      } else {
        args.push(
          "-c:a",
          "aac",
        );
      }

      args.push(
        "-ar",
        String(sampleRate),
        "-ac",
        "1",
        "-b:a",
        `${audioBitrate}k`,
        "-f",
        "rtp",
        "-payload_type",
        String(request.audio.pt || 110),
        "-ssrc",
        String(session.audioSsrc),
        "-srtp_out_suite",
        suiteName(session.audioCryptoSuite || session.videoCryptoSuite),
        "-srtp_out_params",
        session.audioKeySalt.toString("base64"),
        audioUrl,
      );
    }

    return args;
  }

  private startHaCameraProxyPipe(
    session: HomeKitStreamSession,
    process: ChildProcess,
    sourceUrl: string,
  ): void {
    const controller = new AbortController();
    session.pipeController = controller;
    const cleanup = () => {
      try {
        controller.abort();
      } catch {}
    };
    process.once("close", cleanup);
    process.once("error", cleanup);

    const token =
      this.platform?.ha?.getAccessToken?.() ||
      this.platform?.ha?.wsAccessToken;

    void (async () => {
      try {
        const res = await fetch(sourceUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          this.platform?.log?.warn?.(
            `[HomeKitCamera][${this.entityId}] Failed to connect to HA camera proxy: HTTP ${res.status}`,
          );
          return;
        }

        const reader = res.body.getReader();
        let buffer = Buffer.alloc(0);

        while (!controller.signal.aborted && process.exitCode === null) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            buffer = Buffer.concat([buffer, Buffer.from(value)]);

            // Extract complete frames from buffer (supports both PNG and JPEG)
            while (buffer.length > 8) {
              const pngIdx = buffer.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
              const jpegIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]));

              if (pngIdx !== -1 && (jpegIdx === -1 || pngIdx < jpegIdx)) {
                const iendIdx = buffer.indexOf(
                  Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
                  pngIdx,
                );
                if (iendIdx !== -1) {
                  const frameEnd = iendIdx + 8;
                  const frame = buffer.subarray(pngIdx, frameEnd);
                  buffer = buffer.subarray(frameEnd);
                  if (process.stdin && !process.stdin.destroyed) {
                    process.stdin.write(frame);
                  }
                  continue;
                } else {
                  if (pngIdx > 0) buffer = buffer.subarray(pngIdx);
                  break;
                }
              } else if (jpegIdx !== -1) {
                const eoiIdx = buffer.indexOf(
                  Buffer.from([0xff, 0xd9]),
                  jpegIdx + 2,
                );
                if (eoiIdx !== -1) {
                  const frameEnd = eoiIdx + 2;
                  const frame = buffer.subarray(jpegIdx, frameEnd);
                  buffer = buffer.subarray(frameEnd);
                  if (process.stdin && !process.stdin.destroyed) {
                    process.stdin.write(frame);
                  }
                  continue;
                } else {
                  if (jpegIdx > 0) buffer = buffer.subarray(jpegIdx);
                  break;
                }
              } else {
                buffer = buffer.subarray(-8);
                break;
              }
            }
          }
        }
      } catch (err: any) {
        if (!controller.signal.aborted) {
          this.platform?.log?.debug?.(
            `[HomeKitCamera][${this.entityId}] HA camera pipe ended: ${err?.message || String(err)}`,
          );
        }
      }
    })();
  }

  private stopStream(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;
    if (session.pipeController) {
      try {
        session.pipeController.abort();
      } catch {}
      session.pipeController = undefined;
    }
    if (session.process) {
      try {
        session.process.kill("SIGTERM");
      } catch {}
    }
    this.activeSessions.delete(sessionId);
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] HAP STOP cleanup session=${sessionId}`,
    );
    if (this.activeSessions.size === 0) {
      this.emit("session-end");
    }
  }

  public cleanupAllSessions(): void {
    for (const sessionId of [...this.activeSessions.keys()]) {
      this.stopStream(sessionId);
    }
    this.emit("session-end");
  }
}

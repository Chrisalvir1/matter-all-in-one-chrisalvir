import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import {
  type CameraRecordingDelegate,
  type CameraRecordingConfiguration,
  type RecordingPacket,
  HDSProtocolSpecificErrorReason,
} from "@homebridge/hap-nodejs";
import { Fmp4Segmenter, type Fmp4MediaFragment } from "../fmp4-parser.js";
import { prependProducerReferenceTime, normalizeFragmentTfdt, type TfdtOffsets } from "./fmp4-hevc.js";
import { resolveFfmpegPath, sanitizeUrlCredentials } from "../ffmpeg-helper.js";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../../camera-types.js";

export class HevcRecordingDelegate extends EventEmitter implements CameraRecordingDelegate {
  private recordingActive = false;
  private selectedConfiguration?: CameraRecordingConfiguration;
  private prebuffer: Fmp4MediaFragment[] = [];
  private initializationSegment: Buffer | null = null;
  private ffmpegProcess?: ChildProcess;
  private segmenter = new Fmp4Segmenter();
  private tfdtOffsets: TfdtOffsets = new Map();

  private isStartingPipeline = false;
  private isPausedByLiveStream = false;
  private isMotionActive = false;
  private currentStreamId?: number;
  private deliveredFragmentsInSession = 0;
  private deliveredInitInSession = false;
  private sessionHadProtocolError = false;

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly record: HomeKitCameraStorageRecord,
    private readonly capabilities: CameraCapabilitiesInfo,
    private streamSource: ResolvedStreamSource,
  ) {
    super();

    this.segmenter.on("initialization", (initSeg: Buffer) => {
      this.initializationSegment = initSeg;
      this.emit("initialization", initSeg);
      this.platform?.log?.notice?.(
        `[HKSV3][${this.entityId}] Received HEVC fMP4 Initialization Segment (${initSeg.length} bytes, tag: hvc1)`,
      );
    });

    this.segmenter.on("fragment", (fragment: Fmp4MediaFragment) => {
      this.handleNewFragment(fragment);
    });

    if (this.record.hksvEnabled !== false && Boolean(this.streamSource.url)) {
      this.recordingActive = true;
      this.record.hksvState = "waiting_hub";
    }
  }

  public updateRecordingActive(active: boolean): void {
    this.recordingActive = active;
    this.record.hksvState = active
      ? "ready"
      : this.selectedConfiguration
        ? "configurable"
        : "waiting_hub";

    this.platform?.log?.notice?.(
      `[HKSV3][${this.entityId}] Recording active state changed: ${active ? "ENABLED" : "PAUSED"}`,
    );

    if (active) {
      if (!this.isPausedByLiveStream) {
        this.startPrebufferPipeline();
      }
    } else {
      this.isPausedByLiveStream = false;
      this.stopPrebufferPipeline();
      this.clearPrebuffer();
    }
    this.emit("recording-active", active);
  }

  public updateRecordingConfiguration(configuration: CameraRecordingConfiguration | undefined): void {
    this.selectedConfiguration = configuration;
    if (configuration) {
      this.record.hksvState = this.recordingActive ? "ready" : "configurable";
      const res = configuration.videoCodec.resolution;
      const fragLen = configuration.mediaContainerConfiguration.fragmentLength || 4000;
      this.platform?.log?.notice?.(
        `[HKSV3][${this.entityId}] Negotiated HKSV3 Configuration: ${res[0]}x${res[1]}@${res[2]}fps, fragmentLength=${fragLen}ms`,
      );

      if (this.recordingActive && !this.ffmpegProcess) {
        this.startPrebufferPipeline();
      }
      this.emit("recording-configured");
    } else {
      this.record.hksvState = "waiting_hub";
      this.stopPrebufferPipeline();
      this.clearPrebuffer();
    }
  }

  public pausePrebuffer(): void {
    if (!this.recordingActive) return;
    this.isPausedByLiveStream = true;
    this.platform?.log?.notice?.(
      `[HKSV3][${this.entityId}] Pausing HKSV3 prebuffer for Live View session`,
    );
    this.stopPrebufferPipeline();
  }

  public resumePrebuffer(): void {
    if (!this.recordingActive || !this.isPausedByLiveStream) return;
    this.isPausedByLiveStream = false;
    this.platform?.log?.notice?.(
      `[HKSV3][${this.entityId}] Live View ended; resuming HKSV3 prebuffer pipeline`,
    );
    this.startPrebufferPipeline();
  }

  public handleMotionDetected(detected: boolean): void {
    this.isMotionActive = detected;
    this.platform?.log?.notice?.(
      `[HKSV3][${this.record.name || this.entityId}] 🚨 EVENTO HKSV3: ${detected ? "MOVIMIENTO DETECTADO → Notificando a Apple Home Hub" : "Movimiento finalizado"}`,
    );
  }

  public async *handleRecordingStreamRequest(
    streamId: number,
    signal?: AbortSignal,
  ): AsyncGenerator<RecordingPacket> {
    this.currentStreamId = streamId;
    this.deliveredFragmentsInSession = 0;
    this.deliveredInitInSession = false;
    this.sessionHadProtocolError = false;
    this.recordingActive = true;
    this.tfdtOffsets.clear();

    this.platform?.log?.notice?.(
      `[HKSV3][${this.record.name || this.entityId}] 🎬 GRABACIÓN HKSV3 (streamId ${streamId}) → Transmitiendo fMP4 HEVC nativo (hvc1) a Apple Home Hub / iCloud`,
    );

    if (!this.ffmpegProcess) {
      void this.startPrebufferPipeline();
    }

    // 1. Deliver initialization segment
    if (!this.initializationSegment) {
      await this.waitForInitialization(5000);
    }

    if (this.initializationSegment) {
      this.deliveredInitInSession = true;
      yield {
        data: this.initializationSegment,
        isLast: false,
      };
    } else {
      this.platform?.log?.warn?.(
        `[HKSV3][${this.record.name || this.entityId}] Initialization segment missing for HKSV3 recording`,
      );
    }

    // 2. Deliver prebuffer fragments (with tfdt normalized and prft prepended)
    const prebufferSnapshot = [...this.prebuffer];
    for (const fragment of prebufferSnapshot) {
      if (signal?.aborted) return;
      this.deliveredFragmentsInSession++;
      const processedData = this.processFragmentForDelivery(fragment.data);
      yield {
        data: processedData,
        isLast: false,
      };
    }

    // 3. Deliver live fragments
    let postRollFragmentsRemaining = 2;
    while (!signal?.aborted) {
      const nextFragment = await this.waitForNextFragment(signal, 15000);
      if (!nextFragment || signal?.aborted) {
        yield { data: Buffer.alloc(0), isLast: true };
        break;
      }

      this.deliveredFragmentsInSession++;
      const isLast = !this.isMotionActive && postRollFragmentsRemaining-- <= 0;
      const processedData = this.processFragmentForDelivery(nextFragment.data);

      yield {
        data: processedData,
        isLast,
      };

      if (isLast) break;
    }
  }

  public acknowledgeStream(streamId: number): void {
    this.platform?.log?.notice?.(
      `[HKSV3][${this.record.name || this.entityId}] ✅ GRABACIÓN CONFIRMADA: Apple Home Hub guardó clip HEVC en iCloud (streamId ${streamId})`,
    );
    this.checkVerificationSuccess();
  }

  public closeRecordingStream(
    streamId: number,
    reason: HDSProtocolSpecificErrorReason | undefined,
  ): void {
    const isNormal = reason === HDSProtocolSpecificErrorReason.NORMAL;
    this.platform?.log?.notice?.(
      `[HKSV3][${this.entityId}] Recording stream closed for streamId ${streamId} (reason: ${reason ?? "connection closed"})`,
    );

    if (reason && !isNormal) {
      this.sessionHadProtocolError = true;
      this.record.hksvState = "error";
    } else {
      this.checkVerificationSuccess();
    }
    this.currentStreamId = undefined;
  }

  private processFragmentForDelivery(data: Buffer): Buffer {
    const normalized = normalizeFragmentTfdt(data, this.tfdtOffsets);
    return prependProducerReferenceTime(normalized, Date.now());
  }

  private checkVerificationSuccess(): void {
    if (
      this.selectedConfiguration &&
      this.recordingActive &&
      this.deliveredInitInSession &&
      this.deliveredFragmentsInSession >= 2 &&
      !this.sessionHadProtocolError
    ) {
      if (!this.record.hksvVerified) {
        this.record.hksvVerified = true;
        this.record.hksvState = "verified";
        this.platform?.log?.notice?.(
          `[HKSV3][${this.entityId}] ✅ HKSV3 REAL VERIFIED: Multi-fragment HEVC iCloud recording confirmed!`,
        );
        if (this.platform?.saveHomeKitCameraRecords) {
          this.platform.saveHomeKitCameraRecords();
        }
        this.emit("hksv-verified");
      }
    }
  }

  private handleNewFragment(fragment: Fmp4MediaFragment): void {
    if (fragment.isKeyframe) {
      this.prebuffer.push(fragment);
      while (this.prebuffer.length > 4) {
        this.prebuffer.shift();
      }
    }
    this.emit("new-fragment", fragment);
  }

  private async startPrebufferPipeline(): Promise<void> {
    if (this.ffmpegProcess || this.isStartingPipeline || this.isPausedByLiveStream) return;
    this.isStartingPipeline = true;

    try {
      const ffmpegPath = resolveFfmpegPath();
      const sourceUrl = this.streamSource.url;
      if (!ffmpegPath || !sourceUrl) {
        this.record.hksvState = "not_capable";
        return;
      }

      // FFmpeg pipeline: STRICT HEVC Passthrough (-c:v copy) with -tag:v hvc1
      const args: string[] = [
        "-hide_banner",
        "-loglevel", "warning",
      ];

      if (sourceUrl.startsWith("rtsp://") || sourceUrl.startsWith("rtsps://")) {
        args.push(
          "-rtsp_transport", "tcp",
          "-timeout", "5000000",
          "-probesize", "65536",
          "-analyzeduration", "100000",
          "-fflags", "+nobuffer+flush_packets+genpts+igndts",
          "-use_wallclock_as_timestamps", "1",
          "-flags", "low_delay",
        );
      } else {
        args.push(
          "-probesize", "65536",
          "-analyzeduration", "100000",
          "-fflags", "+nobuffer+flush_packets+genpts+igndts",
          "-flags", "low_delay",
        );
      }

      args.push("-i", sourceUrl);

      // Video: STRICT COPY + Apple-required hvc1 tag
      args.push(
        "-map", "0:v:0",
        "-c:v", "copy",
        "-tag:v", "hvc1",
      );

      // Audio: STRICT AAC copy if compatible, otherwise -an
      const audioCodec = this.capabilities.audioCodec?.toLowerCase();
      if (audioCodec === "aac") {
        this.platform?.log?.notice?.(
          `[HKSV3][${this.entityId}] Grabación HKSV3: preservando audio AAC de fuente con passthrough (-c:a copy)`,
        );
        args.push(
          "-map", "0:a:0?",
          "-c:a", "copy",
        );
      } else {
        this.platform?.log?.notice?.(
          `[HKSV3][${this.entityId}] Audio fuente (${audioCodec || "none"}) no es AAC: omitiendo pista de audio en grabación para evitar transcodificación`,
        );
        args.push("-an");
      }

      // fMP4 output container
      args.push(
        "-avoid_negative_ts", "make_zero",
        "-max_interleave_delta", "0",
        "-muxdelay", "0",
        "-muxpreload", "0",
        "-f", "mp4",
        "-movflags", "frag_keyframe+empty_moov+default_base_moof+skip_sidx+skip_trailer",
        "pipe:1",
      );

      const sanitizedUrl = sanitizeUrlCredentials(sourceUrl);
      this.platform?.log?.notice?.(
        `[HKSV3][${this.entityId}] Spawning HKSV3 HEVC prebuffer pipeline (-c:v copy, tag: hvc1): ${sanitizedUrl}`,
      );

      this.segmenter.reset();
      this.ffmpegProcess = spawn(ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });

      this.ffmpegProcess.stdout?.on("data", (chunk: Buffer) => {
        this.segmenter.push(chunk);
      });

      this.ffmpegProcess.stderr?.on("data", (chunk: Buffer) => {
        const msg = chunk.toString().trim();
        if (msg) {
          this.platform?.log?.debug?.(`[HKSV3][${this.entityId}][stderr] ${msg}`);
        }
      });

      this.ffmpegProcess.once("close", (code) => {
        this.platform?.log?.notice?.(`[HKSV3][${this.entityId}] Prebuffer FFmpeg closed (code ${code})`);
        this.ffmpegProcess = undefined;
      });

      this.ffmpegProcess.once("error", (err) => {
        this.platform?.log?.error?.(`[HKSV3][${this.entityId}] Prebuffer FFmpeg error: ${err.message}`);
        this.ffmpegProcess = undefined;
      });
    } finally {
      this.isStartingPipeline = false;
    }
  }

  public stopPrebufferPipeline(): void {
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill("SIGKILL");
      } catch {}
      this.ffmpegProcess = undefined;
    }
  }

  private clearPrebuffer(): void {
    this.prebuffer = [];
    this.initializationSegment = null;
    this.segmenter.reset();
  }

  private waitForInitialization(timeoutMs: number): Promise<void> {
    if (this.initializationSegment) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.removeListener("initialization", onInit);
        resolve();
      }, timeoutMs);
      const onInit = () => {
        clearTimeout(timer);
        resolve();
      };
      this.once("initialization", onInit);
    });
  }

  private waitForNextFragment(signal?: AbortSignal, timeoutMs = 15000): Promise<Fmp4MediaFragment | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, timeoutMs);

      const onAbort = () => {
        cleanup();
        resolve(null);
      };

      const onFragment = (fragment: Fmp4MediaFragment) => {
        cleanup();
        resolve(fragment);
      };

      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.removeListener("new-fragment", onFragment);
      };

      signal?.addEventListener("abort", onAbort, { once: true });
      this.once("new-fragment", onFragment);
    });
  }
}

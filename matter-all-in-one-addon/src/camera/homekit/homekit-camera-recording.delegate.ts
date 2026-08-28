/**
 * HomeKit Secure Video (HKSV) Recording Delegate
 * Handles pre-buffering, motion-triggered fragmented MP4 streaming (fMP4/HDS),
 * dynamic audio/video codec negotiation, and verified recording lifecycle.
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import {
  CameraRecordingDelegate,
  CameraRecordingConfiguration,
  RecordingPacket,
  HDSProtocolSpecificErrorReason,
  AudioRecordingSamplerate,
} from "hap-nodejs";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera-types.js";
import { Fmp4Segmenter, Fmp4MediaFragment } from "./fmp4-parser.js";
import { resolveFfmpegPath, sanitizeUrlCredentials } from "./ffmpeg-helper.js";
import { CameraSourceResolver } from "../camera-source-resolver.js";

export class HomeKitCameraRecordingDelegate
  extends EventEmitter
  implements CameraRecordingDelegate
{
  private recordingActive = false;
  private selectedConfiguration?: CameraRecordingConfiguration;
  private prebuffer: Fmp4MediaFragment[] = [];
  private initializationSegment: Buffer | null = null;

  private ffmpegProcess?: ChildProcess;
  private segmenter = new Fmp4Segmenter();

  // Resource limits
  private readonly maxPrebufferBytes = 16 * 1024 * 1024; // 16 MB max RAM per camera
  private currentPrebufferBytes = 0;

  // Verification tracking
  private deliveredFragmentsInSession = 0;
  private deliveredInitInSession = false;
  private sessionHadProtocolError = false;

  // Active motion recording state
  private isMotionActive = false;
  private currentStreamId?: number;
  private streamAbortController?: AbortController;

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
      this.platform?.log?.debug?.(
        `[HKSV][${this.entityId}] Received fMP4 Initialization Segment (${initSeg.length} bytes)`,
      );
    });

    this.segmenter.on("fragment", (fragment: Fmp4MediaFragment) => {
      this.handleNewFragment(fragment);
    });
  }

  /**
   * Called by HAP-NodeJS when Apple Home toggles recording active state.
   */
  public updateRecordingActive(active: boolean): void {
    this.recordingActive = active;
    this.record.hksvState = active
      ? "ready"
      : this.selectedConfiguration
        ? "configurable"
        : "waiting_hub";

    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Recording active state changed: ${active ? "ENABLED" : "PAUSED"}`,
    );

    if (active) {
      this.startPrebufferPipeline();
    } else {
      this.stopPrebufferPipeline();
      this.clearPrebuffer();
    }
  }

  /**
   * Called by HAP-NodeJS when the Home Hub writes SelectedCameraRecordingConfiguration.
   */
  public updateRecordingConfiguration(
    configuration: CameraRecordingConfiguration | undefined,
  ): void {
    this.selectedConfiguration = configuration;
    if (configuration) {
      this.record.hksvState = this.recordingActive ? "ready" : "configurable";
      const res = configuration.videoCodec.resolution;
      const fragLen =
        configuration.mediaContainerConfiguration.fragmentLength || 4000;
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Negotiated HKSV Configuration: ${res[0]}x${res[1]}@${res[2]}fps, fragmentLength=${fragLen}ms, prebuffer=${configuration.prebufferLength}ms`,
      );

      // Restart prebuffer pipeline with negotiated settings if active
      if (this.recordingActive) {
        this.stopPrebufferPipeline();
        this.startPrebufferPipeline();
      }
    } else {
      this.record.hksvState = "waiting_hub";
      this.stopPrebufferPipeline();
      this.clearPrebuffer();
    }
  }

  /**
   * Home Assistant or accessory reports motion state change.
   */
  public handleMotionDetected(detected: boolean): void {
    this.isMotionActive = detected;
    this.platform?.log?.debug?.(
      `[HKSV][${this.entityId}] Motion event: ${detected ? "DETECTED" : "CLEARED"}`,
    );
  }

  /**
   * AsyncGenerator yielding MEDIA_INITIALIZATION and MEDIA_FRAGMENT packets to Apple Home Hub.
   */
  public async *handleRecordingStreamRequest(
    streamId: number,
    signal?: AbortSignal,
  ): AsyncGenerator<RecordingPacket> {
    this.currentStreamId = streamId;
    this.deliveredFragmentsInSession = 0;
    this.deliveredInitInSession = false;
    this.sessionHadProtocolError = false;

    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Starting HKSV recording stream session (streamId ${streamId})`,
    );

    // 1. Deliver MEDIA_INITIALIZATION segment (ftyp + moov)
    if (!this.initializationSegment) {
      // If initialization segment not yet ready, wait briefly for it
      await this.waitForInitialization(2000);
    }

    if (this.initializationSegment) {
      this.deliveredInitInSession = true;
      yield {
        data: this.initializationSegment,
        isLast: false,
      };
    } else {
      this.platform?.log?.warn?.(
        `[HKSV][${this.entityId}] Initialization segment missing; stream may be rejected`,
      );
    }

    // 2. Deliver pre-buffer fragments (pre-roll before motion trigger)
    const prebufferSnapshot = [...this.prebuffer];
    this.platform?.log?.debug?.(
      `[HKSV][${this.entityId}] Flushing ${prebufferSnapshot.length} pre-buffer fragments to Home Hub`,
    );

    for (const fragment of prebufferSnapshot) {
      if (signal?.aborted) return;
      this.deliveredFragmentsInSession++;
      yield {
        data: fragment.data,
        isLast: false,
      };
    }

    // 3. Stream ongoing live fragments while motion is active or until Home Hub closes
    let postRollFragmentsRemaining = 2; // At least 2 post-roll fragments after motion clears
    while (!signal?.aborted) {
      const nextFragment = await this.waitForNextFragment(signal, 5000);
      if (!nextFragment || signal?.aborted) break;

      this.deliveredFragmentsInSession++;

      const isLast = !this.isMotionActive && postRollFragmentsRemaining-- <= 0;
      yield {
        data: nextFragment.data,
        isLast,
      };

      if (isLast) {
        this.platform?.log?.debug?.(
          `[HKSV][${this.entityId}] Reached end of motion recording stream`,
        );
        break;
      }
    }
  }

  /**
   * Called by Home Hub when acknowledging the end of stream.
   */
  public acknowledgeStream(streamId: number): void {
    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Home Hub acknowledged streamId ${streamId}`,
    );
    this.checkVerificationSuccess();
  }

  /**
   * Called by HAP-NodeJS when the recording stream is closed by Home Hub or error.
   */
  public closeRecordingStream(
    streamId: number,
    reason: HDSProtocolSpecificErrorReason | undefined,
  ): void {
    const isNormal = reason === HDSProtocolSpecificErrorReason.NORMAL;
    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Recording stream closed for streamId ${streamId} (reason: ${reason ?? "connection closed"}, normal: ${isNormal})`,
    );

    if (reason && !isNormal) {
      this.sessionHadProtocolError = true;
      this.record.hksvState = "error";
    } else {
      this.checkVerificationSuccess();
    }

    this.currentStreamId = undefined;
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
          `[HKSV][${this.entityId}] ✅ HomeKit Secure Video (HKSV) VERIFIED: Multi-fragment iCloud recording confirmed!`,
        );
        if (this.platform?.saveHomeKitCameraRecords) {
          this.platform.saveHomeKitCameraRecords();
        }
        this.emit("hksv-verified");
      }
    }
  }

  private handleNewFragment(fragment: Fmp4MediaFragment): void {
    // Only accept keyframed fragments into prebuffer to prevent decode corruption
    if (fragment.isKeyframe) {
      this.prebuffer.push(fragment);
      this.currentPrebufferBytes += fragment.data.length;

      // Enforce ring buffer limits (duration and memory)
      const targetDurationMs =
        this.selectedConfiguration?.prebufferLength || 4000;
      const approxDurationMs = this.prebuffer.length * 4000;

      while (
        (approxDurationMs > targetDurationMs + 4000 ||
          this.currentPrebufferBytes > this.maxPrebufferBytes) &&
        this.prebuffer.length > 1
      ) {
        const discarded = this.prebuffer.shift();
        if (discarded) {
          this.currentPrebufferBytes -= discarded.data.length;
        }
      }
    }

    this.emit("new-fragment", fragment);
  }

  private async startPrebufferPipeline(): Promise<void> {
    if (this.ffmpegProcess) return;

    const ffmpegPath = resolveFfmpegPath();
    if (!ffmpegPath) {
      this.platform?.log?.warn?.(
        `[HKSV][${this.entityId}] Cannot start HKSV pre-buffer: FFmpeg not found`,
      );
      this.record.hksvState = "not_capable";
      return;
    }

    // Refresh dynamic URL if needed
    let sourceUrl = this.streamSource.url;
    if (!sourceUrl || this.streamSource.sourceType === "hls") {
      const state = this.platform?.ha?.hassStates?.get(this.entityId);
      if (state) {
        try {
          const fresh = await CameraSourceResolver.resolve(
            this.platform,
            this.entityId,
            state,
          );
          if (fresh && fresh.url) {
            this.streamSource = fresh;
            sourceUrl = fresh.url;
          }
        } catch {}
      }
    }

    if (!sourceUrl) {
      this.platform?.log?.warn?.(
        `[HKSV][${this.entityId}] Cannot start HKSV pre-buffer: stream URL missing`,
      );
      return;
    }

    const token =
      this.platform?.ha?.getAccessToken?.() || this.platform?.ha?.wsAccessToken;
    const sanitizedUrl = sanitizeUrlCredentials(sourceUrl);

    // Build FFmpeg fMP4 args
    const args = ["-hide_banner", "-loglevel", "warning"];

    if (
      (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) &&
      token
    ) {
      args.push("-headers", `Authorization: Bearer ${token}\r\n`);
    }

    if (sourceUrl.startsWith("rtsp://")) {
      args.push("-rtsp_transport", "tcp");
    }

    args.push("-fflags", "+nobuffer", "-flags", "low_delay", "-i", sourceUrl);

    // camera_proxy_stream is multipart MJPEG; the physical camera codec must
    // not be used to decide whether that proxy can be copied.
    const isH264 =
      this.capabilities.videoCodec === "h264" &&
      this.streamSource.sourceType !== "ha_proxy";
    if (isH264) {
      args.push("-map", "0:v:0", "-vcodec", "copy");
    } else {
      const res = this.selectedConfiguration?.videoCodec.resolution || [
        1920, 1080, 30,
      ];
      args.push(
        "-map",
        "0:v:0",
        "-vcodec",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "baseline",
        "-level:v",
        "3.1",
        "-r",
        String(res[2] || 30),
        "-g",
        String(Math.max(1, (res[2] || 30) * 2)),
        "-keyint_min",
        String(Math.max(1, res[2] || 30)),
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
      );
    }

    // Audio pipeline: format according to negotiated configuration
    const audioCodecConfig = this.selectedConfiguration?.audioCodec;
    if (this.capabilities.hasAudio && audioCodecConfig) {
      let samplerateStr = "32k";
      switch (audioCodecConfig.samplerate) {
        case AudioRecordingSamplerate.KHZ_8:
          samplerateStr = "8k";
          break;
        case AudioRecordingSamplerate.KHZ_16:
          samplerateStr = "16k";
          break;
        case AudioRecordingSamplerate.KHZ_24:
          samplerateStr = "24k";
          break;
        case AudioRecordingSamplerate.KHZ_32:
          samplerateStr = "32k";
          break;
        case AudioRecordingSamplerate.KHZ_44_1:
          samplerateStr = "44.1k";
          break;
        case AudioRecordingSamplerate.KHZ_48:
          samplerateStr = "48k";
          break;
      }
      const bitrate = audioCodecConfig.bitrate || 32;
      args.push(
        "-map",
        "0:a:0",
        "-acodec",
        "aac",
        "-ar",
        samplerateStr,
        "-b:a",
        `${bitrate}k`,
        "-ac",
        String(audioCodecConfig.audioChannels || 1),
      );
    } else {
      // Disable audio if not available or incompatible
      args.push("-an");
    }

    // Output fragmented MP4 to stdout pipe
    args.push(
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
      "pipe:1",
    );

    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Spawning HKSV pre-buffer pipeline: ${sanitizedUrl}`,
    );

    try {
      this.segmenter.reset();
      this.ffmpegProcess = spawn(ffmpegPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.ffmpegProcess.stdout?.on("data", (chunk: Buffer) => {
        this.segmenter.push(chunk);
      });

      this.ffmpegProcess.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          this.platform?.log?.debug?.(
            `[HKSV][${this.entityId}][ffmpeg] ${msg}`,
          );
        }
      });

      this.ffmpegProcess.on("close", (code) => {
        this.platform?.log?.debug?.(
          `[HKSV][${this.entityId}] HKSV pre-buffer FFmpeg exited with code ${code}`,
        );
        this.ffmpegProcess = undefined;
      });

      this.ffmpegProcess.on("error", (err) => {
        this.platform?.log?.error?.(
          `[HKSV][${this.entityId}] HKSV pre-buffer FFmpeg error: ${err}`,
        );
        this.ffmpegProcess = undefined;
      });
    } catch (err) {
      this.platform?.log?.error?.(
        `[HKSV][${this.entityId}] Failed to spawn HKSV FFmpeg process: ${err}`,
      );
      this.ffmpegProcess = undefined;
    }
  }

  private stopPrebufferPipeline(): void {
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill("SIGTERM");
        const proc = this.ffmpegProcess;
        setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {}
        }, 1000);
      } catch {}
      this.ffmpegProcess = undefined;
    }
  }

  private clearPrebuffer(): void {
    this.prebuffer = [];
    this.currentPrebufferBytes = 0;
    this.initializationSegment = null;
  }

  private waitForInitialization(timeoutMs: number): Promise<void> {
    if (this.initializationSegment) return Promise.resolve();
    return new Promise((resolve) => {
      const onInit = () => {
        clearTimeout(timer);
        this.removeListener("initialization", onInit);
        resolve();
      };
      const timer = setTimeout(() => {
        this.removeListener("initialization", onInit);
        resolve();
      }, timeoutMs);
      this.once("initialization", onInit);
    });
  }

  private waitForNextFragment(
    signal?: AbortSignal,
    timeoutMs = 5000,
  ): Promise<Fmp4MediaFragment | null> {
    return new Promise((resolve) => {
      const onFragment = (fragment: Fmp4MediaFragment) => {
        cleanup();
        resolve(fragment);
      };
      const onAbort = () => {
        cleanup();
        resolve(null);
      };
      const onTimeout = () => {
        cleanup();
        resolve(null);
      };

      const timer = setTimeout(onTimeout, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        this.removeListener("new-fragment", onFragment);
        signal?.removeEventListener("abort", onAbort);
      };

      this.once("new-fragment", onFragment);
      signal?.addEventListener("abort", onAbort);
    });
  }

  public destroy(): void {
    this.stopPrebufferPipeline();
    this.clearPrebuffer();
    this.segmenter.reset();
  }
}

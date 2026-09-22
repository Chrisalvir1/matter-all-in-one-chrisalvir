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
} from "@homebridge/hap-nodejs";
import type {
  CameraCapabilitiesInfo,
  ResolvedStreamSource,
  HomeKitCameraStorageRecord,
} from "../camera-types.js";
import { Fmp4Segmenter, Fmp4MediaFragment } from "./fmp4-parser.js";
import { resolveFfmpegPath, sanitizeUrlCredentials } from "./ffmpeg-helper.js";
import { CameraSourceResolver } from "../camera-source-resolver.js";

function recordingSampleRateHz(sampleRate?: AudioRecordingSamplerate): number | undefined {
  switch (sampleRate) {
    case AudioRecordingSamplerate.KHZ_8: return 8000;
    case AudioRecordingSamplerate.KHZ_16: return 16000;
    case AudioRecordingSamplerate.KHZ_24: return 24000;
    case AudioRecordingSamplerate.KHZ_32: return 32000;
    case AudioRecordingSamplerate.KHZ_44_1: return 44100;
    case AudioRecordingSamplerate.KHZ_48: return 48000;
    default: return undefined;
  }
}

export class HomeKitCameraRecordingDelegate
  extends EventEmitter
  implements CameraRecordingDelegate
{
  private recordingActive = false;
  public selectedConfiguration?: CameraRecordingConfiguration;
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
  private isStartingPipeline = false;
  private lastPrebufferStderrAt = 0;
  /** A transient RTSP/go2rtc interruption must not permanently disable HKSV. */
  private prebufferRestartTimer?: NodeJS.Timeout;
  private consecutivePrebufferFailures = 0;

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
      // A valid fMP4 init segment proves that the recovered reader is healthy;
      // a later transient disconnect should begin its backoff from the first
      // short retry again.
      this.consecutivePrebufferFailures = 0;
      this.emit("initialization", initSeg);
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Received fMP4 Initialization Segment (${initSeg.length} bytes)`,
      );
    });

    this.segmenter.on("fragment", (fragment: Fmp4MediaFragment) => {
      this.handleNewFragment(fragment);
    });

    // Do not open an RTSP/FFmpeg reader for every exported camera at startup.
    // Camera.UI and several physical cameras permit only a small number of
    // simultaneous readers; eager HKSV prebuffers starved Live View and even
    // made the add-on HTTP API unresponsive.  HAP starts this pipeline once a
    // Home Hub enables/configures recording (or requests a recording stream).
    if (this.record.hksvEnabled !== false && Boolean(this.streamSource.url)) {
      this.recordingActive = true;
      this.record.hksvState = "waiting_hub";
    }
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

  private isPausedByLiveStream = false;

  /**
   * Temporarily pause the HKSV pre-buffer FFmpeg process while a Live View stream is active.
   * This releases the camera's single RTSP hardware socket, preventing RTSP contention and stream freezing.
   */
  public pausePrebuffer(): void {
    if (!this.recordingActive) return;
    this.isPausedByLiveStream = true;
    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Pausing prebuffer to grant full camera bandwidth and RTSP socket to Live View`,
    );
    this.stopPrebufferPipeline();
  }

  /**
   * Re-activate the HKSV pre-buffer pipeline once all Live View sessions have ended.
   */
  public resumePrebuffer(): void {
    if (!this.recordingActive || !this.isPausedByLiveStream) return;
    this.isPausedByLiveStream = false;
    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Live View session ended; resuming HKSV pre-buffer pipeline`,
    );
    this.startPrebufferPipeline();
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

      // Keep running prebuffer pipeline if already active; only spawn if missing
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

  /**
   * Home Assistant or accessory reports motion state change.
   */
  public handleMotionDetected(detected: boolean): void {
    this.isMotionActive = detected;
    this.platform?.log?.notice?.(
      `[HKSV][${this.record.name || this.entityId}] 🚨 EVENTO HKSV: ${detected ? "MOVIMIENTO DETECTADO → Enviando señal a Apple Home Hub para grabar en iCloud" : "Movimiento finalizado"}`,
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
    this.recordingActive = true;

    this.platform?.log?.notice?.(
      `[HKSV][${this.record.name || this.entityId}] 🎬 GRABACIÓN HKSV EN CURSO (streamId ${streamId}) → Transmitiendo video fMP4 a Apple Home Hub / iCloud`,
    );

    // Ensure prebuffer FFmpeg pipeline is running
    if (!this.ffmpegProcess) {
      void this.startPrebufferPipeline();
    }

    // 1. Deliver MEDIA_INITIALIZATION segment (ftyp + moov)
    if (!this.initializationSegment) {
      // Wait up to 5000ms for FFmpeg to produce the fMP4 moov box
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
        `[HKSV][${this.record.name || this.entityId}] Initialization segment missing; stream may be rejected`,
      );
    }

    // 2. Deliver pre-buffer fragments (pre-roll before motion trigger)
    const prebufferSnapshot = [...this.prebuffer];
    this.platform?.log?.notice?.(
      `[HKSV][${this.record.name || this.entityId}] 📦 Entregando ${prebufferSnapshot.length} fragmentos de pre-buffer a Apple Home Hub`,
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
      const nextFragment = await this.waitForNextFragment(signal, 15000);
      if (!nextFragment || signal?.aborted) {
        yield {
          data: Buffer.alloc(0),
          isLast: true,
        };
        break;
      }

      this.deliveredFragmentsInSession++;

      const isLast = !this.isMotionActive && postRollFragmentsRemaining-- <= 0;
      yield {
        data: nextFragment.data,
        isLast,
      };

      if (isLast) {
        this.platform?.log?.notice?.(
          `[HKSV][${this.record.name || this.entityId}] Reached end of motion recording stream`,
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
      `[HKSV][${this.record.name || this.entityId}] ✅ GRABACIÓN CONFIRMADA: Apple Home Hub guardó el clip en iCloud (streamId ${streamId})`,
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

  public buildPrebufferArgs(sourceUrl: string): string[] | null {
    const token =
      this.platform?.ha?.getAccessToken?.() || this.platform?.ha?.wsAccessToken;

    const cameraIdentity = `${this.entityId} ${this.record.name || ""} ${this.record.model || ""}`.toLowerCase();
    // The C402 may reopen its direct RTSP publisher between Live View and the
    // HKSV reader. Its first packets can arrive before SPS/PPS, so a normal
    // low-latency probe drops the parameter sets and the fMP4 reader exits
    // with "non-existing PPS". Give only this source a bounded full probe.
    const isTapoC402 = /(?:\bc402\b|tapo[-_ ]?c402)/i.test(cameraIdentity);
    // Camera.UI sources from these cameras have demonstrated discontinuous
    // audio clocks. Rebuild the audio timeline before AAC encoding while
    // keeping their video stream in strict passthrough.
    const needsAudioTimestampRepair = /(?:\bc402\b|\bc120\b|\bwyze\b|\bezviz\b)/i.test(cameraIdentity);

    // Build FFmpeg fMP4 args
    const args = ["-hide_banner", "-loglevel", "warning"];

    if (
      (sourceUrl.startsWith("http://") || sourceUrl.startsWith("https://")) &&
      token
    ) {
      args.push("-headers", `Authorization: Bearer ${token}\r\n`);
    }

    if (sourceUrl.startsWith("rtsp://") || sourceUrl.startsWith("rtsps://")) {
      args.push(
        "-rtsp_transport",
        "tcp",
        "-timeout",
        "5000000",
        "-probesize",
        isTapoC402 ? "1048576" : needsAudioTimestampRepair ? "524288" : "65536",
        "-analyzeduration",
        isTapoC402 ? "1000000" : needsAudioTimestampRepair ? "500000" : "100000",
        "-fflags",
        // Camera.UI/go2rtc can restart an RTSP publisher with DTS values that
        // move backwards. Generate a fresh monotonic timeline for fMP4/HKSV
        // instead of forwarding invalid timestamps to the Apple Home Hub.
        needsAudioTimestampRepair
          ? "+genpts+discardcorrupt"
          : "+nobuffer+flush_packets+genpts+igndts",
        "-flags",
        needsAudioTimestampRepair ? "0" : "low_delay",
      );
      // Camera.UI AAC streams can restart with discontinuous DTS.  Replacing
      // them with wall-clock timestamps makes FFmpeg drop audio packets before
      // the aresample filter can normalize them. Keep only these repaired
      // sources on their native timeline.
      if (needsAudioTimestampRepair) {
        // Keep the source's relative timestamps, then shift this reader to
        // zero.  `igndts` reset one stream to zero while leaving Camera.UI's
        // AAC stream at a large absolute timestamp, which made FFmpeg drop
        // audio before the AAC repair filter could process it.
        args.push("-copyts", "-start_at_zero");
      } else {
        args.push("-use_wallclock_as_timestamps", "1");
      }
    } else {
      args.push(
        "-probesize",
        "65536",
        "-analyzeduration",
        "100000",
        "-fflags",
        "+nobuffer+flush_packets+genpts+igndts",
        "-flags",
        "low_delay",
      );
    }
    args.push("-i", sourceUrl);

    // camera_proxy_stream is multipart MJPEG; the physical camera codec must
    // not be used to decide whether that proxy can be copied.
    const isH264 =
      this.capabilities.videoCodec === "h264" &&
      this.streamSource.sourceType !== "ha_proxy";
    if (isH264) {
      // Keep H.264 native for HKSV, but normalize the MP4 timing and repeat
      // parameter sets. This fixes the non-monotonous DTS fragments seen on
      // Camera.UI restreams without a global video transcode.
      args.push(
        "-map", "0:v:0",
        "-vcodec", "copy",
        "-bsf:v", "dump_extra=freq=keyframe",
      );
    } else {
      this.platform?.log?.error?.(
        `[HKSV][${this.entityId}] Cámara no entrega H.264 nativo (${this.capabilities.videoCodec || "desconocido"}). Transcodificación con libx264 prohibida en modo passthrough.`,
      );
      this.record.hksvState = "not_capable";
      return null;
    }

    // Audio pipeline: strict passthrough (-c:a copy) if source is AAC; otherwise transcode ONLY audio to AAC
    const audioCodecConfig = this.selectedConfiguration?.audioCodec;
    const sourceAudioCodec = (this.capabilities.audioCodec || "").toLowerCase();
    const isAac = sourceAudioCodec === "aac" || sourceAudioCodec === "aac_lc";
    const requestedSampleRate = recordingSampleRateHz(audioCodecConfig?.samplerate);
    const requestedChannels = audioCodecConfig?.audioChannels;
    const canCopyAac =
      isAac &&
      !!this.capabilities.audioSampleRate &&
      !!requestedSampleRate &&
      this.capabilities.audioSampleRate === requestedSampleRate &&
      (!requestedChannels || !this.capabilities.audioChannels ||
        this.capabilities.audioChannels === requestedChannels);

    if (this.capabilities.hasAudio && canCopyAac) {
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Grabación HKSV: Passthrough de audio AAC nativo activo (-c:a copy)`,
      );
      args.push(
        "-map",
        "0:a:0?",
        "-c:a",
        "copy",
      );
    } else if (this.capabilities.hasAudio) {
      let samplerateStr = "32k";
      if (audioCodecConfig) {
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
      }
      const bitrate = audioCodecConfig?.bitrate || 32;
      const channels = audioCodecConfig?.audioChannels || 1;

      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Grabación HKSV: Normalizando exclusivamente audio fuente (${this.capabilities.audioCodec || "desconocido"}) a AAC (${samplerateStr}, ${bitrate}kbps, ${channels}ch). Vídeo permanece en passthrough puro.`,
      );
      args.push(
        "-map",
        "0:a:0?",
        "-c:a",
        "aac",
        "-af",
        needsAudioTimestampRepair
          ? "asetpts=N/SR/TB,aresample=async=1:min_hard_comp=0.100:first_pts=0"
          : "aresample=async=1:first_pts=0",
        "-ar",
        samplerateStr,
        "-b:a",
        `${bitrate}k`,
        "-ac",
        String(channels),
      );
    } else {
      args.push("-an");
    }

    // Output fragmented MP4 to stdout pipe
    args.push(
      "-avoid_negative_ts",
      "make_zero",
      // Do not let an audio timestamp jump hold fMP4 video fragments hostage.
      "-max_interleave_delta",
      "0",
      "-muxdelay",
      "0",
      "-muxpreload",
      "0",
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof+skip_sidx+skip_trailer",
      "pipe:1",
    );

    return args;
  }

  private async startPrebufferPipeline(): Promise<void> {
    if (this.ffmpegProcess || this.isStartingPipeline || this.isPausedByLiveStream) return;
    this.isStartingPipeline = true;

    try {
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
    const args = this.buildPrebufferArgs(sourceUrl);
    if (!args) return;

    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Spawning HKSV pre-buffer pipeline: ${sanitizedUrl}`,
    );

    // A restarted RTSP reader begins a new fMP4 timeline. Never send its
    // fragments with the previous reader's moov/pre-roll: that produces
    // malformed fMP4 and HomeKit closes the HDS stream with TIMEOUT/BAD_DATA.
    this.segmenter.reset();
    this.initializationSegment = null;
    this.clearPrebuffer();
    const process = spawn(ffmpegPath, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    this.ffmpegProcess = process;

      process.stdout?.on("data", (chunk: Buffer) => {
        // A killed process can flush after its replacement is assigned. Do not
        // combine fMP4 output from two independent recording timelines.
        if (this.ffmpegProcess !== process) return;
        this.segmenter.push(chunk);
      });

      process.stderr?.on("data", (data: Buffer) => {
        if (this.ffmpegProcess !== process) return;
        const msg = data.toString().trim();
        const now = Date.now();
        // Repeated RTSP/AAC timestamp warnings can arrive thousands of times
        // per minute.  Logging every chunk blocks Node's event loop and makes
        // the dashboard and HomeKit accessory appear offline.
        if (msg && now - this.lastPrebufferStderrAt >= 30000) {
          this.lastPrebufferStderrAt = now;
          this.platform?.log?.warn?.(
            `[HKSV][${this.entityId}][ffmpeg] ${msg}`,
          );
        }
      });

      process.on("close", (code) => {
        // A stop caused by Live View deliberately clears the current process.
        // Do not race that cleanup by starting a second reader.
        if (this.ffmpegProcess !== process) return;
        this.platform?.log?.warn?.(
          `[HKSV][${this.entityId}] HKSV pre-buffer FFmpeg exited with code ${code}`,
        );
        this.ffmpegProcess = undefined;
        this.schedulePrebufferRecovery();
      });

      process.on("error", (err) => {
        if (this.ffmpegProcess !== process) return;
        this.platform?.log?.error?.(
          `[HKSV][${this.entityId}] HKSV pre-buffer FFmpeg error: ${err}`,
        );
        this.ffmpegProcess = undefined;
        this.schedulePrebufferRecovery();
      });
    } catch (err) {
      this.platform?.log?.error?.(
        `[HKSV][${this.entityId}] Failed to spawn HKSV FFmpeg process: ${err}`,
      );
      this.ffmpegProcess = undefined;
    } finally {
      this.isStartingPipeline = false;
    }
  }

  private stopPrebufferPipeline(): void {
    this.isStartingPipeline = false;
    if (this.prebufferRestartTimer) {
      clearTimeout(this.prebufferRestartTimer);
      this.prebufferRestartTimer = undefined;
    }
    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill("SIGKILL");
      } catch {}
      this.ffmpegProcess = undefined;
    }
  }

  private clearPrebuffer(): void {
    this.prebuffer = [];
    this.currentPrebufferBytes = 0;
  }

  /**
   * Camera.UI/go2rtc can briefly drop an RTSP publisher while the physical
   * camera reconnects.  Previously that single exit left a paired camera with
   * no HKSV prebuffer until HomeKit happened to rewrite its configuration.
   * Recover one reader at a time, with a bounded backoff, and never while a
   * Live View session owns the camera socket.
   */
  private schedulePrebufferRecovery(): void {
    if (
      !this.recordingActive ||
      !this.selectedConfiguration ||
      this.isPausedByLiveStream ||
      this.prebufferRestartTimer
    ) {
      return;
    }

    this.consecutivePrebufferFailures = Math.min(
      this.consecutivePrebufferFailures + 1,
      6,
    );
    const delayMs = Math.min(
      2_000 * 2 ** (this.consecutivePrebufferFailures - 1),
      60_000,
    );
    this.platform?.log?.warn?.(
      `[HKSV][${this.entityId}] El prebuffer se recuperará en ${Math.round(delayMs / 1000)}s (intento ${this.consecutivePrebufferFailures})`,
    );
    this.prebufferRestartTimer = setTimeout(() => {
      this.prebufferRestartTimer = undefined;
      void this.startPrebufferPipeline();
    }, delayMs);
    this.prebufferRestartTimer.unref?.();
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

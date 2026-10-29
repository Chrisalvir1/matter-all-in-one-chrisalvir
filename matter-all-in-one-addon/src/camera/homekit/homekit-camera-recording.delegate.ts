import { CameraSourceAdapter } from "../source-adapter.js";
import { h264VideoPlan, verifiedH264Encoder } from "./media-policy.js";
/**
 * HomeKit Secure Video (HKSV) Recording Delegate
 * Handles pre-buffering, motion-triggered fragmented MP4 streaming (fMP4/HDS),
 * dynamic audio/video codec negotiation, and verified recording lifecycle.
 */

import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import os from "node:os";
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
import { sanitizeDiagnosticText } from "./live-view-telemetry.js";

function recordingSampleRateHz(
  sampleRate?: AudioRecordingSamplerate,
): number | undefined {
  switch (sampleRate) {
    case AudioRecordingSamplerate.KHZ_8:
      return 8000;
    case AudioRecordingSamplerate.KHZ_16:
      return 16000;
    case AudioRecordingSamplerate.KHZ_24:
      return 24000;
    case AudioRecordingSamplerate.KHZ_32:
      return 32000;
    case AudioRecordingSamplerate.KHZ_44_1:
      return 44100;
    case AudioRecordingSamplerate.KHZ_48:
      return 48000;
    default:
      return undefined;
  }
}

/**
 * HKSV selection is ordinary structured data, but only restore a complete
 * configuration. A malformed cache must never be allowed to start FFmpeg.
 */
function restoreRecordingConfiguration(
  value: unknown,
): CameraRecordingConfiguration | undefined {
  const config = value as any;
  if (
    !config ||
    !Number.isFinite(config.prebufferLength) ||
    !config.mediaContainerConfiguration ||
    !config.videoCodec ||
    !Array.isArray(config.videoCodec.resolution) ||
    config.videoCodec.resolution.length !== 3 ||
    !config.videoCodec.parameters ||
    !config.audioCodec
  ) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(config)) as CameraRecordingConfiguration;
  } catch {
    return undefined;
  }
}

export type CameraFpsOrigin =
  "measured" | "average" | "nominal" | "configured" | "unmeasured";

export interface CameraFpsResolution {
  fps?: number;
  origin: CameraFpsOrigin;
  isObserved: boolean;
  label: string;
}

/**
 * Resolves detailed camera source FPS metadata, strictly distinguishing:
 * - FPS medido real (ffprobe fps observado directamente)
 * - FPS promedio (avg_frame_rate observado)
 * - FPS nominal del contenedor (r_frame_rate, NO confundir con observado)
 * - FPS configurado explícitamente (capabilities.maxFps o record.fps)
 * - "No medido (HKSV no capaz)" si no existe información válida (NUNCA fallback arbitrario a 15)
 */
export function resolveCameraFpsDetails(
  capabilities?: CameraCapabilitiesInfo,
  record?: HomeKitCameraStorageRecord,
): CameraFpsResolution {
  if (!capabilities && !record) {
    return {
      origin: "unmeasured",
      isObserved: false,
      label: "No medido (HKSV no capaz)",
    };
  }

  // 1. Measured real FPS directly observed from ffprobe
  if (
    typeof capabilities?.measuredVideo?.fps === "number" &&
    Number.isFinite(capabilities.measuredVideo.fps) &&
    capabilities.measuredVideo.fps > 0
  ) {
    const fps = Math.round(capabilities.measuredVideo.fps);
    return {
      fps,
      origin: "measured",
      isObserved: true,
      label: `FPS medido: ${fps} fps`,
    };
  }

  // Helper to parse fractional frame rate string e.g. "15/1", "30000/1001", "24/1"
  const parseFractionalFps = (rateStr?: string): number | undefined => {
    if (!rateStr || typeof rateStr !== "string") return undefined;
    const parts = rateStr.split("/").map((p) => Number(p.trim()));
    if (parts.length === 2) {
      const [num, den] = parts;
      if (Number.isFinite(num) && Number.isFinite(den) && num > 0 && den > 0) {
        const val = num / den;
        if (Number.isFinite(val) && val > 0) {
          return Math.round(val);
        }
      }
    } else if (parts.length === 1) {
      const val = parts[0];
      if (Number.isFinite(val) && val > 0) {
        return Math.round(val);
      }
    }
    return undefined;
  };

  // 2. avg_frame_rate from ffprobe (observed average rate across samples)
  const avgFps = parseFractionalFps(capabilities?.measuredVideo?.avgFrameRate);
  if (avgFps !== undefined) {
    return {
      fps: avgFps,
      origin: "average",
      isObserved: true,
      label: `FPS promedio: ${avgFps} fps`,
    };
  }

  // 3. r_frame_rate from ffprobe (nominal container timebase, NOT observed rate)
  const rFps = parseFractionalFps(capabilities?.measuredVideo?.rFrameRate);
  if (rFps !== undefined) {
    return {
      fps: rFps,
      origin: "nominal",
      isObserved: false,
      label: `FPS nominal: ${rFps} fps`,
    };
  }

  // 4. Configured / maxFps validated explicitly by user or profile
  if (
    typeof capabilities?.maxFps === "number" &&
    Number.isFinite(capabilities.maxFps) &&
    capabilities.maxFps > 0
  ) {
    const fps = Math.round(capabilities.maxFps);
    return {
      fps,
      origin: "configured",
      isObserved: false,
      label: `FPS configurado: ${fps} fps`,
    };
  }

  const recordFps = (record as any)?.fps;
  if (
    typeof recordFps === "number" &&
    Number.isFinite(recordFps) &&
    recordFps > 0
  ) {
    const fps = Math.round(recordFps);
    return {
      fps,
      origin: "configured",
      isObserved: false,
      label: `FPS configurado: ${fps} fps`,
    };
  }

  return {
    origin: "unmeasured",
    isObserved: false,
    label: "No medido (HKSV no capaz)",
  };
}

/**
 * Resolves camera source FPS using strict priority:
 * 1. Measured real FPS (`measuredVideo.fps`) if valid (> 0 and finite)
 * 2. `avg_frame_rate` (parsed from fractional "num/den") if valid (> 0 and finite)
 * 3. `r_frame_rate` (parsed from fractional "num/den") if valid (> 0 and finite)
 * 4. Configured / max FPS (`capabilities.maxFps` or `record.fps`) if valid (> 0 and finite)
 * 5. Returns `undefined` if no valid FPS can be determined (NEVER fallback to arbitrary 15 fps).
 */
export function resolveCameraSourceFps(
  capabilities?: CameraCapabilitiesInfo,
  record?: HomeKitCameraStorageRecord,
): number | undefined {
  return resolveCameraFpsDetails(capabilities, record).fps;
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
  private sessionAcknowledged = false;

  // Active motion recording state
  private isMotionActive = false;
  private currentStreamId?: number;
  private streamAbortController?: AbortController;
  private isStartingPipeline = false;
  private lastPrebufferStderrAt = 0;
  /** A transient RTSP/go2rtc interruption must not permanently disable HKSV. */
  private prebufferRestartTimer?: NodeJS.Timeout;
  private consecutivePrebufferFailures = 0;
  /** A direct Omni RTSP 404 means future HKSV readers should use HA's route. */
  private preferOmniTuyaHaFallback = false;

  constructor(
    private readonly platform: any,
    private readonly entityId: string,
    private readonly record: HomeKitCameraStorageRecord,
    private readonly capabilities: CameraCapabilitiesInfo,
    private streamSource: ResolvedStreamSource,
  ) {
    super();

    const persistedConfiguration = restoreRecordingConfiguration(
      this.record.hksvRecordingConfiguration,
    );
    if (persistedConfiguration) {
      this.selectedConfiguration = persistedConfiguration;
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Restored persisted Home Hub recording configuration after restart`,
      );
    }

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

    // A capable/configured camera is not the same as active HKSV recording.
    // HomeKit's persisted Active characteristic or an explicit recording
    // stream request starts the prebuffer. Never infer Active from capability:
    // that leaves FFmpeg readers (and C120 software transcodes) running while
    // recording is disabled in Apple Home.
    this.recordingActive = false;
    this.record.hksvState =
      this.record.hksvEnabled === false ? "not_capable" : "waiting_hub";
  }

  /**
   * Called by HAP-NodeJS when Apple Home toggles recording active state.
   */
  public updateRecordingActive(active: boolean): void {
    this.recordingActive = active;
    this.record.hksvState = active
      ? this.selectedConfiguration
        ? "ready"
        : "waiting_hub"
      : this.selectedConfiguration
        ? "configurable"
        : "waiting_hub";

    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] Recording active state changed: ${active ? "ENABLED" : "PAUSED"}`,
    );
    if (active && !this.selectedConfiguration) {
      this.platform?.log?.warn?.(
        `[HKSV][${this.entityId}] Grabación activada, pero falta SelectedCameraRecordingConfiguration del Home Hub. Aún no está lista para grabar; alternar Transmitir y Transmitir y permitir grabación en Casa solicita una nueva negociación.`,
      );
    }

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
    if (!this.recordingActive) {
      this.platform?.log?.debug?.(
        `[HKSV][${this.entityId}] pausePrebuffer() omitido: recordingActive=false`,
      );
      return;
    }
    if (this.isPausedByLiveStream) {
      this.platform?.log?.debug?.(
        `[HKSV][${this.entityId}] pausePrebuffer() omitido: ya pausado por Live View`,
      );
      return;
    }
    this.isPausedByLiveStream = true;
    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] STAGE: prebuffer PAUSED — Live View activo, liberando socket RTSP`,
    );
    this.stopPrebufferPipeline();
    if (this.streamSource.metadata?.isOmniTuyaDirect === true) {
      // Omni direct RTSP only permits one reader. Live View will supply a fresh
      // fMP4 output from its existing reader; never mix fragments from the old
      // prebuffer timeline with the new live-stream timeline.
      this.segmenter.reset();
      this.initializationSegment = null;
      this.clearPrebuffer();
    }
  }

  /** Feed fMP4 bytes from the active HomeKit RTSP reader while Live View owns Omni's socket. */
  public ingestLiveViewRecordingChunk(chunk: Buffer): void {
    if (
      this.streamSource.metadata?.isOmniTuyaDirect !== true ||
      !this.isPausedByLiveStream ||
      !this.recordingActive ||
      !chunk?.length
    )
      return;
    this.segmenter.push(chunk);
  }

  /**
   * Re-activate the HKSV pre-buffer pipeline once all Live View sessions have ended.
   */
  public resumePrebuffer(): void {
    if (!this.recordingActive) {
      this.platform?.log?.debug?.(
        `[HKSV][${this.entityId}] resumePrebuffer() omitido: recordingActive=false`,
      );
      return;
    }
    if (!this.isPausedByLiveStream) {
      this.platform?.log?.debug?.(
        `[HKSV][${this.entityId}] resumePrebuffer() omitido: no estaba pausado por Live View`,
      );
      return;
    }
    this.isPausedByLiveStream = false;
    this.platform?.log?.notice?.(
      `[HKSV][${this.entityId}] STAGE: prebuffer RESUMED — todas las sesiones Live View finalizadas`,
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
      try {
        this.record.hksvRecordingConfiguration = JSON.parse(
          JSON.stringify(configuration),
        ) as Record<string, unknown>;
        void this.platform?.saveHomeKitCameraRecords?.();
      } catch {}
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
      delete this.record.hksvRecordingConfiguration;
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
    this.sessionAcknowledged = false;
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
      await this.waitForInitialization(10000);
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
    if (this.currentStreamId !== streamId) return;
    this.sessionAcknowledged = true;
    this.platform?.log?.notice?.(
      `[HKSV][${this.record.name || this.entityId}] ✅ Apple Home Hub aceptó el final de la transmisión HKSV (streamId ${streamId})`,
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
      `[HKSV][${this.entityId}] Recording stream closed for streamId ${streamId} (reason: ${reason ?? "connection closed"}, normal: ${isNormal}, initSent=${this.deliveredInitInSession}, fragmentsSent=${this.deliveredFragmentsInSession})`,
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
      this.sessionAcknowledged &&
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
          `[HKSV][${this.entityId}] ✅ HKSV VERIFIED: Apple Home Hub aceptó una transmisión con múltiples fragmentos.`,
        );
        if (this.platform?.saveHomeKitCameraRecords) {
          this.platform.saveHomeKitCameraRecords();
        }
        this.emit("hksv-verified");
      }
    }
  }

  private handleNewFragment(fragment: Fmp4MediaFragment): void {
    if (this.isPausedByLiveStream && this.recordingActive) {
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Live View fMP4 fragment seq=${fragment.sequenceNumber ?? "?"} keyframe=${fragment.isKeyframe} bytes=${fragment.data.length}`,
      );
    }

    // Only accept keyframed fragments into prebuffer to prevent decode corruption
    if (fragment.isKeyframe) {
      this.prebuffer.push(fragment);
      this.currentPrebufferBytes += fragment.data.length;

      // Enforce ring buffer limits (duration and memory)
      const targetDurationMs =
        this.selectedConfiguration?.prebufferLength || 8000;
      const fragmentLength =
        this.selectedConfiguration?.mediaContainerConfiguration
          .fragmentLength || 4000;

      while (
        (this.prebuffer.length * fragmentLength >
          targetDurationMs + fragmentLength ||
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

    // Native RTSP timelines are retained; audio repair uses decoded sample count.
    // This is a media policy, independent of model names and UI aliases.
    const needsAudioTimestampRepair = true;

    // Build FFmpeg fMP4 args
    const args = ["-hide_banner", "-loglevel", "warning"];

    args.push(
      ...new CameraSourceAdapter(
        this.platform,
        this.entityId,
        { ...this.streamSource, url: sourceUrl },
        this.capabilities,
        this.record,
      ).inputArguments(),
    );

    if (sourceUrl.startsWith("rtsp://") || sourceUrl.startsWith("rtsps://")) {
      args.push(
        "-rtsp_transport",
        "tcp",
        "-timeout",
        "5000000",
        "-probesize",
        "2097152",
        "-analyzeduration",
        "3000000",
        "-fflags",
        "+genpts+discardcorrupt",
        "-flags",
        "low_delay",
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
    const isHaProxy = this.streamSource.sourceType === "ha_proxy";

    if (
      isH264 &&
      (this.capabilities.resolution.width > 1920 ||
        this.capabilities.resolution.height > 1080)
    ) {
      const plan = h264VideoPlan(this.capabilities, verifiedH264Encoder());
      if (plan.mode !== "normalization")
        throw new Error("Invalid recording geometry");
      args.push(
        "-map",
        "0:v:0",
        "-c:v",
        plan.encoder!,
        "-vf",
        `scale=${plan.width}:${plan.height}`,
        "-pix_fmt",
        "yuv420p",
      );
    } else if (isH264) {
      // Native H.264 1080p cameras (including C402, C120, Ezviz, Wyze): zero transcoding overhead, pure passthrough copy
      args.push(
        "-map",
        "0:v:0",
        "-vcodec",
        "copy",
        "-bsf:v",
        "dump_extra=freq=keyframe",
      );
    } else if (isHaProxy) {
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Fuente ha_proxy MJPEG detectada — transcodificando a H.264 1080p para grabación HKSV`,
      );
      args.push(
        "-map",
        "0:v:0",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-profile:v",
        "high",
        "-level:v",
        "4.0",
        "-vf",
        "scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-r",
        "15",
        "-g",
        "30",
        "-keyint_min",
        "15",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
      );
    } else {
      // HEVC / H.265 / 4K / 2K sources (Vimtag and all HKSV3 / HEVC cameras):
      // Strict passthrough copy with Apple-compliant hvc1 tag for pure HKSV3 / Open Source compatibility.
      // Video is 100% passthrough (-c:v copy). Audio is normalized separately if needed. Zero video transcoding.
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Fuente HEVC/H.265 detectada: empaquetando grabación HKSV en passthrough puro (-c:v copy, tag: hvc1)`,
      );
      args.push("-map", "0:v:0", "-c:v", "copy", "-tag:v", "hvc1");
    }

    // Audio pipeline: strict passthrough (-c:a copy) if source is AAC; otherwise transcode ONLY audio to AAC
    const audioCodecConfig = this.selectedConfiguration?.audioCodec;
    const sourceAudioCodec = (this.capabilities.audioCodec || "").toLowerCase();
    const isAac = sourceAudioCodec === "aac" || sourceAudioCodec === "aac_lc";
    const requestedSampleRate = recordingSampleRateHz(
      audioCodecConfig?.samplerate,
    );
    const requestedChannels = audioCodecConfig?.audioChannels;
    const canCopyAac =
      sourceAudioCodec === "aac_lc" &&
      this.capabilities.audioSampleRate === 48000 &&
      this.capabilities.audioChannels === 1;

    if (this.capabilities.hasAudio && canCopyAac) {
      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Grabación HKSV: Passthrough de audio AAC nativo activo (-c:a copy)`,
      );
      args.push("-map", "0:a:0?", "-c:a", "copy");
    } else if (this.capabilities.hasAudio) {
      const samplerateStr = "48k";
      const bitrate = audioCodecConfig?.bitrate || 32;
      const channels = 1;

      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Grabación HKSV: Normalizando exclusivamente audio fuente (${this.capabilities.audioCodec || "desconocido"}) a AAC (${samplerateStr}, ${bitrate}kbps, ${channels}ch). Vídeo permanece en passthrough puro.`,
      );
      args.push(
        "-map",
        "0:a:0?",
        "-c:a",
        "aac",
        "-profile:a",
        "aac_low",
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
      "-frag_duration",
      String(
        Math.max(
          1000,
          Math.min(
            10000,
            Number(
              this.selectedConfiguration?.mediaContainerConfiguration
                ?.fragmentLength,
            ) || 4000,
          ),
        ) * 1000,
      ),
      "pipe:1",
    );

    return args;
  }

  private async startPrebufferPipeline(): Promise<void> {
    if (
      this.ffmpegProcess ||
      this.isStartingPipeline ||
      this.isPausedByLiveStream
    )
      return;
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
      let haEntityId =
        this.record.sourceCameraEntityId ||
        this.streamSource.metadata?.sourceCameraEntityId ||
        this.entityId;
      if (!/^camera\.[a-z0-9_]+$/.test(haEntityId)) {
        const realCam = this.record.realEntities?.find(
          (e: any) =>
            typeof e?.id === "string" &&
            /^camera\.[a-z0-9_]+$/.test(e.id) &&
            this.platform?.ha?.hassStates?.has(e.id),
        )?.id;
        if (realCam) {
          haEntityId = realCam;
        } else if (
          /(?:c402|frente[-_ ]?de[-_ ]?calle)/i.test(
            `${this.entityId} ${this.record.name || ""}`,
          )
        ) {
          if (
            this.platform?.ha?.hassStates?.has("camera.tapo_frente_de_calle")
          ) {
            haEntityId = "camera.tapo_frente_de_calle";
          } else if (this.platform?.ha?.hassStates?.has("camera.tapo_c402")) {
            haEntityId = "camera.tapo_c402";
          } else {
            haEntityId = this.record.sourceCameraEntityId || "";
          }
        } else if (
          /(?:c120|spot)/i.test(`${this.entityId} ${this.record.name || ""}`)
        ) {
          if (this.platform?.ha?.hassStates?.has("camera.tapo_c120")) {
            haEntityId = "camera.tapo_c120";
          } else if (this.platform?.ha?.hassStates?.has("camera.tapo_spot")) {
            haEntityId = "camera.tapo_spot";
          } else if (this.platform?.ha?.hassStates?.has("camera.c120")) {
            haEntityId = "camera.c120";
          } else if (
            this.platform?.ha?.hassStates?.has("camera.tapo_c120_hd")
          ) {
            haEntityId = "camera.tapo_c120_hd";
          } else {
            haEntityId = this.record.sourceCameraEntityId || "";
          }
        }
      }

      if (
        haEntityId &&
        (!/^camera\.[a-z0-9_]+$/.test(haEntityId) ||
          !this.platform?.ha?.hassStates?.has(haEntityId))
      ) {
        haEntityId = "";
      }
      if (!haEntityId && this.streamSource.sourceType === "ha_proxy") {
        sourceUrl = "";
      }

      const isOmniSource =
        this.streamSource.metadata?.isOmniTuyaDirect === true ||
        this.streamSource.metadata?.isOmniTuyaFallback === true;
      if (isOmniSource && haEntityId) {
        const state = this.platform?.ha?.hassStates?.get(haEntityId);
        const refreshed =
          await CameraSourceResolver.resolveOmniTuyaRecordingSource(
            this.platform,
            haEntityId,
            state,
            this.preferOmniTuyaHaFallback ||
              this.streamSource.metadata?.isOmniTuyaFallback === true,
          );
        this.streamSource = refreshed;
        sourceUrl = refreshed.url || "";
      } else if (
        haEntityId &&
        (!sourceUrl ||
          this.streamSource.sourceType === "hls" ||
          this.streamSource.sourceType === "ha_proxy")
      ) {
        const state = this.platform?.ha?.hassStates?.get(haEntityId);
        if (state) {
          try {
            const fresh = await CameraSourceResolver.resolve(
              this.platform,
              haEntityId,
              state,
            );
            if (fresh && fresh.url) {
              this.streamSource = {
                ...fresh,
                metadata: {
                  ...this.streamSource.metadata,
                  ...fresh.metadata,
                  sourceCameraEntityId:
                    (fresh.metadata as any)?.sourceCameraEntityId || haEntityId,
                },
              };
              sourceUrl = fresh.url;
            }
          } catch {}
        }
        if (
          (!sourceUrl || this.streamSource.sourceType === "ha_proxy") &&
          this.platform?.ha?.requestCameraStream
        ) {
          try {
            const freshUrl =
              await this.platform.ha.requestCameraStream(haEntityId);
            if (freshUrl) {
              sourceUrl = freshUrl;
              this.streamSource.url = freshUrl;
              this.streamSource.sourceType = "hls";
            }
          } catch {}
        }
        if (!sourceUrl && this.platform?.ha?.getCameraProxyStreamUrl) {
          const proxyUrl = this.platform.ha.getCameraProxyStreamUrl(haEntityId);
          if (proxyUrl) {
            sourceUrl = proxyUrl;
            this.streamSource.url = proxyUrl;
            this.streamSource.sourceType = "ha_proxy";
          }
        }
      }

      // Source allocation awaits the Cloud API. Live View may have paused
      // recording while that request was in flight; never spawn afterward.
      if (this.isPausedByLiveStream) return;

      if (!sourceUrl) {
        this.platform?.log?.warn?.(
          `[HKSV][${this.entityId}] Cannot start HKSV pre-buffer: stream URL missing`,
        );
        return;
      }

      const token =
        this.platform?.ha?.getAccessToken?.() ||
        this.platform?.ha?.wsAccessToken;
      const sanitizedUrl = sanitizeUrlCredentials(sourceUrl);
      const args = this.buildPrebufferArgs(sourceUrl);
      if (!args) return;

      this.platform?.log?.notice?.(
        `[HKSV][${this.entityId}] Spawning HKSV pre-buffer pipeline: [camera-source]`,
      );

      // Track sanitized telemetry metrics for this prebuffer session
      const pipelineStartTime = Date.now();
      const inWidth = this.capabilities.resolution.width;
      const inHeight = this.capabilities.resolution.height;
      const inFps = resolveCameraSourceFps(this.capabilities, this.record) ?? 0;
      const ratio = Math.min(1, 1920 / inWidth, 1080 / inHeight);
      const outWidth = Math.floor((inWidth * ratio) / 2) * 2;
      const outHeight = Math.floor((inHeight * ratio) / 2) * 2;
      const outFps = inFps;
      let droppedFrames = 0;
      let encodingErrors = 0;

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
        const msg = data.toString();
        if (
          this.streamSource.metadata?.isOmniTuyaDirect === true &&
          /(?:DESCRIBE failed:\s*404|404\s+Stream Not Found)/i.test(msg)
        ) {
          this.preferOmniTuyaHaFallback = true;
          this.platform?.log?.warn?.(
            `[HKSV][${this.entityId}] Omni RTSP returned 404 Stream Not Found; the next reader will use Home Assistant's stream/proxy route.`,
          );
        }
        // Parse metrics safely
        const dropMatch = /drop=\s*(\d+)/.exec(msg);
        if (dropMatch) {
          droppedFrames = Number(dropMatch[1]);
        }
        if (/\[error\]|error while decoding|conversion failed/i.test(msg)) {
          encodingErrors++;
        }

        const now = Date.now();
        // Repeated RTSP/AAC timestamp warnings can arrive thousands of times
        // per minute. Logging every chunk blocks Node's event loop and makes
        // the dashboard and HomeKit accessory appear offline.
        if (msg.trim() && now - this.lastPrebufferStderrAt >= 30000) {
          this.lastPrebufferStderrAt = now;
          const safe = sanitizeDiagnosticText(msg.trim());
          if (safe) {
            this.platform?.log?.warn?.(
              `[HKSV][${this.entityId}][ffmpeg] ${safe}`,
            );
          }
        }
      });

      process.on("close", (code) => {
        // A stop caused by Live View deliberately clears the current process.
        // Do not race that cleanup by starting a second reader.
        if (this.ffmpegProcess !== process) return;
        const durationSec = Math.round((Date.now() - pipelineStartTime) / 1000);
        const load1m = os.loadavg()[0]?.toFixed(2) ?? "n/a";
        this.platform?.log?.notice?.(
          `[HKSV][${this.entityId}] Prebuffer métricas: duración=${durationSec}s, in=${inWidth}x${inHeight}@${inFps}fps, out=${outWidth}x${outHeight}@${outFps}fps, framesPerdidos=${droppedFrames}, errores=${encodingErrors}, cargaSistema1m=${load1m}, exitCode=${code}`,
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

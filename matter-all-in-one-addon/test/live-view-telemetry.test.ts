import { describe, expect, it } from "vitest";
import { parseFfprobeJson } from "../src/camera/homekit/ffmpeg-helper.js";
import {
  createSessionTelemetry,
  finishSessionTelemetry,
  mergeFfmpegStreamHeader,
  mergeFfmpegProgress,
  retainRecentSessions,
  sanitizeDiagnosticText,
  sourceMetadataFromProbe,
  classifyLiveViewProcessing,
} from "../src/camera/homekit/live-view-telemetry.js";

describe("Live View telemetry", () => {
  it("parses every measured ffprobe video field", () => {
    const parsed = parseFfprobeJson({
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          profile: "High",
          level: 50,
          width: 2560,
          height: 1440,
          r_frame_rate: "15/1",
          avg_frame_rate: "15/1",
          bit_rate: "2800000",
          pix_fmt: "yuv420p",
        },
        {
          codec_type: "audio",
          codec_name: "pcm_alaw",
          sample_rate: "8000",
          channels: 1,
        },
      ],
    });
    expect(parsed).toMatchObject({
      videoCodec: "h264",
      videoProfile: "High",
      videoLevel: "5.0",
      width: 2560,
      height: 1440,
      rFrameRate: "15/1",
      avgFrameRate: "15/1",
      fps: 15,
      bitrateKbps: 2800,
      pixFmt: "yuv420p",
      audioCodec: "pcm_alaw",
    });
  });

  it("records only sanitized session diagnostics and finalizes duration", () => {
    const session = createSessionTelemetry({
      cameraId: "camera.c120",
      sessionId: "session-1",
      videoSsrc: 1234,
      effectiveMode: "normalization",
      video: { width: 1920, height: 1080, fps: 15 },
      output: { codec: "h264", width: 1920, height: 1080, level: "4.0" },
      fallbackReason: "rtsp://admin:secret@camera.local/live token=abc",
    });
    const finished = finishSessionTelemetry(
      session,
      "failed",
      "Authorization: Bearer secret-token-value",
    );
    expect(finished.durationMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(finished)).not.toContain("secret");
    expect(JSON.stringify(finished)).not.toContain("camera.local");
    expect(finished.cameraId).toBe("camera.c120");
  });

  it("keeps telemetry camera scoped and does not leak rates between cameras", () => {
    const c120 = createSessionTelemetry({
      cameraId: "camera.c120",
      sessionId: "c120-session",
      effectiveMode: "normalization",
      video: { fps: 15 },
      output: sourceMetadataFromProbe({ avgFrameRate: "15/1" }),
    });
    const wyze = createSessionTelemetry({
      cameraId: "camera.wyze",
      sessionId: "wyze-session",
      effectiveMode: "copy",
      video: { fps: 20 },
      output: sourceMetadataFromProbe({ avgFrameRate: "20/1" }),
    });
    expect(c120.cameraId).toBe("camera.c120");
    expect(wyze.cameraId).toBe("camera.wyze");
    expect(c120.output?.averageFps).toBe(15);
    expect(wyze.output?.averageFps).toBe(20);
  });

  it("records only safe ffmpeg progress fields", () => {
    const output = mergeFfmpegProgress(
      { codec: "h264", width: 1920, height: 1080 },
      "fps=14.8",
    );
    const progressed = mergeFfmpegProgress(output, "bitrate=3210.5kbits/s");
    expect(progressed).toMatchObject({ fps: 14.8, bitrateKbps: 3210.5 });
    expect(
      mergeFfmpegProgress(progressed, "Input #0, rtsp://user:secret@host/live"),
    ).toEqual(progressed);
  });

  it("stores structured output-header fields without retaining the FFmpeg line", () => {
    const output = mergeFfmpegStreamHeader(
      { level: "4.0", metadataSource: "effective-command" },
      "Stream #0:0: Video: h264 (High), yuv420p(progressive), 1920x1080, 15 fps, 4500 kb/s",
    );
    expect(output).toMatchObject({
      codec: "h264",
      profile: "High",
      level: "4.0",
      width: 1920,
      height: 1080,
      fps: 15,
      bitrateKbps: 4500,
      pixFmt: "yuv420p(progressive)",
      metadataSource: "ffmpeg-header",
    });
  });

  it("keeps measured source metadata distinct from effective output metadata", () => {
    const source = sourceMetadataFromProbe({
      videoCodec: "h264",
      videoProfile: "High",
      videoLevel: "5.0",
      width: 2560,
      height: 1440,
      rFrameRate: "15/1",
      avgFrameRate: "15/1",
      bitrateKbps: 2800,
      pixFmt: "yuv420p",
    });
    expect(source).toMatchObject({
      width: 2560,
      height: 1440,
      level: "5.0",
      fps: 15,
      nominalFps: 15,
      averageFps: 15,
    });
    expect(
      sanitizeDiagnosticText("srtp_out_params=abc123 token=xyz"),
    ).not.toContain("abc123");
  });

  it.each([10, 15, 20, 30])(
    "does not replace measured %s fps with a global default",
    (fps) => {
      const source = sourceMetadataFromProbe({
        videoCodec: "h264",
        width: 1920,
        height: 1080,
        rFrameRate: `${fps}/1`,
        avgFrameRate: `${fps}/1`,
      });
      expect(source.nominalFps).toBe(fps);
      expect(source.averageFps).toBe(fps);
      expect(source.fps).toBe(fps);
    },
  );

  it("leaves missing measured FPS as no measurement and detects variable output", () => {
    const source = sourceMetadataFromProbe({
      videoCodec: "h264",
      width: 1920,
      height: 1080,
    });
    expect(source.fps).toBeUndefined();
    const output = mergeFfmpegProgress(undefined, "fps=10");
    const next = mergeFfmpegProgress(output, "fps=20");
    expect(next).toMatchObject({
      observedFps: 20,
      observedFpsMin: 10,
      observedFpsMax: 20,
    });
  });

  it("classifies copy, downscale, FPS normalization, transcode and fallback per session", () => {
    expect(
      classifyLiveViewProcessing({
        copiedVideo: true,
        sourceWidth: 1920,
        outputWidth: 1920,
        requestedFps: 15,
        outputFps: 15,
      }),
    ).toBe("copy");
    expect(
      classifyLiveViewProcessing({
        copiedVideo: false,
        sourceWidth: 2560,
        outputWidth: 1920,
      }),
    ).toBe("normalization");
    expect(
      classifyLiveViewProcessing({
        copiedVideo: false,
        requestedFps: 15,
        outputFps: 10,
      }),
    ).toBe("fps-normalization");
    expect(classifyLiveViewProcessing({ copiedVideo: false })).toBe(
      "transcode",
    );
    expect(classifyLiveViewProcessing({ fallback: true })).toBe("fallback");
  });

  it("keeps only a bounded, newest-first session history", () => {
    let history: ReturnType<typeof retainRecentSessions> = [];
    for (let index = 0; index < 10; index += 1) {
      history = retainRecentSessions(
        history,
        createSessionTelemetry({
          cameraId: "camera.c120",
          sessionId: `session-${index}`,
          effectiveMode: "copy",
        }),
        8,
      );
    }
    expect(history).toHaveLength(8);
    expect(history[0]?.sessionId).toBe("session-9");
    expect(history.at(-1)?.sessionId).toBe("session-2");
  });
});

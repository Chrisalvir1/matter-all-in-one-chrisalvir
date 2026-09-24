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
      avgFrameRate: "15/1",
      bitrateKbps: 2800,
      pixFmt: "yuv420p",
    });
    expect(source).toMatchObject({
      width: 2560,
      height: 1440,
      level: "5.0",
      fps: 15,
    });
    expect(
      sanitizeDiagnosticText("srtp_out_params=abc123 token=xyz"),
    ).not.toContain("abc123");
  });

  it("keeps only a bounded, newest-first session history", () => {
    let history: ReturnType<typeof retainRecentSessions> = [];
    for (let index = 0; index < 10; index += 1) {
      history = retainRecentSessions(
        history,
        createSessionTelemetry({
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

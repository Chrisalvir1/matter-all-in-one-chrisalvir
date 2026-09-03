import { describe, expect, it, vi, beforeEach } from "vitest";
import { ScryptedStreamValidator } from "../src/camera/scrypted/scrypted-stream-validator.js";
import * as ffmpegHelper from "../src/camera/homekit/ffmpeg-helper.js";

describe("ScryptedStreamValidator", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    ScryptedStreamValidator.clearCache();
  });

  it("returns not_checked when url is empty", async () => {
    const res = await ScryptedStreamValidator.validateStreamUrl("");
    expect(res.status).toBe("not_checked");
  });

  it("returns invalid when url is an invented path matching /:cameraId", async () => {
    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.50:8554/51",
      "51",
    );
    expect(res.status).toBe("invalid");
    expect(res.error).toContain("URL rechazada");
  });

  it("returns verified when ffprobe returns valid video stream", async () => {
    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: true,
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1920,
      height: 1080,
      fps: 30,
      hasAudio: true,
      probeMethod: "ffprobe",
    });

    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.50:8554/tapo_main",
      "51",
    );
    expect(res.status).toBe("verified");
    expect(res.videoCodec).toBe("h264");
    expect(res.resolution).toEqual({ width: 1920, height: 1080 });
  });

  it("classifies 404 error as not_found", async () => {
    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "Server returned 404 Not Found",
    });

    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.50:8554/wrong_path",
      "51",
    );
    expect(res.status).toBe("not_found");
  });

  it("classifies 401 error as unauthorized", async () => {
    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "401 Unauthorized",
    });

    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.50:8554/protected_path",
      "51",
    );
    expect(res.status).toBe("unauthorized");
  });

  it("classifies timeout error as timeout", async () => {
    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "Connection timed out",
    });

    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.200:8554/stream",
      "51",
    );
    expect(res.status).toBe("timeout");
  });

  it("classifies connection refused as source_offline", async () => {
    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "connect ECONNREFUSED 192.168.1.50:8554",
    });

    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.50:8554/stream",
      "51",
    );
    expect(res.status).toBe("source_offline");
  });

  it("classifies missing ffprobe or ffmpeg as invalid in validateStreamUrl", async () => {
    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "No FFprobe or FFmpeg binary available for probing",
    });

    const res = await ScryptedStreamValidator.validateStreamUrl(
      "rtsp://192.168.1.50:8554/stream",
      "51",
    );
    expect(res.status).toBe("invalid");
  });

  describe("diagnoseStreamUrl", () => {
    it("returns missing_stream_url error when URL is empty", async () => {
      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl("", "51");
      expect(metrics.failureCause).toBe("missing_stream_url");
      expect(metrics.error).toContain("URL de stream no configurada");
      expect(metrics.timeToDescribeMs).toBeUndefined();
    });

    it("rejects invented RTSP URL (/51) with invalid_stream cause", async () => {
      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.50:8554/51",
        "51",
      );
      expect(metrics.failureCause).toBe("invalid_stream");
      expect(metrics.error).toContain("URL rechazada");
      expect(metrics.timeToDescribeMs).toBeUndefined();
    });

    it("diagnoses valid stream successfully with full metrics", async () => {
      vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
        valid: true,
        videoCodec: "h264",
        audioCodec: "aac",
        width: 1920,
        height: 1080,
        fps: 30,
        bitrateKbps: 2048,
        hasAudio: true,
        probeMethod: "ffprobe",
      });
      vi.spyOn(ffmpegHelper, "measureStreamGop").mockResolvedValue(2);

      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.50:8554/live_feed",
        "51",
      );
      expect(metrics.error).toBeUndefined();
      expect(metrics.failureCause).toBeUndefined();
      expect(metrics.timeToDescribeMs?.value).toBeGreaterThanOrEqual(0);
      expect(metrics.timeToFirstFrameMs?.value).toBeGreaterThanOrEqual(0);
      expect(metrics.selectedTransport.value).toBe("tcp");
      expect(metrics.observedFps?.value).toBe(30);
      expect(metrics.observedBitrateKbps?.value).toBe(2048);
    });

    it("classifies missing ffprobe binary as ffprobe_missing", async () => {
      vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
        valid: false,
        hasAudio: false,
        error: "No FFprobe or FFmpeg binary available for probing",
      });

      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.50:8554/live_feed",
        "51",
      );
      expect(metrics.failureCause).toBe("ffprobe_missing");
      expect(metrics.error).toContain("No FFprobe or FFmpeg");
      expect(metrics.timeToDescribeMs).toBeUndefined();
    });

    it("classifies 404 in diagnoseStreamUrl as not_found", async () => {
      vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
        valid: false,
        hasAudio: false,
        error: "Server returned 404 Not Found",
      });

      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.50:8554/missing",
        "51",
      );
      expect(metrics.failureCause).toBe("not_found");
      expect(metrics.error).toContain("404");
    });

    it("classifies 401 in diagnoseStreamUrl as unauthorized", async () => {
      vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
        valid: false,
        hasAudio: false,
        error: "401 Unauthorized",
      });

      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.50:8554/secure",
        "51",
      );
      expect(metrics.failureCause).toBe("unauthorized");
      expect(metrics.error).toContain("401");
    });

    it("classifies timeout in diagnoseStreamUrl as timeout", async () => {
      vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
        valid: false,
        hasAudio: false,
        error: "Connection timed out",
      });

      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.250:8554/feed",
        "51",
      );
      expect(metrics.failureCause).toBe("timeout");
    });

    it("classifies connection refused in diagnoseStreamUrl as source_offline", async () => {
      vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
        valid: false,
        hasAudio: false,
        error: "connect ECONNREFUSED 192.168.1.50:8554",
      });

      const metrics = await ScryptedStreamValidator.diagnoseStreamUrl(
        "rtsp://192.168.1.50:8554/feed",
        "51",
      );
      expect(metrics.failureCause).toBe("source_offline");
    });
  });
});

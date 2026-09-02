import { describe, expect, it, vi } from "vitest";
import { ScryptedStreamValidator } from "../src/camera/scrypted/scrypted-stream-validator.js";
import * as ffmpegHelper from "../src/camera/homekit/ffmpeg-helper.js";

describe("ScryptedStreamValidator", () => {
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
});

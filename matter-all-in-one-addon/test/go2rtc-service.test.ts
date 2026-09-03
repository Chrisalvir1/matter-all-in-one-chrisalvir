import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { Go2rtcService } from "../src/camera/go2rtc/go2rtc-service.js";

describe("Go2rtcService", () => {
  let service: Go2rtcService;

  beforeEach(() => {
    service = new Go2rtcService({
      apiPort: 19840,
      rtspPort: 18554,
      webrtcPort: 18555,
      configPath: "/tmp/test-go2rtc.yaml",
      binaryPath: "/bin/echo",
    });
  });

  afterEach(async () => {
    await service.stop();
    vi.restoreAllMocks();
  });

  it("normalizes stream names correctly", () => {
    expect(service.normalizeStreamName("Tapo Frente 1!")).toBe("tapo_frente_1_");
    expect(service.normalizeStreamName("camera.patio_trasero")).toBe("camera_patio_trasero");
    expect(service.normalizeStreamName("ezviz-123")).toBe("ezviz-123");
  });

  it("generates correct restreamer and snapshot URLs", () => {
    const restreamUrl = service.getRestreamUrl("tapo_sala");
    expect(restreamUrl).toBe("rtsp://127.0.0.1:18554/tapo_sala");

    const snapshotUrl = service.getSnapshotUrl("tapo_sala");
    expect(snapshotUrl).toBe("http://127.0.0.1:19840/api/frame.jpeg?src=tapo_sala");
  });

  it("registers stream via REST API when running", async () => {
    // Mock running state
    (service as any).isRunning = true;

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const ok = await service.registerStream("tapo_cam", "rtsp://admin:pass@192.168.1.50:554/stream1");
    expect(ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("http://127.0.0.1:19840/api/streams?name=tapo_cam&src="),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("unregisters stream via REST API", async () => {
    (service as any).isRunning = true;

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const ok = await service.unregisterStream("tapo_cam");
    expect(ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:19840/api/streams?name=tapo_cam",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("fetches snapshot buffer and verifies JPEG magic bytes", async () => {
    (service as any).isRunning = true;

    // Create mock JPEG buffer (FF D8 ... FF D9) > 512 bytes
    const jpegBytes = new Uint8Array(1024);
    jpegBytes[0] = 0xff;
    jpegBytes[1] = 0xd8;
    jpegBytes[1022] = 0xff;
    jpegBytes[1023] = 0xd9;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => jpegBytes.buffer,
    });
    vi.stubGlobal("fetch", mockFetch);

    const snapshot = await service.fetchSnapshot("tapo_cam");
    expect(snapshot).not.toBeNull();
    expect(snapshot?.length).toBe(1024);
    expect(snapshot?.[0]).toBe(0xff);
    expect(snapshot?.[1]).toBe(0xd8);
  });

  it("rejects non-JPEG buffers in fetchSnapshot", async () => {
    (service as any).isRunning = true;

    const randomBytes = new Uint8Array(1024); // Not starting with FF D8
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => randomBytes.buffer,
    });
    vi.stubGlobal("fetch", mockFetch);

    const snapshot = await service.fetchSnapshot("tapo_cam");
    expect(snapshot).toBeNull();
  });

  it("handles healthcheck probe", async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    const healthy = await service.healthcheck();
    expect(healthy).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:19840/api/streams",
      expect.any(Object),
    );
  });
});

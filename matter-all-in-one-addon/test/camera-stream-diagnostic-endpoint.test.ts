import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import "./mocks/matterbridge.mock.js";
import "./mocks/ha-api.mock.js";
import { HomeAssistantPlatform } from "../src/platform.js";
import { mockMatterbridge, mockLog } from "./mocks/matterbridge.mock.js";
import { ScryptedStorage } from "../src/camera/scrypted/scrypted-storage.js";
import * as ffmpegHelper from "../src/camera/homekit/ffmpeg-helper.js";
import type { CameraRecord } from "../src/camera/scrypted/scrypted-types.js";

import http from "node:http";

function createMockRequest(method: string, url: string, body?: any) {
  const req = new EventEmitter() as any;
  req.method = method;
  req.url = url;
  req.headers = { host: "127.0.0.1:8285" };
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) {
      yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    }
  };
  return req;
}

function createMockResponse() {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let body = "";
  const res = new EventEmitter() as any;
  res.writeHead = (code: number, h?: any) => {
    statusCode = code;
    if (h) headers = { ...headers, ...h };
    return res;
  };
  res.setHeader = (name: string, val: any) => {
    headers[name.toLowerCase()] = String(val);
    return res;
  };
  res.end = (chunk?: any) => {
    if (chunk) body += chunk.toString();
    res.emit("finish");
  };
  return {
    res,
    getStatusCode: () => statusCode,
    getBody: () => (body ? JSON.parse(body) : null),
    getRawBody: () => body,
  };
}

describe("Platform Camera Stream Diagnostic Endpoint", () => {
  let platform: HomeAssistantPlatform;
  let serverHandler: (req: any, res: any) => Promise<void>;
  const tempStorePath = path.join(
    os.tmpdir(),
    `diag-test-store-${Date.now()}-${Math.random().toString(36).substring(7)}.json`,
  );

  const sampleCamera: CameraRecord = {
    cameraId: "cam-entry-1",
    sourceId: "scrypted_cam-entry-1",
    deviceId: "cam-entry-1",
    name: "Cámara Entrada",
    enabled: true,
    displayManufacturer: "Tapo",
    identity: {},
    source: {
      kind: "scrypted",
      serverId: "http://192.168.1.100:10443",
      deviceId: "cam-entry-1",
    },
    capabilities: {
      qualityMode: "maximum_compatible",
    },
    sensors: [],
    exportConfig: {
      matterEnabled: true,
      homeKitEnabled: true,
      hksvEnabledByDefault: true,
      googleHomeEnabled: false,
      alexaEnabled: false,
      smartThingsEnabled: false,
      nasEnabled: false,
    },
    status: {
      connection: "online",
      cache: "fresh",
    },
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    ScryptedStorage.setStorePath(tempStorePath);
    try {
      await fs.unlink(tempStorePath);
    } catch {}

    platform = new HomeAssistantPlatform(
      mockMatterbridge as any,
      mockLog as any,
      {
        name: "test-platform",
        type: "dynamic",
        host: "localhost",
        token: "fake-token",
      } as any,
    );
    (platform as any)._uiPort = 0;

    let capturedHandler: any = null;
    vi.spyOn(http, "createServer").mockImplementationOnce(((handler: any) => {
      capturedHandler = handler;
      const fakeServer = new EventEmitter() as any;
      fakeServer.address = () => ({ port: 8285 });
      fakeServer.listen = (_port: any, _host: any, cb: any) => {
        cb?.();
        return fakeServer;
      };
      fakeServer.close = (cb: any) => cb?.();
      return fakeServer;
    }) as any);

    await (platform as any).startUiServer();
    serverHandler = capturedHandler;
  });

  afterEach(async () => {
    try {
      await fs.unlink(tempStorePath);
    } catch {}
  });

  it("returns 404 when camera does not exist", async () => {
    await ScryptedStorage.updateCameras([sampleCamera]);

    const req = createMockRequest(
      "POST",
      "/api/custom/cameras/non-existent-cam/diagnose-stream",
      { streamUrl: "rtsp://192.168.1.100:8554/live" },
    );
    const mockRes = createMockResponse();

    await serverHandler(req, mockRes.res);

    expect(mockRes.getStatusCode()).toBe(404);
    expect(mockRes.getBody().error).toContain("Cámara no encontrada");
  });

  it("returns 400 Bad Request with missing_stream_url when camera and request have no stream URL", async () => {
    await ScryptedStorage.updateCameras([sampleCamera]);

    const req = createMockRequest(
      "POST",
      "/api/custom/cameras/cam-entry-1/diagnose-stream",
      { streamUrl: "" },
    );
    const mockRes = createMockResponse();

    await serverHandler(req, mockRes.res);

    expect(mockRes.getStatusCode()).toBe(400);
    const body = mockRes.getBody();
    expect(body.success).toBe(false);
    expect(body.cause).toBe("missing_stream_url");
    expect(body.error).toContain("no tiene una URL de stream RTSP configurada");
  });

  it("returns 422 Unprocessable Entity with not_found cause when stream returns 404", async () => {
    await ScryptedStorage.updateCameras([sampleCamera]);

    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "Server returned 404 Not Found",
    });

    const req = createMockRequest(
      "POST",
      "/api/custom/cameras/cam-entry-1/diagnose-stream",
      { streamUrl: "rtsp://192.168.1.100:8554/invalid_stream_path" },
    );
    const mockRes = createMockResponse();

    await serverHandler(req, mockRes.res);

    expect(mockRes.getStatusCode()).toBe(422);
    const body = mockRes.getBody();
    expect(body.success).toBe(false);
    expect(body.cause).toBe("not_found");
    expect(body.error).toContain("404");
    expect(body.metrics.timeToDescribeMs).toBeUndefined();
  });

  it("returns 422 Unprocessable Entity with source_offline cause when stream is unreachable", async () => {
    await ScryptedStorage.updateCameras([sampleCamera]);

    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: false,
      hasAudio: false,
      error: "connect ECONNREFUSED 192.168.1.100:8554",
    });

    const req = createMockRequest(
      "POST",
      "/api/custom/cameras/cam-entry-1/diagnose-stream",
      { streamUrl: "rtsp://192.168.1.100:8554/offline_stream" },
    );
    const mockRes = createMockResponse();

    await serverHandler(req, mockRes.res);

    expect(mockRes.getStatusCode()).toBe(422);
    const body = mockRes.getBody();
    expect(body.success).toBe(false);
    expect(body.cause).toBe("source_offline");
  });

  it("returns 200 OK with full metrics when stream is valid and healthy", async () => {
    await ScryptedStorage.updateCameras([sampleCamera]);

    vi.spyOn(ffmpegHelper, "probeCameraSource").mockResolvedValueOnce({
      valid: true,
      videoCodec: "h264",
      audioCodec: "aac",
      width: 1920,
      height: 1080,
      fps: 30,
      bitrateKbps: 2000,
      hasAudio: true,
      probeMethod: "ffprobe",
    });
    vi.spyOn(ffmpegHelper, "measureStreamGop").mockResolvedValue(2);

    const req = createMockRequest(
      "POST",
      "/api/custom/cameras/cam-entry-1/diagnose-stream",
      { streamUrl: "rtsp://192.168.1.100:8554/live_ok" },
    );
    const mockRes = createMockResponse();

    await serverHandler(req, mockRes.res);

    expect(mockRes.getStatusCode()).toBe(200);
    const body = mockRes.getBody();
    expect(body.success).toBe(true);
    expect(body.metrics.timeToDescribeMs?.value).toBeGreaterThanOrEqual(0);
    expect(body.metrics.selectedTransport.value).toBe("tcp");
    expect(body.camera.capabilities.latencyMetrics).toBeDefined();
  });
});

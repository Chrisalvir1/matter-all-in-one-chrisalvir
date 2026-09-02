import { describe, expect, it } from "vitest";
import {
  resolveFfmpegPath,
  resolveFfprobePath,
  sanitizeUrlCredentials,
  getFfmpegVersion,
  buildFfmpegStreamArgs,
  StreamPipelineConfig,
} from "../src/camera/homekit/ffmpeg-helper.js";
import { SRTPCryptoSuites } from "hap-nodejs";

describe("FFmpeg Helper", () => {
  it("sanitizes username:password in RTSP URLs", () => {
    const raw =
      "rtsp://admin:P@ssw0rd123!@192.168.1.50:554/h264Preview_01_main";
    const clean = sanitizeUrlCredentials(raw);
    expect(clean).not.toContain("P@ssw0rd123!");
    expect(clean).toBe("rtsp://admin:***@192.168.1.50:554/h264Preview_01_main");
  });

  it("sanitizes query parameters (token, auth, secret, api_key)", () => {
    const raw =
      "http://192.168.1.10:8123/api/camera_proxy_stream/camera.front?token=SECRET_JWT_TOKEN_12345";
    const clean = sanitizeUrlCredentials(raw);
    expect(clean).not.toContain("SECRET_JWT_TOKEN_12345");
    expect(clean).toContain("token=***");
  });

  it("resolves ffmpeg path or returns null gracefully if missing", () => {
    const resolved = resolveFfmpegPath();
    // In local dev or test container, it returns a string if installed or null if not
    expect(resolved === null || typeof resolved === "string").toBe(true);
  });

  it("builds correct FFmpeg arguments for H.264 Passthrough (no transcoding)", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.1.50:554/stream1",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      fps: 30,
      bitrateKbps: 2000,
      includeAudio: true,
      audioPort: 51236,
      audioSsrc: 2,
      audioPayloadType: 110,
      audioKeySaltBase64: Buffer.alloc(30).toString("base64"),
      audioCodec: "aac",
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).toContain("-vcodec");
    expect(args).toContain("copy");
    expect(args).toContain("-srtp_out_suite");
    expect(args).toContain("AES_CM_128_HMAC_SHA1_80");
    expect(args).toContain(
      "srtp://192.168.1.200:51234?rtcpport=51234&localrtcpport=51234&pkt_size=1316",
    );
    expect(args).toContain("-acodec");
    expect(args).toContain("copy");
  });

  it("builds correct FFmpeg arguments for H.265 / MJPEG Transcode Fallback", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.1.50:554/hevc_stream",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "transcode_required",
      fps: 25,
      bitrateKbps: 1500,
      includeAudio: false,
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).toContain("-vcodec");
    expect(args).toContain("libx264");
    expect(args).toContain("-preset");
    expect(args).toContain("ultrafast");
    expect(args).toContain("-tune");
    expect(args).toContain("zerolatency");
    expect(args).toContain("-b:v");
    expect(args).toContain("1500k");
  });

  it("builds video-only FFmpeg arguments when audio is disabled or incompatible", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.1.50:554/stream1",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_video_only",
      includeAudio: false,
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).not.toContain("-acodec");
    expect(args).not.toContain("0:a:0");
  });

  it("injects HTTP Authorization headers when streaming from authenticated Home Assistant HTTP/HLS URL", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "http://127.0.0.1:8123/api/hls/test-stream/master.m3u8",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      httpBearerToken: "my-long-lived-access-token",
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).toContain("-headers");
    expect(args).toContain(
      "Authorization: Bearer my-long-lived-access-token\r\n",
    );
    expect(args).toContain(
      "http://127.0.0.1:8123/api/hls/test-stream/master.m3u8",
    );
  });

  it("preserves 1440p stream via stream-copy without downscaling or libx264", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.110.219:554/stream1",
      targetAddress: "192.168.1.150",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      fps: 20,
      bitrateKbps: 4000,
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).toContain("-vcodec");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("scale");
    expect(args).not.toContain("-bsf:v");
  });

  it("preserves 4K stream via stream-copy without downscaling", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.110.220:554/live4k",
      targetAddress: "192.168.1.150",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      fps: 30,
      bitrateKbps: 8000,
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).toContain("-vcodec");
    expect(args).toContain("copy");
    expect(args).not.toContain("libx264");
    expect(args).not.toContain("scale");
  });

  it("applies -bsf:v dump_extra only when needsDumpExtra is explicitly true", () => {
    const configWithDumpExtra: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.1.50:554/stream1",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      needsDumpExtra: true,
    };

    const argsWith = buildFfmpegStreamArgs(configWithDumpExtra);
    expect(argsWith).toContain("-bsf:v");
    expect(argsWith).toContain("dump_extra");

    const configWithout: StreamPipelineConfig = {
      ...configWithDumpExtra,
      needsDumpExtra: false,
    };
    const argsWithout = buildFfmpegStreamArgs(configWithout);
    expect(argsWithout).not.toContain("dump_extra");
  });

  it("respects RTSP transport configuration (udp vs tcp)", () => {
    const udpConfig: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.1.50:554/stream1",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      transport: "udp",
    };

    const udpArgs = buildFfmpegStreamArgs(udpConfig);
    const transportIdx = udpArgs.indexOf("-rtsp_transport");
    expect(transportIdx).toBeGreaterThan(-1);
    expect(udpArgs[transportIdx + 1]).toBe("udp");

    const tcpConfig: StreamPipelineConfig = {
      ...udpConfig,
      transport: "tcp",
    };
    const tcpArgs = buildFfmpegStreamArgs(tcpConfig);
    const tcpTransportIdx = tcpArgs.indexOf("-rtsp_transport");
    expect(tcpArgs[tcpTransportIdx + 1]).toBe("tcp");
  });

  it("configures Opus audio adaptation correctly when opus is specified", () => {
    const config: StreamPipelineConfig = {
      sourceUrl: "rtsp://192.168.1.50:554/stream1",
      targetAddress: "192.168.1.200",
      videoPort: 51234,
      videoSsrc: 1,
      videoPayloadType: 99,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySaltBase64: Buffer.alloc(30).toString("base64"),
      strategy: "passthrough_h264",
      includeAudio: true,
      audioPort: 51236,
      audioSsrc: 2,
      audioPayloadType: 110,
      audioKeySaltBase64: Buffer.alloc(30).toString("base64"),
      audioCodec: "opus",
    };

    const args = buildFfmpegStreamArgs(config);
    expect(args).toContain("-acodec");
    expect(args).toContain("libopus");
    expect(args).toContain("-application");
    expect(args).toContain("lowdelay");
    expect(args).toContain("16k");
  });
});

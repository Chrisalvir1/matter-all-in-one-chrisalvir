import { describe, expect, it, vi } from "vitest";
import {
  H264Level,
  H264Profile,
  SRTPCryptoSuites,
  StreamRequestTypes,
} from "@homebridge/hap-nodejs";
import { EventEmitter } from "node:events";

import { HomeKitCameraAccessory } from "../src/camera/homekit/homekit-camera.accessory.js";
import { HomeKitCameraStreamingDelegate } from "../src/camera/homekit/homekit-camera-stream.delegate.js";
import {
  HomeKitCameraRecordingDelegate,
  resolveCameraFpsDetails,
  resolveCameraSourceFps,
} from "../src/camera/homekit/homekit-camera-recording.delegate.js";

function createMockPlatform() {
  return {
    log: {
      debug: vi.fn(),
      info: vi.fn(),
      notice: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    matterbridge: { matterbridgeVersion: "1.9.5" },
    ha: {
      hassEntities: new Map([
        ["camera.tapo_c120", { device_id: "dev-c120" }],
        ["binary_sensor.tapo_c120_motion", { device_id: "dev-c120" }],
      ]),
      hassStates: new Map([
        [
          "binary_sensor.tapo_c120_motion",
          {
            entity_id: "binary_sensor.tapo_c120_motion",
            state: "off",
            attributes: { device_class: "motion" },
          },
        ],
      ]),
    },
    saveHomeKitCameraRecords: vi.fn(),
  };
}

describe("Integración Estable v1.9.5: Tapo C120 2K Level 5.0 y Aislamiento (20 pruebas)", () => {
  // 1. C120 resolución segura 1080p anunciado en escalera
  it("1. anuncia resolución segura 1080p en la escalera de resoluciones para la C120", () => {
    const platform = createMockPlatform();
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        port: 51830,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:01",
        setupId: "C120",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
        strategy: "passthrough_h264",
        requiresTranscoding: false,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
    );

    const resolutions = acc.buildDeclaredResolutions();
    expect(resolutions).toContainEqual([1920, 1080, 15]);
  });

  // 2. C120 niveles estándar HAP R2
  it("2. declara estrictamente niveles HAP estándar (3.1, 3.2, 4.0) sin niveles no soportados por Apple", () => {
    const platform = createMockPlatform();
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        port: 51830,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:01",
        setupId: "C120",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
        strategy: "passthrough_h264",
        requiresTranscoding: false,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
    );

    const levels = acc.buildDeclaredLevels();
    expect(levels).toEqual([
      H264Level.LEVEL3_1,
      H264Level.LEVEL3_2,
      H264Level.LEVEL4_0,
    ]);
  });

  // 3. C120 FPS adaptativo
  it("3. resuelve dinámicamente FPS adaptativo medido sin clamar a 15 rígido", () => {
    const caps = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: true,
      maxFps: 20,
      measuredVideo: { fps: 18.5 },
    };
    const details = resolveCameraFpsDetails(caps as any, {} as any);
    expect(details.fps).toBe(19);
    expect(details.origin).toBe("measured");
  });

  // 4. C120 normalización HAP a 1080p
  it("4. utiliza normalización HAP a 1080p High Level 4.0 para evitar corrupción o congelamiento de C120", () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
        strategy: "passthrough_h264",
        requiresTranscoding: false,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c120", name: "Tapo C120", model: "C120" } as any,
    );

    const session = {
      sessionId: "session-c120-test",
      targetAddress: "192.168.1.100",
      videoPort: 51000,
      localVideoPort: 51002,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySalt: Buffer.alloc(30, 0x11),
      videoSsrc: 1,
    };

    const request = {
      sessionID: "session-c120-test",
      type: StreamRequestTypes.START,
      video: {
        fps: 15,
        width: 1920,
        height: 1080,
        max_bit_rate: 4000,
        rtp: {
          port: 51000,
        },
      },
    };

    const args = (delegate as any).buildStreamArgs(session, request, false);
    expect(args).toContain("libx264");
    expect(args).toContain("4.0");
    expect(args).toContain("veryfast");
    expect(args).toContain("zerolatency");
  });

  // 5. C120 fallback 1080p
  it("5. utiliza fallback seguro normalizado a 1080p High Level 4.0 cuando Apple solicita 1920x1080", () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
        strategy: "passthrough_h264",
        requiresTranscoding: false,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c120", name: "Tapo C120", model: "C120" } as any,
    );

    const session = {
      sessionId: "session-1080p-fallback",
      targetAddress: "192.168.1.100",
      videoPort: 51000,
      localVideoPort: 51002,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySalt: Buffer.alloc(30, 0x11),
      videoSsrc: 1,
    };

    const request = {
      sessionID: "session-1080p-fallback",
      type: StreamRequestTypes.START,
      video: {
        fps: 20,
        width: 1920,
        height: 1080,
        max_bit_rate: 4000,
        rtp: {
          port: 51000,
        },
      },
    };

    const args = (delegate as any).buildStreamArgs(session, request, false);
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-vf");
    expect(args).toContain("scale=1920:1080:flags=fast_bilinear");
    expect(args).toContain("-profile:v");
    expect(args).toContain("high");
    expect(args).toContain("-level:v");
    expect(args).toContain("4.0");
  });

  // 6. C120 HKSV 1080p Level 4.0
  it("6. genera prebuffer HKSV de C120 exclusivamente en 1080p High Level 4.0", () => {
    const platform = createMockPlatform();
    const recDelegate = new HomeKitCameraRecordingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        port: 51830,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:01",
        setupId: "C120",
      } as any,
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
    );

    const args = (recDelegate as any).buildPrebufferArgs(
      "rtsp://192.168.1.50/tapo_c120",
    );
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-profile:v");
    expect(args).toContain("high");
    expect(args).toContain("-level:v");
    expect(args).toContain(
      "scale=1920:1080:force_original_aspect_ratio=decrease:force_divisible_by=2",
    );
    expect(args).toContain("-r");
    const rIdx = args.indexOf("-r");
    expect(args[rIdx + 1]).toBe("20");
  });

  it("6b. limita el prebuffer HKSV de C120 a un techo de 20 fps incluso si la metadata fuente reporta 30 fps", () => {
    const platform = createMockPlatform();
    const recDelegate = new HomeKitCameraRecordingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        port: 51830,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:01",
        setupId: "C120",
      } as any,
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 30, // Fuente errónea o genérica reporta 30
      } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
    );

    const args = (recDelegate as any).buildPrebufferArgs(
      "rtsp://192.168.1.50/tapo_c120",
    );
    expect(args).toContain("-r");
    const rIdx = args.indexOf("-r");
    expect(args[rIdx + 1]).toBe("20");
  });

  // 7. Cámara 1080p a 15 fps
  it("7. maneja cámara 1080p a 15 fps sin aplicar lógica de C120", () => {
    const platform = createMockPlatform();
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.garden_1080p",
      {
        entityId: "camera.garden_1080p",
        name: "Garden Cam",
        model: "Generic1080",
        port: 51831,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:02",
        setupId: "G108",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 1920, height: 1080 },
        maxFps: 15,
        strategy: "transcode_required",
        requiresTranscoding: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.51/garden",
        supportsPassthrough: false,
      },
    );

    const levels = acc.buildDeclaredLevels();
    expect(levels).not.toContain(50);
    expect(acc.isTapoC120()).toBe(false);
  });

  // 8. Cámara 1080p a 20 fps
  it("8. respeta 20 fps configurado en cámara 1080p distinta sin forzar 15", () => {
    const caps = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: true,
      maxFps: 20,
    };
    const resolved = resolveCameraSourceFps(caps as any, {} as any);
    expect(resolved).toBe(20);
  });

  // 9. Cámara 1080p a 30 fps
  it("9. preserva 30 fps para cámaras 1080p convencionales", () => {
    const caps = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: true,
      maxFps: 30,
    };
    const resolved = resolveCameraSourceFps(caps as any, {} as any);
    expect(resolved).toBe(30);
  });

  // 10. Cámara 2K distinta a la C120
  it("10. no aplica el perfil Level 5.0 a cámaras 2K distintas de la C120", () => {
    const platform = createMockPlatform();
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.reolink_2k",
      {
        entityId: "camera.reolink_2k",
        name: "Reolink E1 Pro 2K",
        model: "E1-Pro",
        port: 51832,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:03",
        setupId: "REOL",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 25,
        strategy: "transcode_required",
        requiresTranscoding: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.52/reolink",
        supportsPassthrough: false,
      },
    );

    expect(acc.isTapoC120()).toBe(false);
    const levels = acc.buildDeclaredLevels();
    expect(levels).not.toContain(50);
    expect(levels).toEqual([
      H264Level.LEVEL3_1,
      H264Level.LEVEL3_2,
      H264Level.LEVEL4_0,
    ]);
  });

  // 11. Cámara HEVC no modificada
  it("11. mantiene cámaras HEVC con codec intacto y sin aplicar passthrough C120", () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c402",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "hevc",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 15,
        strategy: "passthrough_hevc",
        requiresTranscoding: false,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.53/tapo_c402",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c402", name: "Tapo C402", model: "C402" } as any,
    );

    const session = {
      sessionId: "session-hevc",
      targetAddress: "192.168.1.100",
      videoPort: 51000,
      localVideoPort: 51002,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySalt: Buffer.alloc(30, 0x11),
      videoSsrc: 1,
    };

    const request = {
      sessionID: "session-hevc",
      type: StreamRequestTypes.START,
      video: {
        fps: 15,
        width: 1920,
        height: 1080,
        max_bit_rate: 2000,
        rtp: { port: 51000 },
      },
    };

    // HEVC camera does not support classic HAP streaming; must reject safely
    expect(() => {
      (delegate as any).buildStreamArgs(session, request, false);
    }).toThrow(
      "Cámara no entrega H.264 nativo; transcodificación no permitida",
    );
  });

  // 12. FPS ausente: rechazo seguro
  it("12. rechaza de forma segura cuando no hay FPS medible ni configurado (fail-closed)", () => {
    const caps = {
      hasLiveStream: true,
      streamSourceType: "rtsp" as const,
      videoCodec: "h264" as const,
      hasAudio: true,
      maxFps: undefined,
      measuredVideo: undefined,
    };
    const details = resolveCameraFpsDetails(caps as any, {} as any);
    expect(details.fps).toBeUndefined();
    expect(details.label).toBe("No medido (HKSV no capaz)");
  });

  // 13. StartStreamRequest sin FPS: tolerancia resiliente con default seguro
  it("13. tolera StartStreamRequest si falta el campo video.fps usando valor por defecto resiliente", async () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c120", name: "Tapo C120", model: "C120" } as any,
    );

    const requestWithoutFps = {
      sessionID: "session-missing-fps",
      type: StreamRequestTypes.START,
      video: {
        width: 1920,
        height: 1080,
        // fps ausente
      },
    };

    (delegate as any).activeSessions.set("session-missing-fps", {
      sessionId: "session-missing-fps",
      targetAddress: "192.168.1.80",
      videoPort: 52000,
      localVideoPort: 52002,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySalt: Buffer.alloc(30, 0x11),
      videoSsrc: 1,
    });

    let errorReceived: Error | undefined;
    await delegate.handleStreamRequest(requestWithoutFps as any, (err) => {
      errorReceived = err;
    });

    // No debe fallar por "missing or invalid video FPS"
    expect(errorReceived?.message).not.toContain(
      "missing or invalid video FPS",
    );
  });

  // 14. Resolución no anunciada: normalización o fallback explícito
  it("14. aplica fallback normalizado a 1080p ante una resolución no anunciada", () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
        strategy: "passthrough_h264",
        requiresTranscoding: false,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c120", name: "Tapo C120", model: "C120" } as any,
    );

    const session = {
      sessionId: "session-unannounced-res",
      targetAddress: "192.168.1.100",
      videoPort: 51000,
      localVideoPort: 51002,
      videoCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
      videoKeySalt: Buffer.alloc(30, 0x11),
      videoSsrc: 1,
    };

    // Apple envía 1280x720 (no es 2K ni 1080p estándar)
    const request = {
      sessionID: "session-unannounced-res",
      type: StreamRequestTypes.START,
      video: {
        fps: 20,
        width: 1280,
        height: 720,
        max_bit_rate: 2000,
        rtp: { port: 51000 },
      },
    };

    const args = (delegate as any).buildStreamArgs(session, request, false);
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264"); // normaliza limpiamente
  });

  // 15. C1200 y C210 no identificadas como C120
  it("15. no identifica modelos C1200 ni C210 como Tapo C120", () => {
    const platform = createMockPlatform();
    const accC1200 = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c1200",
      {
        entityId: "camera.tapo_c1200",
        name: "Tapo C1200",
        model: "C1200",
        port: 51833,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:04",
        setupId: "1200",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 1920, height: 1080 },
        maxFps: 30,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.54/c1200",
        supportsPassthrough: true,
      },
    );

    const accC210 = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c210",
      {
        entityId: "camera.tapo_c210",
        name: "Tapo C210",
        model: "C210",
        port: 51834,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:05",
        setupId: "C210",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2304, height: 1296 },
        maxFps: 15,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.55/c210",
        supportsPassthrough: true,
      },
    );

    expect(accC1200.isTapoC120()).toBe(false);
    expect(accC210.isTapoC120()).toBe(false);
  });

  // 16. Varias sesiones simultáneas
  it("16. gestiona múltiples sesiones simultáneas rastreando el contador correctamente", () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c120", name: "Tapo C120", model: "C120" } as any,
    );

    (delegate as any).activeSessions.set("session-1", {
      sessionId: "session-1",
    });
    (delegate as any).activeSessions.set("session-2", {
      sessionId: "session-2",
    });

    expect(delegate.hasActiveSessions()).toBe(true);
    expect(delegate.activeSessionCount()).toBe(2);

    (delegate as any).activeSessions.delete("session-1");
    expect(delegate.hasActiveSessions()).toBe(true);
    expect(delegate.activeSessionCount()).toBe(1);

    (delegate as any).activeSessions.delete("session-2");
    expect(delegate.hasActiveSessions()).toBe(false);
    expect(delegate.activeSessionCount()).toBe(0);
  });

  // 17. Sesión prepareStream sin startStream (watchdog huérfana)
  it("17. registra y programa timeout de 45s para sesión huérfana en prepareStream", async () => {
    const platform = createMockPlatform();
    const delegate = new HomeKitCameraStreamingDelegate(
      platform as any,
      "camera.tapo_c120",
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
      { entityId: "camera.tapo_c120", name: "Tapo C120", model: "C120" } as any,
    );

    const prepareReq = {
      sessionID: "orphan-session-123",
      targetAddress: "192.168.1.80",
      video: {
        port: 52000,
        srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
        srtp_key: Buffer.alloc(16),
        srtp_salt: Buffer.alloc(14),
      },
    };

    await new Promise<void>((resolve) => {
      delegate.prepareStream(prepareReq as any, () => resolve());
    });

    expect((delegate as any).prepareTimeouts.has("orphan-session-123")).toBe(
      true,
    );
    expect(delegate.hasActiveSessions()).toBe(true);

    // Limpiar timeout para el test
    clearTimeout((delegate as any).prepareTimeouts.get("orphan-session-123"));
  });

  // 18. Timeout y recuperación del detector
  it("18. emite session-end y limpia sesión cuando se dispara el watchdog de sesión huérfana", async () => {
    vi.useFakeTimers();
    try {
      const platform = createMockPlatform();
      const delegate = new HomeKitCameraStreamingDelegate(
        platform as any,
        "camera.tapo_c120",
        {
          hasLiveStream: true,
          streamSourceType: "rtsp",
          videoCodec: "h264",
          hasAudio: true,
        },
        {
          sourceType: "rtsp",
          url: "rtsp://192.168.1.50/tapo_c120",
          supportsPassthrough: true,
        },
        {
          entityId: "camera.tapo_c120",
          name: "Tapo C120",
          model: "C120",
        } as any,
      );

      let sessionEndEmitted = false;
      delegate.on("session-end", () => {
        sessionEndEmitted = true;
      });

      const prepareReq = {
        sessionID: "orphan-session-timeout",
        targetAddress: "192.168.1.80",
        video: {
          port: 52000,
          srtpCryptoSuite: SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80,
          srtp_key: Buffer.alloc(16),
          srtp_salt: Buffer.alloc(14),
        },
      };

      await new Promise<void>((resolve) => {
        delegate.prepareStream(prepareReq as any, () => resolve());
      });

      expect(delegate.hasActiveSessions()).toBe(true);

      // Fast-forward past 45s timeout
      vi.advanceTimersByTime(46_000);

      expect(delegate.hasActiveSessions()).toBe(false);
      expect(sessionEndEmitted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // 19. Prebuffer pause/resume
  it("19. ejecuta ciclo idempotente de pausePrebuffer y resumePrebuffer", () => {
    const platform = createMockPlatform();
    const recDelegate = new HomeKitCameraRecordingDelegate(
      platform as any,
      "camera.tapo_c120",
      { entityId: "camera.tapo_c120" } as any,
      { hasLiveStream: true, maxFps: 20 } as any,
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
    );

    expect(() => {
      recDelegate.pausePrebuffer();
      recDelegate.pausePrebuffer(); // idempotente
      recDelegate.resumePrebuffer();
      recDelegate.resumePrebuffer(); // idempotente
    }).not.toThrow();
  });

  // 20. Movimiento seguido de solicitud HKSV
  it("20. procesa evento de movimiento hacia el delegado de grabación", () => {
    const platform = createMockPlatform();
    const acc = new HomeKitCameraAccessory(
      platform as any,
      "camera.tapo_c120",
      {
        entityId: "camera.tapo_c120",
        name: "Tapo C120",
        model: "C120",
        port: 51830,
        pincode: "031-45-154",
        username: "AA:BB:CC:12:00:01",
        setupId: "C120",
      },
      {
        hasLiveStream: true,
        streamSourceType: "rtsp",
        videoCodec: "h264",
        hasAudio: true,
        resolution: { width: 2560, height: 1440 },
        maxFps: 20,
      },
      {
        sourceType: "rtsp",
        url: "rtsp://192.168.1.50/tapo_c120",
        supportsPassthrough: true,
      },
    );

    const recordingDelegate = acc.recordingDelegate;
    expect(recordingDelegate).toBeDefined();

    const spy = vi.spyOn(recordingDelegate as any, "handleMotionDetected");
    acc.updateMotionState(true);
    expect(spy).toHaveBeenCalledWith(true);

    acc.updateMotionState(false);
    expect(spy).toHaveBeenCalledWith(false);
  });
});

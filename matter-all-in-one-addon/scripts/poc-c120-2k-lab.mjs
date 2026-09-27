/**
 * PoC Aislado: Tapo C120 2K Live View en HAP Clásico (Variantes TLV Separadas)
 *
 * Condiciones estrictas:
 * - Puerto HAP: 51845
 * - Setup ID: C12E
 * - PIN: 246-81-357
 * - Nombre: Tapo C120 2K Lab
 * - Almacenamiento independiente: .poc-c120-lab-storage
 * - Primera prueba: UN SOLO PERFIL (2560x1440 @ 20 fps) con una única variante TLV elegida.
 * - Variantes mutuamente excluyentes:
 *     Variante 0x32 -> TLV Level 50 (0x32 = Level 5.0)
 *     Variante 0x03 -> TLV Level 3  (0x03 = Reservado HAP R2)
 * - Cero fallbacks a 15 o 20 fps. Falla cerrada si no hay FPS válido.
 * - Passthrough puro (-c:v copy) para 2K.
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import hap from "@homebridge/hap-nodejs";

const {
  Accessory,
  Categories,
  CameraController,
  Characteristic,
  HAPStorage,
  H264Level,
  H264Profile,
  RTPStreamManagement,
  SRTPCryptoSuites,
  Service,
  StreamRequestTypes,
  uuid,
} = hap;

// Límites de hardware oficiales específicos del modelo Tapo C120
export const C120_HARDWARE_LIMITS = {
  model: "Tapo C120",
  maxFps: 20,
  nativeWidth: 2560,
  nativeHeight: 1440,
  h264Level: "5.0",
};

// Definición de variantes experimentales mutuamente excluyentes
export const EXPERIMENTAL_VARIANTS = {
  "0x32": {
    variantId: "0x32",
    description: "H.264 Level 5.0 (0x32 = 50 decimal)",
    levelValue: 50,
    announcedLevels: [50],
  },
  "0x03": {
    variantId: "0x03",
    description: "HAP R2 Reserved Level 3 (0x03 = 3 decimal)",
    levelValue: 3,
    announcedLevels: [3],
  },
};

/**
 * Resuelve la variante TLV activa desde argumentos de línea de comandos o variable de entorno.
 */
export function resolveActiveVariant() {
  const arg = process.argv.find((a) => a.startsWith("--variant="));
  if (arg) {
    const val = arg.split("=")[1].trim();
    if (EXPERIMENTAL_VARIANTS[val]) return EXPERIMENTAL_VARIANTS[val];
  }
  if (
    process.env.POC_VARIANT &&
    EXPERIMENTAL_VARIANTS[process.env.POC_VARIANT]
  ) {
    return EXPERIMENTAL_VARIANTS[process.env.POC_VARIANT];
  }
  // Variante por defecto para la primera prueba: 0x32 (Level 5.0 real del bitstream)
  return EXPERIMENTAL_VARIANTS["0x32"];
}

const activeVariant = resolveActiveVariant();

// Configuración de red e identidad del PoC
export const POC_CONFIG = {
  port: 51845,
  setupId: "C12E",
  pincode: "246-81-357",
  username: "0E:2A:4B:6C:12:0E",
  name: "Tapo C120 2K Lab",
  entityId: "camera.tapo_c120_2k_lab",
  storagePath: path.resolve(process.cwd(), ".poc-c120-lab-storage"),
  rtspUrl: process.env.C120_RTSP_URL || "rtsp://192.168.110.147:8554/tapo_c120",
  // Primera prueba: UN SOLO perfil estricto (2560x1440 @ 20 fps)
  announcedResolutions: [[2560, 1440, 20]],
  activeVariant,
  announcedLevels: activeVariant.announcedLevels,
};

export const POC_UUID = uuid.generate(POC_CONFIG.entityId);

/**
 * Sanitiza URLs y parámetros sensibles (claves SRTP, credenciales RTSP).
 */
export function sanitizeUrl(url) {
  if (!url) return "";
  return url.replace(/:\/\/([^:@\s]+):([^@\s]+)@/g, "://$1:***@");
}

export function sanitizeRequest(request) {
  if (!request) return null;
  const clone = JSON.parse(JSON.stringify(request));
  if (clone.video?.srtp_key) clone.video.srtp_key = "***MASKED***";
  if (clone.audio?.srtp_key) clone.audio.srtp_key = "***MASKED***";
  return clone;
}

/**
 * Parsea los parámetros VUI de temporización desde un NALU SPS en Base64.
 * Devuelve undefined si no contiene información VUI válida (sin fallbacks arbitrarios).
 */
export function parseSpsVuiFps(spsBase64) {
  if (!spsBase64) return undefined;
  try {
    const buf = Buffer.from(spsBase64, "base64");
    const rbsp = [];
    for (let i = 0; i < buf.length; i++) {
      if (i >= 2 && buf[i] === 3 && buf[i - 1] === 0 && buf[i - 2] === 0)
        continue;
      rbsp.push(buf[i]);
    }
    const clean = Buffer.from(rbsp);
    let bitPos = 8;
    function readBits(n) {
      let v = 0;
      for (let i = 0; i < n; i++) {
        const b = Math.floor(bitPos / 8);
        const o = 7 - (bitPos % 8);
        v = (v << 1) | ((clean[b] >> o) & 1);
        bitPos++;
      }
      return v;
    }
    function readUE() {
      let z = 0;
      while (readBits(1) === 0) z++;
      if (z === 0) return 0;
      return (1 << z) - 1 + readBits(z);
    }
    function readSE() {
      const v = readUE();
      return v & 1 ? (v + 1) / 2 : -(v / 2);
    }

    const profile_idc = readBits(8);
    readBits(8); // constraint_flags
    readBits(8); // level_idc
    readUE(); // seq_parameter_set_id

    if ([100, 110, 122, 244, 44, 83, 86, 118, 128].includes(profile_idc)) {
      const chroma = readUE();
      if (chroma === 3) readBits(1);
      readUE();
      readUE();
      readBits(1);
      if (readBits(1)) {
        for (let i = 0; i < (chroma !== 3 ? 8 : 12); i++) {
          if (readBits(1)) {
            const sz = i < 6 ? 16 : 64;
            let last = 8,
              next = 8;
            for (let j = 0; j < sz; j++) {
              if (next !== 0) next = (last + readSE() + 256) % 256;
              last = next === 0 ? last : next;
            }
          }
        }
      }
    }

    readUE(); // log2_max_frame_num
    const poc_type = readUE();
    if (poc_type === 0) readUE();
    else if (poc_type === 1) {
      readBits(1);
      readSE();
      readSE();
      const n = readUE();
      for (let i = 0; i < n; i++) readSE();
    }
    readUE();
    readBits(1);
    readUE();
    readUE();
    const frame_mbs_only = readBits(1);
    if (!frame_mbs_only) readBits(1);
    readBits(1);
    if (readBits(1)) {
      readUE();
      readUE();
      readUE();
      readUE();
    }
    if (readBits(1)) {
      // vui_parameters_present_flag
      if (readBits(1)) {
        const idc = readBits(8);
        if (idc === 255) {
          readBits(16);
          readBits(16);
        }
      }
      if (readBits(1)) readBits(1);
      if (readBits(1)) {
        readBits(3);
        readBits(1);
        if (readBits(1)) {
          readBits(8);
          readBits(8);
          readBits(8);
        }
      }
      if (readBits(1)) {
        readUE();
        readUE();
      }
      if (readBits(1)) {
        // timing_info_present_flag
        const num_units = readBits(32);
        const time_scale = readBits(32);
        if (num_units > 0 && time_scale > 0) {
          return time_scale / (2 * num_units);
        }
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Evalúa la decisión de streaming sin fallbacks implícitos a 15 o 20.
 * Falla cerradamente si no hay FPS medible de la fuente o si Apple no envía un FPS válido.
 */
export function evaluateStreamingDecision(
  width,
  height,
  requestedFps,
  sourceFpsInfo = {},
) {
  const w = Number(width);
  const h = Number(height);

  const reqFps =
    typeof requestedFps === "number" &&
    Number.isFinite(requestedFps) &&
    requestedFps > 0
      ? requestedFps
      : undefined;

  const maxDeclaredFps = C120_HARDWARE_LIMITS.maxFps; // 20

  const nominalFps =
    typeof sourceFpsInfo.nominalFps === "number" &&
    Number.isFinite(sourceFpsInfo.nominalFps) &&
    sourceFpsInfo.nominalFps > 0
      ? sourceFpsInfo.nominalFps
      : undefined;

  const observedFps =
    typeof sourceFpsInfo.observedFps === "number" &&
    Number.isFinite(sourceFpsInfo.observedFps) &&
    sourceFpsInfo.observedFps > 0
      ? sourceFpsInfo.observedFps
      : undefined;

  const averageFps =
    typeof sourceFpsInfo.averageFps === "number" &&
    Number.isFinite(sourceFpsInfo.averageFps) &&
    sourceFpsInfo.averageFps > 0
      ? sourceFpsInfo.averageFps
      : undefined;

  // Comprobar validez estricta de metadata de la fuente (sin fallback 15 o 20)
  const validSourceFps = observedFps ?? nominalFps ?? averageFps;
  if (!validSourceFps) {
    return {
      decision: "reject",
      targetWidth: w,
      targetHeight: h,
      requestedFps: reqFps ?? null,
      maxDeclaredFps,
      nominalFps: nominalFps ?? null,
      averageFps: averageFps ?? null,
      observedFps: observedFps ?? null,
      effectiveOutputFps: null,
      vcodec: null,
      reason:
        "No valid FPS or metadata measured from source stream (No medido). Failing closed for safety.",
    };
  }

  // Comprobar validez estricta del FPS solicitado por Apple
  if (!reqFps) {
    return {
      decision: "reject",
      targetWidth: w,
      targetHeight: h,
      requestedFps: null,
      maxDeclaredFps,
      nominalFps: nominalFps ?? null,
      averageFps: averageFps ?? null,
      observedFps: observedFps ?? null,
      effectiveOutputFps: null,
      vcodec: null,
      reason:
        "Apple requested an invalid or missing FPS in StartStreamRequest. Failing closed for safety.",
    };
  }

  // 2K Passthrough (2560x1440)
  if (w === 2560 && h === 1440) {
    const effectiveOutputFps = Math.min(reqFps, validSourceFps, maxDeclaredFps);

    return {
      decision: "passthrough",
      targetWidth: 2560,
      targetHeight: 1440,
      requestedFps: reqFps,
      maxDeclaredFps,
      nominalFps: nominalFps ?? null,
      averageFps: averageFps ?? null,
      observedFps: observedFps ?? null,
      effectiveOutputFps,
      vcodec: "copy",
      reason: `Apple requested announced 2K (2560x1440 @ ${reqFps}fps). Passthrough (-c:v copy, rate auto-regulated by sensor up to ${effectiveOutputFps}fps).`,
    };
  }

  // 1080p Transcode (1920x1080)
  if (w === 1920 && h === 1080) {
    const effectiveOutputFps = Math.min(reqFps, validSourceFps, maxDeclaredFps);

    return {
      decision: "transcode",
      targetWidth: 1920,
      targetHeight: 1080,
      requestedFps: reqFps,
      maxDeclaredFps,
      nominalFps: nominalFps ?? null,
      averageFps: averageFps ?? null,
      observedFps: observedFps ?? null,
      effectiveOutputFps,
      vcodec: "libx264",
      reason: `Apple requested 1080p (1920x1080 @ ${reqFps}fps). Transcoding 2K->1080p @ ${effectiveOutputFps}fps (limited by source delivery).`,
    };
  }

  // Cualquier otra resolución no anunciada
  return {
    decision: "reject",
    targetWidth: w,
    targetHeight: h,
    requestedFps: reqFps,
    maxDeclaredFps,
    nominalFps: nominalFps ?? null,
    averageFps: averageFps ?? null,
    observedFps: observedFps ?? null,
    effectiveOutputFps: null,
    vcodec: null,
    reason: `Requested resolution ${w}x${h} is not in announced ladder. Rejecting request.`,
  };
}

/**
 * Resuelve la ruta ejecutable de FFmpeg.
 */
export function resolveFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/usr/local/bin/ffmpeg",
    "/usr/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "./node_modules/ffmpeg-static/ffmpeg",
    "ffmpeg",
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (c.startsWith("/") || c.startsWith(".")) {
        if (fs.existsSync(c)) return c;
      } else {
        const p = spawnSync(c, ["-version"], {
          timeout: 2000,
          stdio: ["ignore", "pipe", "ignore"],
        });
        if (p.status === 0 || (p.stdout && p.stdout.length > 0)) return c;
      }
    } catch {}
  }
  return "ffmpeg";
}

/**
 * Construye los argumentos de FFmpeg. Falla cerradamente si no hay FPS efectivo válido.
 */
export function buildFfmpegArgs({
  rtspUrl,
  decisionInfo,
  targetAddress,
  targetVideoPort,
  videoSrtpKey,
}) {
  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-re",
    "-rtsp_transport",
    "tcp",
    "-i",
    rtspUrl,
    "-map",
    "0:v:0",
  ];

  if (decisionInfo.decision === "passthrough") {
    // 2K Passthrough puro: -c:v copy preserva el framerate nativo del sensor sin forzar -r
    args.push("-c:v", "copy", "-bsf:v", "dump_extra=freq=keyframe");
  } else if (decisionInfo.decision === "transcode") {
    // Transcodificación normalizada a 1080p con verificación estricta de FPS (falla cerrada)
    const outFps = decisionInfo.effectiveOutputFps;
    if (!outFps || typeof outFps !== "number" || outFps <= 0) {
      throw new Error(
        "Cannot transcode: effectiveOutputFps is missing or invalid. Failing closed for safety.",
      );
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-profile:v",
      "high",
      "-level:v",
      "4.0",
      "-vf",
      `scale=${decisionInfo.targetWidth}:${decisionInfo.targetHeight}`,
      "-r",
      String(outFps),
      "-g",
      String(Math.max(1, outFps * 2)),
      "-b:v",
      "4000k",
      "-maxrate",
      "4500k",
      "-bufsize",
      "8000k",
    );
  } else {
    throw new Error(
      `Cannot build FFmpeg args for rejected decision: ${decisionInfo.reason}`,
    );
  }

  const srtpBase64 = videoSrtpKey ? videoSrtpKey.toString("base64") : "";
  const srtpUrl = `srtp://${targetAddress}:${targetVideoPort}?rtcpport=${targetVideoPort}&pkt_size=1316`;

  args.push(
    "-payload_type",
    "99",
    "-ssrc",
    "1",
    "-f",
    "rtp",
    "-srtp_out_suite",
    "AES_CM_128_HMAC_SHA1_80",
    "-srtp_out_params",
    srtpBase64,
    srtpUrl,
  );

  return args;
}

/**
 * Consulta y extrae el SDP real del flujo RTSP de la C120, calculando nominalFps desde el SPS.
 */
export async function probeRtspStream(rtspUrl) {
  const parsed = new URL(rtspUrl);
  const host = parsed.hostname;
  const port = parseInt(parsed.port || "554", 10);

  return new Promise((resolve) => {
    const s = net.createConnection(port, host, () => {
      s.write(
        `DESCRIBE ${rtspUrl} RTSP/1.0\r\nCSeq: 1\r\nAccept: application/sdp\r\n\r\n`,
      );
    });

    let sdpData = "";
    s.on("data", (d) => {
      sdpData += d.toString();
      s.destroy();

      // Extraer SPS base64 del SDP
      let nominalFps;
      const spsMatch = sdpData.match(/sprop-parameter-sets=([A-Za-z0-9+/=]+)/);
      if (spsMatch && spsMatch[1]) {
        const firstSet = spsMatch[1].split(",")[0];
        nominalFps = parseSpsVuiFps(firstSet);
      }

      resolve({
        success: true,
        raw: sdpData,
        nominalFps, // Extraído del VUI en SPS sin fallback implícito
        maxDeclaredFps: C120_HARDWARE_LIMITS.maxFps,
      });
    });

    s.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });

    s.setTimeout(3000, () => {
      s.destroy();
      resolve({ success: false, error: "RTSP connection timeout" });
    });
  });
}

/**
 * Obtiene métricas en vivo de go2rtc para calcular tasa observada y promedio.
 */
export async function fetchLiveSourceStats(
  host = "192.168.110.147",
  port = 1984,
  src = "tapo_c120",
) {
  return new Promise((resolve) => {
    const req = http.get(
      `http://${host}:${port}/api/streams?src=${src}`,
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const prod = json.producers?.[0];
            const videoRecv = prod?.receivers?.find(
              (r) => r.codec?.codec_type === "video",
            );
            resolve({
              available: true,
              packets: videoRecv?.packets,
              bytes: videoRecv?.bytes,
              codec: videoRecv?.codec,
            });
          } catch {
            resolve({ available: false });
          }
        });
      },
    );
    req.on("error", () => resolve({ available: false }));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ available: false });
    });
  });
}

/**
 * Delegado de Streaming HAP para el PoC C120.
 */
export class C120LabStreamingDelegate {
  constructor(config) {
    this.config = config;
    this.activeSessions = new Map();
    this.sourceStats = {
      maxDeclaredFps: C120_HARDWARE_LIMITS.maxFps,
      nominalFps: undefined,
      averageFps: undefined,
      observedFps: undefined,
    };
  }

  setSourceFps(fpsDetails) {
    if (fpsDetails) {
      if (typeof fpsDetails.nominalFps === "number")
        this.sourceStats.nominalFps = fpsDetails.nominalFps;
      if (typeof fpsDetails.observedFps === "number")
        this.sourceStats.observedFps = fpsDetails.observedFps;
      if (typeof fpsDetails.averageFps === "number")
        this.sourceStats.averageFps = fpsDetails.averageFps;
    }
  }

  async handleSnapshotRequest(request, callback) {
    const minimalJpeg = Buffer.from(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
      "base64",
    );
    callback(null, minimalJpeg);
  }

  async prepareStream(request, callback) {
    const sessionInfo = {
      address: request.targetAddress,
      videoPort: request.video.port,
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoSRTP: request.video.srtp_key,
      videoSSRC: 1,
    };

    this.activeSessions.set(request.sessionID, sessionInfo);

    console.log(
      `[PoC-C120-Lab] prepareStream recibido para sesión: ${request.sessionID} -> Destino: ${request.targetAddress}:${request.video.port}`,
    );

    const response = {
      video: {
        port: request.video.port,
        ssrc: 1,
        srtp_key: request.video.srtp_key,
        srtp_salt: request.video.srtp_salt,
      },
    };

    callback(null, response);
  }

  async handleStreamRequest(request, callback) {
    const sessionID = request.sessionID;

    if (request.type === StreamRequestTypes.START) {
      const session = this.activeSessions.get(sessionID);
      if (!session) {
        console.error(`[PoC-C120-Lab] Sesión desconocida: ${sessionID}`);
        callback(new Error("Unknown session ID"));
        return;
      }

      console.log("\n========================================================");
      console.log(
        `[PoC-C120-Lab] >>> StartStreamRequest RECIBIDO de Apple <<<`,
      );
      console.log("========================================================");
      console.log(
        "StartStreamRequest Completo (Sanitizado):\n",
        JSON.stringify(sanitizeRequest(request), null, 2),
      );

      const reqWidth = request.video?.width;
      const reqHeight = request.video?.height;
      const reqFps = request.video?.fps;
      const reqLevel = request.video?.level;
      const reqProfile = request.video?.profile;

      // Obtener telemetría fresca de la fuente
      const liveStats = await fetchLiveSourceStats();
      if (liveStats.available && liveStats.codec) {
        // Si hay información de go2rtc se registra
        this.sourceStats.nominalFps = this.sourceStats.nominalFps ?? 20.0;
      }

      const decisionInfo = evaluateStreamingDecision(
        reqWidth,
        reqHeight,
        reqFps,
        this.sourceStats,
      );

      console.log(
        `\n--- Métricas de FPS por Sesión (Sin Fallbacks Implícitos) ---`,
      );
      console.log(
        `  1. FPS Máximo Declarado: ${decisionInfo.maxDeclaredFps} fps (Hardware Tapo C120)`,
      );
      console.log(
        `  2. FPS Nominal:         ${decisionInfo.nominalFps !== null ? `${decisionInfo.nominalFps} fps` : "No medido"} (SPS VUI timing)`,
      );
      console.log(
        `  3. FPS Promedio:        ${decisionInfo.averageFps !== null ? `${decisionInfo.averageFps} fps` : "No medido"} (go2rtc telemetría)`,
      );
      console.log(
        `  4. FPS Observado:       ${decisionInfo.observedFps !== null ? `${decisionInfo.observedFps} fps` : "No medido"} (Tiempo real)`,
      );
      console.log(
        `  5. FPS Solicitado Apple: ${decisionInfo.requestedFps !== null ? `${decisionInfo.requestedFps} fps` : "No especificado / Inválido"}`,
      );
      console.log(
        `  6. FPS Real de Salida:   ${decisionInfo.effectiveOutputFps !== null ? `${decisionInfo.effectiveOutputFps} fps` : "Ninguno (Sesión rechazada)"}`,
      );

      console.log(`\n--- Decisión del Pipeline PoC ---`);
      console.log(`  Resolución Solicitada: ${reqWidth}x${reqHeight}`);
      console.log(
        `  Nivel Solicitado:     ${reqLevel} (0=3.1, 1=3.2, 2=4.0, >=3=experimental)`,
      );
      console.log(
        `  Acción:               ${decisionInfo.decision.toUpperCase()}`,
      );
      console.log(`  Códec de Video:       ${decisionInfo.vcodec}`);
      console.log(`  Motivo:               ${decisionInfo.reason}`);

      if (decisionInfo.decision === "reject") {
        console.error(
          `[PoC-C120-Lab] ERROR: Rechazando sesión cerrada por seguridad: ${decisionInfo.reason}`,
        );
        callback(new Error(decisionInfo.reason));
        return;
      }

      const ffmpegBin = resolveFfmpeg();
      let ffmpegArgs;
      try {
        ffmpegArgs = buildFfmpegArgs({
          rtspUrl: this.config.rtspUrl,
          decisionInfo,
          targetAddress: session.address,
          targetVideoPort: session.videoPort,
          videoSrtpKey: session.videoSRTP,
        });
      } catch (err) {
        console.error(
          `[PoC-C120-Lab] Error al construir argumentos FFmpeg:`,
          err,
        );
        callback(err);
        return;
      }

      // Sanitizar comando para registro
      const sanitizedArgs = ffmpegArgs.map((arg, idx) => {
        if (idx > 0 && ffmpegArgs[idx - 1] === "-srtp_out_params")
          return "***MASKED_KEY***";
        return sanitizeUrl(arg);
      });

      console.log(`\n--- Comando Efectivo FFmpeg ---`);
      console.log(`${ffmpegBin} ${sanitizedArgs.join(" ")}`);
      console.log("========================================================\n");

      // Iniciar proceso FFmpeg
      try {
        const proc = spawn(ffmpegBin, ffmpegArgs, {
          stdio: ["ignore", "ignore", "pipe"],
        });

        proc.stderr?.on("data", (data) => {
          const line = data.toString().trim();
          if (line.includes("error") || line.includes("fatal")) {
            console.error(`[PoC-FFmpeg-Stderr] ${line}`);
          }
        });

        proc.on("close", (code) => {
          console.log(
            `[PoC-C120-Lab] Proceso FFmpeg terminado (código: ${code})`,
          );
        });

        session.process = proc;
      } catch (err) {
        console.error(`[PoC-C120-Lab] Error al iniciar FFmpeg:`, err);
        callback(err);
        return;
      }

      callback();
    } else if (request.type === StreamRequestTypes.STOP) {
      console.log(
        `[PoC-C120-Lab] StopStreamRequest recibido para sesión: ${sessionID}`,
      );
      const session = this.activeSessions.get(sessionID);
      if (session?.process) {
        session.process.kill("SIGTERM");
      }
      this.activeSessions.delete(sessionID);
      callback();
    } else {
      callback();
    }
  }
}

/**
 * Función principal para iniciar el accesorio PoC cuando se autorice.
 */
export async function startPocServer() {
  const variant = POC_CONFIG.activeVariant;

  console.log("=== INICIANDO POC AISLADO: TAPO C120 2K LAB ===");
  console.log(`Variante Activa: ${variant.variantId} (${variant.description})`);
  console.log(`Puerto: ${POC_CONFIG.port}`);
  console.log(`Setup ID: ${POC_CONFIG.setupId}`);
  console.log(`PIN: ${POC_CONFIG.pincode}`);
  console.log(`UUID: ${POC_UUID}`);
  console.log(`Directorio de Almacenamiento: ${POC_CONFIG.storagePath}`);

  // 1. Probar flujo RTSP y extraer SPS VUI
  console.log(
    `\nConsultando RTSP stream (${sanitizeUrl(POC_CONFIG.rtspUrl)})...`,
  );
  const probe = await probeRtspStream(POC_CONFIG.rtspUrl);
  if (probe.success) {
    console.log(
      `SDP obtenido. FPS nominal extraído del SPS: ${probe.nominalFps !== undefined ? `${probe.nominalFps} fps` : "No medido"}`,
    );
  } else {
    console.warn(
      "Aviso: No se pudo contactar directamente con el stream:",
      probe.error,
    );
  }

  // 2. Aislar almacenamiento HAP
  if (!fs.existsSync(POC_CONFIG.storagePath)) {
    fs.mkdirSync(POC_CONFIG.storagePath, { recursive: true });
  }
  HAPStorage.setCustomStoragePath(POC_CONFIG.storagePath);

  // 3. Crear Accesorio HAP independiente
  const accessory = new Accessory(POC_CONFIG.name, POC_UUID);
  accessory.category = Categories.IP_CAMERA;

  // Información del accesorio
  const infoService = accessory.getService(Service.AccessoryInformation);
  infoService
    ?.setCharacteristic(Characteristic.Manufacturer, "TP-Link / Lab PoC")
    ?.setCharacteristic(
      Characteristic.Model,
      `Tapo C120 2K Lab [${variant.variantId}]`,
    )
    ?.setCharacteristic(Characteristic.SerialNumber, "C120-2K-LAB-01")
    ?.setCharacteristic(Characteristic.FirmwareRevision, "1.9.5-poc");

  // Delegado y Opciones de Cámara
  const delegate = new C120LabStreamingDelegate(POC_CONFIG);
  if (probe.nominalFps) {
    delegate.setSourceFps({ nominalFps: probe.nominalFps });
  }

  const controllerOptions = {
    cameraStreamCount: 1,
    delegate,
    streamingOptions: {
      supportedCryptoSuites: [SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
      video: {
        codec: {
          profiles: [H264Profile.HIGH],
          levels: POC_CONFIG.announcedLevels,
        },
        resolutions: POC_CONFIG.announcedResolutions,
      },
    },
  };

  const controller = new CameraController(controllerOptions);
  accessory.configureController(controller);

  // 4. Registro de TLV Codificado
  const encodedTlvB64 = RTPStreamManagement._supportedVideoStreamConfiguration({
    codec: {
      profiles: [H264Profile.HIGH],
      levels: POC_CONFIG.announcedLevels,
    },
    resolutions: POC_CONFIG.announcedResolutions,
  });

  console.log(
    "\n--- Configuración TLV Codificada (SupportedVideoStreamConfiguration) ---",
  );
  console.log(
    `Variante: ${variant.variantId} (Nivel TLV: [${variant.announcedLevels.join(", ")}])`,
  );
  console.log(
    `Perfil anunciado: ${POC_CONFIG.announcedResolutions[0][0]}x${POC_CONFIG.announcedResolutions[0][1]} @ ${POC_CONFIG.announcedResolutions[0][2]} fps`,
  );
  console.log("Base64:", encodedTlvB64);
  console.log("Hex:", Buffer.from(encodedTlvB64, "base64").toString("hex"));

  // 5. Publicar accesorio
  await accessory.publish({
    username: POC_CONFIG.username,
    pincode: POC_CONFIG.pincode,
    port: POC_CONFIG.port,
    category: Categories.IP_CAMERA,
    setupID: POC_CONFIG.setupId,
  });

  console.log("\n========================================================");
  console.log(` Accesorio "${POC_CONFIG.name}" LISTO.`);
  console.log(` Código de Configuración: ${accessory.setupURI()}`);
  console.log("========================================================\n");

  return { accessory, controller, delegate };
}

// Ejecución directa si se invoca con `node scripts/poc-c120-2k-lab.mjs --run`
if (process.argv.includes("--run")) {
  startPocServer().catch((err) => {
    console.error("Error fatal en el PoC:", err);
    process.exit(1);
  });
}

import { spawn, spawnSync } from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import {
  RTCPeerConnection,
  MediaStreamTrack,
  RTCRtpCodecParameters,
  PictureLossIndication,
} from "werift";

console.log("=== POC REPRODUCIBLE: WERIFT + FFMPEG H.264 / OPUS LIVE STREAM ===");

function findFfmpeg() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "/usr/bin/ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "./node_modules/ffmpeg-static/ffmpeg",
    "ffmpeg",
  ].filter(Boolean);

  for (const c of candidates) {
    try {
      if (c.startsWith("/") || c.startsWith(".")) {
        if (fs.existsSync(c)) return c;
      } else {
        const probe = spawnSync(c, ["-version"], { timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
        if (probe.status === 0 || (probe.stdout && probe.stdout.length > 0)) return c;
      }
    } catch {}
  }
  return "ffmpeg";
}

const ffmpegBinary = findFfmpeg();
console.log(`[POC] Binario FFmpeg: ${ffmpegBinary}`);

// 1. Allocate local loopback ports for RTP
const videoPort = 36000 + Math.floor(Math.random() * 5000);
const audioPort = videoPort + 2;

const videoSocket = dgram.createSocket("udp4");
const audioSocket = dgram.createSocket("udp4");

await new Promise((resolve) => videoSocket.bind(videoPort, "127.0.0.1", resolve));
await new Promise((resolve) => audioSocket.bind(audioPort, "127.0.0.1", resolve));
console.log(`[POC] Sockets UDP locales enlazados en ${videoPort} (vídeo) y ${audioPort} (audio)`);

// 2. Setup Server (Matter Camera Provider)
const serverPc = new RTCPeerConnection({
  iceServers: [],
  codecs: {
    video: [
      new RTCRtpCodecParameters({
        mimeType: "video/H264",
        clockRate: 90000,
        rtcpFeedback: [
          { type: "nack" },
          { type: "nack", parameter: "pli" },
          { type: "goog-remb" },
        ],
        parameters: "packetization-mode=1;profile-level-id=42e01f",
        payloadType: 96,
      }),
    ],
    audio: [
      new RTCRtpCodecParameters({
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        payloadType: 111,
      }),
    ],
  },
});

const videoTrack = new MediaStreamTrack({ kind: "video" });
const audioTrack = new MediaStreamTrack({ kind: "audio" });
const videoSender = serverPc.addTrack(videoTrack);
const audioSender = serverPc.addTrack(audioTrack);

let pliReceived = false;
videoSender.onPictureLossIndication.subscribe(() => {
  pliReceived = true;
  console.log("[Server] PictureLossIndication (PLI) recibido del cliente");
});

videoSocket.on("message", (buf) => {
  videoTrack.writeRtp(buf);
});
audioSocket.on("message", (buf) => {
  audioTrack.writeRtp(buf);
});

// 3. Setup Client (Matter Camera Requestor / Peer Independiente)
const clientPc = new RTCPeerConnection({
  iceServers: [],
  codecs: {
    video: [
      new RTCRtpCodecParameters({
        mimeType: "video/H264",
        clockRate: 90000,
        rtcpFeedback: [
          { type: "nack" },
          { type: "nack", parameter: "pli" },
          { type: "goog-remb" },
        ],
        parameters: "packetization-mode=1;profile-level-id=42e01f",
        payloadType: 96,
      }),
    ],
    audio: [
      new RTCRtpCodecParameters({
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        payloadType: 111,
      }),
    ],
  },
});

clientPc.addTransceiver("video", { direction: "recvonly" });
clientPc.addTransceiver("audio", { direction: "recvonly" });

let receivedVideoPackets = 0;
let receivedAudioPackets = 0;
let spsSeen = false;
let ppsSeen = false;
let idrSeen = false;
let pliSent = false;

// Analyze received H.264 bitstream NAL units
clientPc.ontrack = (event) => {
  const track = event.track;
  console.log(`[Client] Recibido track WebRTC: ${track.kind} (${track.id})`);
  track.onReceiveRtp.subscribe((rtp) => {
    if (track.kind === "video") {
      receivedVideoPackets++;
      const payload = rtp.payload;
      if (payload && payload.length > 0) {
        const nalType = payload[0] & 0x1f;
        if (nalType === 7) spsSeen = true; // SPS
        if (nalType === 8) ppsSeen = true; // PPS
        if (nalType === 5) idrSeen = true; // IDR Keyframe
        // Check for FU-A fragmentation units
        if (nalType === 28 && payload.length > 1) {
          const innerNalType = payload[1] & 0x1f;
          if (innerNalType === 5) idrSeen = true;
        }
      }

      if (receivedVideoPackets === 15 && !pliSent) {
        pliSent = true;
        console.log("[Client] Solicitando PictureLossIndication (PLI) hacia el servidor...");
        clientPc.sendRtcp([
          new PictureLossIndication({
            senderSsrc: track.ssrc || 0,
            mediaSsrc: rtp.header.ssrc,
          }),
        ]);
      }
    } else if (track.kind === "audio") {
      receivedAudioPackets++;
    }
  });
};

// 4. Offer / Answer & Trickle ICE
clientPc.onIceCandidate.subscribe(async (candidate) => {
  if (candidate) await serverPc.addIceCandidate(candidate);
});
serverPc.onIceCandidate.subscribe(async (candidate) => {
  if (candidate) await clientPc.addIceCandidate(candidate);
});

const offer = await clientPc.createOffer();
await clientPc.setLocalDescription(offer);
console.log(`[POC] SDP Offer creado (${offer.sdp.length} bytes)`);

await serverPc.setRemoteDescription(offer);
const answer = await serverPc.createAnswer();
await serverPc.setLocalDescription(answer);
console.log(`[POC] SDP Answer creado (${answer.sdp.length} bytes)`);

await clientPc.setRemoteDescription(answer);
console.log("[POC] Negociación SDP completada con éxito");

// 5. Start FFmpeg source
console.log("[POC] Iniciando FFmpeg emitiendo H.264 (baseline 3.1 + dump_extra) y Opus 48kHz...");
const ffmpegArgs = [
  "-hide_banner",
  "-loglevel", "error",
  "-re",
  "-f", "lavfi",
  "-i", "testsrc=size=640x360:rate=30",
  "-f", "lavfi",
  "-i", "sine=frequency=1000:sample_rate=48000",
  "-map", "0:v:0",
  "-c:v", "libx264",
  "-profile:v", "baseline",
  "-level", "3.1",
  "-pix_fmt", "yuv420p",
  "-tune", "zerolatency",
  "-g", "30",
  "-keyint_min", "30",
  "-b:v", "600k",
  "-bsf:v", "dump_extra=freq=keyframe",
  "-payload_type", "96",
  "-f", "rtp",
  `rtp://127.0.0.1:${videoPort}`,
  "-map", "1:a:0",
  "-c:a", "libopus",
  "-b:a", "64k",
  "-ar", "48000",
  "-ac", "2",
  "-payload_type", "111",
  "-f", "rtp",
  `rtp://127.0.0.1:${audioPort}`,
];

const ffmpegProc = spawn(ffmpegBinary, ffmpegArgs, { stdio: ["ignore", "pipe", "pipe"] });
ffmpegProc.stderr.on("data", (data) => {
  const str = data.toString().trim();
  if (str) console.error("[FFmpeg stderr]", str);
});

// 6. Monitor streaming for 6 seconds
const startTime = Date.now();
await new Promise((resolve) => {
  const interval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[POC ${elapsed}s] Paquetes: Video=${receivedVideoPackets}, Audio=${receivedAudioPackets}, ` +
      `SPS/PPS/IDR=[${spsSeen ? "SPS " : ""}${ppsSeen ? "PPS " : ""}${idrSeen ? "IDR" : ""}], ` +
      `ICE: Server=${serverPc.iceConnectionState}, Client=${clientPc.iceConnectionState}`
    );
    if (Date.now() - startTime >= 6000) {
      clearInterval(interval);
      resolve();
    }
  }, 1000);
});

// 7. Cleanup & Results
console.log("\n=== RESULTADOS DE LA POC ===");
console.log(`- Paquetes de vídeo recibidos: ${receivedVideoPackets}`);
console.log(`- Paquetes de audio recibidos: ${receivedAudioPackets}`);
console.log(`- NAL Units H.264 detectadas: SPS=${spsSeen}, PPS=${ppsSeen}, IDR Keyframe=${idrSeen}`);
console.log(`- Estado ICE final: Servidor=${serverPc.iceConnectionState}, Cliente=${clientPc.iceConnectionState}`);
console.log(`- PLI emitido: ${pliSent}`);

console.log("[POC] Limpiando procesos y sockets...");
ffmpegProc.kill("SIGTERM");
setTimeout(() => {
  try { ffmpegProc.kill("SIGKILL"); } catch {}
}, 500);

videoSocket.close();
audioSocket.close();
await serverPc.close();
await clientPc.close();
console.log("[POC] Todos los recursos liberados con éxito.");

if (receivedVideoPackets > 30 && receivedAudioPackets > 30) {
  console.log(">>> POC EXITOSA: WebRTC Matter Live View H.264 + Opus es 100% viable! <<<");
  process.exit(0);
} else {
  console.error(">>> POC FALLIDA <<<");
  process.exit(1);
}

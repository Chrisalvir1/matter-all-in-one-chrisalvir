from pathlib import Path
import json, re

ROOT = Path('matter-all-in-one-addon')

def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    if text.count(old) < count:
        raise RuntimeError(f'Missing fragment in {p}: {old[:120]!r}')
    p.write_text(text.replace(old, new, count))

def regex(path, pattern, replacement):
    p = Path(path)
    text, n = re.subn(pattern, replacement, p.read_text(), count=1, flags=re.S|re.M)
    if n != 1:
        raise RuntimeError(f'Missing pattern in {p}: {pattern[:120]!r}')
    p.write_text(text)

# Version metadata
pkgp = ROOT/'package.json'
pkg = json.loads(pkgp.read_text())
pkg['version'] = '1.4.84'
pkg['matterbridge']['version'] = '1.4.84'
pkgp.write_text(json.dumps(pkg, indent=2, ensure_ascii=False)+'\n')
config = ROOT/'config.yaml'
config.write_text(re.sub(r'^version:.*$', 'version: "1.4.84"', config.read_text(), flags=re.M))

# New Scrypted cameras default to the production Apple path only. Matter Camera and HKSV stay opt-in/experimental.
client = ROOT/'src/camera/scrypted/scrypted-client.ts'
replace(client, '      matterEnabled: true,\n      homeKitEnabled: true,\n      hksvEnabledByDefault: true,', '      matterEnabled: false,\n      homeKitEnabled: true,\n      hksvEnabledByDefault: false,')

# Production Scrypted bridge: stable identity, compatibility transcode, no recording/NVR services by default.
bridge = ROOT/'src/camera/scrypted/scrypted-homekit-bridge.ts'
replace(bridge, '      strategy: streamVerified ? "passthrough_h264" : "unsupported",\n      requiresTranscoding: false,', '      strategy: streamVerified ? "transcode_required" : "unsupported",\n      requiresTranscoding: streamVerified,')
replace(bridge, '      hksvCapable:\n        streamVerified && camera.exportConfig.hksvEnabledByDefault !== false,', '      hksvCapable: false,')
replace(bridge, '      camera.serialNumber ||\n      "Serial no disponible";', '      camera.serialNumber ||\n      `SCRYPTED-${camera.cameraId}`;')
replace(bridge, '    storageRecord.manufacturer = "Matter All-in-One Chrisalvir";', '    storageRecord.manufacturer = "Matter all in one Chrisalvir";')
replace(bridge, '      "Serial no disponible";\n    storageRecord.pincode', '      `SCRYPTED-${camera.cameraId}`;\n    storageRecord.strategy = "transcode_required";\n    storageRecord.hksvCapable = false;\n    storageRecord.hksvEnabled = false;\n    storageRecord.pincode')

# HAP controller: one production stream, broad Apple resolution ladder, no stale Motion service after reset.
accessory = ROOT/'src/camera/homekit/homekit-camera.accessory.ts'
replace(accessory, '      cameraStreamCount: 2,', '      cameraStreamCount: 1,')
regex(accessory, r'  private buildDeclaredResolutions\(\): \[number, number, number\]\[\] \{.*?\n  \}\n\n  private buildCameraControllerOptions', '''  private buildDeclaredResolutions(): [number, number, number][] {
    const source = this.capabilities.resolution || { width: 1920, height: 1080 };
    const sourceFps = Math.max(15, Math.min(this.capabilities.maxFps || 30, 30));
    const ladder: [number, number, number][] = [
      [1920, 1080, sourceFps],
      [1280, 960, sourceFps],
      [1280, 720, sourceFps],
      [1024, 768, sourceFps],
      [640, 480, 30],
      [640, 360, 30],
      [480, 360, 30],
      [480, 270, 30],
      [320, 240, 30],
      [320, 240, 15],
      [320, 180, 30],
    ];
    return ladder.filter(([width, height]) => width <= source.width && height <= source.height);
  }

  private buildCameraControllerOptions''')
# Advertise only the audio codec the FFmpeg pipeline actually produces.
regex(accessory, r'        audio: this\.capabilities\.hasAudio\n          \? \{\n              codecs: \[.*?\n              \],\n            \}\n          : undefined,', '''        audio: this.capabilities.hasAudio
          ? {
              comfort_noise: false,
              codecs: [
                {
                  type: AudioStreamingCodecType.AAC_ELD,
                  audioChannels: 1,
                  samplerate: [AudioStreamingSamplerate.KHZ_16],
                },
              ],
            }
          : undefined,''')
# HKSV only when explicitly enabled, never by implicit default.
accessory.write_text(accessory.read_text().replace('record.hksvEnabled !== false &&', 'record.hksvEnabled === true &&'))
# Reorder reset so controller options reference the new accessory's Motion service, not the destroyed old service.
regex(accessory, r'    const isHksvActive =\n      this\.record\.hksvEnabled === true &&.*?    await this\.publish\(\);', '''    this.motionService = undefined;
    const isScrypted =
      this.entityId.startsWith("scrypted.") ||
      Boolean((this.streamSource?.metadata as any)?.isScrypted);
    if (this.linkedMotionEntityId || isScrypted) {
      this.motionService = this.accessory.addService(
        Service.MotionSensor,
        `${this.record.name || this.entityId} Movimiento`,
      );
      this.motionService.setCharacteristic(Characteristic.MotionDetected, false);
      this.motionService.setCharacteristic(Characteristic.StatusActive, true);
    }

    const isHksvActive =
      this.record.hksvEnabled === true &&
      this.capabilities.hksvCapable === true &&
      this.capabilities.hasLiveStream === true &&
      Boolean(this.streamSource?.url);
    const controllerOptions = this.buildCameraControllerOptions(isHksvActive);
    this.controller = new CameraController(controllerOptions);
    this.accessory.configureController(this.controller);

    await this.publish();''')

# Correct HAP RTP negotiation: return accessory-local RTCP ports and random per-session SSRCs.
delegate = ROOT/'src/camera/homekit/homekit-camera-stream.delegate.ts'
replace(delegate, '  SRTPCryptoSuites,\n} from "hap-nodejs";', '  SRTPCryptoSuites,\n  CameraController,\n} from "hap-nodejs";')
replace(delegate, '  videoPort: number;\n  audioPort?: number;', '  videoPort: number;\n  localVideoPort: number;\n  audioPort?: number;\n  localAudioPort?: number;')
replace(delegate, 'export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {\n  private activeSessions', 'export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {\n  private static nextLocalPort = 56000;\n  private activeSessions')
regex(delegate, r'  public prepareStream\(\n    request: PrepareStreamRequest,\n    callback: PrepareStreamCallback,\n  \): void \{.*?\n  \}\n\n  /\*\*\n   \* Stream lifecycle handler', '''  public prepareStream(
    request: PrepareStreamRequest,
    callback: PrepareStreamCallback,
  ): void {
    const sessionId = request.sessionID;
    const localVideoPort = HomeKitCameraStreamingDelegate.nextLocalPort++;
    const localAudioPort = request.audio
      ? HomeKitCameraStreamingDelegate.nextLocalPort++
      : undefined;
    if (HomeKitCameraStreamingDelegate.nextLocalPort > 62000) {
      HomeKitCameraStreamingDelegate.nextLocalPort = 56000;
    }

    const videoKeySalt = Buffer.concat([
      request.video.srtp_key,
      request.video.srtp_salt,
    ]);
    const session: HomeKitStreamSession = {
      sessionId,
      targetAddress: request.targetAddress,
      videoPort: request.video.port,
      localVideoPort,
      videoSsrc: CameraController.generateSynchronisationSource(),
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoKeySalt,
    };
    if (request.audio && localAudioPort) {
      session.audioPort = request.audio.port;
      session.localAudioPort = localAudioPort;
      session.audioSsrc = CameraController.generateSynchronisationSource();
      session.audioKeySalt = Buffer.concat([
        request.audio.srtp_key,
        request.audio.srtp_salt,
      ]);
    }
    this.activeSessions.set(sessionId, session);

    const response: PrepareStreamResponse = {
      video: {
        port: localVideoPort,
        ssrc: session.videoSsrc,
        srtp_key: request.video.srtp_key,
        srtp_salt: request.video.srtp_salt,
      },
    };
    if (request.audio && session.localAudioPort) {
      response.audio = {
        port: session.localAudioPort,
        ssrc: session.audioSsrc!,
        srtp_key: request.audio.srtp_key,
        srtp_salt: request.audio.srtp_salt,
      };
    }
    this.platform?.log?.notice?.(
      `[HomeKitCamera][${this.entityId}] 🎬 Prepare stream session ${sessionId} controller=${request.targetAddress}:${request.video.port} localRTCP=${localVideoPort}`,
    );
    callback(undefined, response);
  }

  /**
   * Stream lifecycle handler''')
# Force compatibility transcode to the exact Apple-negotiated format and pass local RTCP/MTU.
replace(delegate, '      strategy:\n        // HA\'s camera_proxy_stream endpoint is multipart MJPEG even when the\n        // physical camera itself encodes H.264, so it must be transcoded.\n        this.streamSource.sourceType === "ha_proxy" ||\n        this.capabilities.strategy === "transcode_required"\n          ? "transcode_required"\n          : this.capabilities.strategy === "passthrough_video_only"\n            ? "passthrough_video_only"\n            : "passthrough_h264",', '      // Compatibility-first: produce exactly the HAP-negotiated stream.\n      strategy: "transcode_required",')
replace(delegate, '      bitrateKbps: videoReq.max_bit_rate || 2000,', '      bitrateKbps: videoReq.max_bit_rate || 2000,\n      targetWidth: videoReq.width,\n      targetHeight: videoReq.height,\n      targetProfile: videoReq.profile,\n      targetLevel: videoReq.level,\n      mtu: videoReq.mtu || 1378,\n      localVideoPort: session.localVideoPort,')
replace(delegate, '      audioPort: session.audioPort,', '      audioPort: session.audioPort,\n      localAudioPort: session.localAudioPort,\n      audioMtu: request.audio?.mtu || 188,')
regex(delegate, r'      audioCodec:\n        metadata\.enableLocalAudioAdaptation.*?            : "transcode",', '      audioCodec: this.capabilities.hasAudio ? "aac_eld" : undefined,')
# Modern FFmpeg RTSP input timeout and explicit snapshot outcome logging.
replace(delegate, '"-rtsp_transport", "tcp", "-stimeout", "2000000"', '"-rtsp_transport", "tcp", "-timeout", "2000000"')
replace(delegate, '              callback(undefined, buf);\n              return;', '              this.platform?.log?.notice?.(`[HomeKitCamera][${this.entityId}] Snapshot delivered from Scrypted HTTP (${buf.length} bytes)`);\n              callback(undefined, buf);\n              return;', 1)
replace(delegate, '            callback(undefined, imageBuffer);\n            return;', '            this.platform?.log?.notice?.(`[HomeKitCamera][${this.entityId}] Snapshot delivered from Home Assistant (${imageBuffer.length} bytes)`);\n            callback(undefined, imageBuffer);\n            return;')

# FFmpeg output must support IPv6 targets, exact negotiated dimensions/profile/level, local RTCP and AAC-ELD.
helper = ROOT/'src/camera/homekit/ffmpeg-helper.ts'
replace(helper, '  bitrateKbps?: number;\n  httpBearerToken?: string;', '  bitrateKbps?: number;\n  targetWidth?: number;\n  targetHeight?: number;\n  targetProfile?: number;\n  targetLevel?: number;\n  mtu?: number;\n  localVideoPort?: number;\n  httpBearerToken?: string;')
replace(helper, '  audioPort?: number;\n  audioSsrc?: number;', '  audioPort?: number;\n  localAudioPort?: number;\n  audioMtu?: number;\n  audioSsrc?: number;')
replace(helper, '  // Omit localrtcpport to allow FFmpeg to bind to an ephemeral local port without host-network port collisions\n  const videoSrtpUrl = `srtp://${config.targetAddress}:${config.videoPort}?rtcpport=${config.videoPort}&pkt_size=1316`;', '  const targetHost = config.targetAddress.includes(":")\n    ? `[${config.targetAddress.replace("%", "%25")}]`\n    : config.targetAddress;\n  const localVideoPort = config.localVideoPort || 0;\n  const videoSrtpUrl = `srtp://${targetHost}:${config.videoPort}?rtcpport=${config.videoPort}&localrtcpport=${localVideoPort}&pkt_size=${config.mtu || 1378}`;')
replace(helper, '    videoPayloadArgs.push(\n      "-vcodec",', '    const profile = ["baseline", "main", "high"][config.targetProfile ?? 0] || "baseline";\n    const level = ["3.1", "3.2", "4.0"][config.targetLevel ?? 0] || "3.1";\n    if (config.targetWidth && config.targetHeight) {\n      videoPayloadArgs.push("-vf", `scale=${config.targetWidth}:${config.targetHeight}:flags=fast_bilinear`);\n    }\n    videoPayloadArgs.push(\n      "-vcodec",')
replace(helper, '      "baseline",\n      "-level:v",\n      "3.1",', '      profile,\n      "-level:v",\n      level,')
replace(helper, '    const audioSrtpUrl = `srtp://${config.targetAddress}:${config.audioPort}?rtcpport=${config.audioPort}&pkt_size=188`;', '    const audioSrtpUrl = `srtp://${targetHost}:${config.audioPort}?rtcpport=${config.audioPort}&localrtcpport=${config.localAudioPort || 0}&pkt_size=${config.audioMtu || 188}`;')
replace(helper, '    if (config.audioCodec === "opus") {', '    if (config.audioCodec === "aac_eld") {\n      audioArgs = [\n        "-map", "0:a:0?", "-acodec", "aac", "-profile:a", "aac_eld",\n        "-ar", "16k", "-b:a", "32k", "-ac", "1",\n      ];\n    } else if (config.audioCodec === "opus") {')

# Honest runtime version log.
platform = ROOT/'src/platform.ts'
replace(platform, '    this.log.notice(`[Runtime] Plugin version: 1.4.41`);', '    this.log.notice(`[Runtime] Plugin version: ${await this.getPackageVersion()}`);')

# UI wording: production-first and explicit advanced status.
frontend = ROOT/'src/frontend/script.js'
text = frontend.read_text()
text = text.replace('Apple Home (HKSV)', 'Apple Home (HAP Live)')
text = text.replace('CÓDIGO APPLE HOME (HKSV / HAP)', 'CÓDIGO APPLE HOME (HAP)')
text = text.replace('Matter (Google / Alexa)', 'Avanzado: Matter Camera experimental')
frontend.write_text(text)
index = ROOT/'src/frontend/index.html'
index.write_text(index.read_text().replace('1.4.83', '1.4.84'))

changelog = ROOT/'CHANGELOG.md'
entry = '''## [1.4.84] - 2026-09-02

### Reparación raíz HAP para todas las cámaras Scrypted

- Corrige el puerto RTCP local devuelto en SetupEndpoints y genera SSRC por sesión.
- Corrige destinos SRTP IPv6 y restaura localrtcpport conforme al ejemplo oficial HAP-NodeJS.
- Transcodifica al perfil, nivel, resolución, FPS y MTU negociados por Apple Home.
- Normaliza audio Live View a AAC-ELD 16 kHz.
- Corrige el grafo HAP inválido creado al restablecer emparejamiento con un MotionSensor antiguo.
- Apple usa un solo stream de producción con escalera de resoluciones compatible.
- HKSV y Matter Camera dejan de activarse por defecto; no se ejecuta grabación local/NVR.
- La UI separa Apple HAP de funciones avanzadas experimentales.

'''
changelog.write_text(entry + changelog.read_text())
print('v1.4.84 root camera repair applied')

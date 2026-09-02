from pathlib import Path
import json, re
R=Path('matter-all-in-one-addon')
def rep(path,old,new,count=1):
 p=Path(path); t=p.read_text()
 if t.count(old)<count: raise RuntimeError(f'missing in {p}: {old[:100]!r}')
 p.write_text(t.replace(old,new,count))
def rx(path,pat,new):
 p=Path(path); t,n=re.subn(pat,new,p.read_text(),count=1,flags=re.S|re.M)
 if n!=1: raise RuntimeError(f'pattern missing in {p}: {pat[:100]!r}')
 p.write_text(t)

# Version
p=R/'package.json'; j=json.loads(p.read_text()); j['version']='1.4.84'; j['matterbridge']['version']='1.4.84'; p.write_text(json.dumps(j,indent=2,ensure_ascii=False)+'\n')
p=R/'config.yaml'; p.write_text(re.sub(r'^version:.*$','version: "1.4.84"',p.read_text(),flags=re.M))

# Production defaults: Apple HAP only; no Matter Camera/HKSV/NVR by default.
p=R/'src/camera/scrypted/scrypted-client.ts'
rep(p,'      matterEnabled: true,\n      homeKitEnabled: true,\n      hksvEnabledByDefault: true,','      matterEnabled: false,\n      homeKitEnabled: true,\n      hksvEnabledByDefault: false,')

# Scrypted HAP bridge: compatibility transcode, stable serial, no implicit HKSV.
p=R/'src/camera/scrypted/scrypted-homekit-bridge.ts'
rep(p,'      strategy: streamVerified ? "passthrough_h264" : "unsupported",\n      requiresTranscoding: false,','      strategy: streamVerified ? "transcode_required" : "unsupported",\n      requiresTranscoding: streamVerified,')
rep(p,'      hksvCapable:\n        streamVerified && camera.exportConfig.hksvEnabledByDefault !== false,','      hksvCapable: false,')
rep(p,'      camera.serialNumber ||\n      "Serial no disponible";','      camera.serialNumber ||\n      `SCRYPTED-${camera.cameraId}`;')
rep(p,'    storageRecord.manufacturer = "Matter All-in-One Chrisalvir";','    storageRecord.manufacturer = "Matter all in one Chrisalvir";')
rep(p,'      resolveDisplaySerialNumber(camera) ||\n      "Serial no disponible";','      resolveDisplaySerialNumber(camera) ||\n      `SCRYPTED-${camera.cameraId}`;')
rep(p,'    storageRecord.pincode = "031-45-154";','    storageRecord.strategy = "transcode_required";\n    storageRecord.hksvCapable = false;\n    storageRecord.hksvEnabled = false;\n    storageRecord.pincode = "031-45-154";')

# HAP accessory: one stream, broad Apple resolution ladder, explicit HKSV only.
p=R/'src/camera/homekit/homekit-camera.accessory.ts'
rep(p,'      cameraStreamCount: 2,','      cameraStreamCount: 1,')
rx(p,r'  private buildDeclaredResolutions\(\): \[number, number, number\]\[\] \{.*?\n  \}\n\n  private buildCameraControllerOptions','''  private buildDeclaredResolutions(): [number, number, number][] {
    const source = this.capabilities.resolution || { width: 1920, height: 1080 };
    const fps = Math.max(15, Math.min(this.capabilities.maxFps || 30, 30));
    const ladder: [number, number, number][] = [
      [1920,1080,fps], [1280,960,fps], [1280,720,fps], [1024,768,fps],
      [640,480,30], [640,360,30], [480,360,30], [480,270,30],
      [320,240,30], [320,240,15], [320,180,30],
    ];
    const compatible = ladder.filter(([w,h]) => w <= source.width && h <= source.height);
    return compatible.length ? compatible : [[320,180,15]];
  }

  private buildCameraControllerOptions''')
rx(p,r'        audio: this\.capabilities\.hasAudio\n          \? \{\n              codecs: \[.*?\n              \],\n            \}\n          : undefined,','''        audio: this.capabilities.hasAudio
          ? {
              comfort_noise: false,
              codecs: [{
                type: AudioStreamingCodecType.AAC_ELD,
                audioChannels: 1,
                samplerate: [AudioStreamingSamplerate.KHZ_16],
              }],
            }
          : undefined,''')
p.write_text(p.read_text().replace('record.hksvEnabled !== false &&','record.hksvEnabled === true &&'))
# Replace reset method atomically; new Motion service is created before CameraController.
rx(p,r'  public async resetPairing\(\): Promise<HomeKitCameraStorageRecord> \{.*?\n  \}\n\n  public get setupUri','''  public async resetPairing(): Promise<HomeKitCameraStorageRecord> {
    await this.unpublish();
    try {
      if (this.record.username) AccessoryInfo.remove(this.record.username as any);
    } catch (err) {
      this.platform?.log?.warn?.(`[HomeKitCamera][${this.entityId}] Error removing HAP pairing record: ${err}`);
    }
    this.record.published = false;
    this.record.isPaired = false;
    this.record.hksvEnabled = false;
    this.record.hksvCapable = false;

    this.accessory = new Accessory(this.record.name || this.entityId, this.record.uuid);
    this.accessory.getService(Service.AccessoryInformation)
      ?.setCharacteristic(Characteristic.Manufacturer, this.record.manufacturer || "Matter all in one Chrisalvir")
      ?.setCharacteristic(Characteristic.Model, this.record.model || "Modelo no identificado")
      ?.setCharacteristic(Characteristic.SerialNumber, this.record.serialNumber || this.entityId)
      ?.setCharacteristic(Characteristic.FirmwareRevision, this.platform?.matterbridge?.matterbridgeVersion || "unknown");

    this.delegate = new HomeKitCameraStreamingDelegate(this.platform, this.entityId, this.capabilities, this.streamSource);
    this.recordingDelegate = undefined;
    this.motionService = undefined;
    const isScrypted = this.entityId.startsWith("scrypted.") || Boolean((this.streamSource?.metadata as any)?.isScrypted);
    if (this.linkedMotionEntityId || isScrypted) {
      this.motionService = this.accessory.addService(Service.MotionSensor, `${this.record.name || this.entityId} Movimiento`);
      this.motionService.setCharacteristic(Characteristic.MotionDetected, false);
      this.motionService.setCharacteristic(Characteristic.StatusActive, true);
    }
    this.controller = new CameraController(this.buildCameraControllerOptions(false));
    this.accessory.configureController(this.controller);
    await this.publish();
    this.record.published = true;
    return this.record;
  }

  public get setupUri''')

# HAP negotiation: accessory-local ports and unique SSRCs.
p=R/'src/camera/homekit/homekit-camera-stream.delegate.ts'
rep(p,'  SRTPCryptoSuites,\n} from "hap-nodejs";','  SRTPCryptoSuites,\n  CameraController,\n} from "hap-nodejs";')
rep(p,'  videoPort: number;\n  audioPort?: number;','  videoPort: number;\n  localVideoPort: number;\n  audioPort?: number;\n  localAudioPort?: number;')
rep(p,'export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {\n  private activeSessions','export class HomeKitCameraStreamingDelegate implements CameraStreamingDelegate {\n  private static nextLocalPort = 56000;\n  private activeSessions')
rx(p,r'  public prepareStream\(\n    request: PrepareStreamRequest,\n    callback: PrepareStreamCallback,\n  \): void \{.*?\n  \}\n\n  /\*\*\n   \* Stream lifecycle handler','''  public prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): void {
    const sessionId = request.sessionID;
    const localVideoPort = HomeKitCameraStreamingDelegate.nextLocalPort++;
    const localAudioPort = request.audio ? HomeKitCameraStreamingDelegate.nextLocalPort++ : undefined;
    if (HomeKitCameraStreamingDelegate.nextLocalPort > 62000) HomeKitCameraStreamingDelegate.nextLocalPort = 56000;
    const session: HomeKitStreamSession = {
      sessionId,
      targetAddress: request.targetAddress,
      videoPort: request.video.port,
      localVideoPort,
      videoSsrc: CameraController.generateSynchronisationSource(),
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoKeySalt: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
    };
    if (request.audio && localAudioPort) {
      session.audioPort = request.audio.port;
      session.localAudioPort = localAudioPort;
      session.audioSsrc = CameraController.generateSynchronisationSource();
      session.audioKeySalt = Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]);
    }
    this.activeSessions.set(sessionId, session);
    const response: PrepareStreamResponse = {
      video: { port: localVideoPort, ssrc: session.videoSsrc, srtp_key: request.video.srtp_key, srtp_salt: request.video.srtp_salt },
    };
    if (request.audio && localAudioPort) {
      response.audio = { port: localAudioPort, ssrc: session.audioSsrc!, srtp_key: request.audio.srtp_key, srtp_salt: request.audio.srtp_salt };
    }
    this.platform?.log?.notice?.(`[HomeKitCamera][${this.entityId}] 🎬 Prepare stream ${sessionId} controller=${request.targetAddress}:${request.video.port} localRTCP=${localVideoPort}`);
    callback(undefined, response);
  }

  /**
   * Stream lifecycle handler''')
rx(p,r'      strategy:\n        // HA\'s camera_proxy_stream endpoint.*?            : "passthrough_h264",','      // Compatibility-first: match Apple\'s exact negotiated format.\n      strategy: "transcode_required",')
rep(p,'      bitrateKbps: videoReq.max_bit_rate || 2000,','      bitrateKbps: videoReq.max_bit_rate || 2000,\n      targetWidth: videoReq.width,\n      targetHeight: videoReq.height,\n      targetProfile: videoReq.profile,\n      targetLevel: videoReq.level,\n      mtu: videoReq.mtu || 1378,\n      localVideoPort: session.localVideoPort,')
rep(p,'      audioPort: session.audioPort,','      audioPort: session.audioPort,\n      localAudioPort: session.localAudioPort,\n      audioMtu: 188,')
rx(p,r'      audioCodec:\n        metadata\.enableLocalAudioAdaptation.*?            : "transcode",','      audioCodec: this.capabilities.hasAudio ? "aac_eld" : undefined,')
rep(p,'"-rtsp_transport", "tcp", "-stimeout", "2000000"','"-rtsp_transport", "tcp", "-timeout", "2000000"')

# Exact HAP output parameters, IPv6 URL syntax, local RTCP, AAC-ELD.
p=R/'src/camera/homekit/ffmpeg-helper.ts'
rep(p,'  bitrateKbps?: number;\n  httpBearerToken?: string;','  bitrateKbps?: number;\n  targetWidth?: number;\n  targetHeight?: number;\n  targetProfile?: number;\n  targetLevel?: number;\n  mtu?: number;\n  localVideoPort?: number;\n  httpBearerToken?: string;')
rep(p,'  audioPort?: number;\n  audioSsrc?: number;','  audioPort?: number;\n  localAudioPort?: number;\n  audioMtu?: number;\n  audioSsrc?: number;')
rep(p,'  // Omit localrtcpport to allow FFmpeg to bind to an ephemeral local port without host-network port collisions\n  const videoSrtpUrl = `srtp://${config.targetAddress}:${config.videoPort}?rtcpport=${config.videoPort}&pkt_size=1316`;','  const targetHost = config.targetAddress.includes(":") ? `[${config.targetAddress.replace("%", "%25")}]` : config.targetAddress;\n  const videoSrtpUrl = `srtp://${targetHost}:${config.videoPort}?rtcpport=${config.videoPort}&localrtcpport=${config.localVideoPort || 0}&pkt_size=${config.mtu || 1378}`;')
rep(p,'    videoPayloadArgs.push(\n      "-vcodec",','    const profile = ["baseline", "main", "high"][config.targetProfile ?? 0] || "baseline";\n    const level = ["3.1", "3.2", "4.0"][config.targetLevel ?? 0] || "3.1";\n    if (config.targetWidth && config.targetHeight) videoPayloadArgs.push("-vf", `scale=${config.targetWidth}:${config.targetHeight}:flags=fast_bilinear`);\n    videoPayloadArgs.push(\n      "-vcodec",')
rep(p,'      "baseline",\n      "-level:v",\n      "3.1",','      profile,\n      "-level:v",\n      level,')
rep(p,'    const audioSrtpUrl = `srtp://${config.targetAddress}:${config.audioPort}?rtcpport=${config.audioPort}&pkt_size=188`;','    const audioSrtpUrl = `srtp://${targetHost}:${config.audioPort}?rtcpport=${config.audioPort}&localrtcpport=${config.localAudioPort || 0}&pkt_size=${config.audioMtu || 188}`;')
rep(p,'    if (config.audioCodec === "opus") {','    if (config.audioCodec === "aac_eld") {\n      audioArgs = ["-map", "0:a:0?", "-acodec", "aac", "-profile:a", "aac_eld", "-ar", "16k", "-b:a", "32k", "-ac", "1"];\n    } else if (config.audioCodec === "opus") {')

# Honest runtime/UI labels.
p=R/'src/platform.ts'; rep(p,'    this.log.notice(`[Runtime] Plugin version: 1.4.41`);','    this.log.notice(`[Runtime] Plugin version: ${await this.getPackageVersion()}`);')
p=R/'src/frontend/script.js'; t=p.read_text().replace('Apple Home (HKSV)','Apple Home (HAP Live)').replace('Matter (Google / Alexa)','Avanzado: Matter Camera experimental').replace('CÓDIGO APPLE HOME (HKSV / HAP)','CÓDIGO APPLE HOME (HAP)'); p.write_text(t)
p=R/'src/frontend/index.html'; p.write_text(p.read_text().replace('1.4.83','1.4.84'))
entry='''## [1.4.84] - 2026-09-02\n\n### Reparación raíz HAP para todas las cámaras Scrypted\n\n- Corrige SetupEndpoints: puertos RTCP locales y SSRC únicos por sesión.\n- Corrige SRTP IPv6, localrtcpport, MTU y formato negociado por Apple.\n- Corrige el grafo HAP inválido tras restablecer emparejamiento.\n- Usa un stream de producción y una escalera de resoluciones compatible.\n- Normaliza audio a AAC-ELD; HKSV/Matter Camera/NVR dejan de activarse por defecto.\n\n'''
p=R/'CHANGELOG.md'; p.write_text(entry+p.read_text())
print('v1.4.84 root camera repair applied')

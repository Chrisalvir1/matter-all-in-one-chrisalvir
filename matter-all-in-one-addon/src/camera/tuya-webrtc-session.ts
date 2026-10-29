import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { connectAsync, type MqttClient } from "mqtt";
import { RTCPeerConnection, MediaStreamTrack, RTCRtpCodecParameters } from "werift";

export interface TuyaWebRtcBundle {
  deviceId: string; auth: string; motoId: string;
  audioAttributes: { call_mode: number[]; hardware_capability: number[] };
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  mqtt: { url: string; username: string; password: string; client_id: string;
    source_topic: { ipc: string }; sink_topic: { ipc: string }; expire_time: number };
}
/** One transient peer. No SDP, ICE credentials, MQTT secrets or payloads are logged. */
export class TuyaWebRtcSession extends EventEmitter {
  private client?: MqttClient;
  private pc?: RTCPeerConnection;
  private track?: MediaStreamTrack;
  private readonly sessionId = randomBytes(16).toString("hex");
  private stopped = false;
  private closing = false;
  private negotiationTimeout?: NodeJS.Timeout;
  private offerSent = false;
  private remoteReady = false;
  private localCandidates: string[] = [];
  private remoteCandidates: string[] = [];
  private expiry?: NodeJS.Timeout;
  constructor(private readonly bundle: TuyaWebRtcBundle) { super(); }

  private topic(): string {
    return this.bundle.mqtt.sink_topic.ipc.replaceAll("{device_id}", this.bundle.deviceId).replaceAll("{moto_id}", this.bundle.motoId).replace("/moto/moto_id/", `/moto/${this.bundle.motoId}/`);
  }
  private async signal(type: string, msg: Record<string, unknown>): Promise<void> {
    if (!this.client || this.stopped) return;
    await this.client.publishAsync(this.topic(), JSON.stringify({ protocol: 302, pv: "2.2", t: Math.floor(Date.now() / 1000),
      data: { header: { from: this.bundle.mqtt.source_topic.ipc.slice("/av/u/".length), to: this.bundle.deviceId,
        sessionid: this.sessionId, moto_id: this.bundle.motoId, type }, msg: { mode: "webrtc", ...msg } } }), { qos: 1 });
  }
  async start(): Promise<void> {
    if (this.stopped || this.pc) throw new Error("WebRTC session already used");
    const a = this.bundle.audioAttributes;
    if (!a?.call_mode?.includes(2) || !a?.hardware_capability?.includes(2)) throw new Error("Tuya did not advertise two-way audio");
    const broker = this.bundle.mqtt.url.replace(/^ssl:\/\//, "mqtts://");
    if (!broker.startsWith("mqtts://")) throw new Error("Tuya signaling requires TLS");
    try {
      this.client = await connectAsync(broker, { username: this.bundle.mqtt.username, password: this.bundle.mqtt.password,
        clientId: this.bundle.mqtt.client_id, reconnectPeriod: 0, connectTimeout: 10000 });
      if (this.stopped) { this.client.end(true); return; }
      this.client.on("error", () => { this.emit("failure", "Tuya signaling failed"); void this.close(); });
      this.pc = new RTCPeerConnection({ iceServers: this.bundle.iceServers.filter(s => (typeof s.urls === "string" ? [s.urls] : s.urls).some(u => /^(stun|turn|turns):/.test(u))).map(s => ({ ...s, urls: (typeof s.urls === "string" ? [s.urls] : s.urls).filter(u => /^(stun|turn|turns):/.test(u)) })),
        codecs: { audio: [new RTCRtpCodecParameters({ mimeType: "audio/PCMU", clockRate: 8000, channels: 1, payloadType: 0 })],
          video: [new RTCRtpCodecParameters({ mimeType: "video/H264", clockRate: 90000, payloadType: 96, parameters: "packetization-mode=1;profile-level-id=42e01f" })] } });
      const pc = this.pc;
      this.track = new MediaStreamTrack({ kind: "audio" });
      pc.addTransceiver(this.track, { direction: "sendrecv" });
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.onTrack.subscribe(track => track.onReceiveRtp.subscribe(packet => this.emit("rtp", track.kind, packet.serialize())));
      pc.onIceCandidate.subscribe(candidate => {
        if (!candidate) return;
        const text = candidate.candidate.startsWith("a=") ? candidate.candidate : `a=${candidate.candidate}`;
        if (this.offerSent) void this.signal("candidate", { candidate: text }).catch(() => { void this.close(); });
        else this.localCandidates.push(text);
      });
      this.negotiationTimeout = setTimeout(() => { this.emit("failure", "Tuya WebRTC negotiation timed out"); void this.close(); }, 20000);
      pc.connectionStateChange.subscribe(state => {
        if (state === "connected") clearTimeout(this.negotiationTimeout);
        this.emit("state", state);
        if (state === "failed" || state === "closed") void this.close();
      });
      this.client.on("message", (_topic, bytes) => {
        try {
          const data = JSON.parse(bytes.toString()).data;
          const header = data?.header;
          this.emit("diagnostic", { stage: "received", type: ["answer", "candidate", "disconnect"].includes(header?.type) ? header.type : "other", sessionMatch: header?.sessionid === this.sessionId, senderMatch: header?.from === this.bundle.deviceId });
          if (!header || header.sessionid !== this.sessionId) return;
          void this.receive(header.type, data.msg || {}).catch(() => { this.emit("failure", "Invalid Tuya signaling response"); void this.close(); });
        } catch { /* Ignore unrelated broker traffic. */ }
      });
      const granted = await this.client.subscribeAsync(this.bundle.mqtt.source_topic.ipc, { qos: 1 });
      if (granted.some(grant => Number(grant.qos) === 128)) throw new Error("Tuya signaling subscription rejected");
      this.emit("diagnostic", { stage: "subscribed", grants: granted.length });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (this.stopped) return;
      await this.signal("offer", { sdp: pc.localDescription!.sdp, auth: this.bundle.auth, stream_type: 1 });
      this.offerSent = true;
      this.emit("diagnostic", { stage: "offer-acknowledged", topicResolved: !this.topic().includes("{") });
      for (const candidate of this.localCandidates.splice(0)) await this.signal("candidate", { candidate });
      this.expiry = setTimeout(() => { void this.close(); }, Math.min(3600, Math.max(30, this.bundle.mqtt.expire_time || 120)) * 1000);
      this.expiry.unref();
    } catch { await this.close(); throw new Error("Tuya WebRTC negotiation failed"); }
  }
  private async receive(type: string, msg: any): Promise<void> {
    if (!this.pc || this.stopped) return;
    if (type === "answer" && typeof msg.sdp === "string") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: msg.sdp }); this.remoteReady = true;
      for (const candidate of this.remoteCandidates.splice(0)) await this.pc.addIceCandidate({ candidate, sdpMid: "0", sdpMLineIndex: 0 });
    } else if (type === "candidate" && typeof msg.candidate === "string") {
      const candidate = msg.candidate.replace(/^a=/, "");
      if (this.remoteReady) await this.pc.addIceCandidate({ candidate, sdpMid: "0", sdpMLineIndex: 0 });
      else this.remoteCandidates.push(candidate);
    } else if (type === "disconnect") await this.close();
  }
  sendAudioRtp(packet: Buffer): boolean { if (!this.stopped && this.pc?.connectionState === "connected" && this.track) { this.track.writeRtp(packet); return true; } return false; }
  async close(): Promise<void> {
    if (this.stopped || this.closing) return;
    this.closing = true;
    clearTimeout(this.negotiationTimeout);
    if (this.offerSent) await this.signal("disconnect", {}).catch(() => {});
    this.stopped = true; clearTimeout(this.expiry);
    this.track?.stop(); await this.pc?.close(); this.client?.end(true);
    this.localCandidates = []; this.remoteCandidates = [];
    this.emit("closed");
  }
}

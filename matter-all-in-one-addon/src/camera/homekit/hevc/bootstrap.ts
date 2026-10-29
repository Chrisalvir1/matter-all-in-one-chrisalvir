import { RtpPacket } from "werift";
import { HevcAccessUnitAssembler } from "./sframe-rtp.js";
/** Gate the first decoded RTP access unit on VPS/SPS/PPS and IRAP. No decoding. */
export class HevcBootstrapGate {
  private assembler = new HevcAccessUnitAssembler();
  private packets: Buffer[] = [];
  private timestamp?: number;
  private bytes = 0;
  ready = false;
  push(clear: Buffer, wire = clear): Buffer[] {
    if (this.ready) return [wire];
    const packet = RtpPacket.deSerialize(clear);
    if (this.timestamp !== packet.header.timestamp) {
      this.timestamp = packet.header.timestamp;
      this.packets = [];
      this.bytes = 0;
    }
    this.bytes += wire.length;
    if (this.bytes > 16 * 1024 * 1024) {
      this.packets = [];
      this.bytes = 0;
      throw new Error("HEVC bootstrap exceeds limit");
    }
    this.packets.push(wire);
    const unit = this.assembler.push(packet);
    if (!unit) return [];
    const types = new Set<number>();
    for (let offset = 0; offset + 4 <= unit.data.length;) {
      const size = unit.data.readUInt32BE(offset);
      offset += 4;
      if (size < 2 || offset + size > unit.data.length)
        throw new Error("Invalid HEVC access unit");
      types.add((unit.data[offset] >> 1) & 63);
      offset += size;
    }
    this.ready =
      [32, 33, 34].every((type) => types.has(type)) &&
      [16, 17, 18, 19, 20, 21, 22, 23].some((type) => types.has(type));
    const result = this.ready ? this.packets : [];
    this.packets = [];
    this.bytes = 0;
    return result;
  }
}

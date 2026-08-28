import { describe, expect, it } from "vitest";
import { Fmp4Segmenter } from "../src/camera/homekit/fmp4-parser.js";

function createBox(type: string, payload: Buffer): Buffer {
  const size = payload.length + 8;
  const header = Buffer.alloc(8);
  header.writeUInt32BE(size, 0);
  header.write(type, 4, 4, "ascii");
  return Buffer.concat([header, payload]);
}

function createTrafBox(): Buffer {
  // trun box with first_sample_flags where bit 16 is 0 (sync sample / keyframe)
  const trunPayload = Buffer.alloc(12);
  trunPayload[1] = 0x00; // version 0
  trunPayload[2] = 0x00;
  trunPayload[3] = 0x04; // flags: hasFirstSampleFlags (0x000004)
  trunPayload.writeUInt32BE(1, 4); // sample_count = 1
  trunPayload.writeUInt32BE(0x02000000, 8); // first_sample_flags: bit 16 = 0 (sync keyframe), depends_on = 2

  const trunBox = createBox("trun", trunPayload);
  return createBox("traf", trunBox);
}

function createMoofBox(seq = 1): Buffer {
  const mfhdPayload = Buffer.alloc(8);
  mfhdPayload.writeUInt32BE(0, 0); // version/flags
  mfhdPayload.writeUInt32BE(seq, 4); // sequence number

  const mfhdBox = createBox("mfhd", mfhdPayload);
  const trafBox = createTrafBox();
  return createBox("moof", Buffer.concat([mfhdBox, trafBox]));
}

describe("Fmp4Segmenter", () => {
  it("parses initialization segment (ftyp + moov) and emits initialization event", async () => {
    const segmenter = new Fmp4Segmenter();
    const ftyp = createBox("ftyp", Buffer.from("isommp42"));
    const moov = createBox("moov", Buffer.from("sample-moov-data"));

    let initReceived: Buffer | null = null;
    segmenter.on("initialization", (buf: Buffer) => {
      initReceived = buf;
    });

    segmenter.push(ftyp);
    expect(initReceived).toBeNull();

    segmenter.push(moov);
    expect(initReceived).not.toBeNull();
    expect(initReceived!.length).toBe(ftyp.length + moov.length);
  });

  it("parses media fragment (moof + mdat) and inspects keyframe sync sample", async () => {
    const segmenter = new Fmp4Segmenter();
    const moof = createMoofBox(42);
    const mdat = createBox("mdat", Buffer.from("h264-nal-video-payload"));

    let fragmentReceived: any = null;
    segmenter.on("fragment", (frag: any) => {
      fragmentReceived = frag;
    });

    segmenter.push(moof);
    expect(fragmentReceived).toBeNull();

    segmenter.push(mdat);
    expect(fragmentReceived).not.toBeNull();
    expect(fragmentReceived.isKeyframe).toBe(true);
    expect(fragmentReceived.sequenceNumber).toBe(42);
    expect(fragmentReceived.data.length).toBe(moof.length + mdat.length);
  });

  it("handles fragmented chunk delivery across multiple push calls", async () => {
    const segmenter = new Fmp4Segmenter();
    const ftyp = createBox("ftyp", Buffer.from("isom"));
    const moov = createBox("moov", Buffer.from("moov-sample-data-longer"));
    const stream = Buffer.concat([ftyp, moov]);

    let initReceived: Buffer | null = null;
    segmenter.on("initialization", (buf: Buffer) => {
      initReceived = buf;
    });

    // Split stream into tiny 3-byte chunks to simulate network streaming
    for (let i = 0; i < stream.length; i += 3) {
      segmenter.push(stream.subarray(i, Math.min(i + 3, stream.length)));
    }

    expect(initReceived).not.toBeNull();
    expect(initReceived!.length).toBe(stream.length);
  });
});

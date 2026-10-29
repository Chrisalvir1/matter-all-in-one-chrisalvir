import { describe, expect, it, vi } from "vitest";
import { HevcRecordingDelegate } from "../src/camera/homekit/hevc/hevc-recording.js";
function fixture() {
  const record: any = {
    entityId: "camera.synthetic",
    hksvEnabled: true,
    hksvVerified: false,
  };
  const d = new HevcRecordingDelegate(
    {},
    "camera.synthetic",
    record,
    { hasAudio: true, videoCodec: "hevc" } as any,
    { sourceType: "rtsp", url: "rtsp://127.0.0.1/synthetic" } as any,
  );
  vi.spyOn(d as any, "startPrebufferPipeline").mockResolvedValue(undefined);
  d.selectedConfiguration = {
    prebufferLength: 8000,
    mediaContainerConfiguration: { fragmentLength: 4000 },
    videoCodec: { resolution: [640, 360, 15] },
    audioCodec: { samplerate: 5 },
  } as any;
  (d as any).initializationSegment = Buffer.from("synthetic-init");
  (d as any).prebuffer = [
    { data: Buffer.from("synthetic-fragment-one"), isKeyframe: true },
    { data: Buffer.from("synthetic-fragment-two"), isKeyframe: true },
  ];
  return { d, record };
}
describe("HEVC HDS lifecycle (protocol fixtures, no iCloud claim)", () => {
  it("requires init, multiple fragments and the matching ACK; normal close is insufficient", async () => {
    const { d, record } = fixture(),
      stream = d.handleRecordingStreamRequest(1);
    expect((await stream.next()).value?.isLast).toBe(false);
    await stream.next();
    await stream.next();
    d.acknowledgeStream(2);
    expect(record.hksvVerified).toBe(false);
    d.closeRecordingStream(1, 0);
    expect(record.hksvVerified).toBe(false);
    await stream.return();
    const second = d.handleRecordingStreamRequest(3);
    await second.next();
    await second.next();
    await second.next();
    d.acknowledgeStream(3);
    expect(record.hksvVerified).toBe(true);
    await second.return();
    d.updateRecordingActive(false);
  });
  it("cleans fragment listener and terminates when aborted while awaiting media", async () => {
    const { d } = fixture(),
      abort = new AbortController(),
      stream = d.handleRecordingStreamRequest(4, abort.signal);
    await stream.next();
    await stream.next();
    await stream.next();
    const pending = stream.next();
    expect(d.listenerCount("new-fragment")).toBeGreaterThan(0);
    abort.abort();
    expect((await pending).value?.isLast).toBe(true);
    await stream.return();
    expect(d.listenerCount("new-fragment")).toBe(0);
    d.updateRecordingActive(false);
  });
  it("never verifies a stream closed with a protocol error", async () => {
    const { d, record } = fixture(),
      s = d.handleRecordingStreamRequest(7);
    await s.next();
    await s.next();
    await s.next();
    d.closeRecordingStream(7, 5);
    d.acknowledgeStream(7);
    expect(record.hksvVerified).toBe(false);
    await s.return();
  });
});

import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../src/camera/homekit/ffmpeg-helper.js", () => ({
  resolveFfmpegPath: () => "/ffmpeg",
}));
import { BrowserPreview } from "../src/camera/browser-preview.js";
function response() {
  const r = new EventEmitter() as any;
  r.headersSent = false;
  r.writeHead = vi.fn(() => {
    r.headersSent = true;
  });
  r.write = vi.fn(() => true);
  r.end = vi.fn();
  return r;
}
describe("temporary browser preview", () => {
  beforeEach(() => vi.clearAllMocks());
  it("releases a late source allocation if the browser closes during allocation", async () => {
    const p = new BrowserPreview();
    const r = response();
    const release = vi.fn();
    let resolve: any;
    const pending = p.stream(
      "test-session",
      {} as any,
      r,
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    r.emit("close");
    resolve({ url: "rtsp://secret.invalid", release });
    await pending;
    expect(release).toHaveBeenCalledOnce();
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(p.sessions.size).toBe(0);
  });
  it("uses one reader, separates source measurements from output, and stops on disconnect", async () => {
    const child = new EventEmitter() as any;
    child.stdout = new EventEmitter();
    child.stdout.pause = vi.fn();
    child.stdout.resume = vi.fn();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    mocks.spawn.mockReturnValue(child);
    const p = new BrowserPreview();
    const r = response();
    const release = vi.fn();
    await p.stream("test-session", {} as any, r, async () => ({
      url: "rtsp://secret.invalid",
      release,
    }));
    child.stderr.emit(
      "data",
      Buffer.from(
        "Stream #0:0: Video: h264, yuv420p, 1920x1080, 15 fps\nStream #0:1: Audio: pcm_mulaw, 8000 Hz, mono\nOutput #0\nStream #0:0: Video: mjpeg, 640x360, 5 fps\n",
      ),
    );
    child.stderr.emit("data", Buffer.from("frame=1\n"));
    child.stdout.emit("data", Buffer.from("ftyp"));
    expect(p.sessions.get("test-session")).toMatchObject({
      videoCodec: "h264",
      width: 1920,
      sourceFps: 15,
      outputVideo: "copy",
      audioCodec: "pcm_mulaw",
      frames: 1,
    });
    const args = mocks.spawn.mock.calls[0][1];
    expect(args).toContain("0:a:0?");
    expect(args).toContain("aac_low");
    expect(args).not.toContain("-an");
    expect(args).toContain("copy");
    r.emit("close");
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(release).toHaveBeenCalledOnce();
    expect(p.sessions.size).toBe(0);
  });
});

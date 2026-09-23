import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("../src/camera/homekit/ffmpeg-helper.js", () => ({ resolveFfmpegPath: () => "ffmpeg" }));
vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
import { FfmpegMotionDetector } from "../src/camera/motion/ffmpeg-motion-detector.js";

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("motion reporting", () => {
  it("reports strong motion and keeps it active while frames continue changing", () => {
    vi.useFakeTimers();
    const process = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(process as any);
    const detector = new FfmpegMotionDetector({ cameraId: "c402", cameraName: "Tapo C402", rtspUrl: "rtsp://example/live", reportAllFrameChanges: true, changeThresholdPercent: 2 });
    const motion = vi.fn();
    detector.on("motion", motion);
    detector.start();
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args[args.indexOf("-vf") + 1]).toContain("blackframe=amount=0:");
    process.stderr.emit("data", Buffer.from("frame:1 pblack:70 pts:1\n"));
    expect(motion).toHaveBeenCalledWith(true);
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(5_000);
      process.stderr.emit("data", Buffer.from("frame:2 pblack:60 pts:2\n"));
    }
    expect(motion.mock.calls).toEqual([[true]]);
    vi.advanceTimersByTime(15_000);
    expect(motion.mock.calls).toEqual([[true], [false]]);
    detector.stop();
  });

  it("retains the existing Wyze filter and threshold", () => {
    const process = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(process as any);
    const detector = new FfmpegMotionDetector({ cameraId: "wyze", cameraName: "Wyze", rtspUrl: "rtsp://example/live" });
    const motion = vi.fn();
    detector.on("motion", motion);
    detector.start();
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args[args.indexOf("-vf") + 1]).toBe("fps=1,scale=160:90,format=gray,tblend=all_mode=difference,blackframe=amount=95:thresh=12");
    process.stderr.emit("data", Buffer.from("frame:1 pblack:97 pts:1\n"));
    expect(motion).not.toHaveBeenCalled();
    detector.stop();
  });

  it("detects subtle vehicle motion with fps=2 and changeThresholdPercent=1", () => {
    const process = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() });
    vi.mocked(spawn).mockReturnValue(process as any);
    const detector = new FfmpegMotionDetector({
      cameraId: "c402",
      cameraName: "Tapo C402",
      rtspUrl: "rtsp://example/live",
      changeThresholdPercent: 1,
      fps: 2,
      analysisWidth: 320,
      analysisHeight: 180,
      pixelDifferenceThreshold: 8,
      reportAllFrameChanges: true,
    });
    const motion = vi.fn();
    detector.on("motion", motion);
    detector.start();
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args[args.indexOf("-vf") + 1]).toBe(
      "fps=2,scale=320:180,format=gray,tblend=all_mode=difference,blackframe=amount=0:thresh=8",
    );
    // 1% change (pblack:99) triggers motion
    process.stderr.emit("data", Buffer.from("frame:1 pblack:99 pts:1\n"));
    expect(motion).toHaveBeenCalledWith(true);
    detector.stop();
  });
});

import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolveFfmpegPath } from "./homekit/ffmpeg-helper.js";

export interface PreviewLease {
  url: string;
  release(): void;
}
export class BrowserPreview {
  readonly sessions = new Map<string, Record<string, unknown>>();
  async stream(
    id: string,
    req: IncomingMessage,
    res: ServerResponse,
    acquire: (stop: () => void) => Promise<PreviewLease>,
  ): Promise<void> {
    if (!/^[a-zA-Z0-9-]{8,80}$/.test(id) || this.sessions.has(id)) {
      res.writeHead(409);
      res.end();
      return;
    }
    const stats: Record<string, unknown> = {
      frames: 0,
      outputVideo: "copy",
      outputAudio: "aac-lc",
      audioTranscoding: true,
    };
    this.sessions.set(id, stats);
    let closed = false;
    let lease: PreviewLease | undefined;
    let process: ReturnType<typeof spawn> | undefined;
    const stop = () => {
      if (closed) return;
      closed = true;
      clearTimeout(deadline);
      process?.kill("SIGKILL");
      lease?.release();
      this.sessions.delete(id);
      res.end();
    };
    const deadline = setTimeout(stop, 90000);
    res.once("close", stop);
    try {
      lease = await acquire(stop);
      if (closed) {
        lease.release();
        return;
      }
      const ffmpeg = resolveFfmpegPath();
      if (!ffmpeg) throw new Error("FFmpeg no disponible");
      process = spawn(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "info",
          "-progress",
          "pipe:2",
          "-stats_period",
          "0.5",
          "-rtsp_transport",
          "tcp",
          "-timeout",
          "5000000",
          "-i",
          lease.url,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-profile:a",
          "aac_low",
          "-ar",
          "24000",
          "-ac",
          "1",
          "-b:a",
          "48k",
          "-avoid_negative_ts",
          "make_zero",
          "-movflags",
          "frag_keyframe+empty_moov+default_base_moof",
          "-frag_duration",
          "500000",
          "-f",
          "mp4",
          "pipe:1",
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let outputHeader = false;
      let pending = "";
      process.stderr?.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        const lines = pending.split(/[\r\n]/);
        pending = lines.pop()!.slice(-2048);
        for (const line of lines) {
          if (/Output #/.test(line)) outputHeader = true;
          const frame = line.match(/^frame=(\d+)/);
          if (frame) stats.frames = Number(frame[1]);
          if (outputHeader) continue;
          const video = line.match(/Video:\s*(\w+).*?\b(\d{2,5})x(\d{2,5})\b/);
          if (video) {
            stats.videoCodec = video[1];
            stats.width = +video[2];
            stats.height = +video[3];
          }
          const fps = line.match(/([\d.]+) fps/);
          if (video && fps) stats.sourceFps = +fps[1];
          const audio = line.match(/Audio:\s*([^,]+),\s*(\d+) Hz/);
          if (audio) {
            stats.audioCodec = audio[1];
            stats.sampleRate = +audio[2];
          }
        }
      });
      process.stdout?.on("data", (chunk: Buffer) => {
        if (closed) return;
        if (!res.headersSent)
          res.writeHead(200, {
            "Content-Type": "video/mp4",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
          });
        if (!res.write(chunk)) process?.stdout?.pause();
      });
      res.on("drain", () => process?.stdout?.resume());
      process.once("error", stop);
      process.once("close", stop);
    } catch {
      if (!res.headersSent && !closed)
        res.writeHead(409, { "Content-Type": "text/plain" });
      stop();
    }
  }
}

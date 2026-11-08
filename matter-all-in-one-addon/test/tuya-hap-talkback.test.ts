import { expect, it, vi } from "vitest";
import { TuyaHapTalkback } from "../src/camera/homekit/tuya-hap-talkback.js";

it("waits for HAP audio before contacting Omni and allows a retry after allocation failure", async () => {
  vi.useFakeTimers();
  const allocate = vi.fn().mockRejectedValue(new Error("test timeout"));
  const talkback = new TuyaHapTalkback(
    "127.0.0.1",
    Buffer.alloc(30),
    allocate,
    vi.fn(),
  );
  try {
    talkback.configure({ pt: 110 } as any);
    expect(allocate).not.toHaveBeenCalled();
    const packet = Buffer.alloc(14);
    packet[0] = 0x80;
    packet[1] = 110;
    talkback.pushRtp(packet);
    talkback.pushRtp(packet);
    expect(allocate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    talkback.pushRtp(packet);
    expect(allocate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1001);
    talkback.pushRtp(packet);
    expect(allocate).toHaveBeenCalledTimes(2);
  } finally {
    talkback.close();
    vi.useRealTimers();
  }
});

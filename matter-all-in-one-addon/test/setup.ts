import { vi } from "vitest";

// The production add-on image ships FFmpeg with libfdk_aac. The GitHub Node
// runner does not, so make the test fixture describe the target image rather
// than the host that happens to execute Vitest.
vi.mock("../src/camera/homekit/ffmpeg-helper.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/camera/homekit/ffmpeg-helper.js")>()),
  supportsFdkAac: () => true,
}));

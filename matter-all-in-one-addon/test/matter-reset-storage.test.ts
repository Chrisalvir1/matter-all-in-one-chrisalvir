import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import {
  recoverMatterReset,
  stageMatterReset,
} from "../src/utils/matter-reset-storage.js";

it("isolates Matter data and leaves HAP records in place", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miao-reset-"));
  try {
    await fs.mkdir(path.join(directory, ".matterbridge"));
    await fs.writeFile(path.join(directory, "device-overrides.json"), "{}");
    await fs.writeFile(path.join(directory, "homekit-cameras.json"), "[]");
    const staging = await stageMatterReset(directory);
    expect(await fs.readdir(staging)).toEqual([
      ".matterbridge",
      "device-overrides.json",
    ]);
    expect(
      await fs.readFile(path.join(directory, "homekit-cameras.json"), "utf8"),
    ).toBe("[]");
    await expect(
      fs.stat(path.join(directory, ".matterbridge")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it("restores files already moved if staging another entry fails", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miao-reset-"));
  const overrides = path.join(directory, "device-overrides.json");
  await fs.writeFile(overrides, "{}");
  const originalRename = fs.rename;
  const rename = vi.spyOn(fs, "rename").mockImplementation(async (from, to) => {
    if (String(from).endsWith("exported-devices.json")) {
      throw Object.assign(new Error("permission denied"), { code: "EACCES" });
    }
    await originalRename(from, to);
  });
  try {
    await expect(stageMatterReset(directory)).rejects.toMatchObject({
      code: "EACCES",
    });
    expect(await fs.readFile(overrides, "utf8")).toBe("{}");
    expect(await fs.readdir(directory)).toEqual(["device-overrides.json"]);
  } finally {
    rename.mockRestore();
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it("restores an interrupted reset and removes committed staging on startup", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "miao-reset-"));
  try {
    const interrupted = await fs.mkdtemp(
      path.join(directory, ".matter-reset-stage-"),
    );
    const done = await fs.mkdtemp(path.join(directory, ".matter-reset-done-"));
    await fs.writeFile(
      path.join(interrupted, "exported-devices.json"),
      '["light.example"]',
    );
    await fs.writeFile(path.join(done, "device-overrides.json"), "{}");
    await recoverMatterReset(directory);
    expect(await fs.readdir(directory)).toEqual(["exported-devices.json"]);
    expect(
      await fs.readFile(path.join(directory, "exported-devices.json"), "utf8"),
    ).toBe('["light.example"]');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

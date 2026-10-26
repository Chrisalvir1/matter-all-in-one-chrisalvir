import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AtomicJsonStore } from "../src/utils/atomic-json-store.js";

describe("atomic persistent JSON", () => {
  it("preserves ordered updates and complete data", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "miao-atomic-"));
    try {
      const file = path.join(dir, "records.json");
      const store = new AtomicJsonStore();
      await Promise.all([store.write(file, ["first"]), store.write(file, ["second"])]);
      expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(["second"]);
      expect(await fs.readdir(dir)).toEqual(["records.json"]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  it("reports a failed write without damaging the previous file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "miao-atomic-"));
    try {
      const file = path.join(dir, "records.json");
      await fs.writeFile(file, '["safe"]');
      await expect(new AtomicJsonStore().write(path.join(dir, "missing", "records.json"), ["bad"])).rejects.toThrow();
      expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(["safe"]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
});

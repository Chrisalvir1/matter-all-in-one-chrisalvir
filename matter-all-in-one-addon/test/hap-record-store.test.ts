import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeHapAccessoryRecords } from "../src/hap/hap-record-store.js";

describe("HAP record persistence", () => {
  let directory = "";

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  });

  it("atomically persists valve deadlines with private file permissions", async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "hap-records-"));
    const filePath = path.join(directory, "homekit-accessories.json");
    const record = {
      entityId: "valve.garden",
      hapProfile: "valve_irrigation",
      name: "Garden",
      pincode: "123-45-678",
      port: 52124,
      username: "AA:BB:CC:DD:EE:12",
      setupId: "ABCD",
      uuid: "00000000-0000-4000-8000-000000000001",
      published: true,
      isPaired: true,
      valveSetDurationSeconds: 45,
      valveDeadlineAt: 1_800_000_000_000,
    } as const;

    await writeHapAccessoryRecords(filePath, [record]);
    const saved = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(saved[0].valveDeadlineAt).toBe(record.valveDeadlineAt);
    expect(saved[0].uuid).toBe(record.uuid);
    expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    expect(await fs.readdir(directory)).toEqual(["homekit-accessories.json"]);
  });
});

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeIdentityStore } from "../src/utils/node-identity.js";

describe("NodeIdentityStore", () => {
  it("keeps the first name even if HA renames the entity", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ni-"));
    const file = path.join(dir, "ids.json");
    const a = new NodeIdentityStore(file, () => [dir]);
    expect(a.pin("switch.x", "NEON SALA Toma 1")).toBe("NEON SALA Toma 1");
    const b = new NodeIdentityStore(file, () => [dir]);
    expect(b.pin("switch.x", "Another Name")).toBe("NEON SALA Toma 1");
  });

  it("adopts the name that already has a matter storage folder", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ni-"));
    fs.mkdirSync(path.join(dir, "matterstorage", "NEONSALA"), { recursive: true });
    const s = new NodeIdentityStore(path.join(dir, "ids.json"), () => [dir]);
    expect(s.pin("switch.x", "NEON SALA Toma 1", ["NEON SALA"])).toBe("NEON SALA");
  });
});

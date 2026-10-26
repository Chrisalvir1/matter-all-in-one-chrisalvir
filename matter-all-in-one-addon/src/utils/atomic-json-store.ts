import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Serialize writes per file and replace a complete JSON document atomically. */
export class AtomicJsonStore {
  private readonly pending = new Map<string, Promise<void>>();

  async write(file: string, value: unknown): Promise<void> {
    const contents = JSON.stringify(value, null, 2);
    const previous = this.pending.get(file);
    const operation = (previous ? previous.catch(() => undefined) : Promise.resolve()).then(async () => {
      const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await fs.rename(temporary, file);
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
    });
    this.pending.set(file, operation);
    try { await operation; }
    finally { if (this.pending.get(file) === operation) this.pending.delete(file); }
  }
}

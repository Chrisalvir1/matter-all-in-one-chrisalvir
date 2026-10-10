import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { HapAccessoryRecord } from "./hap-generic-accessory.js";

/** Atomically persist HAP records without changing accessory identities. */
export async function writeHapAccessoryRecords(
  filePath: string,
  records: HapAccessoryRecord[],
): Promise<void> {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, JSON.stringify(records, null, 2), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await fs.chmod(temporaryPath, 0o600);
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

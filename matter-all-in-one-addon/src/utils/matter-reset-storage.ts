import fs from "node:fs/promises";
import path from "node:path";

const stagingPrefix = ".matter-reset-stage-";
const committedPrefix = ".matter-reset-done-";
const resetEntries = [
  "device-overrides.json",
  "exported-devices.json",
  ".matterbridge",
];

async function exists(file: string): Promise<boolean> {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function restoreMatterReset(directory: string, staging: string) {
  for (const entry of [...resetEntries].reverse()) {
    const backup = path.join(staging, entry);
    if (!(await exists(backup))) continue;
    const active = path.join(directory, entry);
    if (await exists(active)) {
      throw new Error(
        `Active reset data already exists. Recovery directory: ${staging}`,
      );
    }
    await fs.rename(backup, active);
  }
  await fs.rmdir(staging);
}

export async function recoverMatterReset(directory: string): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const location = path.join(directory, entry.name);
    if (entry.name.startsWith(stagingPrefix)) {
      await restoreMatterReset(directory, location);
    } else if (entry.name.startsWith(committedPrefix)) {
      await fs.rm(location, { recursive: true, force: true });
    }
  }
}

export async function stageMatterReset(directory: string): Promise<string> {
  const staging = await fs.mkdtemp(path.join(directory, stagingPrefix));
  const committed = path.join(
    directory,
    committedPrefix + path.basename(staging).slice(stagingPrefix.length),
  );
  try {
    for (const entry of resetEntries) {
      try {
        await fs.rename(path.join(directory, entry), path.join(staging, entry));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await fs.rename(staging, committed);
    return committed;
  } catch (error) {
    try {
      await restoreMatterReset(directory, staging);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        `Unable to restore reset data. Recovery directory: ${staging}`,
      );
    }
    throw error;
  }
}

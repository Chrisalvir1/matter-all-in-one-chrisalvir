import fsSync from "node:fs";
import path from "node:path";

/**
 * Matterbridge keys a node's persisted fabrics by its device name. If that
 * name ever changes (HA rename, entity name vs device name, late integration
 * start after a power outage) the node is treated as brand new and shows
 * "ready to pair" while Apple Home keeps the old, unreachable one.
 *
 * This store pins the first name a node was exported with, so the identity is
 * immutable no matter how HA names evolve. When no pin exists yet, it adopts
 * whichever candidate name already has a matter storage folder on disk, so
 * accessories that are already paired keep working after upgrading.
 */
export const NODE_IDENTITY_FILE = "/data/node-identities.json";

const toStoreId = (name: string) => name.replace(/[ .]/g, "");

export class NodeIdentityStore {
  private pins: Record<string, string> = {};
  private loaded = false;

  constructor(
    private readonly file: string = NODE_IDENTITY_FILE,
    private readonly storageRoots: () => string[] = () => [],
  ) {}

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(fsSync.readFileSync(this.file, "utf8"));
      if (parsed && typeof parsed === "object") this.pins = parsed;
    } catch {
      this.pins = {};
    }
  }

  private save() {
    try {
      fsSync.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fsSync.writeFileSync(tmp, JSON.stringify(this.pins, null, 2));
      fsSync.renameSync(tmp, this.file);
    } catch {
      // Non-fatal: identity is still stable for this process lifetime.
    }
  }

  private existingStoreIds(): Set<string> {
    const ids = new Set<string>();
    for (const root of this.storageRoots()) {
      try {
        for (const d of fsSync.readdirSync(path.join(root, "matterstorage")))
          ids.add(d);
      } catch {
        /* ignore */
      }
    }
    return ids;
  }

  /** Return the immutable node name for `key`, pinning it on first use. */
  pin(key: string, proposed: string, alternates: string[] = []): string {
    this.load();
    const current = this.pins[key];
    if (current) return current;
    const candidates = [proposed, ...alternates]
      .map((n) => (n ?? "").substring(0, 32).trim())
      .filter(Boolean);
    const existing = this.existingStoreIds();
    const adopted = candidates.find((n) => existing.has(toStoreId(n)));
    const chosen = adopted ?? candidates[0] ?? key;
    this.pins[key] = chosen;
    this.save();
    return chosen;
  }

  get(key: string): string | undefined {
    this.load();
    return this.pins[key];
  }

  forget(key: string) {
    this.load();
    if (key in this.pins) {
      delete this.pins[key];
      this.save();
    }
  }
}

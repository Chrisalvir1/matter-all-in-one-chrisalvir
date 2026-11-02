import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// Find the bridge's package, but use its ESM entry: CJS service constructors
// have different identities and cannot be used as ESM Environment keys.
const bridgeRequire = createRequire(import.meta.resolve("matterbridge"));
export async function loadBridgeProtocol(): Promise<
  typeof import("@matter/protocol")
> {
  let directory = dirname(bridgeRequire.resolve("@matter/protocol"));
  for (;;) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(directory, "package.json"), "utf8"),
      );
      if (manifest.name === "@matter/protocol") {
        const entry = manifest.exports?.["."]?.import?.default;
        if (typeof entry !== "string")
          throw new Error("Matter protocol ESM entry is missing");
        return import(pathToFileURL(join(directory, entry)).href);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(directory);
    if (parent === directory)
      throw new Error("Cannot locate the bridge protocol manifest");
    directory = parent;
  }
}

import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(fs.readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const expectedNode = pkg.engines.node.match(/^>=(\d+\.\d+\.\d+) <27$/)?.[1];
assert.equal(pkg.packageManager, `npm@${execFileSync("npm", ["--version"], { encoding: "utf8" }).trim()}`, "Unexpected npm runtime");
assert.ok(expectedNode, "Expected a pinned Node 26 minimum");
assert.equal(process.version, `v${expectedNode}`, "Runtime must match the validated Node release");
for (const name of ["matterbridge", "@homebridge/hap-nodejs", "werift", "@scrypted/client"]) {
  await import(name);
  let dir = path.dirname(fileURLToPath(import.meta.resolve(name)));
  let manifest;
  while (true) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      const data = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (data.name === name) { manifest = data; break; }
    }
    const parent = path.dirname(dir);
    assert.notEqual(parent, dir, `Could not locate manifest for ${name}`);
    dir = parent;
  }
  const installed = manifest.version;
  const expected = lock.packages[`node_modules/${name}`]?.version;
  if (expected) assert.equal(installed, expected, `${name} runtime differs from validated version`);
  console.log(`${name}: ${installed}`);
}
const { DescriptorServer, BasicInformationServer } = await import("matterbridge/matter/behaviors");
assert.ok(DescriptorServer && BasicInformationServer, "Required Matter behaviors missing");
const { loadBridgeProtocol } = await import("../dist/utils/matter-protocol.js");
const { DeviceCommissioner, FabricManager } = await loadBridgeProtocol();
assert.equal(typeof DeviceCommissioner, "function");
assert.equal(typeof FabricManager, "function");
console.log("Bridge protocol services resolved from the bridge installation");
console.log(`Runtime verified: ${process.version}, ${process.platform}/${process.arch}`);

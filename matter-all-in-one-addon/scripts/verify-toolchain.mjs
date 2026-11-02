import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const addon = fileURLToPath(new URL("../", import.meta.url));
const root = path.dirname(addon.replace(/\/$/, ""));
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const version = read(".node-version").trim();
for (const p of [".nvmrc", "matter-all-in-one-addon/.node-version", "matter-all-in-one-addon/.nvmrc"]) assert.equal(read(p).trim(), version, p);
const pkg = JSON.parse(read("matter-all-in-one-addon/package.json"));
assert.equal(process.version, `v${version}`);
assert.equal(pkg.engines.node, `>=${version} <27`);
assert.ok(pkg.devDependencies["@types/node"].startsWith("^26."));
assert.equal(pkg.packageManager, `npm@${execFileSync("npm", ["--version"], { encoding: "utf8" }).trim()}`);
for (const p of ["matter-all-in-one-addon/Dockerfile", "matter-all-in-one-addon/build.yaml"]) {
  const images = [...read(p).matchAll(/node:([^\s"']+)/g)].map(m => m[1]);
  assert.ok(images.length); for (const image of images) assert.equal(image.split("@")[0], `${version}-alpine3.24`, p);
}
for (const name of ["build.yml", "publish.yml", "publish-addon-image.yml"]) {
 const text = read(`.github/workflows/${name}`);
 assert.ok(text.includes(version), name);
 for (const m of text.matchAll(/node-version:\s*['"]?([0-9][^\s'"\]]*)/g)) assert.equal(m[1], version, name);
}
const docker = read("matter-all-in-one-addon/Dockerfile");
assert.ok(docker.includes(`matterbridge@${pkg.devDependencies.matterbridge}`));
const npmVersion = pkg.packageManager.split("@")[1];
assert.equal((docker.match(new RegExp(`npm@${npmVersion.replaceAll(".", "\\.")}`, "g")) ?? []).length, 2, "Builder and runtime must upgrade npm");
const base = read("matter-all-in-one-addon/build.yaml");
const digest = docker.match(/node:[^\s]+@(sha256:[a-f0-9]{64})/)?.[1];
assert.ok(digest, "Docker base image must have a digest");
assert.equal((base.match(new RegExp(digest, "g")) ?? []).length, 2, "Both HA architectures must match Docker base digest");
assert.equal(pkg.peerDependencies.matterbridge, `>=${pkg.devDependencies.matterbridge}`);
const arm = read(".github/workflows/arm64-validation.yml");
assert.ok(arm.includes("scripts/verify-runtime.mjs"));
console.log(`Toolchain synchronized: Node ${version}, ${pkg.packageManager}, Matterbridge ${pkg.devDependencies.matterbridge}`);

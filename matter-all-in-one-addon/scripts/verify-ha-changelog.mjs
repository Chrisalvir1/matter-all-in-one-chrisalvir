import fs from "node:fs";

const config = fs.readFileSync("config.yaml", "utf8");
const version = config.match(/^version:\s*[\"']?([^\"'\s]+)[\"']?\s*$/m)?.[1];
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const firstVersion = changelog.match(/^##\s+\[?(\d+\.\d+\.\d+)\]?/m)?.[1];

if (!version || !firstVersion || firstVersion !== version) {
  throw new Error(
    `Home Assistant changelog must begin with config.yaml version (expected ${version || "none"}, found ${firstVersion || "none"}).`,
  );
}

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const versions = [pkg.version, pkg.matterbridge?.version, lock.version, lock.packages?.[""]?.version];
if (versions.some((value) => value !== version)) {
  throw new Error(`Package and lock versions must match config.yaml ${version}: ${versions.join(", ")}`);
}
if (process.env.GITHUB_REF_TYPE === "tag" && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`Git tag must match v${version}, found ${process.env.GITHUB_REF_NAME}`);
}
console.log(`Home Assistant changelog and package metadata match ${version}.`);

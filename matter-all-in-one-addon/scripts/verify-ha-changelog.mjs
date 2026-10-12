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

console.log(`Home Assistant changelog starts with ${version}.`);

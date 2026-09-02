from pathlib import Path
import json
import re

ROOT = Path("matter-all-in-one-addon")


def replace(path: Path | str, old: str, new: str, required: bool = True) -> None:
    path = Path(path)
    text = path.read_text()
    if old not in text:
        if required:
            raise RuntimeError(f"Required fragment not found in {path}: {old[:120]!r}")
        return
    path.write_text(text.replace(old, new, 1))


def replace_regex(path: Path | str, pattern: str, replacement: str, required: bool = True) -> None:
    path = Path(path)
    text = path.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.M | re.S)
    if count != 1 and required:
        raise RuntimeError(f"Required pattern not found in {path}: {pattern[:120]!r}")
    if count:
        path.write_text(updated)


# Version and Node 24.20 LTS.
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text())
pkg["version"] = "1.4.83"
pkg.setdefault("engines", {})["node"] = ">=24.20.0 <25"
pkg.setdefault("matterbridge", {})["version"] = "1.4.83"
if "@types/node" in pkg.get("devDependencies", {}):
    pkg["devDependencies"]["@types/node"] = "^24.10.0"
pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n")

config = ROOT / "config.yaml"
config.write_text(re.sub(r'^version:.*$', 'version: "1.4.83"', config.read_text(), flags=re.M))

(ROOT / ".nvmrc").write_text("24.20.0\n")
replace_regex(ROOT / "Dockerfile", r"ARG BUILD_FROM=node:[^\n]+", "ARG BUILD_FROM=node:24.20.0-alpine3.22")
for workflow in [Path(".github/workflows/build.yml"), Path(".github/workflows/publish.yml")]:
    workflow.write_text(re.sub(r"node-version: ['\"]?26\.8(?:\.x)?['\"]?", "node-version: '24.20.x'", workflow.read_text()))

# FFmpeg: never emit the invalid '-rtsp_transport auto'.
helper = ROOT / "src/camera/homekit/ffmpeg-helper.ts"
replace(helper, 'transport?: "tcp" | "udp";', 'transport?: "auto" | "tcp" | "udp";')
replace(
    helper,
    'const transport = config.transport || "tcp";\n    inputArgs.push("-rtsp_transport", transport);',
    'const transport = config.transport || "tcp";\n    // "auto" is a UI preference, not a valid FFmpeg rtsp_transport value.\n    if (transport !== "auto") {\n      inputArgs.push("-rtsp_transport", transport);\n    }',
)

# Repeat H.264 SPS/PPS at keyframes after a successful probe.
validator = ROOT / "src/camera/scrypted/scrypted-stream-validator.ts"
replace(
    validator,
    "needsDumpExtra: false,",
    'needsDumpExtra: probe.videoCodec.toLowerCase() === "h264",',
)

# HAP: timeout is not a confirmed fatal result and must be allowed to reach FFmpeg.
delegate = ROOT / "src/camera/homekit/homekit-camera-stream.delegate.ts"
replace(
    delegate,
    'validationStatus === "unauthorized" ||\n      validationStatus === "timeout" ||\n      validationStatus === "unsupported" ||',
    'validationStatus === "unauthorized" ||\n      validationStatus === "unsupported" ||',
)

# Do not report HAP START success immediately if FFmpeg dies during startup.
replace(
    delegate,
    'const proc = spawn(ffmpegPath, ffmpegArgs, {\n        stdio: ["ignore", "ignore", "pipe"],\n      });\n      session.process = proc;',
    'const proc = spawn(ffmpegPath, ffmpegArgs, {\n        stdio: ["ignore", "ignore", "pipe"],\n      });\n      session.process = proc;\n      let startCallbackSettled = false;\n      const readinessTimer = setTimeout(() => {\n        if (startCallbackSettled) return;\n        startCallbackSettled = true;\n        if (proc.exitCode === null && !proc.killed) {\n          this.platform?.log?.notice?.(\n            `[HomeKitCamera][${this.entityId}] FFmpeg survived startup guard; accepting HAP START`,\n          );\n          callback();\n        } else {\n          callback(new Error("FFmpeg exited before Live View became ready"));\n        }\n      }, 1500);',
)
replace(
    delegate,
    'proc.on("close", (code) => {\n        this.platform?.log?.debug?.(\n          `[HomeKitCamera][${this.entityId}] FFmpeg process closed with code ${code}`,\n        );\n        session.process = undefined;\n      });',
    'proc.on("close", (code) => {\n        this.platform?.log?.notice?.(\n          `[HomeKitCamera][${this.entityId}] FFmpeg process closed with code ${code}`,\n        );\n        session.process = undefined;\n        if (!startCallbackSettled) {\n          startCallbackSettled = true;\n          clearTimeout(readinessTimer);\n          callback(new Error(`FFmpeg exited during HAP startup (code ${code})`));\n        }\n      });',
)
replace(
    delegate,
    'proc.on("error", (err) => {\n        this.platform?.log?.error?.(\n          `[HomeKitCamera][${this.entityId}] FFmpeg process error: ${err.message}`,\n        );\n      });\n\n      callback();',
    'proc.on("error", (err) => {\n        this.platform?.log?.error?.(\n          `[HomeKitCamera][${this.entityId}] FFmpeg process error: ${err.message}`,\n        );\n        if (!startCallbackSettled) {\n          startCallbackSettled = true;\n          clearTimeout(readinessTimer);\n          callback(err);\n        }\n      });',
)

# Refresh a published accessory when Scrypted provides a different stream URL.
bridge = ROOT / "src/camera/scrypted/scrypted-homekit-bridge.ts"
replace(
    bridge,
    'const existing = this.activeAccessories.get(camera.cameraId);\n    if (existing && existing.isPublished) {\n      return existing;\n    }\n    if (existing) {\n      this.unmountCamera(camera.cameraId);\n    }',
    'const existing = this.activeAccessories.get(camera.cameraId);\n    if (existing && existing.isPublished) {\n      const nextUrl = camera.source.streamReference?.directUrl;\n      if (existing.streamSource?.url === nextUrl && nextUrl) {\n        return existing;\n      }\n      platform?.log?.notice?.(\n        `[ScryptedHomeKitBridge] Rebuilding ${camera.cameraId}: Scrypted stream URL changed`,\n      );\n      await existing.unpublish();\n      this.activeAccessories.delete(camera.cameraId);\n    } else if (existing) {\n      await existing.unpublish();\n      this.activeAccessories.delete(camera.cameraId);\n    }',
)
replace_regex(
    bridge,
    r"storageRecord\.manufacturer =\s*camera\.displayManufacturer \|\|\s*resolveDisplayManufacturer\(camera\) \|\|\s*\"Marca no identificada\";",
    'storageRecord.manufacturer = "Matter All-in-One Chrisalvir";',
)

# Firmware must be the real Matterbridge runtime version, never a stale plugin number.
accessory = ROOT / "src/camera/homekit/homekit-camera.accessory.ts"
replace(accessory, 'platform?.matterbridge?.matterbridgeVersion || "1.4.72"', 'platform?.matterbridge?.matterbridgeVersion || "unknown"')

# Apple Home always uses the real HAP setup URI. Matter QR remains separate/experimental.
frontend = ROOT / "src/frontend/script.js"
replace_regex(
    frontend,
    r"pairingPayload =\s*camera\.identity\?\.homeKitSetupUri \|\|\s*`X-HM://\$\{camera\.identity\?\.homeKitSetupId \|\| \"0000\"\}`;",
    'pairingPayload = camera.identity?.homeKitSetupUri || "";',
)
frontend.write_text(frontend.read_text().replace('bridgeEntity?.pairingCode ||\n        "ABCD-1234-EFGH"', 'bridgeEntity?.pairingCode ||\n        ""'))

# Cache busting and visible version labels.
index = ROOT / "src/frontend/index.html"
index.write_text(index.read_text().replace("1.4.82", "1.4.83"))
for readme in [Path("README.md"), ROOT / "README.md"]:
    if readme.exists():
        readme.write_text(readme.read_text().replace("v1.4.82", "v1.4.83"))

changelog = ROOT / "CHANGELOG.md"
entry = """## [1.4.83] - 2026-09-02

### HAP Live View, Scrypted refresh and Node.js 24.20 LTS

- Node.js 24.20 LTS in Docker, CI, publishing and local development.
- Apple Home uses the real HAP X-HM setup URI; Matter Camera remains separate and experimental.
- Published HAP cameras are rebuilt when Scrypted changes the stream URL.
- The UI value `auto` no longer produces invalid `-rtsp_transport auto` FFmpeg arguments.
- HAP START waits through an FFmpeg startup guard and reports early process failures.
- H.264 SPS/PPS are repeated at keyframes to prevent green-frame startup.
- Manufacturer is `Matter All-in-One Chrisalvir`; firmware reports the Matterbridge runtime version.

"""
if changelog.exists() and not changelog.read_text().startswith("## [1.4.83]"):
    changelog.write_text(entry + changelog.read_text())

print("v1.4.83 repair script completed")

from pathlib import Path
import json
import re

ROOT = Path("matter-all-in-one-addon")


def replace(path, old, new, required=True, all_matches=False):
    path = Path(path)
    text = path.read_text()
    if old not in text:
        if required:
            raise RuntimeError(f"Required fragment not found in {path}: {old[:120]!r}")
        return
    path.write_text(text.replace(old, new) if all_matches else text.replace(old, new, 1))


def regex(path, pattern, replacement, required=True):
    path = Path(path)
    updated, count = re.subn(pattern, replacement, path.read_text(), count=1, flags=re.M | re.S)
    if count != 1 and required:
        raise RuntimeError(f"Required pattern not found in {path}: {pattern[:120]!r}")
    if count:
        path.write_text(updated)


# Version metadata and Node.js 24.20.0 LTS everywhere.
pkg_path = ROOT / "package.json"
pkg = json.loads(pkg_path.read_text())
pkg["version"] = "1.4.83"
pkg.setdefault("engines", {})["node"] = ">=24.20.0 <25"
pkg.setdefault("matterbridge", {})["version"] = "1.4.83"
pkg.get("devDependencies", {})["@types/node"] = "^24.10.0"
pkg_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False) + "\n")

config = ROOT / "config.yaml"
config.write_text(re.sub(r'^version:.*$', 'version: "1.4.83"', config.read_text(), flags=re.M))
(ROOT / ".nvmrc").write_text("24.20.0\n")
regex(ROOT / "Dockerfile", r"ARG BUILD_FROM=node:[^\n]+", "ARG BUILD_FROM=node:24.20.0-alpine3.22")
for workflow in [Path(".github/workflows/build.yml"), Path(".github/workflows/publish.yml")]:
    workflow.write_text(re.sub(r"node-version: ['\"]?26\.8(?:\.x)?['\"]?", "node-version: '24.20.x'", workflow.read_text()))

# FFmpeg RTSP transport: 'auto' means omit the option, because FFmpeg accepts tcp/udp, not auto.
helper = ROOT / "src/camera/homekit/ffmpeg-helper.ts"
replace(helper, 'transport?: "tcp" | "udp";', 'transport?: "auto" | "tcp" | "udp";')
replace(
    helper,
    'const transport = config.transport || "tcp";\n    inputArgs.push("-rtsp_transport", transport);',
    'const transport = config.transport || "tcp";\n    if (transport !== "auto") {\n      inputArgs.push("-rtsp_transport", transport);\n    }',
)

# Validated H.264 receives SPS/PPS on keyframes to avoid green startup frames.
validator = ROOT / "src/camera/scrypted/scrypted-stream-validator.ts"
replace(validator, "needsDumpExtra: false,", 'needsDumpExtra: probe.videoCodec.toLowerCase() === "h264",')

# HAP must not block an RTSP URL solely because a short probe timed out.
delegate = ROOT / "src/camera/homekit/homekit-camera-stream.delegate.ts"
replace(
    delegate,
    'validationStatus === "unauthorized" ||\n      validationStatus === "timeout" ||\n      validationStatus === "unsupported" ||',
    'validationStatus === "unauthorized" ||\n      validationStatus === "unsupported" ||',
)

# Gate HAP START: report a real error if FFmpeg exits during startup instead of returning success immediately.
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

# Rebuild published HAP accessories only when the effective Scrypted source fingerprint changes.
bridge = ROOT / "src/camera/scrypted/scrypted-homekit-bridge.ts"
replace(
    bridge,
    'private static activeAccessories = new Map<string, HomeKitCameraAccessory>();',
    'private static activeAccessories = new Map<string, HomeKitCameraAccessory>();\n  private static sourceFingerprints = new Map<string, string>();',
)
replace(
    bridge,
    'const existing = this.activeAccessories.get(camera.cameraId);\n    if (existing && existing.isPublished) {\n      return existing;\n    }\n    if (existing) {\n      this.unmountCamera(camera.cameraId);\n    }',
    'const sourceFingerprint = JSON.stringify({\n      url: camera.source.streamReference?.directUrl || null,\n      validationStatus:\n        camera.source.streamValidationStatus ||\n        camera.source.streamReference?.validationStatus ||\n        "not_checked",\n      observed: camera.capabilities?.observed || null,\n      transport: camera.exportConfig?.rtspTransportPreference || "auto",\n    });\n    const existing = this.activeAccessories.get(camera.cameraId);\n    if (\n      existing &&\n      existing.isPublished &&\n      this.sourceFingerprints.get(camera.cameraId) === sourceFingerprint\n    ) {\n      return existing;\n    }\n    if (existing) {\n      platform?.log?.notice?.(\n        `[ScryptedHomeKitBridge] Rebuilding ${camera.cameraId}: source configuration changed`,\n      );\n      await existing.unpublish();\n      this.activeAccessories.delete(camera.cameraId);\n    }',
)
# The bridge-level status also treats timeout as non-fatal and lets the delegate/FFmpeg decide.
replace(
    bridge,
    'validationStatus === "unauthorized" ||\n      validationStatus === "timeout" ||\n      validationStatus === "unsupported" ||',
    'validationStatus === "unauthorized" ||\n      validationStatus === "unsupported" ||',
)
regex(
    bridge,
    r"storageRecord\.manufacturer =\s*camera\.displayManufacturer \|\|\s*resolveDisplayManufacturer\(camera\) \|\|\s*\"Marca no identificada\";",
    'storageRecord.manufacturer = "Matter All-in-One Chrisalvir";',
)
replace(
    bridge,
    'this.activeAccessories.set(camera.cameraId, accessory);',
    'this.activeAccessories.set(camera.cameraId, accessory);\n    this.sourceFingerprints.set(camera.cameraId, sourceFingerprint);',
)
replace(
    bridge,
    'this.activeAccessories.delete(cameraId);\n    }',
    'this.activeAccessories.delete(cameraId);\n      this.sourceFingerprints.delete(cameraId);\n    }',
)

# Firmware reports the Matterbridge runtime version, not a stale plugin fallback.
accessory = ROOT / "src/camera/homekit/homekit-camera.accessory.ts"
replace(accessory, 'platform?.matterbridge?.matterbridgeVersion || "1.4.72"', 'platform?.matterbridge?.matterbridgeVersion || "unknown"')

# The Apple camera tab already defaults to HomeKit/HAP and computes a valid X-HM URI from
# the accessory's persisted setupId + pincode. Remove only fabricated Matter placeholders.
frontend = ROOT / "src/frontend/script.js"
replace(frontend, '"ABCD-1234-EFGH"', '""', required=False, all_matches=True)

# Visible version/cache metadata.
index = ROOT / "src/frontend/index.html"
index.write_text(index.read_text().replace("1.4.82", "1.4.83"))
for readme in [Path("README.md"), ROOT / "README.md"]:
    if readme.exists():
        readme.write_text(readme.read_text().replace("v1.4.82", "v1.4.83"))

changelog = ROOT / "CHANGELOG.md"
entry = """## [1.4.83] - 2026-09-02

### HAP Live View, Scrypted refresh and Node.js 24.20 LTS

- Node.js 24.20 LTS in Docker, CI, publishing and local development.
- Apple Home uses the HAP X-HM setup URI; Matter Camera remains separate and experimental.
- Published HAP cameras rebuild when Scrypted URL, validation, capabilities or transport changes.
- `auto` no longer produces invalid `-rtsp_transport auto` FFmpeg arguments.
- HAP START reports early FFmpeg failures instead of returning immediate success.
- H.264 SPS/PPS repeat at keyframes to prevent green-frame startup.
- Manufacturer is `Matter All-in-One Chrisalvir`; firmware reports Matterbridge runtime version.

"""
if changelog.exists() and not changelog.read_text().startswith("## [1.4.83]"):
    changelog.write_text(entry + changelog.read_text())

print("v1.4.83 repair script completed")

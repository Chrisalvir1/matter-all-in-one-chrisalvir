#!/usr/bin/env bash
set -euo pipefail

# Reproducible build script for @homebridge/hap-nodejs Secure Video fork
REPO_URL="https://github.com/seydx/HAP-NodeJS.git"
COMMIT_SHA="d81fba565ee26e82170d5f4f8cd358c2fd773f6c"
BRANCH="secure-video"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TARGET_DIR="${ROOT_DIR}/vendor/hap-nodejs"
TMP_BUILD_DIR="$(mktemp -d -t hap-build-XXXXXX)"

echo "[build-vendor-hap] Cloning ${REPO_URL} (${BRANCH}) into ${TMP_BUILD_DIR}..."
git clone --depth 1 --branch "${BRANCH}" "${REPO_URL}" "${TMP_BUILD_DIR}"

cd "${TMP_BUILD_DIR}"
CURRENT_COMMIT="$(git rev-parse HEAD)"
if [ "${CURRENT_COMMIT}" != "${COMMIT_SHA}" ]; then
  echo "[build-vendor-hap] ERROR: Commit mismatch! Expected ${COMMIT_SHA}, got ${CURRENT_COMMIT}" >&2
  rm -rf "${TMP_BUILD_DIR}"
  exit 1
fi

echo "[build-vendor-hap] Installing dependencies and building TypeScript dist..."
pnpm install --ignore-scripts
pnpm run build

echo "[build-vendor-hap] Copying artifacts to ${TARGET_DIR}..."
mkdir -p "${TARGET_DIR}"
rm -rf "${TARGET_DIR}/dist"
cp -R "${TMP_BUILD_DIR}/dist" "${TARGET_DIR}/"
cp "${TMP_BUILD_DIR}/package.json" "${TARGET_DIR}/"
cp "${TMP_BUILD_DIR}/README.md" "${TARGET_DIR}/"
cp "${TMP_BUILD_DIR}/LICENSE" "${TARGET_DIR}/"

rm -rf "${TMP_BUILD_DIR}"
echo "[build-vendor-hap] Successfully updated ${TARGET_DIR} from commit ${COMMIT_SHA}!"

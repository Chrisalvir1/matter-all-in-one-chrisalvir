#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR/matter-all-in-one-addon"
NPM_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json')).packageManager.split('@')[1]")"
if [ "$(npm --version)" != "$NPM_VERSION" ]; then
  npm install --global "npm@$NPM_VERSION" --no-fund --no-audit
fi
EXPECTED_NODE="$(cat .node-version)"
test "$(node --version)" = "v$EXPECTED_NODE" || { echo "Expected Node $EXPECTED_NODE; rebuild the devcontainer." >&2; exit 1; }
BRIDGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json')).devDependencies.matterbridge")"
npm install --global "matterbridge@$BRIDGE_VERSION" --omit=dev --no-fund --no-audit
npm ci --legacy-peer-deps --no-fund --no-audit
npm run check:toolchain
npm run build
npm run check:runtime

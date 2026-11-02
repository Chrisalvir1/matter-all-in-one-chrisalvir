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
# Do not replace locked dependencies or link an unvalidated development bridge on restart.
npm run check:toolchain
npm run check:runtime

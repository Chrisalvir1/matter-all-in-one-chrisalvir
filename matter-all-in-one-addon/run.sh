#!/usr/bin/env sh
set -e

echo "[Info] Starting Matter 1.5.1 All-in-One Bridge Add-on..."

# Read options from HA options file
OPTIONS_FILE="/data/options.json"
HOST=$(jq -r '.host // empty' "$OPTIONS_FILE")
TOKEN=$(jq -r '.token // empty' "$OPTIONS_FILE")

# Fallback to supervisor API if defaults are used
if [ -z "$HOST" ] || [ "$HOST" = "http://supervisor/core" ]; then
    HOST="http://supervisor/core"
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "[Info] Using injected Supervisor Token for connection."
    TOKEN="$SUPERVISOR_TOKEN"
fi

# Ensure Matterbridge config directory exists
mkdir -p /root/.matterbridge

# Write the plugin config file
CONFIG_PATH="/root/.matterbridge/matter-all-in-one-chrisalvir.config.json"
echo "[Info] Generating config file at $CONFIG_PATH"
cat <<EOF > "$CONFIG_PATH"
{
  "name": "matter-all-in-one-chrisalvir",
  "type": "dynamic",
  "host": "$HOST",
  "token": "$TOKEN"
}
EOF

# Write the main matterbridge settings to automatically enable the plugin
SETTINGS_PATH="/root/.matterbridge/matterbridge.json"
if [ ! -f "$SETTINGS_PATH" ]; then
    echo "[Info] Creating default matterbridge.json"
    cat <<EOF > "$SETTINGS_PATH"
{
  "bridgeMode": "dynamic",
  "plugins": {
    "matter-all-in-one-chrisalvir": {
      "enabled": true,
      "path": "/app"
    }
  }
}
EOF
fi

# Add/register the plugin in matterbridge explicitly
echo "[Info] Registering plugin..."
matterbridge -add /app || true

# Start Ingress proxy server
echo "[Info] Starting proxy server on port 8283..."
node /app/dist/proxy.js &

# Start Matterbridge
echo "[Info] Launching Matterbridge on port 8284..."
exec matterbridge -frontend 8284



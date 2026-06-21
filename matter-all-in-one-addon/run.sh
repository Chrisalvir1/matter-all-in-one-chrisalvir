#!/usr/bin/env sh
set -e

echo "[Info] Starting Matter All-in-One Bridge Add-on..."

# Read options from HA options file
OPTIONS_FILE="/data/options.json"
HOST=$(jq -r '.host // empty' "$OPTIONS_FILE")
TOKEN=$(jq -r '.token // empty' "$OPTIONS_FILE")
MDNSINTERFACE=$(jq -r '.mdnsinterface // empty' "$OPTIONS_FILE")
IPV4_ONLY=$(jq -r '.ipv4_only // false' "$OPTIONS_FILE")

# Fallback to supervisor API if defaults are used
if [ -z "$HOST" ] || [ "$HOST" = "http://supervisor/core" ]; then
    HOST="http://supervisor/core"
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "[Info] Using injected Supervisor Token for connection."
    TOKEN="$SUPERVISOR_TOKEN"
fi

# Ensure Matterbridge persistent config directory exists in HA data volume
mkdir -p /data/.matterbridge

# If /root/.matterbridge exists as a directory (and is not already a symlink), remove it
if [ -d /root/.matterbridge ] && [ ! -L /root/.matterbridge ]; then
    echo "[Info] Removing non-persistent /root/.matterbridge directory"
    rm -rf /root/.matterbridge
fi

# Create symlink from /root/.matterbridge to /data/.matterbridge
echo "[Info] Linking /root/.matterbridge to persistent volume /data/.matterbridge"
ln -sfn /data/.matterbridge /root/.matterbridge

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
  "bridgeMode": "bridge",
  "plugins": {
    "matter-all-in-one-chrisalvir": {
      "enabled": true,
      "path": "/app"
    }
  }
}
EOF
fi

# Older releases wrote an unsupported "dynamic" bridgeMode. Matterbridge
# supports only bridge or childbridge; use one stable bridge node here.
if [ -f "$SETTINGS_PATH" ] && [ "$(jq -r '.bridgeMode // empty' "$SETTINGS_PATH")" = "dynamic" ]; then
    echo "[Info] Migrating unsupported bridgeMode 'dynamic' to 'bridge'"
    jq '.bridgeMode = "bridge"' "$SETTINGS_PATH" > "$SETTINGS_PATH.tmp" && mv "$SETTINGS_PATH.tmp" "$SETTINGS_PATH"
fi

# Add/register the plugin in matterbridge explicitly
echo "[Info] Registering plugin..."
matterbridge -add /app || true

# Start Ingress proxy server
echo "[Info] Starting proxy server on port 8283..."
node /app/dist/proxy.js &

# Handle mDNS interface configuration
MDNS_PARAM=""
if [ -n "$MDNSINTERFACE" ]; then
    echo "[Info] Using manually configured network interface for mDNS: $MDNSINTERFACE"
    MDNS_PARAM="-mdnsinterface $MDNSINTERFACE"
else
    # Try dynamic auto-detection
    ACTIVE_INTERFACE=""
    if command -v ip >/dev/null 2>&1; then
        ACTIVE_INTERFACE=$(ip route get 1.1.1.1 2>/dev/null | grep -oE "dev [^ ]+" | cut -d' ' -f2)
        if [ -z "$ACTIVE_INTERFACE" ]; then
            ACTIVE_INTERFACE=$(ip route show default 2>/dev/null | grep -oE "dev [^ ]+" | head -n1 | cut -d' ' -f2)
        fi
    fi
    if [ -z "$ACTIVE_INTERFACE" ] && command -v route >/dev/null 2>&1; then
        ACTIVE_INTERFACE=$(route -n 2>/dev/null | grep '^0.0.0.0' | awk '{print $8}' | head -n1)
    fi
    if [ -n "$ACTIVE_INTERFACE" ]; then
        echo "[Info] Auto-detected active network interface for mDNS: $ACTIVE_INTERFACE"
        MDNS_PARAM="-mdnsinterface $ACTIVE_INTERFACE"
    else
        echo "[Warning] Could not detect active network interface and no override was configured. mDNS will start on all interfaces."
    fi
fi

if [ "$IPV4_ONLY" = "true" ]; then
    echo "[Info] Forcing IPv4 only networking for Matterbridge due to addon config."
    MDNS_PARAM="$MDNS_PARAM -ipv4"
fi

# Start Matterbridge
echo "[Info] Launching Matterbridge on port 8284 with $MDNS_PARAM..."
exec matterbridge -bridge -frontend 8284 $MDNS_PARAM

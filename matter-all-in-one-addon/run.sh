#!/usr/bin/env sh
set -e

echo "[Info] Starting Matter All-in-One Bridge Add-on..."

# Read options from HA options file
OPTIONS_FILE="/data/options.json"
[ -r "$OPTIONS_FILE" ] || { echo "[Error] Missing $OPTIONS_FILE"; exit 1; }
HOST=$(jq -r '.host // empty' "$OPTIONS_FILE")
TOKEN=$(jq -r '.token // empty' "$OPTIONS_FILE")
MDNSINTERFACE=$(jq -r '.mdnsinterface // empty' "$OPTIONS_FILE")
GROUP_BY_DEVICE_ID=$(jq -r '.group_by_device_id // true' "$OPTIONS_FILE")

# Fallback to supervisor API if defaults are used
if [ -z "$HOST" ] || [ "$HOST" = "http://supervisor/core" ]; then
    HOST="http://supervisor/core"
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "[Info] Using injected Supervisor Token for connection."
    TOKEN="$SUPERVISOR_TOKEN"
fi

if [ -z "$TOKEN" ]; then
    echo "[Error] Home Assistant did not provide a Supervisor token and no token was configured."
    exit 1
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

# Write the plugin config file atomically and safely escape host/token values.
CONFIG_PATH="/root/.matterbridge/matter-all-in-one-chrisalvir.config.json"
echo "[Info] Generating config file at $CONFIG_PATH"
jq -n \
  --arg host "$HOST" \
  --arg token "$TOKEN" \
  --argjson groupByDeviceId "$GROUP_BY_DEVICE_ID" \
  '{name:"matter-all-in-one-chrisalvir",type:"dynamic",host:$host,token:$token,groupByDeviceId:$groupByDeviceId}' \
  > "$CONFIG_PATH.tmp"
mv "$CONFIG_PATH.tmp" "$CONFIG_PATH"
chmod 600 "$CONFIG_PATH"

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
if ! matterbridge -add /app; then
    echo "[Warning] Plugin registration returned an error (it may already be registered); continuing with the persistent configuration."
fi

# Private token between the loopback Ingress proxy and the plugin UI. It is
# never written to disk and prevents direct calls to destructive admin routes.
MATTER_AIO_ADMIN_TOKEN=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
export MATTER_AIO_ADMIN_TOKEN

# Start Ingress proxy server
echo "[Info] Starting proxy server on port 8283..."
node /app/dist/proxy.js &

# Build arguments without shell word-splitting or option injection.
set -- matterbridge -bridge -frontend 8284 -bind 127.0.0.1
if [ -n "$MDNSINTERFACE" ]; then
    case "$MDNSINTERFACE" in
      *[!A-Za-z0-9_.:-]*) echo "[Error] Invalid mDNS interface name."; exit 1 ;;
    esac
    echo "[Info] Using manually configured network interface for mDNS: $MDNSINTERFACE"
    set -- "$@" -mdnsinterface "$MDNSINTERFACE"
else
    echo "[Info] mDNS will use all available interfaces so route changes do not strand Matter devices."
fi

# Matter uses IPv6 link-local addresses on the LAN. This is independent from
# Internet/WAN IPv6 and is required for reliable Apple Home communication.
# Do not pass -ipv4 here: it prevents the required local Matter transport.
echo "[Info] Launching Matterbridge with LAN IPv6 link-local support enabled."
exec "$@"

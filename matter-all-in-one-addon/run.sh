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
    export MATTER_AIO_MDNS_IFACE="$MDNSINTERFACE"
else
    # Auto-detect the real physical LAN interface (eth0/end0/enpXsY/wlan0).
    # Matterbridge's own web-UI announcements (_matterbridge._tcp / _http._tcp
    # with the mDNS FLUSH bit) are useless inside this add-on (the UI is served
    # only through Ingress on 8283) and, when multicast leaks through virtual
    # interfaces (docker/hassio/veth/tailscale/...), they invalidate records of
    # unrelated pure-Matter Wi-Fi devices. Pin mDNS to the physical LAN only.
    is_virtual_iface() {
        case "$1" in
          lo|docker*|hassio*|veth*|br-*|br_*|virbr*|tailscale*|ts[0-9]*|tun*|tap*|wg*|zt*|cali*|flannel*|cni*|kube*|dummy*|vmnet*|vboxnet*|ifb*|bond*|sit*|gre*|ip6tnl*|vlan*.*|macvtap*|podman*) return 0 ;;
        esac
        return 1
    }
    is_up_iface() {
        [ -r "/sys/class/net/$1/operstate" ] || return 1
        case "$(cat "/sys/class/net/$1/operstate" 2>/dev/null)" in up|unknown) return 0 ;; esac
        return 1
    }
    DETECTED_IFACE=""
    # 1) Interface used by the default route, if it is physical.
    ROUTE_IFACE=$(ip -4 route show default 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="dev"){print $(i+1); exit}}')
    if [ -n "$ROUTE_IFACE" ] && ! is_virtual_iface "$ROUTE_IFACE" && [ -e "/sys/class/net/$ROUTE_IFACE/device" ]; then
        DETECTED_IFACE="$ROUTE_IFACE"
    fi
    # 2) Otherwise the first up, non-virtual interface backed by real hardware.
    if [ -z "$DETECTED_IFACE" ]; then
        for path in /sys/class/net/*; do
            name=$(basename "$path")
            is_virtual_iface "$name" && continue
            [ -e "$path/device" ] || continue
            is_up_iface "$name" || continue
            DETECTED_IFACE="$name"
            break
        done
    fi
    if [ -n "$DETECTED_IFACE" ]; then
        echo "[Info] Auto-detected physical LAN interface for mDNS: $DETECTED_IFACE"
        set -- "$@" -mdnsinterface "$DETECTED_IFACE"
        export MATTER_AIO_MDNS_IFACE="$DETECTED_IFACE"
    else
        echo "[Warning] No physical LAN interface detected; mDNS falls back to all interfaces. Set 'mdnsinterface' in the add-on options to pin it."
    fi
fi

# Matter uses IPv6 link-local addresses on the LAN. This is independent from
# Internet/WAN IPv6 and is required for reliable Apple Home communication.
# Do not pass -ipv4 here: it prevents the required local Matter transport.
echo "[Info] Launching Matterbridge with LAN IPv6 link-local support enabled."
exec "$@"

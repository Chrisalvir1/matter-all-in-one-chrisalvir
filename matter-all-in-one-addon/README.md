# Matter All-in-One for Home Assistant — v1.2.32

<div align="center">
  <img src="logo.png" alt="Matter All In One Logo" width="300" />
</div>

> Puente Matter 1.6 para Home Assistant con publicación de accesorios independientes y perfiles conservadores para Apple Home.
> **Base:** `matterbridge@3.9.3` · **Node.js:** `24-alpine` · **Spec:** Matter 1.6 (CSA, 17 Jun 2026)

---

## AI Agent Context (machine-readable)

This file is intentionally structured for both humans and AI agents.

```yaml
project: matter-all-in-one-chrisalvir
version: "1.2.29"
spec: "Matter 1.6"
engine: matterbridge
engine_version: "3.9.3"
node_image: "node:24-alpine"
bridge_mode: server       # Each exported entity = independent Matter ServerNode with own QR
plugin_mode: dynamic      # MatterbridgeDynamicPlatform
ha_integration: websocket # WebSocket to HA supervisor API
persistent_data: /data/.matterbridge
config_file: /root/.matterbridge/matter-all-in-one-chrisalvir.config.json
ui_port: 8285             # internal; proxied to 8283 via proxy.js
ingress_port: 8283
matterbridge_ui_port: 8284
```

### Matter 1.6 Feature Mapping

| Matter 1.6 Feature | Status in this bridge |
|---|---|
| NFC Commissioning | Implemented by controller (Apple Home, Google). Bridge is transparent. |
| Joint Fabric | Implemented by controller. Bridge is transparent. |
| Thermostat Suggestions | Not implemented (controller feature). |
| Security Sensor Event History | Not yet mapped — pending HA event_log integration. |

---

## Minimum Requirements

- **Apple Home:** HomePod mini / Apple TV 4K (Matter hub); Thread router only needed for Thread accessories.
- **Matterbridge:** `>= 3.9.3`
- **Home Assistant:** `>= 2025.1`

---

## Supported Devices & HomeKit Compatibility

| Device Type | HA Domain / Class | Apple Home |
|---|---|---|
| Lights, plugs, locks, thermostats, fans, RVC | `light.*`, `switch.*`, `lock.*`, `climate.*`, `fan.*`, `vacuum.*` | Supported |
| Covers | `cover.*` with `windowCovering` profile | Supported |
| Contact, motion, occupancy, temperature, humidity, moisture, ambient light | `binary_sensor.*`, `sensor.*` (supported classes) | Supported |
| Media players | `media_player.*` as `onOffPlugInUnit` fallback | Supported |
| Camera, energy tariff, smoke/CO, pressure, flow, alarm, water heater, generic button | - | Not exported by default |

> **Note:** Devices marked as not exported are intentionally excluded until full cluster/transport mappings are implemented and interop-tested with Matter 1.6 controllers.

---

## Architecture

```
Home Assistant (WebSocket API)
        │
        ▼
HomeAssistantPlatform (MatterbridgeDynamicPlatform)
        │
        ├── VacuumEntity   → RoboticVacuumCleaner (ServerNode, own QR)
        ├── LockEntity     → DoorLock (ServerNode, own QR)
        ├── BaseEntity     → Light / Switch / Sensor (ServerNode, own QR)
        └── CompositeDeviceEntity → Fan+Light grouped (ServerNode, own QR)
        │
        ▼
matterbridge@3.9.3 (Matter SDK: @matter/node)
        │
        ▼
Matter 1.6 Network (mDNS + BLE commissioning)
```

---

## Key Files for AI Agents

| File | Purpose |
|---|---|
| `src/platform.ts` | Core `HomeAssistantPlatform`; HA→Matter routing, UI HTTP server |
| `src/homeAssistant.ts` | WebSocket client, entity discovery, state sync |
| `src/device-registry.ts` | Domain → MatterDeviceType mapping |
| `src/device-profiles.ts` | UI export profiles per HA domain |
| `src/homekit.compat.ts` | Matter 1.6 HomeKit support flags |
| `src/entities/base.entity.ts` | Base entity with cluster registration |
| `src/entities/vacuum.entity.ts` | RVC Matter 1.4+ (device type 0x0074) |
| `src/entities/lock.entity.ts` | DoorLock with alarm_control_panel support |
| `src/entities/composite-device.entity.ts` | Fan+Light grouped by HA device_id or explicit include list |
| `src/converters/vacuum.converter.ts` | HA vacuum state → Matter RVC attributes |
| `run.sh` | Startup: mDNS interface detection, plugin registration, proxy |
| `Dockerfile` | `node:24-alpine` + `matterbridge@3.9.3` global install |

---

## Installation

```bash
npm install -g matterbridge@3.9.3
npm install -g matter-all-in-one-chrisalvir@1.2.29
```

---

## Changelog Summary (latest)

### v1.2.29 (2026-07-08)
- Updated toolchain to TypeScript 7.0.2.
- Updated core engine to Matterbridge 3.9.3 (integrating Matter 1.6+ features).
- Node 24 Active LTS verified as baseline.

### v1.2.25 (2026-07-02)
- Fan+Light composites can now be declared explicitly with `include_entities` even when Home Assistant registers the fan and light under different `device_id` values.
- Light capabilities remain auto-detected from Home Assistant (`brightness`, `color_temp`, RGB/HS/XY), so compatible fan lights expose dimmer, color temperature, or color controls in Apple Home.
- Documentation updated with a `device-groups.json` recipe for fan integrations that split the light into a separate HA device.

### v1.2.24
- Apple Home-safe defaults for shared homes and toolchain updates.

### v1.2.19
- SwitchBot Lock published as real Matter DoorLock with composite device grouping

See [CHANGELOG.md](CHANGELOG.md) for full history.

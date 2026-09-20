# Matter All-in-One for Home Assistant — v1.8.32

<div align="center">
  <img src="https://raw.githubusercontent.com/chrisalvir1/matter-all-in-one-chrisalvir/main/matter-all-in-one-addon/logo.png" alt="Matter All In One Logo" width="300" />
</div>

> Puente Matter 1.6 para Home Assistant con código QR independiente para apagadores dobles/triples, perfiles conservadores para Apple Home y modelo/marca real en el campo Model.
> **Base:** `matterbridge@3.10.10` · **Node.js:** `24.21.0-alpine3.24` · **TypeScript:** `7.0.2` · **Spec:** Matter 1.6 (CSA, 17 Jun 2026)

---

## AI Agent Context (machine-readable)

This file is intentionally structured for both humans and AI agents.

```yaml
project: matter-all-in-one-chrisalvir
version: "1.8.32"
spec: "Matter 1.6"
engine: matterbridge
engine_version: "3.10.10"
node_image: "node:26.8.1-alpine3.24"
bridge_mode: server       # Each HA device = ServerNode; standalone entities keep their own QR
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
| NFC Commissioning | Not implemented (requires physical NFC hardware). |
| Joint Fabric | Not implemented (controller / fabric admin feature). |
| Thermostat Suggestions | Supported via Matterbridge 3.10.6 (`Thermostat.Feature.ThermostatSuggestions`). |
| Security Sensor Event History | Not yet mapped — pending HA event_log integration. |

### Camera.UI / HomeKit stability

Camera.UI is the source of truth for each camera URL and capabilities. A normal
Camera.UI refresh preserves existing HAP UUIDs, ports, pairings, motion
detectors, HKSV pre-buffering, and Live View listeners. A paired camera is
remounted only after an explicit stream-source edit.

---

## Minimum Requirements

- **Apple Home:** HomePod mini / Apple TV 4K (Matter hub); Thread router only needed for Thread accessories.
- **Matterbridge:** `>= 3.10.6`
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
matterbridge@3.10.2 (Matter SDK: @matter/node)
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
| `Dockerfile` | Imagen multi-stage reproducible con `node:24.21.0-alpine3.24` y `matterbridge@3.10.10` |

---

## Installation

> ⚠️ **Siempre usa la última versión disponible.** Las instrucciones de abajo reflejan la versión actual del proyecto.

```bash
# 1. Instalar Matterbridge (última versión requerida)
npm install -g matterbridge@3.10.10

# 2. Instalar el plugin
npm install -g matter-all-in-one-chrisalvir@1.4.64
```

En Home Assistant, el add-on usa `ghcr.io/chrisalvir1/matter-all-in-one-chrisalvir` con un manifiesto multi-arquitectura para `amd64` y `aarch64`. Una actualización solo descarga la imagen precompilada desde GHCR — no recompila dependencias en el host.

Para actualizar desde una versión anterior:

```bash
npm update -g matterbridge
npm update -g matter-all-in-one-chrisalvir
```

---

## Changelog Summary (latest)

### v1.8.32 (2026-09-20) — Wyze mediante restream Camera.UI

- Wyze deja de depender del RTSP físico efímero y usa el stream canónico `cui_*` de Camera.UI.

### v1.8.31 (2026-09-20) — reinicio HAP real y servicios de cámara

- Restablecer emparejamiento genera una identidad HAP completa y un PIN/QR nuevos.
- Las selecciones de luz, sirena y sensores se reconstruyen como servicios del mismo accesorio de cámara en Apple Casa.

### v1.8.30 (2026-09-20) — audio HKSV tolerante a discontinuidades

- Normaliza únicamente la línea de tiempo del audio que HomeKit/HKSV ya recodifica; el vídeo H.264 en passthrough no se altera.
- Añade diagnósticos explícitos de `SetupEndpoints` y `START` HAP para identificar sesiones Apple Home rechazadas o incompletas.

### v1.8.25 (2026-09-20) — reintento BLE sin bloquear llamadas normales

### v1.8.24 (2026-09-20) — reintentar comandos BLE/fan tras reconexión de Home Assistant

### v1.8.23 (2026-09-20) — conservar RTSP y diagnosticar comandos BLE/fan

- No sobrescribe streams existentes de go2rtc configurados por Camera.UI.
- Registra errores reales de servicios HA para ventiladores BLE en lugar de ocultarlos.

### v1.8.22 (2026-09-20) — sincronización HA para instalaciones grandes

- Snapshot de Home Assistant con timeout de 60 s por solicitud.
- Lectura serial de servicios, registros y estados para evitar saturar el WebSocket en instalaciones grandes.
- Conservación del inventario anterior si el snapshot nuevo falla.

### v1.8.21 (2026-09-20) — Matterbridge 3.10.10 y disponibilidad real

- Matterbridge actualizado a 3.10.10, incluyendo las correcciones de Camera/WebRTC y el SDK Matter 1.6 más reciente.
- Una caída del WebSocket de Home Assistant marca los accesorios exportados como no alcanzables sin eliminarlos ni romper su emparejamiento HAP; al reconectar vuelven a estar disponibles.
- Se elimina el fallback incorrecto a `127.0.0.1` dentro del contenedor, que producía respuestas 404 y dejaba estados y streams congelados.

### v1.8.20 (2026-09-18) — HAP Live View y HKSV fiables

- H.264 mantiene copia RTP/SRTP nativa, ahora repitiendo SPS/PPS por keyframe para que Apple Home pueda decodificar inmediatamente un restream ya abierto.
- HEVC/H.265 conserva la fuente original y se convierte a H.264 solo en el límite RTP de HAP, porque el accesorio negocia perfiles H.264; evita paquetes no negociados y «Sin respuesta».
- HKSV conserva H.264 nativo y normaliza DTS/PTS para generar fragmentos fMP4 monotónicos y válidos para detección y grabación.
- Las cámaras HAP ya emparejadas no se eliminan ni se vuelven a enlazar.

### v1.2.62 (2026-07-24) — Estabilidad y actualización a 3.10.2

- **🔧 Reconexión sin carreras de condición:** Se elimina la llamada redundante a `startReconnect()` dentro del callback `connectionTimeout`. Cuando `socket.terminate()` es invocado, Node.js siempre emite el evento `close` → `onClose()` → `startReconnect()`. La llamada duplicada podía avanzar `reconnectRetry` dos veces y producir mensajes redundantes. Ahora hay un único punto de entrada garantizado.
- **🔇 Filtro de ruido en logs:** Las entidades de Home Assistant **no exportadas como Matter** (p. ej. Samsung TV, sensores de alarma solar, cerrojos de baño) ya no generan `WARN`/`NOTICE` cuando van a `unavailable`. Se registran a nivel `debug`. Solo los accesorios Matter activos emiten advertencias visibles.
- **⬆️ Matterbridge 3.10.2:** `@matter/main` v0.17.6 · Closure devices con `countdownTime`, `mainState`, `overallCurrentState/TargetState`, `addPanel()` · Fix `ClosureTag` export shadowing · Frontend v3.5.4 con `@rjsf v6.7.0` y `vite v8.1.5` · Detección correcta de plugins locales.
- **🏷️ Versión sincronizada:** `matterbridge.version` en `package.json` ahora es `1.2.62` (antes atascado en `1.2.52`). Matterbridge ya muestra la versión correcta del plugin.

### v1.2.57–1.2.58 (2026-07-23) — Identidad visual

- Encabezado del panel lateral: `MATTER 1.6 BRIDGE`. Título principal: `Matter All In One Chrisalvir`.

### v1.2.56 (2026-07-23) — Badge de emparejamiento

- Indicador numérico dinámico en el botón *Por emparejar*. Actualización en tiempo real cuando un accesorio se desempareja o se publica sin escanear. Filtro activo por accesorios pendientes de escanear.

### v1.2.55 (2026-07-23) — Conteo exacto de emparejados

- El contador *Emparejados* usa `matterNodeKey` como fuente de verdad en lugar de grupos de tarjetas. Dispositivos con múltiples canales independientes (apagadores/enchufes dobles/triples) suman correctamente.

### v1.2.54 (2026-07-23) — Modelo y QR independiente

- Campo *Model* en Apple Home muestra `Marca + Modelo real` (p. ej. `Tuya CB03-SBL`). QR independiente por canal en apagadores dobles/triples y enchufes dobles. Filtrado de entidades DPS genéricas de Tuya.

### v1.2.52 (2026-07-22) — Fabric Operational Credentials

- `OperationalCredentials` como fuente de verdad de fabrics. Al eliminar el último fabric desde HomeKit, el accesorio pasa automáticamente a **No emparejado**.

### v1.2.51 (2026-07-22) — Luces de color

- Entidades `light.*` RGB/HS/XY publican `ExtendedColorLight` con `ColorControl`. Govee RGBIC exportado correctamente.

See [CHANGELOG.md](CHANGELOG.md) for full history.

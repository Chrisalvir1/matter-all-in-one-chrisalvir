# Matter All-in-One for Home Assistant

Puente Matter para Home Assistant con publicación de accesorios independientes y perfiles conservadores para Apple Home.

## Minimum Requirements
- **Apple Home:** un HomePod o Apple TV 4K como hub Matter; un hub compatible con Thread es necesario solo para accesorios Thread.
- **Matterbridge:** >= 2.0.0
- **Home Assistant:** >= 2025.1

## Key Features

- **Unique QR Codes per Device (Server Mode):** Devices exported from Home Assistant are published as independent Matter Server nodes. This means each device (like a Vacuum or a Light) gets its very own unique Matter Pairing QR code instead of sharing a global bridge code.
- **Custom Liquid Glass UI:** A sleek, dark-themed custom frontend available at the bridge's local port. You can toggle which entities to publish, select custom HomeKit profiles, and view the pairing QR code natively embedded in the UI without relying on the default Matterbridge dashboard.

## Supported Devices & HomeKit Compatibility

Matterbridge 3.9.1 es la base estable. Matter 1.6 no se anuncia como soportado hasta que Matterbridge y los controladores implementen y validen sus funciones. La matriz refleja únicamente los tipos que el bridge publica por defecto:

| Device Type | HA Domain / Class | Apple Home |
|---|---|---|
| Lights, plugs, locks, thermostats, fans and RVC | `light.*`, `switch.*`, `lock.*`, `climate.*`, `fan.*`, `vacuum.*` | Supported mapping |
| Covers | `cover.*` with `windowCovering` profile | Supported mapping |
| Contact, motion, occupancy, temperature, humidity and ambient light | supported `binary_sensor.*` and `sensor.*` classes | Supported mapping |
| Camera, energy tariff, smoke/CO, pressure, flow, alarm, water heater and generic button | — | Not exported by default |

> Note: Matter 1.4 features like Water Heater, EVSE, and Solar Panel are not yet fully supported by HomeKit and will be filtered automatically.

## Installation
Run via Matterbridge plugin manager or manually:
```bash
npm install -g matterbridge
npm install -g matter-all-in-one-chrisalvir
```

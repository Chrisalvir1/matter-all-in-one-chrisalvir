# Matter All-in-One for Home Assistant

Matter bridge for Home Assistant with HomeKit-compatible mappings.

## Minimum Requirements
- **iOS:** 18.4+
- **Matterbridge:** >= 2.0.0
- **Home Assistant:** >= 2025.1

## Supported Devices & HomeKit Compatibility

With Matterbridge 3.9.1 as the stable baseline, the bridge uses official Matterbridge dependencies and is prepared for a future Matter 1.6-compatible runtime release. Below is the HomeKit compatibility matrix:

| Device Type (Matter)       | HA Domain / Class | HomeKit Supported? |
|----------------------------|-------------------|--------------------|
| **Camera**                 | `camera.*`        | ✅ Yes             |
| **Closure** (Unified)      | `cover.*`         | ✅ Yes             |
| **Soil Sensor**            | `sensor.*` (moisture)| ✅ Yes          |
| **Energy Tariff**          | `sensor.*` (monetary)| ⚠️ Partial     |
| **Robotic Vacuum Cleaner** | `vacuum.*`        | ✅ Yes             |
| Light / Dimmable           | `light.*`         | ✅ Yes             |
| On/Off Plug-in Unit        | `switch.*`        | ✅ Yes             |
| Door Lock                  | `lock.*`          | ✅ Yes             |
| Thermostat                 | `climate.*`       | ✅ Yes             |
| Contact / Occupancy Sensor | `binary_sensor.*` | ✅ Yes             |
| Temp / Humidity Sensor     | `sensor.*`        | ✅ Yes             |

> Note: Matter 1.4 features like Water Heater, EVSE, and Solar Panel are not yet fully supported by HomeKit and will be filtered automatically.

## Installation
Run via Matterbridge plugin manager or manually:
```bash
npm install -g matterbridge
npm install -g matter-all-in-one-chrisalvir
```

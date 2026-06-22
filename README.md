# matter-all-in-one-chrisalvir

> **Matter All-in-One for Home Assistant (v1.2.11)**  
> Expose Home Assistant entities as independent Matter accessories with complete HomeKit compatibility.

---

## 🌟 Key Features

* **Independent Accessories Mode (Plan B)**: Exported entities are published as standalone Matter Server nodes (not a bridged device), each with its own unique QR pairing code. This avoids mDNS overhead and simplifies discovery.
* **Liquid Glass UI Integration**: View QR codes and manual codes natively inside a custom dark-themed control panel, without leaving the page.
* **Complete HomeKit Ready**: Native support for Apple HomeKit's Matter specifications.
* **Unified Closure Support**: Cover entities (`cover.*`) mapped directly to the unified `ClosureDimension` and `ClosureControl` clusters.

---

## 📊 Supported Device Types

| Device Type (Matter 1.5.1) | Home Assistant Domain | Primary Clusters | HomeKit Compatibility |
| :--- | :--- | :--- | :--- |
| **Camera** (0x0510) | `camera.*` | `CameraAvStreamManagement`, `WebRTCTransportProvider` | ✅ Native IP Camera (2025/2026) |
| **Closure** (0x000d) | `cover.*` (garage, blind, curtain...) | `ClosureDimension`, `ClosureControl` | ✅ Native Closure (2025/2026) |
| **Soil Sensor** (0x000c) | `sensor.*` (moisture class) | `SoilMoistureMeasurement`, `TemperatureMeasurement` | ✅ Native Soil Sensor |
| **Energy Tariff** (0x000e) | `sensor.*` (monetary class) | `ElectricalGridConditions` | ⚠️ Partial / Experimental |
| **Light** | `light.*` | `OnOff`, `LevelControl`, `ColorControl` | ✅ Full Support |
| **Switch / Plug** | `switch.*` | `OnOff` | ✅ Full Support |
| **Thermostat** | `climate.*` | `Thermostat` | ✅ Full Support |
| **Lock** | `lock.*` | `DoorLock` | ✅ Full Support |

---

## 🛠️ Installation

```bash
npm install matter-all-in-one-chrisalvir
```

Register the plugin in your Matterbridge configuration:

```json
{
  "plugins": [
    "matter-all-in-one-chrisalvir"
  ]
}
```

---

## ⚙️ Configuration

| Key | Type | Description |
| :--- | :--- | :--- |
| `host` | `string` | **Required**. Home Assistant instance URL (e.g. `ws://localhost:8123/api/websocket`). |
| `token` | `string` | **Required**. Long-Lived Access Token. |
| `includeEntities` | `string[]` | Optional list of specific entities to expose. |
| `excludeEntities` | `string[]` | Optional list of entities to block/exclude. |

---

## 📖 Further Documentation

* [HomeKit Compatibility Details](docs/homekit-compatibility.md)
* [Thread Network Setup Guide](docs/thread-setup.md)

---

## 📜 License

Apache-2.0 License.

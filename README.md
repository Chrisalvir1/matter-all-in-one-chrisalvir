# matter-all-in-one-chrisalvir

> **Matter 1.5.1 Bridge for Home Assistant**  
> Complete HomeKit (2025/2026) compatibility. Expose Home Assistant entities directly to the Matter protocol.

---

## 🌟 Key Features

* **Complete HomeKit 2025/2026 Ready**: Native support for Apple HomeKit's Matter 1.5.1 specifications.
* **Unified Closure Support**: Cover entities (`cover.*`) mapped directly to the unified `ClosureDimension` and `ClosureControl` clusters.
* **Secure IP Cameras**: Support for camera entities (`camera.*`) with RTSP, HLS, and WebRTC streaming using `CameraAvStreamManagement`.
* **Soil Humidity Sensors**: Map sensor moisture measurements directly to standard Soil Moisture + Temperature endpoints.
* **Energy Tariff Tracking**: Expose monetary sensors using standard Electrical Grid Conditions clusters.

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

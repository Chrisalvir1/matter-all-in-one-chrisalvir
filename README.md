# matter-all-in-one-chrisalvir

> **Matter All-in-One for Home Assistant (v1.2.21)**
> Expose entidades verificadas de Home Assistant como accesorios Matter independientes con perfiles conservadores para Apple Home.

---

## 🌟 Key Features

* **Independent Accessories Mode (Plan B)**: las entidades exportadas se publican como nodos Matter independientes con QR propio. Esta topología prioriza aislamiento; cada nodo añade sus propios anuncios mDNS.
* **Liquid Glass UI Integration**: View QR codes and manual codes natively inside a custom dark-themed control panel, without leaving the page.
* **Apple Home con tipos verificados**: luces, enchufes, persianas `windowCovering`, cerraduras, termostatos, ventiladores, RVC y sensores admitidos.
* **Thread externo**: el bridge usa IP; una red Thread requiere un Thread Border Router compatible en la LAN.

---

## 📊 Supported Device Types

| Device Type | Home Assistant Domain / Class | Apple Home |
| :--- | :--- | :--- |
| Luz, enchufe e interruptor | `light.*`, `switch.*` | Compatible |
| Persiana o cortina | `cover.*` con perfil `windowCovering` | Compatible |
| Cerradura y termostato | `lock.*`, `climate.*` | Compatible |
| Ventilador y RVC | `fan.*`, `vacuum.*` | Compatible; RVC requiere nodo independiente |
| Contacto, movimiento, ocupación, temperatura, humedad, luz ambiental | clases admitidas de `binary_sensor.*` y `sensor.*` | Compatible |
| Cámara, tarifa, humo/CO, presión, caudal, alarma, calentador de agua y botón genérico | — | No se exportan por defecto hasta tener mapeo y pruebas completos |

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

* [Compatibilidad y topología Apple Home](docs/homekit-compatibility.md)
* [Guía correcta de Thread](docs/thread-setup.md)

---

## 📜 License

Apache-2.0 License.

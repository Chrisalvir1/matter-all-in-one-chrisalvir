# matter-all-in-one-chrisalvir

<div align="center">
  <img src="matter-all-in-one-addon/logo.png" alt="Matter All In One Logo" width="300" />
</div>

> **Matter All-in-One for Home Assistant (v1.4.72)**
> Expone entidades verificadas de Home Assistant como accesorios Matter 1.6 estables, cámaras Scrypted passthrough con HKSV y cámaras HomeKit con Live View en Apple Home.
> **Base:** `matterbridge@3.10.7` · **Node.js:** `26.8.1-alpine3.24` · **TypeScript:** `7.0.2` · **Vitest:** `5.0.0-rc.4` · **Vite:** `8.2.2` · **Spec:** Matter 1.6 (CSA, 17 Jun 2026)

---

## 🌟 Key Features

* **QR independiente por canal**: los apagadores dobles/triples y enchufes dobles se publican con un código QR único e independiente por cada canal.
* **Modelo y marca real en HomeKit**: el campo *Model* en Apple Home muestra la Marca + Modelo real del dispositivo de HA (`Tuya CB03-SBL`), manteniendo *Manufacturer* como `Matter All-in-One Chrisalvir`.
* **Filtro de DPS genéricos**: los datapoints de Tuya sin nombrar (`DPS 2`, `DPS 3`) se ocultan automáticamente del panel de control.
* **Red dual-stack**: IPv4 e IPv6 permanecen habilitados y mDNS escucha las interfaces disponibles para sobrevivir cambios de ruta entre Ethernet y Wi-Fi.
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

En Home Assistant, agrega este repositorio como repositorio de aplicaciones/add-ons e instala **Matter All-in-One Bridge**. Las actualizaciones descargan la imagen multi-arquitectura precompilada de GHCR, por lo que ya no ejecutan `npm ci` ni TypeScript dentro del equipo de Home Assistant.

La primera publicación de la imagen requiere que el paquete `ghcr.io/chrisalvir1/matter-all-in-one-chrisalvir` tenga visibilidad **Public** en GitHub Packages. El workflow comprueba el acceso anónimo y falla con una instrucción clara si todavía está privado.

Para una instalación independiente de Matterbridge:

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
| `host` | `string` | URL base de Home Assistant (por ejemplo, `http://localhost:8123`); el add-on usa Supervisor automáticamente. |
| `token` | `string` | Token de larga duración; opcional dentro del add-on de Home Assistant. |
| `includeEntities` | `string[]` | Optional list of specific entities to expose. |
| `excludeEntities` | `string[]` | Optional list of entities to block/exclude. |
| `group_by_device_id` | `boolean` | Agrupa capacidades del mismo dispositivo físico; predeterminado `true`. |
| `mdnsinterface` | `string` | Interfaz mDNS manual; vacío usa todas las interfaces. |
| `ipv4_only` | `boolean` | Compatibilidad con configuraciones anteriores; no desactiva IPv6 link-local de Matter. |

---

## 📖 Further Documentation

* [Compatibilidad y topología Apple Home](docs/homekit-compatibility.md)
* [Guía correcta de Thread](docs/thread-setup.md)

---

## 📜 License

Apache-2.0 License.

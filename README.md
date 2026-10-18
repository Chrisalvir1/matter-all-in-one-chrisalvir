# matter-all-in-one-chrisalvir

<div align="center">
  <img src="matter-all-in-one-addon/logo.png" alt="Matter All In One Logo" width="300" />
</div>

> **Matter All-in-One for Home Assistant (v2.1.15)**
> Expone entidades verificadas de Home Assistant como accesorios Matter 1.6 estables, cámaras Scrypted passthrough con HKSV y cámaras HomeKit con Live View en Apple Home.
> **Base:** `matterbridge@3.10.14` · **Node.js:** `24.21.0-alpine3.24` · **TypeScript:** `7.0.2` · **Vitest:** `5.0.5` · **Vite:** `8.3.4` · **Spec:** Matter 1.6.1

---

### Novedades de la versión 2.1.15

- Actualiza la base oficial de ejecución a **Matterbridge 3.10.14** sobre Node.js 24.21.0 y Alpine 3.24.
- Normaliza los límites de memoria bajo Docker (`constrainedMemory`) en Home Assistant OS para evitar lecturas infladas de la máquina host.
- Optimiza los contextos de almacenamiento de MatterNode omitiendo escrituras duplicadas en disco, acelerando los arranques y protegiendo el almacenamiento flash.
- Incorpora atributos de batería de Matter 1.6.1 (`batCapacity`, `batTimeToFullCharge`, etc.) y tipo `TiltOnlyInteriorBlind` conforme para persianas.
- Actualiza dependencias estables: `werift@0.25.1`, `undici@8.12.2`, `mqtt@5.16.1`, `react@19.3.1`, `vite@8.3.4`, `vitest@5.0.5` y `lucide-react@1.59.0`.

### Novedades de la versión 2.1.13

- Durante Live View, HKSV fragmenta el fMP4 en el intervalo negociado con Casa, incluso cuando Omni tiene un GOP largo. El diagnóstico registra cuántos fragmentos se reciben y se envían a Apple.

### Novedades de la versión 2.1.12

- Mantiene detección y entrega de video fMP4 a HKSV durante Live View de Apple Casa usando el mismo lector RTSP activo, sin abrir otra sesión al comedero Omni.
- Evita que HKSV quede sin fragmentos durante Live View y que la sesión de grabación cierre por `TIMEOUT`.
- Conserva el audio AAC-LC en los clips y el emparejamiento HAP tras reinicios; cada nueva sesión renueva la URL RTSP firmada de Omni.
- Si Omni aún no respondió después de reiniciar, el detector vuelve a intentarlo sin reutilizar una credencial caducada.
- Ajusta el análisis para conservar cambios grandes de imagen, como el paso cercano de una mascota.
- Las casillas de gato/perro filtran eventos clasificados por una integración externa; MIAO no ejecuta por sí solo un modelo de reconocimiento de animales.
- Verificar Stream espera hasta cinco segundos para medir un RTSP Tuya firmado por RTSPS.

---

### Novedades de la versión 2.1.8

- El diagnóstico de streams HLS emitidos por Home Assistant usa el token Bearer del add-on, evitando falsos errores 401.
- Cuando Omni no puede asignar un RTSP firmado, el registro indica el intento de asignación sin exponer URL ni credenciales.

### Novedades de la versión 2.1.7

- Live View de cámaras Omni renueva el RTSP firmado antes de iniciar HAP y reintenta la asignación si Tuya sigue creando la sesión tras un reinicio.
- Cuando Omni no entrega una URL renovada, MIAO acepta solamente un stream HLS nuevo de Home Assistant. Se excluye `camera_proxy_stream`, que puede devolver 401 y dejar una imagen congelada.

### Novedades de la versión 2.1.5

- Las cámaras Omni Tuya descubiertas mediante Camera.UI ya no dependen de una URL RTSP fija guardada. El complemento identifica su entidad `camera.*` real de Home Assistant y solicita una URL firmada nueva para cada Live View, reinicio y reconexión.
- La renovación de audio y detección local usa la entidad real de Home Assistant, evitando que un ID interno de HAP impida renovar el stream.
- go2rtc sigue siendo la ruta estable para cámaras IP con URL permanente. Los streams firmados de Tuya se renuevan desde Omni, ya que su autorización caduca.

### Novedades de la versión 2.1.3

- Conecta las cámaras de Omni Tuya Local con el Live View de HomeKit HAP mediante RTSP firmado.
- Solicita una URL RTSP nueva por sesión HAP y evita guardar o registrar credenciales efímeras.
- Requiere Omni Tuya Local 1.11.6 o posterior y permiso Tuya IoT Video Live Stream.

### Novedades de la versión 2.1.2

- La cámara de Omni Tuya “DPS camera” aparece en la lista de cámaras HAP y puede publicarse como cámara independiente.
- Los sensores/datapoints genéricos DPS no se muestran como accesorios.
- Requiere Omni Tuya Local 1.11.4 o posterior para la renovación RTSP por sesión.

### Novedades de la versión 2.1.1

- Solicita una URL RTSP Tuya firmada nueva a Omni 1.11.4 al inicio de cada sesión de cámara HAP. Requiere el permiso IoT Video Live Stream y conectividad con Tuya; el stream real debe validarse en Home Assistant.
- Actualiza Matterbridge a 3.10.13 sobre Node.js 24.21.0 y la imagen ARM64.
- Añade duración y cuenta atrás HAP para válvulas, con recuperación de plazos y conservación de identidades existentes.
- Valida los contratos de Home Assistant Core 2026.10 y los cambios de disponibilidad de Matterbridge.

## 🌟 Key Features

* **QR independiente por canal**: los apagadores dobles/triples y enchufes dobles se publican con un código QR único e independiente por cada canal.
* **Modelo y marca real en HomeKit**: el campo *Model* en Apple Home muestra la Marca + Modelo real del dispositivo de HA (`Tuya CB03-SBL`), manteniendo *Manufacturer* como `Matter All-in-One Chrisalvir`.
* **Filtro de DPS genéricos**: los datapoints de Tuya sin nombrar (`DPS 2`, `DPS 3`) se ocultan automáticamente del panel de control.
* **Red dual-stack**: IPv4 e IPv6 permanecen habilitados y mDNS escucha las interfaces disponibles para sobrevivir cambios de ruta entre Ethernet y Wi-Fi.
* **Liquid Glass UI Integration**: View QR codes and manual codes natively inside a custom dark-themed control panel, without leaving the page.
* **Apple Home con tipos verificados**: luces, enchufes, persianas `windowCovering`, cerraduras, termostatos, ventiladores, RVC y sensores admitidos.
* **Camera.UI → Apple Home estable**: H.264 conserva passthrough RTP con SPS/PPS por keyframe para aperturas rápidas; HEVC se adapta únicamente en la salida HAP; HKSV normaliza el timeline fMP4 para detección y grabación fiables. Las cámaras ya emparejadas conservan su identidad durante sincronizaciones.
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

El número 2.1.1 corresponde al add-on de Home Assistant y su imagen GHCR. El plugin NPM independiente mantiene una versión separada.

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

# Estado de refactorización — matter-all-in-one-chrisalvir

> Documento vivo. Última actualización: 2026-06-21 — versión 1.2.9.

## Objetivo de arquitectura actual (v1.2.0+)

**Modo de Accesorios Independientes (Plan B)**:
El add-on opera publicando cada entidad exportada de Home Assistant como un nodo servidor Matter independiente (`mode: 'server'` en `MatterbridgeEndpoint`). 
- **NO se utiliza el modo Bridge global** para las entidades exportadas.
- Cada dispositivo exportado se anuncia de forma independiente en la red local con su propio puerto de red mDNS y su propia identidad de comisión.
- Esto permite que cada accesorio (por ejemplo, una Aspiradora o una Luz) tenga su propio código QR y código PIN de emparejamiento único en el panel de control.

---

## Cambios aplicados y estado actual

| Área | Estado | Implementación / Detalles en v1.2.9 |
| --- | --- | --- |
| **Ciclo de Vida Matter** | Hecho | Cada accesorio es un `ServerNode` independiente. Se registran/desregistran mediante `registerDevice()` y `unregisterDevice()`. |
| **Llamadas de control API** | Hecho | **Se eliminaron por completo las llamadas a `startServerNode()` y `stopServerNode()`** que no existen en `MatterbridgePlatform` y producían `TypeError` al deshabilitar dispositivos. |
| **Extracción de Códigos QR** | Hecho | Se extraen directamente desde `endpoint?.serverNode?.state?.commissioning?.pairingCodes?.qrPairingCode` (y `manualPairingCode`). |
| **Nombre de Casa (Fabric)** | Hecho | El backend extrae el nombre de la casa (ej: "Casa de Chris") desde `endpoint?.serverNode?.state?.commissioning?.fabrics` (propiedad `label`) y lo expone como `homeName` en la API `/api/custom/devices`. |
| **Panel Gráfico (Liquid Glass)** | Hecho | El frontend agrupa entidades por **Dispositivo físico de HA** (`device_id`). El usuario interactúa con dispositivos físicos en la lista, no con un listado confuso de entidades sueltas. |
| **Polling de Código QR** | Hecho | El botón de ver QR está siempre visible para entidades exportadas. Si el código QR aún no se ha generado en el arranque, el frontend realiza polling automático cada 2 segundos. |
| **Restablecimiento individual** | Hecho | `POST /api/custom/reset-accessory/:entityId` ejecuta `serverNode.erase()` para eliminar únicamente los fabrics del accesorio seleccionado y reabrir su comisión. |
| **Dispositivos compuestos** | Opt-in | Con `group_by_device_id: true`, Fan + Light/Switch/Sensor del mismo `device_id` se publican como endpoints de un único ServerNode y comparten QR/fabrics. Ver `docs/composite-devices.md`. |
| **RVC y Apple Home** | Hecho | `vacuum.*` usa el tipo Matter real `RoboticVacuumCleaner` (`0x0074`) como ServerNode independiente. No se debe convertir en switch ni añadirlo al bridge. |
| **Identidad visible** | Hecho | El nombre visible es el `friendly_name` de Home Assistant (hasta 32 caracteres); `entity_id`, serial y `uniqueId` proporcionan la identidad interna estable. |

---

## Lecciones aprendidas e instrucciones CRÍTICAS para futuras IAs

> [!IMPORTANT]
> **No mezclar Dispositivos y Entidades en la vista principal del Panel.**
> El panel agrupa las entidades por `device_id`. Si una entidad no tiene `device_id` (entidades virtuales), se agrupa en un contenedor virtual por dominio (ej: `virtual:light`). La UI debe mostrar los dispositivos físicos y permitir configurar sus entidades dentro del modal de configuración.

> [!IMPORTANT]
> **¡NO USAR `this.matterbridge.startServerNode()` ni `this.matterbridge.stopServerNode()`!**
> Estos métodos NO existen en la clase `MatterbridgePlatform`. El ciclo de vida de cada nodo Matter independiente en modo `server` es manejado de manera interna por `registerDevice()` y `unregisterDevice()`. Intentar llamarlos causa un crash fatal del add-on.

> [!IMPORTANT]
> **Los nodos creados dinámicamente sí requieren arrancar `endpoint.serverNode`.**
> Tras `registerDevice(endpoint)`, Matterbridge ya ha creado el `ServerNode`, pero si el accesorio se añadió después de su intervalo de arranque inicial, el nodo puede seguir offline. Llamar `await endpoint.serverNode.start()` publica `_matterc._udp` y hace que el QR sea detectable. Al retirar un endpoint `server`, llamar `await endpoint.serverNode.close()` antes de `unregisterDevice()` evita anuncios mDNS residuales. No llamar los métodos privados/inexistentes del singleton `this.matterbridge`.

> [!IMPORTANT]
> **RVC para Apple Home debe mantenerse como RVC Matter real.**
> Apple Home soporta aspiradoras robot Matter, pero Matterbridge exige un nodo individual `mode: 'server'` para el RVC. No usar `mode: 'matter'`, no añadirlo como endpoint hijo de un bridge y no sustituirlo por `OnOffPlugInUnit`. El constructor es `new RoboticVacuumCleaner(name, serial, 'server', ...)`.

> [!IMPORTANT]
> **No alterar el nombre del usuario para crear unicidad.**
> El nombre de Basic Information debe proceder de `friendly_name` de Home Assistant. La unicidad vive en `entity_id`, `serialNumber` y `uniqueId`; añadir sufijos como el ID de entidad o versiones modifica indebidamente el accesorio visible.

> [!NOTE]
> **El `pairingCode` puede ser nulo inicialmente.**
> Cuando se registra un dispositivo mediante `registerDevice()`, el nodo tarda unos segundos en inicializarse y generar los códigos de emparejamiento. El frontend realiza polling automático al endpoint `/api/custom/devices` cada 2 segundos hasta obtener los códigos.

> [!NOTE]
> **Extracción del nombre de la casa vinculada:**
> Para saber a qué ecosistema (Apple Home, Google Home, etc.) se ha emparejado un accesorio, se consulta la lista de fabrics en `endpoint?.serverNode?.state?.commissioning?.fabrics`. El nombre de la casa se guarda en la propiedad `label` de cada fabric.

---

## APIs expuestas (Puerto 8285)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/custom/devices` | Devuelve el listado de todas las entidades agrupadas con su estado Matter (incluye `pairingCode`, `manualPairingCode`, `commissioned`, `homeName`). |
| POST | `/api/custom/register/:entityId` | Registra/exporta una entidad como accesorio Matter independiente. |
| POST | `/api/custom/unregister/:entityId` | Desregistra/deshabilita una entidad. |
| POST | `/api/custom/reset-accessory/:entityId` | Restablece solo ese nodo Matter: elimina fabrics y permite emparejarlo de nuevo. |
| POST | `/api/custom/device-profile/:entityId` | Cambia el perfil Matter de la entidad. |
| GET | `/api/custom/status` | Devuelve el estado general y la versión del addon. |
| GET | `/api/custom/logs` | Devuelve logs para depuración. |
| POST | `/api/custom/restart` | Reinicia Matterbridge. |
| POST | `/api/custom/factoryreset` | Borra selección, perfiles y el almacenamiento Matterbridge (fabrics/QR/nodos), y reinicia. |

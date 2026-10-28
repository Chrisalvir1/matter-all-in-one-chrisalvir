# Matter All-in-One Chrisalvir — v2.3.0

<div align="center">
  <img src="matter-all-in-one-addon/logo.png" alt="Matter All In One Logo" width="300" />
</div>

<div align="center">

**Un solo proyecto para integrar dispositivos de Home Assistant en Matter y cámaras en Apple Casa.**

**Versión 2.3.0** · **Preparado para Home Assistant 2026.11 (beta)** · **Matter 1.6.1** · **HomeKit HAP / HKSV**

</div>

Matter All-in-One Chrisalvir (MIAO) reúne la administración de accesorios Matter, cámaras de **Omni Tuya Local**, **Camera.UI**, **Scrypted** y entidades de **Home Assistant** en una interfaz integrada. Las rutas Matter y HomeKit HAP son distintas: se utiliza la que corresponda a cada dispositivo, sin prometer que todos los tipos Matter sean compatibles con Apple Casa.

> [!IMPORTANT]
> **Compatibilidad con Home Assistant 2026.11:** la v2.3.0 incorpora ajustes y pruebas automatizadas para los cambios de nombres contextuales de entidades de la **beta de 2026.11**. **No se ha validado todavía sobre una instalación real de esa beta**; la referencia operativa del proyecto sigue siendo Home Assistant 2026.10. No necesitas actualizar tu Home Assistant principal a la beta para usar estas mejoras.

## ✨ Novedades de hoy — v2.3.0 (28 de octubre de 2026)

### 1. Compatibilidad preparada para Home Assistant 2026.11

- **Nombres contextuales:** la detección y asociación de movimiento de cámaras conservan como identificadores principales `entity_id` y `device_id`. Cuando faltan nombres legibles, ahora consultan nombres del registro de entidades y del dispositivo.
- **Sin migraciones de identidades:** no se cambian los identificadores persistentes HAP, el emparejamiento de Apple Casa, las fabrics Matter, los QR ni las selecciones del usuario.
- **Sin suposiciones sobre Matter 1.5 Cameras:** que Home Assistant pueda incorporar una cámara Matter no significa que exista automáticamente un RTSP compatible con HomeKit. Una cámara nueva se debe verificar antes de exportarla.

### 2. Más visibilidad de la ruta Omni Tuya Local → Apple Casa

- **Métricas de asignación RTSP firmada por cámara:** intentos, éxitos, fallos, duración y resultado más reciente, sin almacenar URL firmadas ni credenciales en los contadores.
- **Reintentos observables:** se puede distinguir un fallo inicial de asignación de una recuperación posterior.
- **Integración conservadora:** se mantienen la renovación de la URL firmada por sesión, las rutas de audio, los sensores de movimiento asociados, Live View y HKSV. **Esta versión no reemplaza el pipeline de FFmpeg ni cambia su negociación.**
- **Varias cámaras:** la instrumentación separa las métricas por entidad. La reproducción simultánea de varias cámaras sigue pendiente de validación física.

### 3. Diagnóstico de cámaras para automatizaciones e IA (opcional)

- Nuevo endpoint **de solo lectura**: `GET /api/custom/ai/camera-diagnostics`.
- Ofrece estado de publicación/emparejamiento HAP, disponibilidad, audio, sensor de movimiento, estado HKSV, sesiones Live View y contadores de asignación Omni.
- **Desactivado por defecto**; requiere `diagnostics_token` con un secreto de al menos 24 caracteres, enviado en `Authorization: Bearer`.
- Respuesta limitada a campos permitidos: no incluye contraseñas, tokens de HA, direcciones RTSP, SDP, códigos de emparejamiento ni registros brutos.
- Es una **fuente de datos para un adaptador MCP confiable**, no un servidor MCP autónomo ni una conexión directa pública a ChatGPT. No añade controles remotos de reinicio o modificación.

### 4. Pruebas de regresión

- Se añadieron pruebas para los nombres de HA 2026.11, asociación de movimiento, renovación/reintentos Omni, aislamiento de métricas por cámara, salida de diagnóstico y autenticación.
- También se conservan las pruebas existentes de Matter, RVC, accesorios HAP, cámaras y compatibilidad de dispositivos.
- La publicación de la imagen de esta versión queda subordinada a las verificaciones del flujo de GitHub Actions.

**Lo que ya funciona en la instalación de Chrisalvir:** una cámara **Omni Tuya Local** exportada a **Apple Casa** con **vídeo en vivo, audio, sensor de movimiento y grabaciones HKSV**. Es una confirmación del usuario en su sistema actual; no se presenta como prueba de Home Assistant 2026.11 ni de todas las cámaras.

## 🧭 ¿Cómo funciona?

| Fuente o dispositivo | Ruta de MIAO | Destino / alcance |
| --- | --- | --- |
| Luces, enchufes, persianas, cerraduras, sensores, ventiladores y aspiradoras compatibles de Home Assistant | **Matterbridge → Matter 1.6.1** | Controlador Matter compatible, incluido Apple Casa cuando admite su perfil |
| Cámara de **Omni Tuya Local** | **HA → URL RTSP Tuya renovada por sesión → HomeKit HAP/HKSV** | Apple Casa: Live View, audio, movimiento y grabación según capacidades reales |
| Cámara de **Camera.UI** | **Camera.UI → HomeKit HAP/HKSV** | Apple Casa, con fuente y capacidades configuradas |
| Cámara de **Scrypted** | **Scrypted → integración de cámaras de MIAO / HAP** | Apple Casa, según capacidades y compatibilidad del stream |
| Entidad `camera.*` directa de Home Assistant | **Resolución y validación de stream → HAP**, si es utilizable | No todas las integraciones de cámara ofrecen un stream adecuado |

**Matter no es lo mismo que HomeKit HAP.** Las cámaras publicadas en Apple Casa mediante HAP/HKSV conservan su propia identidad y emparejamiento; no se convierten automáticamente en cámaras Matter. Los dispositivos Thread necesitan un Border Router Thread en la red; el puente MIAO opera a través de IP.

## 📱 Compatibilidad con Home Assistant y Apple Casa

| Entorno | Estado de v2.3.0 |
| --- | --- |
| Home Assistant 2026.10 | Base conocida del proyecto; conservar como entorno principal mientras se valida la beta |
| **Home Assistant 2026.11 beta** | **Preparado a nivel de código y pruebas de compatibilidad**; validación física pendiente |
| Home Assistant 2026.11 estable | Pendiente de publicación y prueba en instalación real |
| Matterbridge 3.11.0 | Versión del runtime del complemento |
| Matter 1.6.1 | Especificación utilizada por el puente Matter |
| Apple Casa — accesorios Matter | Depende del tipo de dispositivo que Apple admita |
| Apple Casa — cámara Omni mediante HAP/HKSV | Vídeo, audio, movimiento y grabación reportados como operativos por Chrisalvir en su instalación |
| Cámaras Matter 1.5 importadas a Home Assistant | No tienen exportación HAP/RTSP automática garantizada |

La actualización **no borra emparejamientos ni modifica intencionalmente fabrics**, pero se recomienda hacer una copia de seguridad antes de actualizar.

## 🧩 Funciones principales

- Publicación de entidades compatibles como accesorios Matter, incluidos dispositivos individuales o compuestos con QR y estado de emparejamiento.
- Aspiradoras como dispositivos Matter **RVC** con controles y batería cuando Home Assistant proporciona las entidades necesarias.
- Accesorios HAP y cámaras independientes para Apple Casa, con soporte de Live View, audio y HKSV donde la fuente y el hub lo permitan.
- Administración de fuentes de Scrypted y Camera.UI, comprobación de streams y detección de sensores relacionados.
- Persistencia de la selección de accesorios y de las identidades de los dispositivos ya emparejados.
- Interfaz web integrada con Home Assistant Ingress y conectividad IPv4/IPv6.
- Diagnósticos opcionales sin exponer credenciales ni abrir rutas de escritura a agentes.

## 🚀 Instalación y actualización

### Como aplicación / add-on de Home Assistant

1. En **Ajustes → Complementos / Aplicaciones → Tienda**, abre el menú para agregar un repositorio.
2. Agrega: `https://github.com/Chrisalvir1/matter-all-in-one-chrisalvir`.
3. Instala **Matter All-in-one (Chrisalvir)** o actualiza a **v2.3.0** cuando la imagen publicada esté disponible.
4. Inicia el complemento y abre su interfaz desde Home Assistant.
5. Selecciona el dispositivo y la ruta **Matter** o **HomeKit HAP** apropiada; usa el QR de emparejamiento correspondiente.

Las imágenes `amd64` y `aarch64` se generan mediante GitHub Actions y se distribuyen desde `ghcr.io/chrisalvir1/matter-all-in-one-chrisalvir`. La release de GitHub se publica después de validar que Home Assistant puede descargar la imagen.

**Antes de actualizar:** respalda Home Assistant, la configuración del add-on y sus datos persistentes. No restablezcas códigos QR, fabrics ni accesorios que actualmente funcionan por el solo hecho de instalar esta versión.

### Como plugin de Matterbridge (instalación independiente)

```bash
npm install matter-all-in-one-addon@2.3.0
```

La publicación en npm depende del flujo de release. Configura la conexión WebSocket con Home Assistant, Matterbridge y los puertos de la instancia según tu entorno. El complemento oficial de HA ya gestiona la conexión con Supervisor y la persistencia.

## 🎥 Cámara Omni Tuya Local: ruta recomendada

1. Confirma que **Omni Tuya Local** muestra una entidad `camera.*` funcional en Home Assistant.
2. En MIAO, identifica la cámara correcta y verifica la relación con su sensor de movimiento.
3. Exporta la cámara como **HomeKit HAP** y conserva su identidad y puerto existente si ya está emparejada.
4. Al abrir Live View, MIAO solicita a Omni una **nueva URL RTSP firmada**; no depende de reutilizar una dirección caducada de Camera.UI.
5. En Apple Casa comprueba vídeo, audio, movimiento y un **clip HKSV real**. La grabación depende además de la configuración del hub doméstico y de iCloud.

Si la asignación RTSP falla, consulta el diagnóstico opcional y los registros del complemento sin compartir URLs firmadas ni tokens. **No desinstales ni vuelvas a emparejar una cámara funcional para probar esta actualización.**

## 🔐 Configuración y diagnóstico opcional

| Opción de add-on | Uso |
| --- | --- |
| `host` | Dirección de Home Assistant; el complemento usa Supervisor por defecto |
| `token` | Token de Home Assistant; el complemento aprovecha el token inyectado si no se define uno |
| `group_by_device_id` | Agrupación de entidades del mismo dispositivo |
| `mdnsinterface` | Interfaz mDNS opcional |
| `ipv4_only` | Opción heredada; Matter sigue necesitando IPv6 local |
| **`diagnostics_token`** | Secreto opcional de **24+ caracteres** para activar diagnósticos de cámara de solo lectura |

Para consultar el diagnóstico, realiza una solicitud autenticada a **`GET /api/custom/ai/camera-diagnostics`** a través de una ruta local confiable, con cabecera `Authorization: Bearer <diagnostics_token>`. **No publiques el puerto 8285 ni incluyas el token en una URL o prompt de IA**. Sin secreto configurado, el endpoint devuelve 404; con autenticación incorrecta, 401.

Esta función no instala por sí sola un agente de IA ni un servidor MCP. Para usarla con un asistente se necesita un adaptador aparte, autorizado y restringido a lectura.

## 🧪 Validación de Home Assistant 2026.11

Sin tocar el servidor principal, prueba la v2.3.0 en una instancia secundaria con HA 2026.11:

1. Verifica que siguen enlazados `camera.*` y el `binary_sensor.*` real de movimiento pese a cambios de nombres visibles.
2. Reinicia MIAO y comprueba que Apple Casa conserva el accesorio y su emparejamiento.
3. Abre y cierra Live View varias veces, confirma audio y movimiento y graba un clip HKSV.
4. Provoca un fallo temporal de asignación Omni y confirma recuperación con nueva URL, sin reutilizar una credencial caducada.
5. Si hay una segunda cámara, comprueba sesiones y grabaciones simultáneas y métricas independientes.

Consulta la [guía de preparación para HA 2026.11](docs/home-assistant-2026-11-readiness.md) para el protocolo técnico y las limitaciones.

## 📚 Documentación y soporte

- [Notas completas de la release v2.3.0](docs/RELEASE_NOTES_2.3.0.md)
- [Historial de cambios](matter-all-in-one-addon/CHANGELOG.md)
- [Compatibilidad con Apple Casa](matter-all-in-one-addon/docs/homekit-compatibility.md)
- [Configuración de Thread](matter-all-in-one-addon/docs/thread-setup.md)
- [Reportar un problema](https://github.com/Chrisalvir1/matter-all-in-one-chrisalvir/issues)

**Base de ejecución:** Matterbridge `3.11.0` · Node.js `24.22.1` · Matter `1.6.1` · TypeScript `7.0.2`.

**Licencia:** Apache-2.0 · Proyecto mantenido por **Chrisalvir**.

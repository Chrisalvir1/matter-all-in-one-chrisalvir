# Matter All-in-One Chrisalvir — complemento v2.3.0

<div align="center">
  <img src="https://raw.githubusercontent.com/chrisalvir1/matter-all-in-one-chrisalvir/main/matter-all-in-one-addon/logo.png" alt="Matter All In One Logo" width="300" />
</div>

**Compatible a nivel de código con Home Assistant 2026.10 y preparado para Home Assistant 2026.11 beta.** Esta última versión todavía requiere validación en una instalación real.

Puente **Matter 1.6.1** basado en **Matterbridge 3.11.0** con publicación independiente **HomeKit HAP/HKSV** para cámaras y accesorios compatibles. Incluye integración con Omni Tuya Local, Camera.UI, Scrypted y el inventario de Home Assistant.

## Novedades v2.3.0 — 28 de octubre de 2026

1. **Home Assistant 2026.11:** soporte defensivo de nombres contextuales mediante nombres del registro y del dispositivo, preservando `entity_id`, `device_id` y los vínculos con sensores de movimiento.
2. **Omni Tuya Local:** métricas separadas por cámara para asignaciones RTSP efímeras, con intentos, reintentos, duración y errores agregados, sin guardar URLs ni credenciales.
3. **Ruta HAP/HKSV intacta:** sin cambios en el pipeline de Live View, audio, grabación, detección, emparejamiento ni renovación del stream firmado por sesión.
4. **Diagnóstico opcional de solo lectura:** nueva ruta `GET /api/custom/ai/camera-diagnostics`, autenticada con secreto `diagnostics_token` y deshabilitada por defecto.
5. **Pruebas de regresión:** compatibilidad de nombres, sensores de movimiento, reintentos Omni, contadores independientes, privacidad del diagnóstico y autenticación.
6. **Matter 1.5 cameras:** importarlas a Home Assistant no garantiza una URL compatible con HAP ni las exporta automáticamente a Apple Casa; la funcionalidad depende del dispositivo y de un stream real verificable.

### Confirmación del entorno de Chrisalvir

Una cámara **Omni Tuya Local** ya funciona en **Apple Casa** con vídeo en vivo, movimiento, audio y grabaciones HKSV. Es una observación real del usuario en su instalación actual, **no una certificación de la beta 2026.11**.

## Tabla de integración

| Fuente | Transporte de salida |
| --- | --- |
| Entidades HA compatibles (luces, sensores, persianas, cerraduras, RVC, etc.) | Matter 1.6.1; QR por accesorio según configuración |
| Cámara Omni Tuya Local | HomeKit HAP/HKSV con URL RTSP renovada por sesión |
| Cámaras Scrypted y Camera.UI | HomeKit HAP/HKSV, según códec, fuente y capacidades |
| Cámara directa de Home Assistant | HAP solo si ofrece una fuente de vídeo utilizable |

Las cámaras HomeKit HAP **no son cámaras Matter**. Para las funciones HKSV se necesita un hub doméstico Apple y la configuración de iCloud adecuada.

## Instalar o actualizar

Añade este repositorio de aplicaciones en Home Assistant:

```text
https://github.com/Chrisalvir1/matter-all-in-one-chrisalvir
```

Instala **Matter All-in-one (Chrisalvir)** y elige la versión **2.3.0** cuando la imagen `amd64` / `aarch64` esté publicada. La distribución se realiza desde GHCR, con verificaciones previas de tipos, compilación, pruebas y disponibilidad pública de la imagen.

Antes de actualizar, realiza una copia de seguridad de la configuración y el almacenamiento persistente. No es necesario ni recomendable borrar las fabrics Matter ni volver a emparejar una cámara estable.

### Opciones del complemento

| Clave | Descripción |
| --- | --- |
| `host` | Endpoint HA; usa `http://supervisor/core` automáticamente en el add-on |
| `token` | Token HA; se usa el de Supervisor si no está configurado |
| `group_by_device_id` | Agrupa los componentes del mismo dispositivo |
| `mdnsinterface` | Interfaz de descubrimiento mDNS opcional |
| `ipv4_only` | Compatibilidad heredada; Matter conserva IPv6 local |
| `diagnostics_token` | Secreto opcional de **24+ caracteres** para habilitar diagnósticos de cámara de solo lectura |

### Diagnóstico opcional

El endpoint `GET /api/custom/ai/camera-diagnostics` proporciona solo datos allowlist: `entity_id`, disponibilidad, estado HAP, audio, movimiento, estado HKSV, estado resumido Live View y asignaciones Omni. Se consulta mediante `Authorization: Bearer <diagnostics_token>` desde un acceso **local confiable**.

- Sin secreto configurado: **404**; secreto incorrecto: **401**.
- No entrega URLs RTSP, tokens de HA, SDP, contraseñas, PIN de HomeKit ni logs sin filtrar.
- No es un servidor MCP ni ofrece acciones remotas de modificación.
- No expongas directamente el puerto interno 8285 a Internet.

## Validación pendiente de 2026.11

Se requiere una prueba física separada, sin actualizar el Home Assistant principal:

1. Confirmar el enlace de `camera.*` con su sensor real de movimiento después del cambio de nombres.
2. Abrir Live View, escuchar audio, generar detección y reproducir un clip HKSV auténtico.
3. Forzar una reasignación de RTSP Omni y comprobar una recuperación limpia.
4. Probar varias cámaras simultáneas antes de declarar esa carga validada.

## Datos de implementación

```yaml
project: matter-all-in-one-chrisalvir
version: "2.3.0"
home_assistant: "2026.10; 2026.11-beta contract tested, hardware validation pending"
spec: "Matter 1.6.1"
engine: matterbridge
engine_version: "3.11.0"
node_image: "node:24.22.1-alpine3.24"
ha_integration: websocket
plugin_mode: dynamic
persistent_data: /data/.matterbridge
ingress_port: 8283
internal_plugin_port: 8285
diagnostics: opt-in read-only
```

## Más información

- [README principal del proyecto](../README.md)
- [Notas de publicación v2.3.0](../docs/RELEASE_NOTES_2.3.0.md)
- [Guía técnica de compatibilidad con HA 2026.11](../docs/home-assistant-2026-11-readiness.md)
- [Compatibilidad HomeKit](docs/homekit-compatibility.md)
- [Thread en Home Assistant](docs/thread-setup.md)
- [Cambios del complemento](CHANGELOG.md)

**Licencia:** Apache-2.0. **Autor:** Chrisalvir.

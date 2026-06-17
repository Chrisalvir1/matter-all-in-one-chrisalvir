## Matter 1.5.1 baseline / preparación para Matter 1.6

- Se establece **Matter 1.5.1** como baseline estable del proyecto.
- Se mantienen las notas históricas de soporte Matter 1.4 y 1.5 como referencia funcional.
- Se inicia la preparación de compatibilidad para **Matter 1.6** sin declarar aún migración completa.

# Changelog

All notable changes to this project will be documented in this file.

## [1.1.4] - 2026-06-17
### Fixed
- **Plugin Rejection (Bug Crítico):** Se eliminó el paquete `matterbridge` de las dependencias de producción (`dependencies`) en `package.json` y se movió a `peerDependencies` y `devDependencies`, resolviendo el rechazo del plugin por parte de Matterbridge 3.9.0 que arrojaba el error `package.json not found` y no iniciaba el puerto de la interfaz `8283`.

## [1.1.3] - 2026-06-17
### Fixed
- **HA Ingress Routing (Bug Crítico):** Se añadió soporte para parsear y remover el prefijo de ruta de Ingress de Home Assistant (`/api/hassio_ingress/TOKEN/`), resolviendo el error `502: Bad Gateway` y la pantalla de "App no lista" en la interfaz.
- **Redirección de Ingress sin slash final:** Se implementó una redirección automática para peticiones que acceden a la URL de Ingress sin la barra final (`/api/hassio_ingress/TOKEN` -> `/api/hassio_ingress/TOKEN/`), garantizando que los recursos relativos (`./script.js`, `./style.css`) se carguen correctamente.
- **Conflicto de Dependencia de Matter:** Se eliminó la dependencia duplicada de `@matter/main` en `package.json` que causaba que la carga del plugin fallara con errores de duplicación en Matterbridge 3.9.0.
- **Versión de Matterbridge:** Se bloqueó la instalación global de matterbridge a la versión `3.9.0` en el `Dockerfile` para asegurar coherencia y estabilidad en producción.

## [1.0.25] - 2026-06-16
### Added
- **Matter 1.4 Robotic Vacuum Cleaner (RVC):** Soporte completo para entidades `vacuum.*` de Home Assistant usando el device type Matter 0x0074. Compatible con Tuya, Smart Life, Roborock, iRobot, Dreame, Ecovacs y cualquier vacuum expuesto por HA.
- **`vacuum.converter.ts`:** Nuevo converter con mapeo completo de estados HA → `RvcOperationalState` (cleaning→Running, docked→Docked, returning→SeekingCharger, paused→Paused, error→Error), normalización de velocidades de succión Tuya (`quiet/eco/standard/strong/turbo/max` → 0-100), routing de comandos Matter hacia servicios HA (`vacuum.start`, `vacuum.pause`, `vacuum.stop`, `vacuum.return_to_base`), y detección automática de vendor (Tuya/Roborock/iRobot/Dreame).
- **`vacuum.entity.ts`:** Nueva entidad Matterbridge que crea el endpoint RVC, sincroniza estado a clusters Matter (`OnOff`, `RvcOperationalState`, `PowerSource` batería 0-200, `FanControl` velocidad), y registra handlers para comandos de Apple Home (start/pause/stop/goHome/resume).
- **QR Picker frontend:** El selector de entidades ahora muestra `🤖 Aspiradora Robot (Matter RVC)` como opción primaria para el dominio `vacuum`, con fallback a On/Off básico.
- **30 tests Vitest:** `test/converters/vacuum.test.ts` cubre todos los estados, velocidades, comandos, extracción de atributos y detección de vendor.

### Changed
- `device-registry.ts`: Añadido `roboticVacuumCleaner` (0x0074) a `MatterDeviceTypes` y branch `vacuum` en `getDeviceTypeForEntity()`.
- `platform.ts`: Import y branch de instanciación para `VacuumEntity`.
- `converters/index.ts`: Barrel export de `vacuum.converter`.

### Notes
- Apple Home reconoce el tipo RVC nativamente desde iOS 18.4. No se requiere plugin iRobot — funciona directamente vía `vacuum.*` de HA.

## [1.0.24] - 2026-06-16
### Added
- **Matter 1.5 Camera Entity:** `CameraEntity` con soporte completo de `CameraAvStreamManagement` (cluster 0x00B0) y `WebRTCTransportProvider` (cluster 0x00B1). Integra cámaras de Home Assistant como dispositivos nativos en HomeKit con RTSP/HLS automático.
- **Matter 1.5 Closure Entity:** `ClosureEntity` unificada para `cover.*` con `ClosureControl` y `ClosureDimension` clusters. Distingue automáticamente `garage_door`, `gate`, `blind`, `shade`, `curtain` y `awning` según el `device_class` de HA.
- **Matter 1.5 Soil Sensor Entity:** `SoilEntity` para sensores de humedad/temperatura de suelo (`device_class: moisture`) con `SoilMoistureMeasurement` (cluster 0x0408).
- **Frontend UI mejorado:** Actualización mayor de `script.js` y `style.css` — mejor rendimiento, soporte para nuevos tipos de dispositivos en la UI, y correcciones de estabilidad.
- **Platform mejorado:** Refactorización de `platform.ts` para routing automático a `CameraEntity`, `ClosureEntity` y `SoilEntity` basado en dominio y `device_class`.
- **Light Converter mejorado:** Soporte mejorado para `extendedColorLight` con atributos de color RGB/XY desde HA.
- **Base Entity mejorada:** Mayor resiliencia en `createEndpoint()` con manejo de errores por cluster y logging detallado de Matter.

### Changed
- Versión bumped a `1.0.24` en `package.json` y metadata de Matterbridge.
- `device-registry.ts` ahora identifica correctamente `closure` vs `windowCovering` según `device_class`.
- `homekit.compat.ts` documentado con compatibilidad HomeKit 2026 para Matter 1.5.

## [1.0.23] - 2026-06-16
### Fixed
- **QR Code (Bug crítico):** El endpoint `/api/bridge` no existe en Matterbridge. Ahora el backend intenta `/api/plugins` (endpoint real de Matterbridge), luego `/api/settings`, y finalmente lee el archivo `/root/.matterbridge/matterbridge.json` directamente del disco como último recurso. Esto garantiza que el código QR siempre esté disponible.
- **Nombres duplicados:** El error "Device with name X is already registered" se producía cuando varios dispositivos de la misma área tenían nombres truncados idénticos a 32 caracteres. Ahora se añade un sufijo único basado en el `entity_id` para garantizar unicidad en Matterbridge.

## [1.0.9] - 2026-06-16
### Fixed
- Fixed Matterbridge 3.9 plugin rejection caused by `matterbridge` being listed in `devDependencies`. The plugin manager now accepts the custom UI plugin and starts the web server on port 8283 properly.

## [1.0.8] - 2026-06-16
### Fixed
- Fixed Matterbridge 3.9.0 startup error where it rejected the plugin due to the presence of `@matter/main` in dependencies.


## [1.0.7] - 2026-06-16
### Fixed
- Fixed Docker build error (`npm ci` fail) by switching to `npm install` inside the Docker image to handle missing `package-lock.json` synchronizations during add-on build.

## [1.0.6] - 2026-06-16
### Changed
- UI Limpia: Eliminada la pestaña de "Ajustes" y toda la información técnica innecesaria del panel. Los controles avanzados (Reiniciar, Restablecer) ahora están en un modal discreto en la pestaña Puente.
- Toggle de Exportación: Añadido un interruptor (toggle) en cada tarjeta de dispositivo para habilitar o deshabilitar su exportación a Matter individualmente.
- Filtro estricto: El puente ahora filtra automáticamente dominios no soportados y sensores de sistema/energía para mantener la red limpia.
- Modal de Dispositivo: Reorganizado para mostrar el nombre del dispositivo encima de su código de vinculación.
- Soporte para Persistencia de Overrides: El backend ahora guarda y carga las preferencias de exportación y tipo Matter en un archivo local para que se mantengan tras los reinicios.

## [1.0.5] - 2026-06-16
### Changed
- Completely rebuilt UI: nueva interfaz en español con diseño Liquid Glass premium (sidebar, tarjetas de dispositivos, y fondo con orbes animados).
- Los dispositivos se muestran como tarjetas clickeables. Al hacer clic en un dispositivo se abre un panel de detalles con:
  - Selector de tipo HomeKit 2026 con descripción de cada categoría compatible.
  - Código QR y código manual de vinculación del puente.
  - Información completa de la entidad (dominio, tipo Matter, estado HA).
- Nuevo endpoint API `/api/custom/device-override` para persistir overrides de tipo Matter por entidad.
- Eliminadas todas las referencias a instalación de plugins (el puente ya los incorpora internamente).
- Optimizado Dockerfile: separación de capas para mayor velocidad de actualización en Home Assistant.

## [1.0.4] - 2026-06-16
### Added
- Replaced the default cockpit/dashboard with a premium, fully local, custom Spanish "Liquid Glass" (glassmorphism) Web UI on port 8283.
- Completely zero-config: automatic environment detection for local Home Assistant host and Supervisor token.
- Clean layout: display only critical bridge details, dynamic bridged devices list, and action tools (Restart/Factory Reset).

## [1.0.3] - 2026-06-16
### Fixed
- Restored original add-on directory structure to allow standard updates in Home Assistant.

## [1.0.2] - 2026-06-16
### Changed
- Cleaned up legacy repository branding and references.
- Consolidated version specifications across package configurations.

## [1.0.1] - 2026-06-16
### Added
- Home Assistant Add-on Ingress support for sidebar integration.
- Bypassed manual setup by implementing zero-config auto-discovery.

## [1.0.0] - 2026-06-16
### Added
- Initial release of Matter 1.5 Bridge for Home Assistant (matter-all-in-one-chrisalvir).
- Native support for Apple HomeKit 2025/2026 specifications.
- Unified Closure support (cover.* -> garage doors, blinds, curtains, gates, shades, awnings).
- Video camera streaming management and RTSP/WebRTC support.
- Soil moisture and temperature sensor mapping.
- Automatic Supervisor API token and WebSocket host detection.

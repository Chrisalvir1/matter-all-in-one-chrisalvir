# Changelog

All notable changes to this project will be documented in this file.

## [1.2.11] - 2026-06-21

### Fixed
- **Endpoint de luz compuesto en Apple Home:** Se corrigió el bug crítico donde los clusters del child endpoint de luz (`LevelControl`, `ColorControl`) se añadían *después* de crear el endpoint en lugar de *durante* su creación con `addChildDeviceTypeWithClusterServer()`. Apple Home y Google Home leen el Descriptor cluster en el momento de la comisión; clusters añadidos post-creación no eran visibles, por eso solo el ventilador aparecía en Apple Home.
- **Temperatura de color bidireccional:** El handler `moveToColorTemperature` ahora envía `color_temp_kelvin` a HA cuando el dispositivo lo soporta, y `color_temp` (mireds) como fallback. La sincronización de estado también convierte correctamente entre ambas unidades.
- **Soporte RGB/HS en dispositivos compuestos:** Añadido handler `moveToHueAndSaturation` para luces Extended Color. El estado HS ahora se sincroniza bidireccionalmente con los atributos `hs_color` de HA.
- **Logging diagnóstico enriquecido:** `getCompositeCandidate` ahora emite logs de debug para cada punto de retorno temprano (sin device_id, agrupación desactivada, sin miembro fan.*, menos de 2 miembros). `createEndpoint` emite un registro detallado de capacidades de la luz detectadas (modos, clusters, rango de temperatura).

### Changed
- **Separación de responsabilidades:** Se reestructuró `composite-device.entity.ts` separando la inicialización de clusters (`addRootClusters`, `computeClusterIds`) del registro de handlers de comandos (`addCommandHandlers`). Los endpoints hijos reciben sus clusters en la llamada de creación, no en una llamada posterior.

## [1.2.10] - 2026-06-21


### Added
- **Dispositivos compuestos por `device_id`:** modo opt-in `group_by_device_id` para publicar un Fan con Light/Switch/Sensor relacionados como endpoints de un solo nodo Matter, con un QR compartido.
- **Selección de capacidades reales de luces:** On/Off, Dimmable, Color Temperature y Extended Color se eligen a partir de las capacidades reportadas por Home Assistant.

### Changed
- **Activación compuesta por defecto:** Fan + Light/Switch/Sensor que comparten `device_id` usan un solo interruptor de publicación en el panel y un único QR Matter. Las filas secundarias se muestran como **Integrada** antes y después de activar. Use `group_by_device_id: false` para recuperar el comportamiento por entidad.

## [1.2.8] - 2026-06-21

### Fixed
- **QR de accesorios registrados dinámicamente:** el `ServerNode` ahora se inicia de forma explícita después de registrarlo. Antes, un nodo recreado desde el panel podía mostrar un QR válido pero no publicar `_matterc._udp`, provocando “Accessory Not Found” en Apple Home.

## [1.2.7] - 2026-06-21

### Fixed
- **Fabric Matter residual por accesorio:** se añade el restablecimiento individual de un nodo Matter. Borra únicamente los fabrics de ese accesorio y vuelve a abrir su comisión, sin afectar otros dispositivos exportados.
- **Estado de emparejamiento en tiempo real:** el panel actualiza automáticamente cada cuatro segundos el estado de comisión y el nombre de la casa/fabric, sin recargar la página.

## [1.2.6] - 2026-06-21

### Fixed
- **Estado de carga RVC:** una señal física de base/carga (`status`, `activity` o `raw_dps` de la integración) ahora prevalece sobre un estado HA obsoleto `cleaning`. El RVC publica `Charging`, `Idle` y la carga de batería correcta en Apple Home.

## [1.2.5] - 2026-06-21

### Fixed
- **RVC Matter nativo para Apple Home:** `vacuum.*` continúa exponiéndose exclusivamente como `RoboticVacuumCleaner` (`0x0074`) en un nodo independiente `mode: 'server'`; se eliminó cualquier alternativa de degradarlo a interruptor.
- **Nombres de Home Assistant preservados:** se eliminaron los sufijos internos añadidos a los nombres visibles de accesorios. La identidad Matter sigue siendo estable mediante `entity_id`, número de serie y `uniqueId`, sin alterar el `friendly_name` de HA.
- **Factory reset real:** la restauración de fábrica borra también `/data/.matterbridge`, incluidos fabrics y estado de comisión. Esto evita que un intento de comisión revertido reutilice una identidad Matter que parecía ya emparejada.
- **Documentación técnica actualizada:** se documentan la topología RVC requerida por Apple Home, las restricciones de identidad y el procedimiento de recuperación para futuras contribuciones e IAs.

### Changed
- **Perfil RVC:** el panel declara el perfil `RoboticVacuumCleaner` como compatible con Apple Home y muestra que ofrece controles RVC nativos.

## [1.2.4] - 2026-06-21

### Fixed
- **Aspiradora sin código QR (root cause encontrado y corregido):** El aspirador se registraba como endpoint `bridgeado` (sin QR propio) porque en `vacuum.entity.ts` el tercer argumento del constructor `RoboticVacuumCleaner(name, serial, mode, ...)` se pasaba como `undefined` en lugar de `'server'`. La API de Matterbridge (`registerDevice`) verifica `device.mode === undefined` y, si el bridge está en modo `bridge`, convierte automáticamente el endpoint en un endpoint bridgeado añadiéndole `bridgedDeviceBasicInformation`. Al pasar `'server'` explícitamente, el aspirador ahora genera su propio ServerNode Matter con QR y código manual de emparejamiento únicos.
- **Comentario incorrecto en `base.entity.ts` corregido:** El comentario decía "Este es un endpoint bridgeado" cuando en realidad el endpoint usa `mode: 'server'`. Actualizado para evitar confusión futura.

## [1.2.3] - 2026-06-21


### Fixed
- **Error crítico al desactivar dispositivo:** Eliminadas las llamadas a `this.matterbridge.stopServerNode()` y `this.matterbridge.startServerNode()` que no existen en la API real de `MatterbridgePlatform` y causaban `TypeError: this.matterbridge.stopServerNode is not a function` al intentar desactivar un accesorio. El ciclo de vida completo del nodo Matter (arranque y parada) es manejado internamente por los métodos heredados `registerDevice()` y `unregisterDevice()`.
- **Nombre de la casa conectada visible:** El panel ahora muestra junto al nombre del dispositivo activo la casa o controlador Matter al que está emparejado (por ejemplo `🏠 Casa de Chris`) extraído del `label` del fabric de commissioning.
- **Botón de código QR siempre visible:** El botón "Mostrar Código de Emparejamiento" ahora aparece para todos los accesorios exportados (no solo cuando hay `pairingCode` precargado). Si el código aún se está generando, el panel hace polling automático cada 2 segundos hasta obtenerlo.
- **Estado de emparejamiento mejorado:** La descripción del dispositivo y el estado inferior distinguen claramente entre "pendiente de emparejar" y "ya emparejado · [nombre de la casa]".
- **Conteo de dispositivos corregido:** El contador superior ahora muestra la cantidad correcta de dispositivos físicos (agrupados por `device_id`) y cuántos están activos en Matter.

## [1.2.2] - 2026-06-21

### Fixed
- **Arranque Dinámico de Servidores Matter:** Se implementó el inicio explícito (`startServerNode`) del nodo del dispositivo cuando se registra una entidad dinámicamente desde el panel UI. Esto fuerza la generación inmediata de los códigos de emparejamiento QR/manual y activa la difusión mDNS en su respectivo puerto.
- **Detención Dinámica de Servidores:** Se agregó el apagado explícito (`stopServerNode`) del nodo del dispositivo al des-registrar una entidad desde el panel, liberando los puertos asignados y evitando fugas de memoria o publicidad mDNS huérfana.

## [1.2.1] - 2026-06-21

### Fixed
- **Extracción de Códigos QR de Servidores Matter:** Corregido el mapeo en el endpoint de la API `/api/custom/devices` para extraer correctamente los códigos de emparejamiento QR y manual y el estado de comisión desde la estructura interna de `serverNode.state.commissioning.pairingCodes` de Matterbridge. Esto soluciona el problema de los códigos QR que aparecían en blanco o no se mostraban.
- **Clarificación de Interfaz:** Removidas todas las referencias legacy que hablaban de "bridge Matter" en la interfaz de usuario, actualizando los textos para reflejar con precisión el modo de accesorios independientes.

## [1.2.0] - 2026-06-21

### Added
- **Plan B Completado (Código QR único por dispositivo):** Arquitectura migrada de Modo Bridge a Modo Servidor Independiente. Cada entidad exportada (como aspiradoras, luces, etc.) ahora tiene un servidor Matter propio, generando un Código QR único por dispositivo.
- **Integración de QR Nativo:** El código QR se dibuja directamente dentro del panel Liquid Glass con `qrcode.min.js`, eliminando la redirección al portal nativo de Matterbridge (puerto 8284).

### Changed
- Modificado `MatterbridgeEndpoint` a `mode: 'server'` en `base.entity.ts`.
- La API `/api/custom/devices` extrae el `qrPairingCode` y estado de `commissioned` de los endpoints dinámicamente.

### Removed
- Toda la lógica y botones antiguos que redirigían a la interfaz global del bridge han sido eliminados por completo del frontend para mantener al usuario en el nuevo panel.

## [1.1.67] - 2026-06-21

### Added

- **Perfil Matter por entidad principal:** el panel permite elegir únicamente tipos de dispositivo que existen en Matterbridge oficial. Incluye `RoboticVacuumCleaner` para aspiradoras y `BasicVideoPlayer` para reproductores/TV, además de perfiles compatibles de luz, enchufe, persiana, cerradura y termostato.
- **Compatibilidad Apple Home visible:** cada perfil declara si está en la lista actual de categorías Matter de Apple Home, si es un tipo Matter oficial sin categoría Apple Home declarada, o si Apple Home no lo reconoce actualmente. Así no se promete compatibilidad inexistente para RVC o TV.
- **Acceso al código de comisión real:** el panel ofrece el acceso al frontend nativo de Matterbridge, que es la única fuente del QR y código manual reales del bridge.

### Changed

- **Dispositivos compuestos:** una entidad `button.*` que pertenece al mismo dispositivo de Home Assistant que una entidad principal (por ejemplo una aspiradora) se clasifica como acción auxiliar y ya no puede exportarse como accesorio Matter independiente.
- **Identidad RVC estable:** se eliminaron sufijos de versión y marcas/modelos fingidos del endpoint de aspiradora. El identificador Matter ahora deriva de forma estable del `entity_id`, evitando duplicados u objetos huérfanos en controladores.

### Migration

- Tras actualizar desde versiones que creaban accesorios RVC individuales, elimina las fichas antiguas y vuelve a emparejar el bridge si el controlador mantiene su caché. El QR es único para el bridge, no para cada entidad.

## [1.1.66] - 2026-06-21

### Changed

- **Arquitectura Matter estable:** el plugin opera ahora como `MatterbridgeDynamicPlatform` con un único bridge Matter. Las entidades seleccionadas se publican como endpoints bridged; ya no se crea un `ServerNode`, almacenamiento ni anuncio mDNS por entidad.
- **Exportación bajo demanda:** los endpoints Matter se crean únicamente al activar una entidad en el panel y se eliminan al desactivarla.
- **Conexión Home Assistant:** el cliente WebSocket ahora usa un dispatcher único de solicitudes, limpia peticiones pendientes, filtra la suscripción a `state_changed`, reintenta indefinidamente con backoff y coalesce ráfagas de cambios de estado.
- **Modo de arranque:** se migra el valor inválido `bridgeMode: dynamic` a `bridge` y el add-on inicia explícitamente con `matterbridge --bridge`.
- **Dependencias:** Matterbridge actualizado de `3.9.0` a la versión oficial `3.9.1`; se eliminó la dependencia directa duplicada de `@matter/nodejs`.
- **Panel web:** reemplazado el panel inconsistente de QR individuales, logs y controles heredados por un panel responsivo de selección de entidades, estado del bridge, búsqueda y mantenimiento seguro.

### Fixed

- Corregido el error de sintaxis que impedía ejecutar el JavaScript de la interfaz.
- Eliminado el acceso a rutas privadas del singleton de Matterbridge para obtener códigos de comisión.
- Corregidos metadatos de versión del add-on y del manifiesto Matterbridge.

### Migration

- Esta versión cambia la topología Matter. Haz copia de `/data/.matterbridge`, elimina los accesorios individuales de la versión anterior y vuelve a emparejar **una vez** el bridge. Consulta `docs/production-migration.md`.

## [1.1.24] - 2026-06-18
### Added
- **Logs de depuración adicionales:** Se inyectaron logs para imprimir las propiedades del endpoint justo antes de su registro, ayudando a diagnosticar por qué no se inicia el servidor Matter individual.

## [1.1.23] - 2026-06-18
### Fixed
- **Generación de códigos QR / Servidores de accesorios independientes:** 
  - Se configuró el modo de los endpoints explícitamente a `'server'` y se completaron todas las propiedades requeridas por Matterbridge (`deviceType`, `deviceName`, `serialNumber`, `uniqueId`, `vendorId`, `vendorName`, `productId`, `productName`). Esto fuerza a Matterbridge a inicializar un `ServerNode` independiente por cada accesorio, posibilitando la generación real de su QR único.
  - Se corrigió la lectura del estado de vinculación y fabrics del dispositivo apuntando a `serverNode.state.commissioning` (donde reside en la versión actual de Matterbridge).
  - Se corrigió la propiedad `domain` faltante en el payload JSON de la API `/api/custom/devices`, resolviendo el bug que deshabilitaba los selectores de tipos en el frontend ("Tipo no configurable...").
- **Acción para Desconectar Dispositivo ("Eliminar de esta casa"):**
  - Se implementó un nuevo endpoint en el backend `/api/custom/decommission/:entityId` que cierra, borra (decomisiona fabrics) y reinicia el servidor de accesorios individual.
  - Se añadió en la interfaz web un botón rojo de **"❌ Desconectar de la casa"** dentro del modal que aparece únicamente cuando el accesorio está emparejado.

## [1.1.22] - 2026-06-18
### Fixed
- **Inicialización de Aspiradora (RVC):** Se corrigió la excepción `TypeError: this.endpoint.addClusterServer is not a function` en la entidad `VacuumEntity` migrando al API correcto de Matterbridge v3.9+ (`this.endpoint.behaviors.require()`).
- **Apertura de modal en el Frontend:** Se añadió una validación de seguridad en `script.js` al asignar el nombre al label del QR (`emQrLabel`), evitando errores por selectores inexistentes que bloqueaban el despliegue del modal de configuración.

## [1.1.21] - 2026-06-18
### Fixed
- **Advertencias de Estado Inactivo (`inactive state`):** 
  - Se corrigió el flujo de sincronización inicial difiriendo `syncInitialState()` para ejecutarse solo después de que el dispositivo ha sido registrado y activado en Matterbridge.
  - Se optimizó `clampLevel` para evitar llamadas a `getAttribute` durante la sincronización inicial.
  - Se restringió el flujo de actualización de estados de Home Assistant (`handleEntityStateChange`) para sincronizar únicamente los dispositivos que están activamente exportados, eliminando por completo las advertencias y errores de consola sobre endpoints inactivos para entidades no exportadas.

## [1.1.20] - 2026-06-18
### Fixed
- **Visibilidad del Icono de Engranaje (⚙️):** Se corrigió un problema por el cual el botón de configuración (engranaje) no se mostraba para dispositivos sin tipos personalizados de HomeKit en el panel (como las aspiradoras). Ahora el botón se muestra siempre permitiendo ver el código QR y manual de Matter individual.

## [1.1.10] - 2026-06-18
### Fixed
- **Actualización de Estados en Apple Home/Google Home:** Se implementó `safeUpdateAttribute` (que llama a `updateAttribute`) en lugar de `safeSetAttribute` para notificar en tiempo real los cambios a los fabrics suscritos.
- **Advertencias de Estado Inactivo (`setStateOf ... locked`):** Se ajustó el flujo de registro en `registerHAEntity()` para sincronizar el estado inicial *antes* de registrar el dispositivo, garantizando que `setAttribute` se use de forma segura cuando el endpoint está inactivo.
- **Estabilidad del Lifecycle de Home Assistant:** Se removió la inicialización duplicada de la instancia de `HomeAssistant` en el constructor de `HomeAssistantPlatform`, inicializándola y vinculando sus listeners una sola vez en `onStart()`.
- **Filtro de Entidades No Disponibles:** Se omiten las entidades con estado `unavailable` o `unknown` durante el descubrimiento.
- **Comportamiento del Factory Reset:** Se limitó el alcance de la restauración de fábrica para limpiar únicamente `/data/device-overrides.json` en lugar de borrar la carpeta de Matterbridge al completo.
- **Compatibilidad de ColorControl:** Se limitó la adición del cluster `ColorControl` solo a aquellas luces que especifican modos de color reales en `supported_color_modes`.
- **Evitado de Handlers Duplicados:** Se removió la sobreescritura duplicada de `createEndpoint` en `VacuumEntity` para evitar el registro repetido de command handlers.

### Changed
- **Limpieza de Código Legacy:** Eliminada la carpeta residual `/src` en la raíz del repositorio.

## [1.1.9] - 2026-06-18
### Fixed
- **Panel agrupado por dispositivos reales de Home Assistant:** La API `/api/custom/devices` ahora incluye `device_id`, `device_name`, `area_name`, fabricante, modelo y metadatos del entity registry. El frontend puede mostrar dispositivos reales y dejar sus entidades dentro de cada dispositivo.
- **QR del modal de entidad:** El modal ahora renderiza el payload QR Matter real del bridge y mantiene el código manual como texto/copiar, evitando generar un QR inválido desde el código manual.
- **Exportación de QR:** Se añadió botón para exportar el QR mostrado como PNG desde el modal.

### Changed
- **Versión del addon:** Se sube a `1.1.9` y se ajustan textos visibles a Matter `1.5.x`, porque `matterbridge@3.9.0` sigue siendo la última versión publicada estable; Matter 1.6 queda en preparación hasta que el SDK/base lo soporte explícitamente.

## [1.1.8] - 2026-06-17
### Fixed
- **Eliminación de Advertencias de Inicialización (Inactive State):** Se movió la sincronización de estado inicial de los dispositivos a una fase posterior a su registro (`registerDevice`) en Matterbridge. Esto elimina las advertencias del tipo `is in the inactive state` al obtener/establecer atributos en el arranque, ya que las operaciones se ejecutan cuando los endpoints están completamente activos.

## [1.1.7] - 2026-06-17
### Added
- **Proxy de Inicio de Ingress (Eliminación de error 502):** Se implementó un servidor proxy en el puerto `8283` (el puerto de Ingress) que se inicia de forma inmediata cuando arranca el contenedor.
- **Pantalla de Carga Premium:** Si la interfaz del plugin aún no está lista (debido al tiempo de inicialización de Matterbridge), el proxy sirve una pantalla de carga glassmorphic en español ("Iniciando Matter Bridge...") con auto-recarga automática cada 2 segundos.
- **Cambio de Puerto de Interfaz:** Se movió el servidor HTTP del plugin en `src/platform.ts` al puerto interno `8285` (escuchando únicamente en `127.0.0.1`), al cual el proxy redirige el tráfico transparentemente una vez que está en línea.

## [1.1.6] - 2026-06-17
### Fixed
- **Plugin peerDependencies Check (Bug Crítico):** Se amplió la limpieza dinámica en el `Dockerfile` usando `jq` para remover también `peerDependencies.matterbridge` de `package.json` en producción. Esto resuelve el bloqueo restante de Matterbridge 3.9.0 (error `package.json not found` debido a la presencia de `matterbridge` en `peerDependencies`), permitiendo que el plugin se registre y se inicie correctamente la interfaz Liquid Glass.

## [1.1.5] - 2026-06-17
### Fixed
- **Plugin devDependencies Check (Bug Crítico):** Se implementó una solución en el `Dockerfile` para remover dinámicamente el paquete `matterbridge` de los bloques `dependencies` y `devDependencies` de `package.json` a nivel de contenedor usando `jq`. Esto resuelve el rechazo del plugin por parte de Matterbridge 3.9.0 (error `package.json not found` por tener la clave en `devDependencies`) y permite que se registre con éxito e inicie el servidor de interfaz local en el puerto `8283`.

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

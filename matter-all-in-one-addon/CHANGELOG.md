## [1.2.60] - 2026-07-24

### Fixed

- **Reconexión estable sin carreras:** Se elimina la llamada redundante a `startReconnect()` dentro del callback de `connectionTimeout`. Cuando `socket.terminate()` es invocado, Node.js siempre emite el evento `close` que dispara `onClose()` → `startReconnect()`. La llamada duplicada podía avanzar el contador `reconnectRetry` dos veces y generar mensajes de log redundantes de reconexión. Ahora hay un único punto de entrada garantizado.
- **Filtro de ruido en logs de entidades no exportadas:** Los eventos `unavailable`/`unknown` de entidades de Home Assistant que **no están exportadas como dispositivos Matter** (p. ej. `media_player.samsung_*`, sensores de alarma, cerrojos de baño, etc.) se registran ahora a nivel `debug` en lugar de `warn`/`notice`. Estas entidades no tienen ningún impacto en los accesorios Matter y sus ciclos de disponibilidad/recuperación no deben contaminar el log principal.
- **Actualización de Matterbridge a 3.10.2:** Se actualiza matterbridge de `3.10.0` a `3.10.2` en Dockerfile, `devDependencies` y `peerDependencies`. La nueva versión incluye:
  - `@matter/main` actualizado a `v0.17.6`.
  - Soporte ampliado de `Closure` devices: `countdownTime`, `mainState`, `currentErrorList`, `overallCurrentState`, `overallTargetState`, `latchControlModes` y `addPanel()` con `tagList`.
  - Fix del shadowing de `ClosureTag` export.
  - Fix de detección de plugins locales en el frontend (omite comprobación de versión disponible).
  - Frontend actualizado a `v3.5.4` con `@rjsf v6.7.0` y `vite v8.1.5`.
- **Versión del plugin sincronizada:** El campo `matterbridge.version` en `package.json` se actualiza de `1.2.52` a `1.2.60` para que Matterbridge muestre la versión correcta del plugin en su interfaz de gestión.

## [1.2.59] - 2026-07-23

### Fixed

- **Relleno de versión interna** — Sin cambios funcionales; bump para mantener consistencia de numeración entre `config.yaml` y `package.json`.

## [1.2.58] - 2026-07-23

### Fixed

- **Actualización de identidad visual en el panel:** Se actualiza el encabezado del panel lateral superior a `MATTER 1.6 BRIDGE` y el título principal a `Matter All In One Chrisalvir`, eliminando el texto genérico *Home Assistant*.

## [1.2.57] - 2026-07-23

### Fixed

- **Actualización de identidad visual en el panel:** Se actualiza el encabezado del panel lateral superior a `MATTER 1.6 BRIDGE` y el título principal a `Matter All In One Chrisalvir`, eliminando el texto genérico *Home Assistant*.

## [1.2.56] - 2026-07-23

### Fixed

- **Contador de pendientes en tiempo real:** Se agrega el indicador numérico dinámico (`badge`) al botón de filtro *Por emparejar*. Cuando un accesorio Matter es desemparejado o está publicado pero aún no se escanea en Apple Home / Google Home, el contador *Emparejados* disminuye inmediatamente y el badge *Por emparejar* se incrementa en tiempo real.
- **Filtro activo de emparejamiento:** Al pulsar el filtro *Por emparejar*, la lista se filtra para mostrar únicamente los dispositivos que contienen accesorios Matter pendientes de escanear y emparejar.

## [1.2.55] - 2026-07-23

### Fixed

- **Conteo exacto de accesorios emparejados:** El indicador *Emparejados* en la barra de estadísticas del panel superior ahora calcula el total de nodos Matter accesorios independientes emparejados (basado en `matterNodeKey`) en lugar de contar únicamente los grupos de tarjetas de dispositivos físicos de HA. Esto resuelve la inconsistencia donde dispositivos con múltiples canales independientes (apagadores/enchufes dobles o triples) solo sumaban 1 al contador de emparejados.
- **Filtro de accesorios pendientes:** El filtro *Por emparejar* muestra ahora cualquier tarjeta que contenga al menos un accesorio Matter exportado pendiente de emparejar.

## [1.2.54] - 2026-07-23

### Fixed

- **Modelo (Marca + Modelo Real) en HomeKit:** El campo *Model* en Apple Home muestra ahora la combinación de la Marca y Modelo real del dispositivo (p. ej. `Tuya CB03-SBL`, `Shelly SHSW-25`), mientras que *Manufacturer* se mantiene consistentemente como `Matter All-in-One Chrisalvir`.
- **QR independiente por canal en apagadores dobles/triples y enchufes dobles:** Los dispositivos físicos de HA con 2 o más entidades `switch.*` o `light.*` bajo el mismo `device_id` ahora publican cada canal como un accesorio Matter independiente con su propio código QR y proceso de emparejamiento. Se elimina el agrupamiento erróneo que impedía generar un segundo QR cuando ya había uno activo.
- **Filtrado de entidades DPS genéricas:** Las entidades cuyo `friendly_name` empieza con `"DPS"` o cuyo `original_name` contiene `"DPS"` se ocultan del panel de control. Estas son entidades de datapoint genérico de Tuya que no tienen nombre significativo y no se pueden publicar en Matter. Si el usuario les cambia el nombre en HA, vuelven a aparecer automáticamente.

## [1.2.53] - 2026-07-23

### Fixed

- **Panel de selección:** rediseño completo del panel derecho del modal. La tabla de metadatos ahora usa una cuadrícula de dos columnas con corte por `text-overflow` que evita el desbordamiento de IDs y nombres largos.
- **Botones de acción Matter:** los botones `Actualizar estado Matter` y `Desconectar y generar código nuevo` permiten ahora que el texto se ajuste en dos líneas, eliminando el texto recortado en pantallas pequeñas.
- **Badge de casa:** el `home-badge` tiene `max-width` para no desbordarse cuando el nombre de la casa es muy largo.
- **Selectore de perfil:** se añade `appearance: none` para uniformidad visual en todos los sistemas operativos.
- **QR y código manual:** el contenedor del QR y el código manual toman estilos desde CSS en lugar de atributos `style` inline, garantizando coherencia visual.
- **Responsividad del modal:** se amplía la columna del panel lateral de 260 px a 290 px para acomodar mejor el contenido del panel en pantallas de escritorio.

## [1.2.52] - 2026-07-22

- **Estado de emparejamiento en tiempo real:** Operational Credentials es ahora la fuente de verdad del fabric Matter. Tras retirar un accesorio de HomeKit, el panel deja de mostrarlo como emparejado cuando HomeKit ha eliminado su último fabric.
- **Protección contra estado obsoleto:** un registro heredado de commissioning ya no puede conservar un falso estado de emparejamiento después de `RemoveFabric`.
- **Diagnóstico de causa:** el registro distingue fallos de conectividad con Home Assistant/red, entidades `unavailable` o eliminadas de HA, y cambios reales del número de fabrics Matter. No atribuye una retirada a una acción manual si Matter no proporciona esa evidencia.
- **Controladores y casas Matter:** el detalle del accesorio muestra cada fabric, su etiqueta de casa, VID y el ecosistema identificado por el VID (Apple Home, Alexa, Google Home o SmartThings). Los VIDs no reconocidos se conservan como controladores Matter desconocidos.
- **Identidad Matter:** Manufacturer se publica como `Matter All-in-One Chrisalvir`; Serial Number usa el `serial_number` físico del registro de dispositivos de Home Assistant, con un identificador estable de respaldo solo cuando HA no ofrece serial.

## [1.2.51] - 2026-07-22

### Fixed

- **Luces de color directas:** las entidades `light.*` RGB/HS/XY ya publican `ExtendedColorLight` con `ColorControl` y sincronizan tono, saturación, XY y temperatura de color en ambos sentidos con Home Assistant.
- **Govee RGBIC:** el color general, brillo y temperatura disponibles se exportan correctamente sin representar de forma falsa los segmentos, escenas o efectos propietarios como controles Matter estándar.
- **Publicación:** la imagen GHCR toma su etiqueta de `config.yaml`, evitando que una versión futura sobrescriba por error la imagen `1.2.50`.

## [1.2.50] - 2026-07-22

### Fixed

- **Recuperación total:** los nodos Matter directos y compuestos reutilizados reconstruyen sus endpoints, comandos y estado inicial tras una caída de Home Assistant.
- **WebSocket:** se cierran conexiones a medio abrir, se descartan sockets obsoletos y se reintentan snapshots incompletos con espera exponencial.
- **Estado:** las actualizaciones Matter se serializan, los snapshots de HA se reemplazan atómicamente y un `unavailable` conserva el último valor válido.
- **Docker y red:** construcción multi-stage reproducible, Node 24 LTS sobre Alpine 3.24, mDNS en todas las interfaces y dual-stack IPv4/IPv6 por defecto.
- **Actualizaciones rápidas:** Home Assistant descarga una imagen GHCR precompilada para `amd64` y `aarch64` en vez de reinstalar y compilar todas las dependencias localmente.
- **Toolchain:** Vitest y su cobertura suben a 3.2.7, y Prettier a 3.9.6; se conservan Node 24 y Matterbridge 3.10.0 para evitar cambios mayores innecesarios.
- **Seguridad:** el panel sólo acepta Ingress de Supervisor o loopback, las mutaciones usan un token interno y el add-on ya no solicita rol de administrador.

## [1.2.49]

### Fixed

- **Ventiladores con luz:** las luces de blanco cálido/frío ahora conservan el perfil `ColorTemperatureLight` aunque Home Assistant omita el valor de temperatura actual al estar apagadas; se usan también el modo y el rango Kelvin anunciados por el dispositivo.
- **Reconstrucción Matter:** “Desconectar Matter” reconstruye el árbol de endpoints con las capacidades actuales tras borrar los fabrics, permitiendo que accesorios publicados anteriormente como on/off expongan `ColorControl` al emparejarse de nuevo.
- **Estabilidad de UI:** la lectura de estado de un nodo Matter a medio desmontar ya no puede romper toda la respuesta de dispositivos ni dejar la interfaz cargando.

## 1.2.47

### Fixed

- **Node Reusability:** Corregida la restauración de accesorios Matter ya emparejados. Tras una desconexión transitoria de Home Assistant, el sistema ahora detecta y reutiliza los nodos de servidor preexistentes conservados en memoria por Matterbridge, evitando errores de duplicidad ("Device with name is already registered") y manteniendo el estado legítimo de emparejamiento.

## 1.2.46

### Fixed

- **Composite Device Restore:** Solucionada la restauración de dispositivos Matter compuestos. Si Matterbridge falla al recrear el nodo compuesto general, el sistema ahora conserva y restaura automáticamente el endpoint principal emparejado preexistente.
- **State Migration:** Se implementó la migración automática de registros persistidos para asegurar que un dispositivo compuesto fallido transfiera su estado al endpoint principal para prevenir fallas repetitivas en cada inicio.
- **UI Device Counting:** El filtro de "Por emparejar" y el contador de "Emparejados" en la interfaz ahora se evalúan correctamente por dispositivo físico y no de manera subdividida por canales o endpoints internos.

## 1.2.45

### Fixed

- **Runtime Dependency Regression:** Removida la importación inválida de `@matter/protocol` que causaba que el plugin colapsara durante el inicio (startup) en el entorno de producción de Home Assistant (Matterbridge). La lógica de lectura de *fabrics* ahora utiliza exclusivamente los snapshots nativos en su lugar.

## 1.2.44

### Fixed

- **Live Pairing Count:** El contador de emparejados (paired) y la condición de "commissioned" ahora se extraen fidedignamente del `FabricManager` del protocolo, previniendo estados cacheados o inconsistentes (commissioned: false) al tener *fabrics* activos.
- **Entity Logs Panel:** El panel de diagnóstico por accesorio ahora carga y muestra de manera consistente los eventos y logs del sistema asociados exclusivamente al dispositivo, previniendo fallos donde la interfaz omitía los errores recientes en nodos estables.

## 1.2.43

### Fixed

- **UI Matter:** Corregida la interfaz visual para no duplicar accesorios compuestos, mejorando la lectura del estado de emparejamiento (commissioning) y agrupando correctamente bajo el mismo nodo (`compositeDeviceId`).
- **Diagnósticos y Recuperación:** Añadidas acciones de recuperación por accesorio en el panel (actualizar estado, desconectar, regenerar código) y visualización permanente de diagnósticos específicos por entidad para todos los dispositivos sanos.

## 1.2.42

### Added

- **NPM Package Metadata:** Añadidos los enlaces de repositorio, bugs y homepage al paquete para mejorar su visibilidad en el registro NPM.
- **Trusted Publishing:** Migrada la publicación automatizada de GitHub Actions a OIDC Trusted Publishing, eliminando la dependencia de tokens (NPM_TOKEN) y habilitando *provenance* nativo.

## 1.2.41

### Fixed

- **CI/CD Build Pipeline:** Eliminados los paquetes de ESLint incompatibles con TypeScript 7.0.2 que provocaban errores de compilación y publicación en GitHub Actions.
- **NPM Config Warnings:** Resuelto el warning de `npm config always-auth` que aparecía durante la instalación de dependencias en el flujo de publicación.

## 1.2.40

### Added

- **UI Liquid Glass Mejorada:**
  - Panel visual interactivo con resumen de dispositivos y métricas en tiempo real.
  - Filtros dinámicos de visualización: Todos, En Matter, Por emparejar, Sin publicar y Necesitan atención.
  - Micro-animaciones tipo resorte/rebote integradas en filtros, paneles laterales y modales.
  - Sección de diagnóstico por entidad con historial completo de errores.
- **Persistencia de Diagnósticos:** Historial de eventos guardado de forma persistente en `/data/entity-diagnostics.json`, reteniendo hasta 30 eventos por entidad.

### Changed

- **Matterbridge:** Actualizado a la versión `3.10.0`.
- **Matter SDK:** Gestión de SDK de Matter controlada por Matterbridge en su versión `0.17.5` (`@matter/main`, `@matter/node`, `@matter/nodejs`).
- **Compatibilidad Matter:** Confirmada y optimizada para el estándar Matter `1.6.0`.
- **Docker:** Imagen base actualizada con soporte para Matterbridge `3.10.0` manteniendo Node.js en su versión 24 LTS.

## 1.2.39

### Fixed

- **Pruebas Unitarias:** Corregida la suite de pruebas unitarias (Vitest). Se añadieron las definiciones faltantes de `smokeCoAlarm` y `waterLeakDetector` a los mocks de Matterbridge y se actualizó la aserción de seguridad para sensores de humo que ahora son exportados correctamente desde la versión 1.2.36.

## 1.2.38

### Fixed

- **Precisión de Luces / Dimmers:** Implementada ventana de bloqueo temporal (command lockout) de 3 segundos para comandos de brillo, temperatura de color y HS. Evita el "rebote" (jumping) de los deslizadores en HomeKit por estados intermedios y de transición enviados por Home Assistant.

## 1.2.37

### Changed

- **Mantenimiento:** Versión de mantenimiento para forzar la reconstrucción y actualización del Add-on con soporte para las optimizaciones de precisión de brillo en dispositivos dimmer.

## 1.2.36

### Added

- **Soporte de Sensores de Seguridad:** Se ha habilitado la exportación nativa a Matter para sensores de Humo, Gas, Inundación (Moisture), Monóxido de Carbono (CO), Antisabotaje (Tamper) y Seguridad (Safety). Anteriormente, la integración bloqueaba silenciosamente la exportación de estos dispositivos hacia HomeKit/Matter por restricciones de los `device_class`. Ahora se mapean como sensores de contacto, lo que asegura el envío de notificaciones y la integración 100% confiable en Apple HomeKit.

## 1.2.35

### Fixed

- **UI / Branding:** Convertida estrictamente la imagen del logotipo y el ícono al formato real PNG. Anteriormente el archivo tenía extensión `.png` pero contenía cabeceras JPEG, lo que provocaba que tanto el Add-on (en el panel Ingress) como Home Assistant Supervisor fallaran al intentar renderizarlo.

## 1.2.34

### Fixed

- **UI:** Corregido el error por el que la imagen del logotipo aparecía rota en el panel interno. El servidor web integrado ahora soporta la carga y lectura segura de archivos binarios como PNG.

## 1.2.33

### Changed

- **UI:** Reemplazada la "M" predeterminada en la barra lateral del panel web interno del Add-on por el logotipo oficial de la integración, con un tamaño ampliado para mejorar la estética.

## 1.2.32

### Added

- **HA Branding:** Añadidos archivos `logo.png` e `icon.png` en el Add-on para que Home Assistant muestre el ícono y logotipo nativamente en la UI del Supervisor y en el panel.
- **Readme:** Actualizado el archivo README.md para incluir el logotipo del repositorio.

## 1.2.31

### Changed

- **Node.js:** Downgraded to node 24 LTS (`node:24.18-alpine` and github workflows updated to `24.18.x`).
- **Matterbridge:** Maintained version `3.9.4` and Matter SDK `1.6` capabilities.

## 1.2.30

### Changed

- **Node.js:** Actualizada la imagen base a `node:26-alpine`.
- **Matterbridge:** Actualizado `matterbridge` a la versión `3.9.4` para incluir las últimas mejoras del SDK de Matter.

## 1.2.29

### Changed

- **TypeScript 7.0.2:** Actualizado a la versión oficial estable de TypeScript 7.0.2.
- **Matterbridge 3.9.3:** Actualizado `matterbridge` a `3.9.3` para incorporar las optimizaciones de memoria del Matter SDK y compatibilidad con el estándar Matter 1.6 de forma más estable.
- **Node.js:** Verificado y mantenido en la imagen base `node:24-alpine` (Active LTS) para garantizar compatibilidad con los binarios nativos del SDK.
- **@types/node:** Actualizado a `^24.13.3` para alinearse con la última versión menor de Node 24.

## 1.2.25

### Added

- **Agrupación explícita Fan + Light:** `device-groups.json` ahora puede unir entidades exactas con `include_entities` aunque Home Assistant las registre bajo `device_id` distintos. Esto permite que ventiladores como Recámara o Visitas publiquen su luz integrada igual que el de Sala cuando la integración separa `fan.*` y `light.*`.
- **Detección automática de capacidades de luz preservada:** si la entidad `light.*` reporta `brightness`, `color_temp`, `hs`, `xy` o `rgb`, el endpoint hijo se publica automáticamente como Dimmable, Color Temperature o Extended Color Light.

### Documentation

- `docs/composite-devices.md` incluye una receta de `/data/device-groups.json` para unir fan y luz separados por integración.

### Validation

- `npm run build`
- `npm test`
- `npm run lint`

## 1.2.24

### Fixed

- **Apple Home compartido muestra "Unsupported":** se corrigieron defaults y rutas backend que podían publicar tipos Matter experimentales o no listados por Apple Home, visibles especialmente para residentes compartidos que no tenían la misma caché del owner.
- **Covers:** `cover.*` ahora se exporta por defecto como `WindowCovering`; `Closure` queda únicamente como perfil experimental explícito.
- **Cluster experimental de Closure:** `ClosureEntity` ya no añade el cluster experimental cuando el dispositivo se publica como `WindowCovering`.
- **Media players:** `media_player.*` ahora usa `OnOffPlugInUnit` como fallback Apple Home-compatible por defecto, en lugar de `BasicVideoPlayer`.
- **Humidifier:** `humidifier.*` queda alineado internamente con su fallback `OnOffPlugInUnit`.
- **Moisture sensors:** sensores de humedad de suelo dejan de anunciarse como `SoilSensor` experimental y usan `HumiditySensor`.

### Changed

- **Toolchain:** actualizado a TypeScript `6.0.3`, `@types/node` `24.13.2`, `ws` `8.21.0`, Prettier `3.9.4` y `typescript-eslint` `8.62.1`.
- **TypeScript 7 RC:** probado con `typescript@7.0.1-rc`; compila y pasa tests, pero no se promueve porque `typescript-eslint` actual falla con el nuevo layout de exports del paquete TS7. El proyecto queda preparado con `rootDir` explícito para la migración.
- **Matterbridge / Matter SDK:** `matterbridge@3.9.2` sigue siendo la última versión publicada. El Matter SDK se mantiene a través de `@matterbridge/core`; no se fuerza una versión directa paralela para evitar incompatibilidades de runtime.

### Validation

- `npm run build`
- `npm test`
- `npm run lint`
- `npx -y -p @typescript/native-preview tsgo -p tsconfig.build.json`

## 1.2.23

### Fixed

- **Falla en cadena de exportación:** Se implementó aislamiento de fallos (try...catch) al inicializar dispositivos previamente exportados en el arranque. Si un dispositivo individual falla al iniciar (ej. por nombre duplicado o conflicto de Matterbridge), el proceso continúa y permite que el resto de los dispositivos, como los ventiladores, arranquen correctamente.
- **Excepción de atributos (hasAttributeServer):** Se añadió una capa de seguridad en la actualización de estado para ignorar eventos de Home Assistant si el endpoint interno no logró instanciarse correctamente durante un fallo de arranque.
- **Desvinculación de entidades atascadas:** `manualUnregister` ahora elimina el identificador del dispositivo compuesto incluso si Matterbridge no pudo arrancarlo. Esto evita que los dispositivos corruptos o conflictivos se queden "atascados" en la base de datos interna impidiendo que la UI refleje el botón de desactivación correctamente.

## 1.2.22
### Changed

- **Matter 1.6:** Actualización de branding, metadata y keywords al estándar Matter 1.6 (CSA, 17 Jun 2026). Las nuevas características del protocolo (NFC commissioning, Joint Fabric, Thermostat Suggestions) son implementadas por el controlador Matter (Apple Home, Google, Amazon) y este bridge las soporta automáticamente al usar el SDK actualizado.
- **Matterbridge 3.9.2:** Actualizado `matterbridge` de `3.9.1` → `3.9.2` (lanzado 26 Jun 2026). Drop-in patch release: correcciones de estabilidad internas, actualización de `@matterbridge/core` y dependencias. Sin breaking changes de API. Actualizado en `package.json`, `package-lock.json` y `Dockerfile`.
- **Dockerfile:** Imagen base `node:24-alpine` confirmada como LTS activo — sin cambios requeridos.
- **`homekit.compat.ts`:** Documentación actualizada para reflejar compatibilidad Matter 1.6 y contexto de las features del protocolo.
- **`repository.json`:** Nombre actualizado a "Matter 1.6 All-in-One Bridge Repository".
- Alineados `package.json`, `package-lock.json`, `config.yaml`, metadata Matterbridge y README en la versión 1.2.22.

### Notes

- **No se requiere re-pairing:** esta actualización es de dependencias y metadata; `/data/.matterbridge` y los fabrics existentes **no son afectados**.
- **Dispositivos preservados:** vacuum (RVC), cerrojo (DoorLock) y luces (OnOff/Dimmable/Color) continúan funcionando sin cambios.

## 1.2.19


### Fixed

- **SwitchBot Lock como cerradura real en Apple Home:** los dispositivos HA que comparten `device_id` y tienen `lock.*` junto con `binary_sensor.*` ahora se publican como un solo accesorio Matter con raíz `DoorLock`, un único QR y sensores integrados. Esto evita activar varios switches/sensores separados para el mismo llavín y permite que HomeKit lo reconozca como cerrojo.
- **Selección principal estable en el panel:** la interfaz prioriza la entidad principal del dispositivo compuesto, por ejemplo `lock.llavin_switchbot`, para que el usuario active el accesorio correcto.

### Changed

- Alineados `package.json`, `package-lock.json`, `config.yaml`, metadata Matterbridge y README en la versión 1.2.19.

## 1.2.16

### Fixed

- **Exposición segura de entidades:** se dejan de descubrir por defecto cámara, tarifa energética, humo/CO, presión, caudal, alarmas, calentadores de agua y botones genéricos. Estas rutas no tenían un mapeo Matter completo o podían comunicar un tipo de seguridad incorrecto.
- **Sensores de seguridad:** `smoke` y `co` ya no pueden degradarse silenciosamente a un sensor de contacto.
- **Perfil de cubierta Apple Home:** el perfil predeterminado de `cover.*` pasa a `windowCovering`; `Closure` queda como opción experimental, no como afirmación de compatibilidad Apple Home.
- **Metadatos de compatibilidad:** cámara, Closure, suelo y humidificador ya no se anuncian como compatibles con Apple Home hasta contar con implementación y pruebas interoperables.

### Stability and quality

- Añadido el proveedor de cobertura de Vitest y pruebas para conversores de binario, clima, ventilador, cerradura, tarifa y suelo.
- Corregida la accesibilidad del panel: los diálogos inactivos permanecen fuera del árbol visible y accesible.
- Eliminado material de certificados no utilizado del repositorio.
- Alineados `package.json`, `package-lock.json` y el manifiesto del add-on en la versión 1.2.16.

## 1.2.15

- Changed: El metadato `ProductName` exportado a Apple HomeKit ahora usa dinámicamente el nombre del perfil técnico Matter (ej. "DimmablePlugInUnit") en lugar de forzar siempre la categoría original ("Light"). Esto le da libertad a HomeKit para clasificar enchufes y dimmers correctamente y permitir cambiar sus íconos, en lugar de bloquearlos como bombillos amarrillos por defecto.

## 1.2.14

- Fixed: Corrección crítica en la detección de `LevelControl` para dispositivos apagados al iniciar el puente. Esto asegura que Apple Home reconozca la barra de brillo ("dimmer") en enchufes regulables, en lugar de mostrarlos como interruptores básicos sin slider.
- Fixed: Corrección en los comandos `moveToLevel` para extraer el nivel de brillo dictado por Apple Home desde la nueva estructura interna de Matterbridge (`data.request.level`), evitando enviar datos NaN a Home Assistant que causaban falta de respuesta al dimmear.

## 1.2.13

- Added: Opción de perfil "Enchufe regulable / Dimmer" (`dimmablePlugInUnit`) en la interfaz para exportar luces (ej. Desayunador) como interruptores dimmers hacia Apple HomeKit.
- Fixed: Las luces que tienen perfil de enchufe o dimmer ya no reportarán erróneamente capacidades de color (`ColorControl`) ni controles de nivel (`LevelControl`) en perfiles on/off que no los soportan nativamente, incluso si Home Assistant los reporta.

## 1.2.12

- Fix: Forzar agrupación de dispositivos composite ignorando el estado de 'group_by_device_id' en la configuración para evitar deshabilitación accidental.

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

> Estado vigente de Fase 2: [INFORME-FASE2.md](INFORME-FASE2.md). Este documento conserva el historial de Fase 1 y la auditoría inicial.

# Cámaras — migración a v2.3.0, Fase 1 y auditoría inicial de Fase 2

Fecha: 2026-10-28, America/Costa_Rica. Este informe sustituye el estado operativo del informe anterior; `../camera-two-phase-2026-10-28/INFORME-ANTERIOR-BASE-227.md` se conserva únicamente como historial.

## BASE VERSION

VALIDADO ESTÁTICAMENTE: tag remoto y local `v2.3.0`, commit `9741d81145d88f9dad6b101e294ec714e93ce354`. `package.json.version`, `package.json.matterbridge.version`, ambas versiones raíz de `package-lock.json`, `config.yaml` y primer changelog del add-on indican 2.3.0. No se modificaron metadatos de versión.

## BRANCH

VALIDADO ESTÁTICAMENTE: `codex/v230-camera-phase1-phase2`, checkout `miao-v230-camera`. HEAD sigue en el tag 2.3.0; modificaciones sin commit. La rama/check­out `codex/two-phase-reliability` permanece en `3a4d0e0` con sus cambios anteriores intactos.

## MIGRATION FROM 2.2.7 STATUS

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO EN BUILD:

1. Se verificó el tag con `git ls-remote`, se descargó y se creó la nueva rama desde él.
2. Se comparó `3a4d0e0..v2.3.0`: 18 archivos cambiados, 768 inserciones y 430 eliminaciones. Las novedades abarcan nombres HA, diagnóstico/token, métricas de asignación Omni, documentación, configuración y tests.
3. El diff anterior se limitaba a cinco archivos versionados de frontend/tests, dos archivos nuevos de helper/test y el informe. Se aplicaron únicamente esos hunks mediante `git apply --check` y `git apply`; se incorporaron los dos archivos nuevos y se archivó el informe.
4. Ningún archivo de frontend/test del parche había cambiado entre las bases. No se sobrescribieron archivos nuevos de 2.3.0 con archivos de 2.2.7.
5. Gate 0: typecheck backend/frontend, build backend/frontend y 79 archivos / 698 tests pasaron; 12.41 s de tests.

Se reutilizó mediante symlink el node_modules local anterior: la comparación de ambos lockfiles mostró cambios únicamente en las dos versiones raíz, sin cambio del grafo de dependencias. Node 24.22.1. No se ejecutó instalación ni se actualizó una dependencia.

## FILES PORTED

IMPLEMENTADO: `CameraConfigModal.tsx`, `types.ts`, `ha-camera-record.ts`, `camera-control-presentation.ts`, `style.css`, `ha-camera-record.test.ts`, `camera-control-presentation.test.ts` y copia histórica del informe. Rutas de código relativas a `matter-all-in-one-addon/`.

## FILES REWRITTEN

IMPLEMENTADO:

- `CameraConfigModal.tsx`: de 3133 líneas en el tag a un coordinador de menos de 500 líneas, con seis componentes en `src/frontend/src/components/camera/`.
- `CameraUiPairingModal.tsx`: wrapper compatible del modal común; deja de fabricar PIN/URI/resolución.
- Lista de cámaras de `CameraUiModal.tsx`: resumen y acceso al modal común; RTSP/PIN/reset dejan de poblar la lista principal.
- Helpers nuevos `camera-view.ts`, `rtsp-url.ts` y `camera-entity-control.ts`.
- Ajustes de tipos, adaptador HA, API button.press, presentación de tarjetas, estilos y tests.
- `CameraAiDetector` y cuatro puntos semánticos de `platform.ts`: import del helper de servicios, acción de control validada, MQTT genérico sin person y limpieza de timers al apagar. El diff grande de platform también incluye formato del archivo necesariamente modificado; se revisó comparándolo tras normalizar ambos contenidos con Prettier.

No se modificó código de streaming/recording/FFmpeg/HEVC, renovación RTSP, `homeAssistant.ts`, nombres contextuales ni el endpoint/token de diagnóstico 2.3.0. Sus dos archivos nuevos de tests se conservaron y se ejecutaron en la suite completa. Tampoco se modificaron package/lock/config/run.sh/Dockerfile.

## CONFLICTS FOUND

VALIDADO ESTÁTICAMENTE: ningún conflicto textual durante la migración. La revisión posterior encontró problemas semánticos preexistentes: fallback universal de sensores a motion, etiquetas de alimentación falsas, flag de luz/sirena sin acción Camera.UI, identidad Scrypted con endpoint inexistente, selector exportMode sin consumidor de motor y guardado de URL HA que podía crear un accesorio Camera.UI adicional.

## CONFLICTS RESOLVED

IMPLEMENTADO: port por hunks, tipo other, conservación de rawState/disponibilidad, servicio button.press real, retiro de acciones sin contrato y de fuentes/identidades sintetizadas. La URL de una cámara HA nativa se puede usar en el diagnóstico, pero ese modal no ejecuta la antigua ruta de guardado que creaba otro accesorio. La preferencia de transporte Scrypted sí se conserva porque el puente la consume.

## PHASE 1 STATUS

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO EN BUILD.

Se cerraron los dos ciclos del gate de Fase 1. No es una declaración de funcionamiento físico en Apple Home. El lint global conserva deuda exclusivamente anterior; el criterio ajustado por Chris exige limpiar todos los archivos modificados, no reformatear archivos ajenos.

## PHASE 1 UI CHANGES

IMPLEMENTADO:

| Área | Comportamiento |
|---|---|
| Cámara / Resumen | Nombre, fuente, modelo existente y estado del proveedor; no codec/RTSP/puertos |
| Apple Home | Live View, audio, movimiento, HKSV y pairing como CONFIGURADO, NO VERIFICADO o NO DISPONIBLE según evidencia; no deduce FUNCIONANDO de flags |
| Controles | Dominio/nombre reales, descripción propia y acción compatible; lecturas sin acción simulada |
| Rendimiento | Solo métricas recibidas, con unidad y fecha; demás No medido |
| Exportación | Resumen HAP; QR, commissioning, entidades y recuperación bajo Exportación avanzada |
| Diagnóstico avanzado | Colapsado: fuente, códecs, ffprobe, negociación, salida efectiva, HKSV, SSRC y metadata disponible |

- IA & Fauna sigue fuera de UI principal. No se añadió inferencia ML.
- Alimentar ahora se describe como control de alimentación, conservando switch o button según su dominio. No se presume equivalencia funcional entre IDs distintos. Solo se deduplica el mismo entityId.
- Light/siren/switch: turn_on/turn_off; button: press. Backend valida dominio, acción y estado HA antes de enviar. Binary sensor, sensor, event, select, number y otros no reciben toggle inventado; las lecturas se identifican como solo consulta cuando corresponde.
- Entidades unavailable, unknown, stale o sin disponibilidad conocida no ofrecen acción activa. No se transforma edad de un estado estable en stale arbitrariamente; se respeta stale explícito. HA sin estado tampoco aparece online.
- Camera.UI/Scrypted con solo estado booleano no acreditan disponibilidad: se contrasta el ID real con el inventario HA cuando existe; si no hay evidencia, se muestra desconocida.
- Sin PIN, Setup ID ni Setup URI por defecto; QR únicamente con URI del accesorio. No se ejecutó ninguna acción de pairing/commissioning/reset durante el trabajo.
- Desaparecen <200 ms, promesas de alta velocidad y afirmaciones de vídeo/HEVC/HKSV3 derivadas de ffprobe/metadata en los componentes auditados.
- Diagnóstico copiable oculta URLs, PIN, credenciales, Bearer y parámetros SRTP; cubierto por tests. La entrada manual de URL no se copia a los diagnósticos.

### PTZ y presets: contratos revisados

VALIDADO ESTÁTICAMENTE:

| Función | Código existente | Decisión UI |
|---|---|---|
| Joystick | ptz/command mueve viewport; llamadas HA físicas solo para ciertos nombres/integraciones y errores capturados | No anunciar joystick universal por hasPtz/modelo |
| Availability | flags explícitos HA o interfaces Scrypted; no confirma éxito de servicio | Metadata en diagnóstico |
| Presets nativos | manager ofrece zonas; setActiveZone persiste/emite evento, sin llamada genérica a preset físico | No presentarlos como presets nativos operativos |
| Posiciones propias | viewport/zona almacenada y eventos del manager | Diagnóstico de configuración, sin simular posición física |
| Patrol | Sin contrato común ejecutable en el modal | No inventar control |
| Posición predeterminada | currentPreset/currentZoneId predeterminados no son medición física | No anunciar posición real |
| Botones nativos HA | button real asociado | button.press si está disponible |

El backend PTZ existente se preservó; no se instaló integración, ejecutó movimiento ni cambió zona de una cámara real.

### Movimiento / clasificación: rutas revisadas

VALIDADO ESTÁTICAMENTE / VALIDADO EN TESTS:

- MQTT y webhook Camera.UI actualizan MotionDetected independientemente de los targets.
- Se corrigió la única asignación literal MQTT genérico → person encontrada.
- Se eliminó mascota genérica → dog/cat de CameraAiDetector.
- El pulso MotionDetected se procesa antes del filtro/activación de metadata clasificada; un target no seleccionado o filtro deshabilitado no elimina movimiento válido.
- Cada pulso tiene timer independiente de la notificación UI. `updateHomeKitMotion:false` conserva la propiedad del detector local sobre su estado. Shutdown dispone timers y listeners.
- No se elige un accesorio arbitrario porque el mapa tenga un único elemento dentro de CameraAiDetector.
- Los nombres/atributos de sensores explícitamente clasificados y categorías del proveedor siguen siendo metadata externa; no se inventan categorías desde un evento genérico. FFmpeg diferencia de frames sigue siendo movimiento, no visión.

La revisión no constituye prueba física de ninguno de esos proveedores.

## PHASE 1 RESPONSIVE STATUS

VALIDADO VISUALMENTE: Chrome local con fixtures, no HA Ingress real. Viewports: 320×568, 375×667, 390×844, 430×932, 768×1024, 1024×768, 1440×900.

35 casos: modal común emparejado/sin emparejar, configuración Camera.UI, lista descubierta con nombre largo y configuración Scrypted. Sin overflow horizontal del documento ni contenedores, sin errores JS, diagnóstico inicialmente cerrado y footer alcanzable con scroll. Se revisaron capturas y hojas de contacto; apareció un overflow del canvas QR y se corrigió antes de repetir. El desplazamiento interno de un input largo no se cuenta como overflow del layout.

Evidencia: `visual/results.json`, capturas PNG y `visual/review.mjs`. Fixture archivado en `visual/fixture.tsx`; para reproducirlo debe copiarse a `src/frontend/camera-review.tsx` y usarse con un HTML local temporal. Se retiraron esos dos archivos temporales del árbol de producción. La revisión no contactó HA ni cámaras. Los callbacks y APIs se sustituyeron por fixtures.

## PHASE 1 PASS 1

Consultar `phase1-pass1.json`: typechecks, builds, suite completa, lint de todos los TS/TSX/CSS modificados/nuevos y git diff --check. Solo se usan binarios locales con Node 24.22.1, equivalentes a los scripts npm; npm no está en PATH.

VALIDADO EN TESTS / VALIDADO EN BUILD: 80 archivos, 708 tests aprobados, 0 fallos, 0 skip; 10.80 s. Typecheck, ambos builds, lint modificado y diff check con código 0. Resultados finales en JSON. Hubo corridas intermedias que detectaron formato; se corrigieron y no se presentan como gates aprobados.

## PHASE 1 PASS 2

Consultar `phase1-pass2.json`: segunda corrida después de revisión del diff completo y de la coherencia de versiones/novedades 2.3.0. VALIDADO EN TESTS / VALIDADO EN BUILD: 80 archivos, 708 tests aprobados, 0 fallos, 0 skip; 9.64 s. Typecheck, ambos builds, lint modificado y diff check con código 0. Los mismos checks se repiten; no se suman ambos conteos como tests diferentes.

VALIDADO ESTÁTICAMENTE: `lint-debt.json` compara el lint global real contra un archivo temporal del tag: 91 fallos en la base, 87 actuales, 0 nuevos. Script lint intacto. Solo se formatearon archivos de código modificados por esta tarea.

## PHASE 2 STATUS

VALIDADO ESTÁTICAMENTE: auditoría inicial contra `homekit-4k v0.6.30`, tag anotado `b8750341b1585f7cad711fb1402124ca1c7534b1`, commit `3a8142296e3769ce775d9d6f059d3801efe56a3a`, package 0.6.30. Checkout de referencia separado y sin modificaciones de fuente.

BLOQUEADO: **Fase 2 no implementada ni terminada.** El runtime de producción de Matter All-in-One sigue sin SecureVideoController; su gate de runtime no está cerrado. Tampoco están cerrados la matriz completa de protocolos, audio ni compatibilidad de persistencia tras sustituir HAP. No se sustituyó esa dependencia ni se alteró el pipeline para disimular el gate. Las pruebas aisladas siguientes son auditoría, no integración de ese runtime en el add-on.

### Matriz inicial de arquitectura

| Feature | homekit-4k v0.6.30 | Matter All-in-One v2.3.0 | Estado / acción pendiente |
|---|---|---|---|
| HAP runtime | Fork vendorizado 2.2.3-homekit4k.2 | Upstream 2.2.3 | Sustitución requiere compatibilidad real y persistencia |
| CameraController H264 | Rama CLASSIC_H264 | Existe y es el camino efectivo | Preservar |
| SecureVideoController HEVC | Constructor/runtime y servicios reales | No exportado; tipos propios no lo añaden | Gate no cerrado |
| H264 video | Plan por geometría probada; copy/normalización | Copy y transcode; políticas por modelo presentes | Sustituir por capacidad/probe |
| H264 Live audio | Existen rutas diferentes, incluyendo legado PCMA→Opus y anuncio Opus general | Anuncio Opus general; puede transcodificar cualquier origen a Opus | No portar esa política; aplicar requisito de Chris |
| H264 reconfigure | Plan y continuidad independientes de tupla solicitada | Manejo en delegado con reinicios/fallbacks | Tests específicos pendientes |
| HKSV H264 | HDS AAC-LC; temporización explícita | Prebuffer y fMP4; anuncia 4 s / audio 16/32 kHz | Ajustar 8 s, 4 s y AAC-LC 48 kHz separadamente |
| HEVC streaming | SecureVideo + local RTP + WebRTC | Configura clásico también para HEVC | Gate 2.4 incumplido en código base |
| Multi-Tier RTP | Delegate conectado al controlador real | Clase propia sin consumidor en el runtime HAP | Integración y negociación reales pendientes |
| HEVC RTP | Assembler/packetizer y tests | Assembler local y clases disponibles | Auditar FU/AP, wrap, pérdidas, MTU y concurrencia |
| SRTP/SRTCP/RTCP | SrtpContext, autenticación/replay, sender reports y tests | FFmpeg clásico; helpers y sockets en prototipos HEVC | Comparar vectores y lifecycle, no inferir paridad |
| WebRTC | Delegate HAP, werift 0.23.0 | WebRtcSessionManager con werift 0.25.2, sin conexión a SecureVideoController | No copiar API antigua |
| SFrame | Claves, frame/packetización y tests | Clases propias no prueban ruta HAP de extremo a extremo | Vectores y replay/rotación pendientes |
| fMP4/HDS HKSV3 | Delegate HDS, HEVC/AAC; CMAF directo deshabilitado | HevcRecordingDelegate bajo controlador clásico | HDS Secure Video pendiente |
| Snapshot | SDK/go2rtc/caché, con rutas heredadas por revisar | HA/FFmpeg/caché | Imagen nunca prueba Live View; preservar antigüedad |
| Motion | Traduce eventos/detecciones | HA/MQTT/Camera.UI/Omni y diferencia FFmpeg | Sin clasificación obligatoria; Fase 1 corrigió false labels |
| Talkback | Contratos SDK pero también una ruta H264 con twoWayAudio:true fijo | Sin adapter de backchannel común demostrado | No anunciarlo globalmente |
| Source adapters | SDK Camera.UI y fuentes tipadas | CameraStreamSource, resolver HA y puentes existentes | Unificar capacidades y fuentes renovables, sin motores por proveedor |
| Probe/cache | SourceInspector y cachés de runtime/audio | Probes y metadata; métricas Omni 2.3.0 | Separar discovery de sesión y preservar URLs nuevas |
| Network binding | Socket UDP conectado selecciona ruta efectiva | Fallback de IP primaria en addressOverride | Sustituir por selección de ruta validada |
| Cleanup | Generación/stop/cierre y tests específicos | Timers/procesos/sockets existentes | Matriz de fallos y double-stop pendiente |
| Tests | Suite extensa node:test y fixtures de medios | Suite Vitest con mock global de libfdk | No confundir mock con encoder real |

## H264 ARCHITECTURE

BLOQUEADO: no se cambió el motor. Debe mantener CameraController clásico y copy para H264 compatible; normalizar únicamente geometría incompatible con encoder probado. Las políticas actuales por modelo requieren revisión.

## H264 AUDIO POLICY

BLOQUEADO: sigue pendiente integrar la política solicitada: solo Opus nativo probado puede negociarse/utilizarse como Opus; PCMA/AAC/otros requieren AAC-ELD 24 kHz mono, 20 ms/480 muestras y libfdk real. Sin encoder ELD no se debe anunciar Opus indiscriminadamente. La suite existente simula supportsFdkAac en test/setup.ts; no equivale a validación del binario del add-on.

VALIDADO EN TESTS: `aac-eld-probe.cjs` ejecutó FFmpeg local de Camera.UI con tono sintético, libfdk_aac/aac_eld/24000/mono/frame_length 480 solicitado y decodificó su resultado. Duración PCM 1.02 s y tono medido ~447 Hz. Resultado en `aac-eld-result.json`. No es el binario Linux de la imagen ni valida RTP/SRTP, negociación, fuente real o audio audible en Casa. Falta comprobar objeto AAC, frame length efectivo y packetización en la integración MIAO.

## HKSV POLICY

BLOQUEADO: pendiente separar audio live y recording, AAC-LC 48 kHz mono, prebuffer 8000 ms y fragmentos 4000 ms en el motor común. Se conserva el camino instalado declarado operativo por Chris; no se ejecutó ni probó su instalación.

## HEVC ARCHITECTURE

VALIDADO ESTÁTICAMENTE: import real de la dependencia actual produjo CameraController=function, SecureVideoController=undefined, CameraWebRTCStreamManagement=undefined y ausencia de servicios Multi-Tier. DataStreamTransportManagement sí existe, lo que no aporta el resto de Secure Video.

VALIDADO EN TESTS: la prueba aislada `secure-runtime-probe.cjs` cargó el fork de la referencia, construyó un SecureVideoController sobre Accessory y comprobó CameraOperatingMode, DataStreamTransportManagement, CameraWebRTCStreamManagement y CameraMultiTierRTPStreamManagement. Sin Speaker ni publish; se retiró el controlador al terminar. Resultado `secure-runtime-result.json`.

BLOQUEADO: el test anterior no usa la dependencia de producción de MIAO; **no cierra su gate 2.5**. No se portó, publicó ni activó el fork. La procedencia declarada está en vendor/hap-nodejs/PATCH.md: seydx/HAP-NodeJS f844d293d62d843d7c7d5e9363bb606fd841ee00, con parches crypto/CMAF posteriores del repo de referencia. Debe validarse el contrato y la persistencia con H264 antes de adoptarlo.

## HEVC AUDIO POLICY

BLOQUEADO: objetivo Opus 48 kHz mono/20 ms y transcodificar únicamente audio si el origen no ofrece ese formato. No se cambió el vídeo HEVC ni se conectó una nueva ruta.

## HKSV3 POLICY

BLOQUEADO: objetivo HEVC copy/hvc1, fMP4/HDS, AAC-LC 48 kHz mono, prebuffer 8 s y fragmentos 4 s. CMAF directo permanece sin activar. Carpetas/clases no acreditan soporte runtime ni interoperabilidad Apple.

## MOTION POLICY

IMPLEMENTADO / VALIDADO EN TESTS: correcciones descritas en Fase 1. No existe nueva abstracción MotionTrigger común de Fase 2; su integración y todos los adapters siguen pendientes.

## TWO-WAY AUDIO STATUS

PENDIENTE DE VALIDACIÓN FÍSICA: sin backchannel físico MIAO demostrado; no se anunció ni habilitó uno nuevo. Smart Life no acredita el contrato del add-on. No se copió el twoWayAudio:true fijo de una ruta de referencia. Un adapter deberá verificar codec, hasBackchannel, startBackchannel y sendAudioPacket antes de anunciar Speaker.

## DEPENDENCIES REVIEWED

VALIDADO ESTÁTICAMENTE: consulta directa al registro npm el 2026-10-28; respuestas/URLs en `dependency-registry.json`. La herramienta web no pudo leer esos JSON; la consulta HTTPS directa sí devolvió metadatos. No se interpreta metadata como auditoría de seguridad.

| Dependencia | CURRENT MIAO | AVAILABLE | Cambios/protocolo/breaking/security/Node 24 | Decisión |
|---|---|---|---|---|
| @homebridge/hap-nodejs | 2.2.3 | 2.2.3 | Node ^22/^24/^26; upstream carece de Secure Video; seguridad/cambios de fork pendientes de auditoría completa | Conservar por ahora |
| Fork Secure Video | No instalado | 2.2.3-homekit4k.2 en tag de referencia | Node ^22/^24/^26; agrega servicios/delegates y modifica crypto/CMAF. Persistencia y compatibilidad no equivalen por compartir 2.2.3 | No adoptar todavía |
| werift | 0.25.2 declarado | 0.25.2 | Node >=22; referencia 0.23.0 usa otra API; revisión de cambios y seguridad no completada | Sin downgrade/update |
| Camera.UI SDK | No dependencia directa; cliente REST existente | 1.4.4; referencia 1.4.1 | Compatibilidad con API REST actual y SDK/backchannel por auditar; motor no puede depender de SDK para todas las fuentes | No añadir automáticamente |
| @noble/ciphers | No dependencia directa | 2.4.0 | Fork usa 2.4.0; Node >=20.19.0; impacto crypto exige vectores/compatibilidad | No añadir automáticamente |
| @scrypted/client | ^1.3.26 | 1.3.26 | Última coincide con lo declarado; no implica auditoría de advisories | Conservar |
| @scrypted/types | ^0.5.55 | 0.5.55 | Última coincide con lo declarado | Conservar |
| FFmpeg / AAC / Opus | Binario Linux fijado en Dockerfile, no ejecutado aquí | No se determinó actualización de distribución | Probe sintético solo sobre binario Camera.UI macOS; Linux/arquitecturas/codec negotiation pendientes | No actualizar |
| SRTP, SFrame, RTP, HEVC, fMP4/HDS helpers | Código propio + FFmpeg/werift | No hay versión npm única que sustituir | Cambios de protocolo y vectores no auditados completamente | No sustituir por nombre de paquete |

## DEPENDENCIES UPDATED

IMPLEMENTADO: ninguna. Package, lockfile y Dockerfile idénticos al tag. No se ejecutó instalación sobre Camera.UI ni sobre HA.

## DEPENDENCIES NOT UPDATED

VALIDADO ESTÁTICAMENTE: todas las anteriores se mantuvieron. La existencia de una versión o un fork no prueba compatibilidad, seguridad ni persistencia de pairing.

## PERFORMANCE TELEMETRY

IMPLEMENTADO: interfaz usa únicamente métricas disponibles y No medido para el resto. Preservadas las métricas Omni 2.3.0 y la telemetría existente.

BLOQUEADO: no se implementó instrumentación T0–T7 ni se midieron los 5–10 segundos reales. No se optimizó el arranque y no se ejecutó probe contra fuente real.

## PHASE 2 PASS 1

BLOQUEADO: no ejecutado como gate de implementación de Fase 2. Dos probes aislados pasaron con el alcance limitado documentado; no sustituyen la matriz H264/HKSV/HEVC/HKSV3/SRTP/SRTCP/RTCP/WebRTC/SFrame/audio/cleanup.

## PHASE 2 PASS 2

BLOQUEADO: no ejecutado. Falta implementación y revisión de lifecycle, dependency diff, persistencia y matriz completa. No se declara Fase 2 terminada.

## TOTAL TESTS

VALIDADO EN TESTS: suite MIAO 80 archivos / 708 tests por ciclo de Fase 1; 0 fallos/skip en los ciclos aprobados. Los mismos tests se repiten, no se suman. Además, dos probes de auditoría aislados (fork/encoder), que no pertenecen a esa suite ni validan la implementación Fase 2.

## KNOWN RISKS

- BLOQUEADO: Fase 2 sigue incompleta; permanecen en el código base HEVC por controlador clásico, anuncio genérico Opus, políticas de modelo y falta de pipeline Secure Video conectado. Nada de esto se presenta como corregido.
- PENDIENTE DE VALIDACIÓN FÍSICA: los controles/estados UI se contrastaron con fixtures y contratos, no con hardware. Datos de proveedor desconocidos se muestran como tales; no se garantiza staleness de MQTT sin señal de disponibilidad.
- PENDIENTE DE VALIDACIÓN FÍSICA: no se probó continuidad de vídeo/audio/HKSV en la instalación; no hubo despliegue.
- VALIDADO VISUALMENTE: Chrome local cubierto; Safari, HA Ingress real, VoiceOver y tamaños de texto del sistema no se probaron.
- BLOQUEADO: auditoría de seguridad completa de fork/dependencias/protocolos pendiente. Las implementaciones heredadas de referencia no son una especificación confiable por sí solas.

## PHYSICAL VALIDATION PENDING

PENDIENTE DE VALIDACIÓN FÍSICA: Apple Home Live View con reloj avanzando, audio audible, movimiento genérico, clip HKSV con audio/ACK, preservación de pairing tras futura instalación, HEVC local/remoto/celular, HKSV3, concurrencia y backchannel por proveedor. Las restricciones de esta tarea impiden desplegar y no se eludieron.

## GIT STATUS

VALIDADO ESTÁTICAMENTE: rama local basada en v2.3.0; archivos modificados y nuevos sin commit. Rama anterior preservada. Sin versiones nuevas, tags, releases, push, PR, merges, publicación npm/GHCR/Docker, modificación de main remoto ni despliegue. Sin borrado de pairings, UUID/PIN/storage/fabrics ni configuración física. Referencia en checkout separado de solo lectura.

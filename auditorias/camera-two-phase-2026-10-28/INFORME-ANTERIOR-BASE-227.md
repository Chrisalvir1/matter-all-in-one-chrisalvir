# Auditoría e implementación local de cámaras — 2026-10-28

## PHASE 1 STATUS

IMPLEMENTADO: primer conjunto de correcciones de presentación. Fase incompleta.

BLOQUEADO: el gate final de Fase 1 no pasa. Lint global falla y faltan auditoría exhaustiva de controles, nueva estructura completa, extracción de componentes y comprobación visual responsive. No se autoriza el paso a Fase 2 por estos resultados.

Base local: rama `codex/two-phase-reliability`, HEAD `3a4d0e0`, versión 2.2.7. El baseline físico descrito por Chris se conserva como evidencia aportada por el usuario; esta ejecución no realizó comprobaciones en Apple Home ni en HA.

### Checkpoint 1.0: rutas y contratos identificados

VALIDADO ESTÁTICAMENTE:

- HA: `App.tsx` llama `adaptHaDeviceToCameraRecord` y abre `CameraConfigModal`.
- Scrypted: `selectedCamera` abre el mismo `CameraConfigModal`.
- Camera.UI: `selectedCameraUiCamera` abre el mismo modal.
- `CameraUiModal` configura conexión/sincronización de Camera.UI; `ScryptedModal` configura conexión Scrypted.
- `CameraUiPairingModal` existe pero no tiene consumidor en el árbol actual de `App.tsx`.
- `DeviceModal` atiende dispositivos generales; las cámaras HA del inventario se separan y pasan al modal común.
- `CameraCard` y `CameraBrandGroup` presentan inventario y abren configuración; no prueban vídeo.
- API común: `src/frontend/src/api/client.ts`. Handlers: `src/platform.ts`. Presentación HA: `src/frontend/src/utils/ha-camera-record.ts`. Estilos: `src/frontend/style.css`. Estado global: `useAddonState` y `App`.

Todos los archivos de la tabla son relativos a `matter-all-in-one-addon/`. Las categorías describen código, no validación física.

| Elemento UI | Archivo | Backend | Endpoint | Estado encontrado | Acción |
|---|---|---|---|---|---|
| Conectar Scrypted | ScryptedModal.tsx | cliente/config Scrypted en platform.ts | /scrypted/config, /scrypted/test-connection | FUNCIONAL_REAL | Conservar; no confundir conexión con vídeo |
| Conectar Camera.UI | CameraUiModal.tsx | Camera.UI client/storage | /cameraui/config, /cameraui/test-connection, /cameraui/sync | FUNCIONAL_REAL | Conservar; revisión visual pendiente |
| Activación HAP | CameraConfigModal.tsx | puentes HomeKit | /cameras/:id/toggle-homekit, /cameraui/cameras/:id/toggle-homekit | FUNCIONAL_REAL | Conservar |
| Reiniciar pairing | CameraConfigModal.tsx, CameraUiModal.tsx | handlers de reset | /reset-camera-pairing/:id, /cameraui/cameras/:id/reset-pairing | AVANZADO | No ejecutar; reubicación completa pendiente |
| Pairing alternativo | CameraUiPairingModal.tsx | reset Camera.UI | /cameraui/cameras/:id/reset-pairing | UI_MUERTA | Sin consumidor encontrado; no eliminado aún |
| Modelo | CameraConfigModal.tsx | identity override | /cameras/:id/identity-override | SOLO_INFORMATIVA | No determina capacidad de vídeo |
| URL RTSP guardada | CameraConfigModal.tsx | resolución/configuración de fuente | /cameras/:id/stream-url | AVANZADO | Colapsada bajo diagnóstico |
| Probe/diagnóstico | CameraConfigModal.tsx | validación ffprobe | /cameras/:id/verify-stream, /diagnose-stream | DIAGNÓSTICO | Separar medición de reproducción física |
| Snapshot | CameraConfigModal.tsx | snapshot backend | /cameras/:id/snapshot | PARCIAL | No usar imagen como prueba de Live View |
| Targets IA/Fauna | CameraConfigModal.tsx | CameraAiDetector | /cameras/ai-config | INCORRECTA | Retirada UI principal que sugería inferencia local |
| Targets/sensibilidad editados | CameraConfigModal.tsx anterior | persistencia al guardar | /cameras/ai-config POST | PARCIAL | State React hasta guardar; retirada UI, backend conservado |
| Modo/transporte/sensores seleccionados | CameraConfigModal.tsx | export config al guardar | /cameras/:id/export-config | FUNCIONAL_REAL | State local hasta guardar; auditoría de efecto por origen pendiente |
| Luz/sirena/switch HA | CameraConfigModal.tsx | ha.callService | /cameras/control-entity | FUNCIONAL_REAL | Etiquetas por tipo; impedir acción de pseudo-ID |
| Luces/sirenas sintéticas Camera.UI | CameraConfigModal.tsx anterior | handler genérico HA sin contrato Camera.UI | /cameras/control-entity | INCORRECTA | Retiradas síntesis basadas solo en hasLight/hasSiren |
| MotionTopic/doorbellTopic | CameraConfigModal.tsx | eventos externos Camera.UI/MQTT | eventos del proveedor | PARCIAL | Estado informado, no prueba de sensor físico |
| Entidades desconocidas | ha-camera-record.ts y modal | inventario HA | /devices | INCORRECTA | Tipo other; no fallback automático a motion |
| Alimentar ahora | camera-control-presentation.ts | switch HA | /cameras/control-entity | FUNCIONAL_REAL | Describir control de alimentación conservando semántica switch |
| QR Matter por entidad | CameraConfigModal.tsx | export/commissioning | toggle-export y open-commissioning | AVANZADO | Reubicación aún pendiente |
| Latencia <200 ms | CameraConfigModal.tsx anterior | ninguno | ninguno | INCORRECTA | Sustituida por No medida |
| Codec/GOP/audio/negociación/FFmpeg | CameraConfigModal.tsx | capacidades y telemetría | inventario/diagnose-stream | DIAGNÓSTICO | Colapsados en Diagnóstico avanzado |

No se declara auditoría exhaustiva de cada control PTZ/preset/button/sensor de todos los proveedores. Ese trabajo sigue pendiente antes de cerrar los checkpoints 1.0/1.2.

### Movimiento y clasificación

VALIDADO ESTÁTICAMENTE: `CameraAiDetector` consume entidades/eventos externos y filtra targets; no ejecuta modelos CoreML/OpenCV. `platform.ts` actualiza movimiento Camera.UI antes de filtrar clases (aprox. líneas 2125–2175 en HEAD), y cambios HA llegan a `updateMotionState` (aprox. 5807). El webhook genérico no inventa person en esa ruta. No se modificó lógica backend.

BLOQUEADO: no se cierra gate 1.1 exhaustivo; quedan otras rutas y heurísticas por revisar. En particular el detector contiene una conversión de mascota genérica a dog/cat que merece corrección separada y pruebas. La retirada de la UI no corrige esas heurísticas.

## PHASE 2 STATUS

BLOQUEADO: no iniciada porque Fase 1 no supera sus gates. No se consultó ni comparó el repositorio homekit-4k v0.6.30. No se adaptaron contratos Secure Video.

## FILES CHANGED

IMPLEMENTADO:

- src/frontend/src/components/CameraConfigModal.tsx
- src/frontend/src/types.ts
- src/frontend/src/utils/ha-camera-record.ts
- src/frontend/src/utils/camera-control-presentation.ts (nuevo)
- src/frontend/style.css
- test/ha-camera-record.test.ts
- test/camera-control-presentation.test.ts (nuevo)
- auditorias/camera-two-phase-2026-10-28/INFORME.md (este informe, en raíz de checkout)

## UI REMOVED

IMPLEMENTADO: pestaña IA & Fauna, formulario, lectura de configuración y handler de guardado asociados a esa UI. El backend y su configuración persistida permanecen. Retiradas entidades de luz/sirena fabricadas a partir de flags Camera.UI sin entidad real.

## UI MOVED TO ADVANCED

IMPLEMENTADO: bloque de especificaciones, URL RTSP y diagnósticos técnicos de fuente, negociación HAP, FFmpeg y HKSV bajo details/summary colapsado.

BLOQUEADO: faltan QR Matter por entidad, reorganización de exportación y estructura completa con las áreas solicitadas. El modal sigue siendo grande; no se ha completado la extracción de componentes.

## CONTROLS FIXED

IMPLEMENTADO: switch alimentador descrito como control de alimentación; switches generales ya no dicen movimiento. Sensores binarios ajenos a movimiento pasan a other; deduplicación por entityId en el adaptador HA. Acciones del modal exigen ID coherente con el dominio, impidiendo enviar los pseudo-ID sensor.* o cameraui.* al servicio HA de luz/sirena/switch.

VALIDADO EN TESTS: tres pruebas nuevas cubren alimentador, sensor desconocido y adaptación/deduplicación de entidades HA.

BLOQUEADO: button y sensor no están incorporados al contrato común; no se ha completado revisión PTZ/presets ni disponibilidad/staleness. Estado booleano actual no distingue unavailable. No declarar cubierto gate 1.2 completo.

## H264 ARCHITECTURE

BLOQUEADO: revisión/adaptación Fase 2 no iniciada. Sin cambios al motor.

## H264 AUDIO POLICY

BLOQUEADO: no se implementó ni comprobó la matriz AAC-ELD/Opus solicitada en esta ejecución.

## HKSV POLICY

PENDIENTE DE VALIDACIÓN FÍSICA: no se probaron grabaciones ni ACK en esta ejecución. Sin cambios al motor.

## HEVC ARCHITECTURE

BLOQUEADO: sin implementación nueva de SecureVideoController. Una búsqueda local encontró tipos propios, lo que no acredita un runtime Secure Video.

## HEVC AUDIO POLICY

BLOQUEADO: sin revisión de Opus 48 kHz ni prueba física nueva.

## HKSV3 POLICY

BLOQUEADO: sin auditoría/implementación/validación del fork, Multi-Tier, HDS o fMP4 HEVC.

## MOTION POLICY

VALIDADO ESTÁTICAMENTE: las rutas citadas separan motion genérico y clases externas. La UI no ejecutaba inferencia y su retirada no altera las rutas backend. No se cambiaron sensores configurados en la instalación.

BLOQUEADO: gate completo de eventos y heurísticas pendiente; no se afirma que todas las rutas cumplan todavía.

## TWO-WAY AUDIO STATUS

PENDIENTE DE VALIDACIÓN FÍSICA: sin prueba de backchannel ni modificación del anuncio de capacidades. Smart Life no acredita talkback en Matter All-in-One.

## DEPENDENCIES REVIEWED

VALIDADO ESTÁTICAMENTE: package.json local declara @homebridge/hap-nodejs 2.2.3 y werift ^0.25.2. Esta lectura no constituye auditoría de versiones disponibles ni compatibilidad Secure Video. Node utilizado: 24.22.1.

## DEPENDENCIES UPDATED

IMPLEMENTADO: ninguna actualización; package/lock/config permanecen sin cambios.

## DEPENDENCIES REJECTED

BLOQUEADO: no se evaluaron actualizaciones; ninguna decisión técnica de rechazo tomada.

## PERFORMANCE TELEMETRY

IMPLEMENTADO: eliminada cifra fija <200 ms y afirmaciones de reproducción basadas únicamente en ffprobe en los puntos corregidos. No añadida instrumentación T0–T7 ni optimización de arranque.

BLOQUEADO: auditoría exhaustiva de textos y métricas restantes pendiente.

## VALIDATION PASS 1

VALIDADO ESTÁTICAMENTE: tsc --noEmit y tsc -p src/frontend/tsconfig.json terminaron con código 0.

VALIDADO EN BUILD: tsc -p tsconfig.build.json y vite build terminaron con código 0.

VALIDADO EN TESTS: 77 archivos, 691 pruebas, 691 pass, 0 fail, 0 skip, duración 11.77 s. Esta corrida precedió la retirada final de controles sintéticos y algunos textos; PASS 2 cubre ese estado posterior.

BLOQUEADO: lint global devolvió código 1, con 92 archivos señalados en la primera corrida, incluyendo un helper nuevo cuyo formato fue corregido después. Comprobación separada del contenido HEAD de 110 archivos versionados detectó 55 fallos preexistentes de formato; esa muestra no incluye todos los archivos del glob de lint. No se cambió ni debilitó el script lint. No se ejecutó npm porque no está en PATH; se invocaron directamente las herramientas locales con el Node 24.22.1 incluido en el runtime del entorno.

## VALIDATION PASS 2

VALIDADO ESTÁTICAMENTE: revisión de diff, tsc backend/frontend y git diff --check con código 0. Sin cambios a package.json, lockfile, config.yaml, src/camera ni platform.ts. La revisión no equivale a auditoría completa de fugas del motor.

VALIDADO EN BUILD: backend tsc y frontend Vite con código 0; 63 módulos, build frontend 113 ms.

VALIDADO EN TESTS: 77 archivos, 691 pruebas, 691 pass, 0 fail, 0 skip, duración 10.93 s.

VALIDADO ESTÁTICAMENTE: Prettier pasó para helper nuevo, adaptador HA y los dos archivos de tests modificados/nuevos.

BLOQUEADO: no se resolvió ni se declaró verde el lint global. Los ciclos completos exigidos no están ambos verdes. No existe aprobación del gate final.

## TOTAL TESTS

VALIDADO EN TESTS: 691 por corrida; son las mismas pruebas en dos ejecuciones, no 1382 pruebas distintas. Sin pruebas físicas.

## KNOWN RISKS

BLOQUEADO:

- Fase 1 incompleta; no se validaron 320, 375, 390, 430, 768, 1024 ni 1440 px en navegador.
- CSS añadido es una corrección preventiva, no evidencia visual. Layouts flex internos pueden seguir desbordándose.
- El modal no tiene aún la estructura completa solicitada y sigue siendo grande.
- Fuente y configuración anunciadas no prueban reproducción, codec efectivo, audio, HKSV ni talkback.
- No se completó búsqueda exhaustiva de textos falsos ni auditoría de todos los componentes.
- Heurísticas de clasificación externa y estados unavailable requieren revisión.
- No se verificó el repositorio de referencia ni su runtime fork.

## PHYSICAL VALIDATION PENDING

PENDIENTE DE VALIDACIÓN FÍSICA: Live View, audio entrante, motion sin categoría, clip HKSV con audio y conservación de pairing después de instalar una futura versión. HEVC/HKSV3 y two-way audio no fueron probados. Esta tarea prohíbe despliegue; no se accedió ni modificó la instalación física.

## GIT STATUS

VALIDADO ESTÁTICAMENTE: cambios locales sin commit, rama codex/two-phase-reliability sobre 3a4d0e0. Versión 2.2.7 conservada. No tag, release, push, PR, merge, npm publish, Docker/GHCR publish ni despliegue. Sin cambios de UUID, PIN, pairing o storage HAP.

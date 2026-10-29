# Motor de cámaras — Fase 2 sobre v2.3.0

Fecha de trabajo: 2026-10-28–29, America/Costa_Rica. Informe vigente para esta rama. El informe `INFORME.md` anterior conserva la migración y la evidencia de Fase 1; sus conclusiones iniciales sobre Fase 2 quedan sustituidas por este documento.

Estado de software: **IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO EN BUILD**. Apple Casa, cámaras y Home Hub físicos: **PENDIENTE DE VALIDACIÓN FÍSICA**. No se publicó ni desplegó una versión.

## BASE VERSION

VALIDADO ESTÁTICAMENTE: **2.3.0**, tag `v2.3.0`, commit `9741d81145d88f9dad6b101e294ec714e93ce354`. Se conservan config.yaml, package.json, matterbridge.version, versiones raíz del lockfile y changelog en 2.3.0. El verificador de metadatos pasa. No se creó imagen, tag ni release.

## BRANCH

`codex/v230-camera-phase1-phase2`, checkout `miao-v230-camera`. HEAD permanece en el commit base; cambios locales sin commit. No se alteró `main`, la instalación HA, otros checkouts ni fabrics.

## PHASE 1 REGRESSION STATUS

VALIDADO EN TESTS / VALIDADO EN BUILD: se conservan los seis componentes nuevos de cámaras, modal, controles por disponibilidad, button.press, deduplicación por entityId, separación de movimiento/categorías, diagnóstico colapsado, sanitización y responsive. No se rediseñó la UI. Las 35 comprobaciones visuales previas con fixtures y siete tamaños permanecen documentadas en `visual/`; no se presentan como capturas físicas nuevas. La suite final incluye los tests de Fase 1 y frontend.

## PHASE 2A HAP RUNTIME

IMPLEMENTADO / VALIDADO CON FIXTURE / VALIDADO EN TESTS: runtime Apache-2.0 vendorizado de `Chrisalvir1/homekit-4k` v0.6.30, commit `3a8142296e3769ce775d9d6f059d3801efe56a3a`, upstream Secure Video `f844d293d62d843d7c7d5e9363bb606fd841ee00`. Dependencia determinista `file:vendor/hap-nodejs`; sin parche postinstall ni fork remoto flotante.

Se auditaron CameraController, AccessoryInfo, ControllerStorage, HAPStorage, crypto y los servicios Secure Video. CameraController y HAPStorage conservan el runtime previo; ControllerStorage protege la restauración contra guardados parciales. La selección crypto nativa/portable conserva framing y nonces HAP. La fixture se generó con el HAP 2.2.3 anterior antes de sustituirlo y contiene identidades y claves exclusivamente sintéticas. No deriva del storage del usuario.

`phase2/vendor-integrity.json` comprueba 288 archivos importados sin cambios. Solo package.json elimina devDependencies, scripts de desarrollo/publicación y allowScripts; mantiene versión, dependencias de producción, licencia y autores. Se añade MIAO.md como documentación de empaquetado. El manifiesto original está en `phase2/vendor-sha256.json`.

Los exports de producción se verificaron mediante Node: CameraController, SecureVideoController, CameraMultiTierRTPStreamManagement y CameraWebRTCStreamManagement. Dockerfile copia vendor antes de instalar en ambas etapas y comprueba esos exports en producción.

## PHASE 2B SOURCE ADAPTER

IMPLEMENTADO / VALIDADO EN TESTS: `CameraSourceAdapter` representa Home Assistant, Camera.UI, Scrypted, Omni Tuya y RTSP. Describe capacidades, procedencia, disponibilidad y renovación sin exponer URL ni credenciales. Live clásico, Multi-Tier RTP, WebRTC y prebuffer HEVC usan la resolución común; se conservan los mecanismos de renovación HA/Omni y las métricas existentes del cliente HA.

Las credenciales HTTP se agregan solo a argumentos transitorios: bearer HA para su mismo origen, credenciales Scrypted explícitas para esa fuente. No se envía el token HA a un RTSP o HTTP de terceros. La selección de motor depende del codec, no del proveedor.

Un lease evita dos inputs activos que compitan por la misma fuente Secure Video y su timeline de grabación. Las sesiones preparadas no consumen ese lease. Omni también lo utiliza en la ruta clásica; su lector de movimiento/prebuffer se pausa antes de asignar la URL.

## PHASE 2C CAPABILITY DISCOVERY

IMPLEMENTADO / VALIDADO EN TESTS: caché en memoria, TTL 10 min, máximo 128 entradas, deduplicación de probes pendientes, clave SHA-256 por fuente/transporte y URL permanente. Las URLs renovables no entran en la caché. Se guardan únicamente campos de capacidades permitidos, sin error bruto, token ni URL.

Se invalida ante fallo del proceso o cambio de fuente; una respuesta pendiente invalidada no puede reinsertar datos viejos. El probe común actualiza codec, geometría, FPS y audio medidos con procedencia PROBED/CACHED. No se ejecuta un probe de fondo Omni que abra otro lector. El probe de audio inicial que consume una URL Omni exige otra asignación para Live View. La ausencia de evidencia se conserva como desconocida.

## PHASE 2D H264 VIDEO

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL: H.264 usa CameraController clásico. Fuente compatible hasta 1920×1080 conserva `-c:v copy`; no se recodifica por marca o por un RECONFIGURE de Apple. Geometrías mayores se normalizan manteniendo aspecto y dimensiones pares, con máximo 1920×1080.

El encoder se prueba codificando un frame sintético: primero h264_videotoolbox, después libx264. Una enumeración de encoders no basta. Sin encoder funcional se rechaza la normalización y no se anuncia como disponible. Las resoluciones anunciadas corresponden al output real; desaparecen las escalas/fps fabricadas y el permiso especial de 2K por nombre C120. Los tests anteriores que exigían esa excepción se actualizaron a la política solicitada.

Se conservan negociación de PT, SSRC, MTU, SRTP y RECONFIGURE sin reinicio. El delegado clásico rechaza HEVC en lugar de copiarlo bajo un contrato H.264.

## PHASE 2E H264 AUDIO

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL:

- Opus nativo validado, 48 kHz/mono: copy Opus.
- PCMA, PCMU, AAC/AAC-LC, PCM y codecs conocidos decodificables: AAC-ELD 24 kHz, mono, 20 ms, frame_length 480.
- Desconocido o encoder AAC-ELD no funcional: audio no disponible; no se inventa Opus ni audio silencioso.

El anuncio HAP utiliza la misma política que la producción de audio. libfdk_aac se comprueba mediante una codificación real. La prueba local recibe y autentica SRTP emitido por FFmpeg, comprueba SSRC/PT, secuencias, reloj de 24 kHz, incrementos de 480 muestras y Sender Report SRTCP. Un frame puede fragmentarse en varios paquetes con el mismo timestamp: se distingue ese hecho de una duración de frame incorrecta. Los tests de grafo usan una capacidad de encoder inyectada; los tests con binario ejercitan la función real, sin ese mock.

## PHASE 2F HKSV

IMPLEMENTADO / VALIDADO EN TESTS: audio de grabación separado del Live, AAC-LC 48 kHz mono; copy de audio únicamente cuando AAC-LC y su formato coinciden. No se envía AAC-ELD al contenedor de grabación. Prebuffer 8000 ms, fragmentos 4000 ms y política de normalización H.264 también para grabación mayor a 1080p.

Se conserva el parser fMP4, buffers acotados, init/fragmentos, secuencia y reanudación. Se corrigió el límite temporal del ring buffer para recalcularlo al descartar fragmentos. Durante Live Omni se multiplexa fMP4 y análisis de movimiento desde el mismo FFmpeg/RTSP.

La verificación requiere init, múltiples fragmentos, ausencia de error y ACK del stream correspondiente. Un cierre normal no verifica una grabación. El ACK significa recepción HDS; la existencia del clip en Casa se verifica físicamente por separado.

## PHASE 2G SRTP/NETWORK

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL: addressOverride se obtiene conectando un socket UDP a la dirección del controlador y consultando la ruta del kernel. No se elige la primera interfaz.

Relay UDP acotado: conserva SRTP/SRTCP de FFmpeg, aprende el puerto RTCP del productor y retorna feedback. En Multi-Tier, autentica/descifra SRTCP con las claves de recepción negociadas antes de entregarlo a FFmpeg. Se prueban AES_CM_128_HMAC_SHA1_80, material incorrecto, tags alterados, rollover 65535→0, SSRC/PT, bytes intactos, feedback RTCP y doble cierre. Las claves de sesión propias se descartan al terminar; no se modifica el buffer perteneciente al llamador.

## PHASE 2H HEVC

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL: HEVC usa el SecureVideoController real sobre el mismo accesorio/identidad. El gate H.264 pasó antes de conectar esta ruta. No hay libx264/libx265 de vídeo en el pipeline HEVC productivo.

Bootstrap antes de entregar vídeo: agrupación por timestamp, presencia de VPS/SPS/PPS e IRAP, límites de tamaño y rechazo de fragmentación incompleta. RFC 7798 cubre single NAL, AP 48, FU 49, wrap, pérdida, marker y MTU. FFmpeg convierte el framing mediante hevc_mp4toannexb y repite extradata al keyframe, manteniendo el vídeo comprimido. La fuente sintética local se genera con x265 solo dentro del test; el motor la lee con copy.

## PHASE 2I MULTI-TIER RTP

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL: delegado conectado a SecureVideoController; prepare/start/stop usan sockets, claves y SSRC reales. Solo se aceptan IDs de tiers anunciados y la suite SRTP soportada. Los tiers se construyen desde geometría/FPS disponibles; no se fabrica un tier 4K, 30 fps ni una escalera que el input no entrega.

Límites de 8 sesiones preparadas RTP y 6 WebRTC; un input activo por fuente Secure Video protege la sesión RTSP y la timeline de grabación. Las aperturas activas competidoras reciben rechazo y liberan sus recursos. No equivale a afirmar ocho lectores simultáneos ni simulcast con varias resoluciones. Se prueba doble stop, duplicado, tier inválido y que una asignación tardía no cierra la sesión que la reemplazó.

## PHASE 2J HEVC AUDIO

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL: Opus Live a 48 kHz, mono, 20 ms. Opus nativo compatible se copia; los demás codecs conocidos se convierten solo en audio. El test real parte de AAC y recibe audio Opus SRTP en un puerto separado: PT/SSRC y reloj de 960 muestras por frame. Simultáneamente recibe HEVC y fMP4 del mismo proceso.

## PHASE 2K WEBRTC

IMPLEMENTADO / VALIDADO EN TESTS: API de werift 0.25.2. Offer/answer reales con H265/90000, Opus/48000, fingerprint, ICE, DTLS, candidate gathering completo, reoffer, actualización de claves y cierre. El SSRC utilizado por SFrame es el del sender real de werift. Opus SDP expresa dos canales según su contrato RTP, con stereo=0/sprop-stereo=0; la codificación de audio sigue siendo mono.

RID y metadatos simulcast describen el único tier nativo; se negocia su extensión RTP de stream ID y se pasan los parámetros de bitrate al sender. No se anuncia que copy imponga un bitrate distinto al de la cámara. La prueba de transporte envía un frame SFrame sintético fragmentado a otro peer por ICE/DTLS y lo autentica/descifra al recibirlo. La fuente de cámara está sustituida solo en esa prueba de transporte; la lectura FFmpeg se prueba independientemente con el motor real.

No se copió el corte fijo de ~150 ms de otra versión de werift. Una muestra local del gathering completo tardó 101 ms con 8 candidatos. No garantiza ese tiempo en Wi-Fi, NAT o cellular. Cuando SFrame está desactivado, se conserva RTP HEVC/Opus estándar, sin envolverlo como ciphertext.

## PHASE 2L SFRAME

IMPLEMENTADO / VALIDADO EN TESTS: header/KID/counter de 64 bits, codificación canónica, HKDF por SSRC, cifrado y descifrado autenticado, AAD, claves de recepción, eliminación/rotación por KID, ventana de replay y rechazo de tags/SSRC/medio incorrectos. Los streams de envío se reutilizan para no reiniciar el contador y reutilizar un nonce. Se limpian las claves al cerrar.

Vector independiente RFC 9605 AES-128-GCM con metadata externa, comparación byte a byte; además suites CTR-HMAC usadas por Secure Video, replay/reordenación, tampering y transporte SFrame RTP real entre peers. No se usa un roundtrip de una sola implementación como única evidencia.

## PHASE 2M HKSV3

IMPLEMENTADO / VALIDADO EN TESTS / VALIDADO CON BINARIO LOCAL: HDS/fMP4 del SecureVideoController, HEVC copy hvc1 + AAC-LC 48 kHz mono, prebuffer 8000 ms, fragmentos 4000 ms. Durante Live, el mismo proceso entrega una salida adicional fMP4 al delegado de grabación y su lector separado permanece pausado.

La prueba local exige init hvc1/mp4a, múltiples moof/mdat con tfdt/trun y decodifica el contenedor resultante completo con FFmpeg. Fixtures de HDS cubren init/prebuffer, ACK correcto, error, aborto, end flag y retirada de listeners. CMAF directo permanece deshabilitado; su presencia en el runtime vendorizado no activa ninguna ruta de ingestión.

## PHASE 2N MOTION

IMPLEMENTADO / VALIDADO EN TESTS: se conserva MotionDetected boolean desde HA/Camera.UI/Scrypted/Omni y el detector existente de diferencia de frames para Omni. Su salida se entrega al delegado HKSV correspondiente. No se reintroduce IA & Fauna, clasificación obligatoria, OpenCV ni CoreML. Los aliases restantes en asociación de entidades no cambian codec, encoder, resolución o audio.

No se afirma que un RTSP genérico disponga de detector local propio, ni que los sensores MQTT de Camera.UI sean sensores nativos físicos. Un proveedor sin evento de movimiento sigue necesitando un evento HA real o un fallback que realmente esté activo.

## PHASE 2O TWO-WAY AUDIO

IMPLEMENTADO: capacidad explícita false mientras ningún adapter demuestre backchannel. Secure Video anuncia twoWayAudio=false y no añade Speaker; el controlador clásico tampoco anuncia retorno global. El contrato del adapter evita confundir speaker físico con backchannel RTSP. Los adapters de retorno específicos aún no están implementados/validados y no se anuncian como disponibles. Audio audible y backchannel por proveedor: PENDIENTE DE VALIDACIÓN FÍSICA. No bloquea la entrega de Live/recording entrante.

## PHASE 2P PERFORMANCE

IMPLEMENTADO / VALIDADO EN TESTS: telemetría en memoria T0–T7 para clásico/Multi-Tier/WebRTC, con campos ausentes cuando no hubo observación. Los diagnósticos existentes del accesorio incorporan la ruta Secure Video, sin rediseñar la UI. Se retienen como máximo 32 sesiones recientes Secure Video.

T0=request; T1=resolución de fuente completa; T2=URL de uso preparada tras renovaciones/probe; T3=header de input observado; T4=header de output observado; T5/T6=primer paquete de vídeo/audio enviado; T7=retorno del delegado/callback preparado. El spawn se mide por separado. WebRTC observa contadores de paquetes enviados del sender con muestreo de 100 ms: no convierte writeRtp en prueba de envío. T7 puede preceder al primer paquete y no significa reproducción.

Se distinguen allocation1Ms, probeMs, allocation2Ms, ffmpegSpawnMs, firstPacketMs y retries. No hay un coste de probe o segunda asignación inventado cuando no ocurrió. Los fallbacks conservan las métricas existentes HA/Omni y la razón de fallback del diagnóstico clásico.

## PHASE 2Q MODEL-SPECIFIC POLICIES

IMPLEMENTADO / VALIDADO EN TESTS: eliminadas selección de controlador por C402, excepción C120 2K, caps de FPS por modelo, reglas de probe por marca, timestamps de grabación por nombre y resolución inferida por alias. La resolución de sesión clásica pasa por SourceAdapter. Un test compara el mismo pipeline con nombres C120/C402/Wyze/EZVIZ/Generic y exige argumentos iguales.

Se mantienen helpers/aliases de identidad para asociación de entidades HA y compatibilidad de datos anteriores; no deciden el pipeline. Se conserva la migración de un registro Tuya antiguo a fuente renovable si todavía no tenía metadata de proveedor, para no reutilizar credenciales caducadas.

## HAP RUNTIME BEFORE/AFTER

Antes: @homebridge/hap-nodejs 2.2.3 del registry, sin servicios Secure Video consumibles por el motor. Después: 2.2.3-homekit4k.2 local y fijado; CameraController clásico permanece. La versión de la aplicación sigue siendo 2.3.0.

## DEPENDENCIES BEFORE/AFTER

Única sustitución de dependencia: HAP registry → vendor local. El lockfile añade la entrada vendor y convierte el paquete en enlace local; no cambia la versión de otras entradas. Werift permanece en 0.25.2 y Matterbridge en 3.11.0. Hashes/entradas: `phase2/dependency-diff.json`.

Se eliminó el symlink externo de node_modules y se ejecutó una instalación limpia real con Node 24.22.1 y npm 12.2.1 aislado en `/tmp/miao-npm-tool/package/bin/npm-cli.js`:

```sh
node /tmp/miao-npm-tool/package/bin/npm-cli.js ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
```

Resultado: 312 paquetes instalados. node_modules es un directorio propio; solo HAP enlaza al vendor de este mismo checkout. `--ignore-scripts` impide scripts de instalación del host; no se alteró el lockfile para ello. Docker conserva su instalación normal de producción. Auditoría de dependencias de producción: cero vulnerabilidades reportadas; ver `phase2/npm-audit-final.json`.

## FILES CHANGED

Inventario completo, incluidas rutas, en `phase2/files-final.json`. Los cambios de motor están en camera-types, ffmpeg-helper, accesorio/delegados HAP, telemetría, clases HEVC, Dockerfile y manifests. Se conservan los cambios de Fase 1.

platform.ts ya tenía un diff grande de formato. Se revisó su diff semántico: controlCameraEntity validado para button/light/siren/switch, targets MQTT genéricos vacíos en vez de categorías inventadas y dispose del detector al apagar. Fase 2 añade únicamente tres accesos al diagnóstico público del accesorio para incluir Secure Video. No se reestructuró platform.ts; reconstruir todo el formato anterior habría elevado el riesgo de perder cambios válidos.

## FILES ADDED

SourceAdapter/cache, media-policy, route-address, RTP relay, startup-timing, bootstrap HEVC y salida fMP4 compartida; tests de runtime HAP/persistencia, políticas, transporte, SFrame, FFmpeg real y HDS; fixture HAP sintética; vendor Apache-2.0 y evidencias de auditoría. La lista detallada también incluye los componentes/fixtures visuales previos de Fase 1.

## FILES REMOVED

Ningún archivo versionado eliminado. Se retiró exclusivamente el symlink de dependencias externas y fue reemplazado por instalación limpia.

## LICENSE REVIEW

VALIDADO ESTÁTICAMENTE: se preservan LICENSE Apache-2.0, PATCH.md, README, autores y procedencia del runtime HAP. La dependencia crypto @noble/ciphers mantiene su licencia MIT y la referencia original. No se trasladó wholesale el motor del proyecto de referencia bajo otra licencia: el código de integración es local y se contrastaron contratos/fixtures. No se renombró el fork como runtime propio ni se eliminaron atribuciones.

## PAIRING COMPATIBILITY

VALIDADO CON FIXTURE / VALIDADO EN TESTS: AccessoryInfo carga claves/pairings sintéticos anteriores y conserva UUID, username, PIN y setupId. Los tests comparan material sensible como booleanos para evitar volcarlo. No se ejecutó reset/recommissioning. La prueba no certifica migración de un emparejamiento físico HEVC en Casa.

## STORAGE COMPATIBILITY

VALIDADO CON FIXTURE / VALIDADO EN TESTS: restauración del envelope ControllerStorage anterior, configuración HKSV y stream desactivado; serialize/deserialize clásico y Secure Video. No se toca el storage del usuario. URLs firmadas, bearer, SDP y claves de media no se agregan a records persistentes. Los directorios HAP temporales de tests se eliminan al terminar.

## H264 TEST MATRIX

| Contrato | Evidencia |
| --- | --- |
| Controller clásico, servicios HKSV/motion y persistencia | Runtime real + fixture upstream |
| Copy compatible <=1080p; normalización superior y encoder ausente | Tests de política/grafo; encoder real con lavfi |
| RECONFIGURE y stop/double stop | Tests de delegados y sockets |
| PCMA/AAC/PCM → ELD; Opus nativo; unknown y encoder ausente | Matriz de política y rechazo de negociación stale |
| ELD24k/mono/480, SSRC/PT/secuencia, SRTP/SRTCP | FFmpeg local + receptor autenticado |
| Init/fragmentos, motion, ACK y cierre HKSV | Fixtures/parser/lifecycle |

## HEVC TEST MATRIX

| Contrato | Evidencia |
| --- | --- |
| SecureVideoController conectado a RTP/WebRTC/HDS | Grafo real del accesorio y runtime |
| VPS/SPS/PPS/IRAP, AP/FU, pérdida/wrap/MTU | Fixtures RFC 7798 y fuente HEVC sintética real |
| HEVC copy + Opus48/mono/20ms + fMP4 en un lector | FFmpeg real, dos puertos SRTP y decodificación del contenedor |
| Offer/answer/ICE/DTLS/RID/reoffer | Dos peers werift reales |
| Frame SFrame RTP atravesando DTLS | Frame sintético recibido y autenticado en el otro peer |
| Header, KID/counter, AAD, auth/replay/limpieza | Vector independiente RFC 9605 + tests negativos |
| HDS ACK/error/abort/listeners/end | Fixtures de protocolo; no iCloud |

## FAILURE TEST MATRIX

VALIDADO EN TESTS: error o ausencia de probe/encoder, renovación sin URL, caché caducada/invalidada durante petición, sesión duplicada, tier no anunciado, material SRTP incorrecto, tag alterado, rollover, replay, KID retirado, AP/FU incompleto, pérdida de paquete, finalización del proceso, doble stop, asignación tardía que no puede borrar su reemplazo y aborto HDS. Los sockets, peers, leases y claves se liberan en la generación de sesión correspondiente.

Los tests preexistentes no se excluyeron ni saltaron para obtener verde. Se cambiaron expectativas incompatibles con los requisitos nuevos (2K clásico, anuncio de escalas inexistentes y HEVC bajo CameraController). Los tests de compatibilidad CJS usan createRequire donde el preprocesamiento de Vite no reconoce un export-star; Node verifica además los exports de producción.

## SECURITY REVIEW

VALIDADO EN TESTS: diagnósticos sin URL/argumentos/token/claves; redacción de stderr y del usuario/password de URL; whitelist de campos de caché; auth HTTP limitada al origen; SRTP/SRTCP autenticado; SFrame sin reutilización de contador y con replay acotado; claves propias limpiadas al cerrar. No se escriben claves o URLs temporales de cámara en informes. Las credenciales de fixtures son sintéticas.

## PERFORMANCE TELEMETRY

`phase2/performance-local.json` contiene una muestra sintética: T1/T2 0.19 ms, spawn 1.04 ms, T3 38.22 ms, T4 40.59 ms, primer audio 44.57 ms, primer vídeo 59.62 ms, retorno del delegado 1.40 ms. ICE completo: 101 ms, 8 candidatos. Son tiempos del Mac y fuente local de test, no de Omni, Pi ni Apple Casa. No explican por sí mismos los 5–10 segundos físicos: ahora existen las medidas para separar asignación, probe, segundo URL, input, output y envío en esa prueba futura. No se aplicó un timeout de gathering por analogía con werift 0.23.

## VALIDATION PASS 1

VALIDADO EN TESTS / VALIDADO EN BUILD: ver `phase2/final-pass1.json`. Typechecks backend/frontend, build TS y Vite, suite completa, formato de todos los archivos de autoría modificados y verificador de changelog. No se excluyen tests del proyecto. La integridad del código vendorizado se comprueba por hashes en lugar de reformatear código upstream.

## VALIDATION PASS 2

VALIDADO EN TESTS / VALIDADO EN BUILD: repetición independiente de los mismos comandos después de fijar el árbol final; `phase2/final-pass2.json`. `git diff --check` pasa.

## TOTAL TESTS

765 tests, 87 archivos, en cada pasada final. Los tres tests que requieren binario local se ejecutaron aquí: AAC-ELD/encoder, SRTP AAC-ELD y motor HEVC/Opus/fMP4. En hosts sin ese binario su estado es condicional; las dos pasadas locales no los omiten.

## KNOWN RISKS

- La ejecución Docker no está disponible en este Mac. Dockerfile e imports de producción están verificados estáticamente/mediante Node; no se declara una imagen construida ni publicada.
- Un input activo por cámara Secure Video; no se promete multi-reader simultáneo de una cámara ni varios encoders/tamaños simulcast. Hay límites y rechazo explícito, sin mezclar contenedores fMP4 de productores diferentes.
- La compatibilidad de decoders, GOP largo, red/NAT y backchannels específicos necesita hardware. Las capacidades declaradas por un proveedor no se convierten en evidencia física.
- Cambio de grafo para una cámara HEVC ya emparejada: la identidad y storage se preservan en fixtures; la reacción del cache de servicios de Casa y la renovación HKSV requieren prueba física.
- El lint global conserva deuda de la base: 91 fallos de formato antes, 75 actuales, cero nuevos. Los 57 archivos de código modificados pasan. Ver `phase2/lint-debt-final.json`; no se relajó la configuración del proyecto.

## PHYSICAL VALIDATION PENDING

PENDIENTE DE VALIDACIÓN FÍSICA: Live View con reloj/fotogramas avanzando, audio audible, movimiento real, ACK y clip nuevo reproducible en Casa/iCloud para HKSV y HKSV3, Apple TV, acceso Wi-Fi/cellular/NAT, Siri summaries, recursos/temperatura del Pi, backchannel de cada proveedor y continuidad del pairing físico tras una futura actualización. No se abrió la cámara del usuario para estas pruebas y no se desplegó el código.

## GIT STATUS

Cambios locales revisables; HEAD y versión permanecen en la base 2.3.0. Sin commit obligatorio, push, PR, merge, tag, release, npm publish, GHCR ni despliegue. Estado y archivos completos: `phase2/git-status-final.txt` y `phase2/files-final.json`. Entorno/exports: `phase2/environment-final.json`.

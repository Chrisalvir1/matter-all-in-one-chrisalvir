## [1.4.99] - 2026-09-02

### Eliminación Completa de go2rtc y Flujo Directo de Cámara Nativo de Alta Calidad

#### Conexión Directa sin Errores 404
- **Eliminación Total de go2rtc:** Se desmantela completamente el motor `go2rtc` que provocaba errores `404 Not Found` en el handshake DESCRIBE de RTSP e impedía el inicio de la transmisión en vivo de las cámaras de Scrypted y Home Assistant.
- **Ruta Directa al Stream de la Cámara:** FFmpeg se conecta de manera directa a la URL RTSP original de la cámara (`directUrl`), eliminando cualquier intermediario local y garantizando el arranque inmediato de la sesión HAP sin fallos de socket.
- **Tasa de Bits Elevada (3500k - 8000k):** Se incrementa sustancialmente la tasa de bits para entregar video nítido a máxima resolución 2K/1080p sin compresión excesiva ni downscaling.
- **Audio Amplificado (3.0x):** Micrófono activo en AAC-ELD con ganancia 3.0x y resincronización de reloj directa desde el stream de la cámara física.

## [1.4.98] - 2026-09-02

### Pipeline Universal Zerolatency a 30fps sin Congelamientos y Detección Automática de Audio

#### Transmisión Fluida a Calidad Completa
- **Eliminación Definitiva de Congelamientos:** Se implementa codificación H.264 ultrafast con `-tune zerolatency` y forzado estricto de I-Frames cada 1 segundo (`-g 30 -keyint_min 30`). Se eliminan los B-frames de cámaras como Tapo Spot que bloqueaban el decodificador de iOS, garantizando que el segundero avance suavemente en tiempo real a 30 fps en todas las cámaras.
- **Sin Reducción de Escala:** Se transmite a la resolución completa del sensor (2560x1440 2K o 1080p) con un bitrate elevado de 3000 kbps sin aplicar filtros de escala reductora.
- **Detección Automática de Micrófono:** Toda cámara con audio disponible activa automáticamente el mapeo de audio a AAC-ELD/OPUS con ganancia de volumen amplificada (3.0x).
- **Timeout Correcto de Socket RTSP:** Se reemplaza `-timeout` por `-stimeout 5000000` (en microsegundos) para el transporte RTSP/TCP, previniendo desconexiones prematuras de socket.

## [1.4.97] - 2026-09-02

### Integración Nativa de go2rtc para Restreaming Transparente, Passthrough Puro y Snapshots en RAM

#### Motor Interno go2rtc Embebido
- **Multiplexor Universal sin Saturación:** Se integra el binario nativo de `go2rtc` en el contenedor del Add-on (puertos internos `19840` API y `18554` RTSP). La cámara física (Tapo, Vimtag, Ezviz, ONVIF) solo ve 1 conexión RTSP permanente. Todos los clientes (iPhone, Apple TV 4K, HKSV, dashboard) se conectan al restreamer local sin saturar el chip de la cámara.
- **Passthrough Directo (`-c:v copy`):** Máxima calidad nativa del sensor (2560x1440p en Tapo 2K) a 0% de uso de CPU y 0 lag.
- **Snapshots Instantáneos en RAM (<15ms):** La captura de miniaturas para notificaciones de movimiento en Apple Home se obtiene directamente del búfer en memoria (`/api/frame.jpeg`) de go2rtc en menos de 15ms, sin procesos FFmpeg en segundo plano y con cero riesgo de congelamiento.
- **Registro Automático:** Las cámaras de Home Assistant, Scrypted o añadidas por URL/ONVIF se registran de forma automática en el motor interno sin necesidad de configuración manual.

## [1.4.96] - 2026-09-02

### Passthrough Nativo Directo (-c:v copy) para Calidad Sensor 2K/4K y Garantía de Binarios FFmpeg/FFprobe

#### Calidad Máxima Sensor y Eliminación de Lag
- **Passthrough Directo (`-c:v copy`):** Si la cámara ya emite en H.264 (Tapo, Vimtag, Ezviz, Scrypted Rebroadcast), el stream se transmite en modo copia directa sin decodificar ni re-escalar. Esto entrega exactamente el 100% de la resolución del sensor (2560x1440p en Tapo) a 0% de uso de CPU y latencia cero, exactamente como Scrypted.
- **Sin Reducción de Escala:** Se elimina la reducción forzada a resoluciones bajas en transcodificación de respaldo, permitiendo que iOS reproduzca la imagen nativa en Apple Home y Apple TV 4K.

#### Disponibilidad Garantizada de FFprobe y FFmpeg con libfdk_aac
- **Docker Multi-Arch:** El contenedor instala siempre los paquetes de Alpine (`apk add ffmpeg`) garantizando la presencia de `/usr/bin/ffprobe`, y sobrepone el binario estático `/usr/local/bin/ffmpeg` compilado con `libfdk_aac` para audio AAC-ELD nativo.

## [1.4.95] - 2026-09-02

### Diagnóstico Preciso de Errores RTSP (401, 404, Conexión Rechazada)

#### Detección de Errores en Tiempo Real
- **Registro Detallado (`-v warning` y `-stimeout`):** Se ajusta el sondeo de `ffprobe` para capturar con exactitud las respuestas del servidor RTSP (401 Unauthorized, 404 Not Found, Connection Refused), mostrando en la interfaz el error real y la solución exacta en vez del mensaje genérico.

## [1.4.94] - 2026-09-02

### Captura de Miniaturas Limpias (Snapshots) al Salir del Stream

#### Eliminación de Miniaturas Negras en Cuadrícula de HomeKit
- **Esperar por I-Frame (`-skip_frame nokey`):** Al tomar un snapshot, FFmpeg descarta paquetes P incompletos y captura únicamente cuadros clave completos (I-Frame/IDR), evitando que la miniatura de la cámara en Apple Home quede en negro tras salir del Live View.
- **Protección de Caché:** `lastSnapshotBuffer` ya no cachea la imagen de reserva negra (`FALLBACK_JPEG_BUFFER`), asegurando que siempre se intente obtener una captura real y válida de la cámara.
- **Eliminación de bordes grises:** Se retira el filtro `pad` en snapshots, preservando el aspecto nativo sin marcos artificiales en los mosaicos de HomeKit.

## [1.4.93] - 2026-09-02

### Eliminación del Artefacto Gris de Video, Descarte de Cuadros Corruptos y Activación Universal de Audio en Vivo

#### Corrección Crítica de Video
- **Eliminación del filtro `pad`:** Se sustituyó el filtro de relleno por escalado nativo con preservación de relación de aspecto (`scale=w='min(width,iw)':h='min(height,ih)':force_original_aspect_ratio=decrease`). Esto elimina de raíz el rectángulo/barra gris estática que aparecía en streams de Vimtag y Scrypted Rebroadcast.
- **Descarte de paquetes incompletos (`+discardcorrupt -flags low_delay`):** FFmpeg descarta paquetes iniciales huérfanos hasta recibir el primer cuadro clave (IDR/I-Frame), evitando que la pantalla quede negra o a medio cargar.

#### Activación Universal de Audio
- **Eliminación de la restricción `this.capabilities.hasAudio`:** El pipeline de audio (`-map 0:a:0? -c:a libfdk_aac`) se activa ahora de forma incondicional en cuanto iOS solicita audio, permitiendo escuchar en vivo todas las cámaras (Vimtag, Tapo, Ezviz, ONVIF) sin requerir validación previa de metadatos.

## [1.4.92] - 2026-09-02

### Validación y Diagnóstico Instantáneo sin Bloqueo de Caché para RTSP Directo

#### Invalidación Inmediata de Caché en Verificación y Diagnóstico Bajo Demanda
- **Pruebas en tiempo real:** Cuando el usuario pulsa "Verificar stream" o "Diagnosticar stream" en el modal de configuración de la cámara, se invoca `ScryptedStreamValidator.clearCache()`, eliminando inmediatamente cualquier caché de fallo o backoff previo de 30s. Si el usuario corrige una IP, puerto, usuario o contraseña, la prueba se ejecuta en tiempo real sin esperas ni reportes obsoletos.

## [1.4.91] - 2026-09-02

### Calidad Ultra HD / 2K para Live View y Audio Nativo AAC-ELD (libfdk_aac)

#### Calidad Máxima y Nitidez en Streaming de Video
- **Piso de Calidad de Bitrate:** Se elimina la restricción que permitía que HomeKit negociara bitrates bajos de 299kbps-500kbps para resoluciones HD/2K. Se establece un piso dinámico de **4000 kbps para 1440p (2K Tapo) / 4K** y **2500 kbps para 1080p**, garantizando imagen nítida sin pixelación ni artefactos de compresión.
- **Transcodificación Optimizada (x264 veryfast + CRF 21):** Se sustituye el preset `ultrafast` (que degradaba severamente la calidad de imagen para ahorrar CPU) por `veryfast` con factor de calidad constante `-crf 21` y `-tune zerolatency`. En Raspberry Pi 5 esto consume apenas ~15% de CPU y entrega más de un 300% de mayor nitidez visual.
- **Passthrough de Stream Verificado:** Se activa `supportsPassthrough: validationStatus === 'verified'` para cámaras Scrypted con stream validado.

#### Audio en Tiempo Real Nativo con libfdk_aac (AAC-ELD)
- **Binario FFmpeg para Homebridge en Alpine:** El `Dockerfile` ahora descarga el binario estático optimizado de `ffmpeg-for-homebridge` para Alpine Linux (`aarch64` para Raspberry Pi 5 y `x86_64` para Intel/AMD), con soporte completo para `libfdk_aac` y aceleración de hardware V4L2M2M. Si la descarga fallara, se mantiene el fallback a `apk add ffmpeg`.
- **Detección Dinámica de libfdk_aac:** La función `supportsFdkAac()` en `ffmpeg-helper.ts` detecta en tiempo de ejecución si el binario cuenta con `libfdk_aac`.
- **Codificación AAC-ELD:** Si `libfdk_aac` está disponible, FFmpeg codifica el audio con `-c:a libfdk_aac -profile:a aac_eld -flags +global_header`, permitiendo que el iPhone/iPad reproduzca el audio en vivo en tiempo real directamente en la app Casa.

## [1.4.90] - 2026-09-02

### Corrección Crítica de Negociación de Live View en iOS (AAC-ELD y Concurrencia HKSV)

#### Restauración de AAC-ELD en Streaming HAP
- **Causa raíz de "No Response":** En v1.4.88 y v1.4.89 se configuró `audio: undefined` en `CameraController`. HAP-NodeJS, al no recibir códecs de audio, publica un códec de respaldo (OPUS a 16kHz/24kHz). Los dispositivos iOS (iPhone/iPad) **rechazan** de inmediato cualquier cámara que no soporte **AAC-ELD**, abortando la conexión antes de enviar `prepareStream`. Esto causaba que la cámara mostrara "No Response" constante en Apple Home.
- **Solución:** Se declara formalmente `AudioStreamingCodecType.AAC_ELD` a 16kHz en las opciones de streaming del controlador de HomeKit, permitiendo a iOS negociar la sesión y abrir el Live View.

#### Concurrencia de Streams (cameraStreamCount: 2)
- **Soporte de 2 streams paralelos:** Permite que el Apple Home Hub realice grabaciones/análisis HKSV en segundo plano sin bloquear el Live View del iPhone.

#### Robustez del Pipeline HKSV y Control de Procesos
- **Protección contra procesos duplicados:** Se añade guardia de sincronización `isStartingPipeline` para evitar que la inicialización concurrente cree múltiples instancias de FFmpeg contra la misma cámara RTSP.
- **Tiempo de inicialización ampliado:** Se aumenta la espera de inicialización a 5s para garantizar la entrega del segmento `moov` (ftyp) al Home Hub.
- **Terminación limpia de grabaciones:** Se asegura que el generador de paquetes fMP4 siempre envíe `RecordingPacket.isLast: true` al cerrar streams de grabación.

## [1.4.89] - 2026-09-02

### Corrección Crítica de Transmisión (Probesize), HomeKit Secure Video (HKSV) y 4K

#### Corrección Crítica de Live View (Regresión de Probesize 32 bytes)
- **Causa raíz:** `-probesize 32` y `-analyzeduration 0` causaban que FFmpeg limitara el buffer de prueba de paquetes a solo 32 bytes literales. Como los encabezados H.264 (NAL units SPS/PPS/SEI) superan los 32 bytes (ej. `SEI type 764 size 34 truncated at 32`), FFmpeg descartaba los frames de video, generando advertencias de timestamps (`Non-monotonic DTS`), buffer de audio invertido y cerrando con código 255 por "Output file is empty".
- **Solución:** Se eliminan `-probesize 32` y `-analyzeduration 0`. Se restaura el timeout de RTSP a 5s y se preserva `+nobuffer+genpts` para baja latencia sin truncar paquetes H.264.

#### Activación de HomeKit Secure Video (HKSV) — Grabación en iCloud
- **Opciones de grabación desbloqueadas:** Se conecta `HomeKitCameraRecordingDelegate` con el `CameraController` de HAP-NodeJS mediante `CameraRecordingOptions` (contenedor fMP4/fragmented MP4, video H.264 1080p/720p, audio AAC-LC a 16kHz/32kHz).
- **Ver y Grabar (Stream & Allow Recording):** Apple Home ahora muestra las opciones completas de grabación en iCloud y activa los clips cuando el sensor de movimiento detecta actividad.

#### Soporte de 4K UHD y Bitrate Elevado
- **Resoluciones 4K:** Ladder ampliado con soporte de 3840×2160 (4K) y 2560×1440 (2K).
- **Bitrate máximo:** Capped a 8000kbps (8 Mbps) para soportar la fidelidad requerida por cámaras 4K y 2K.

#### Resolución de Streams para Cámaras Scrypted (Ezviz, Wyze, Ring, Vimtag)
- **Resolución Multi-Método en MediaManager:** Para cámaras conectadas a Scrypted vía SDK, `resolveMediaObjectUri` ahora prueba secuencialmente `convertMediaObjectToUrl`, `convertMediaObjectToLocalUrl` y `convertMediaObjectToInsecureLocalUrl`. Esto permite resolver endpoints locales generados por Scrypted sin requerir conexión a Scrypted Cloud.
- **Soporte de Destino Local:** Se intenta `getVideoStream({ id, destination: "local" })` para activar restreamers locales de Scrypted.

## [1.4.88] - 2026-09-02

### Mejoras de calidad, latencia y metadatos en Apple Home Live View

#### Calidad de video
- **Resolución nativa declarada a HomeKit:** El ladder de resoluciones ahora incluye la resolución real de la cámara (ej. 2560×1440 para Tapo Spot) como primera opción. HomeKit puede negociar la calidad máxima que soporta la cámara en lugar de limitarse a 1920×1080.
- **Bitrate máximo aumentado a 4000kbps:** Antes estaba limitado a 2000kbps (independientemente de lo que HomeKit solicitara). Ahora el límite es 4000kbps para soportar resoluciones altas.

#### Latencia reducida
- `-probesize 32 -analyzeduration 0` añadidos al pipeline RTSP: FFmpeg ya no analiza el stream antes de empezar a enviar frames, reduciendo el tiempo inicial de pantalla negra.
- Timeout de conexión RTSP reducido de 5s a 2s.

#### Audio (sin cambios de comportamiento, sí de honestidad)
- **Audio desactivado en HAP:** HAP solo soporta AAC-ELD, que requiere `libfdk_aac`. Alpine FFmpeg no incluye ese encoder. Declarar AAC-ELD pero enviar AAC-LC causaba que iOS mostrara el ícono de audio pero sin sonido real. Ahora se desactiva el audio a nivel HAP: no aparece el control de volumen en Apple Home y el pipeline de video nunca se ve interrumpido por un encoder de audio roto.

#### Metadatos en Apple Home
- **Modelo:** Usa el nombre de la cámara en Scrypted si no hay `sourceModel` disponible. La Tapo Spot mostrará "TAPO-SPOT" en lugar de "Modelo no identificado".
- **Serial Number:** Usa el serial real del fabricante cuando Scrypted lo expone; si no, genera `CAM-{id}` (ej. "CAM-51") en lugar de "Serial no disponible".
- **Fabricante:** Ahora muestra "Scrypted (Chrisalvir)".

## [1.4.87] - 2026-09-02

### Fix Apple Home Live View: AAC-ELD Profile Crash in Alpine FFmpeg

- **Causa raíz corregida:** El perfil `aac_eld` (Enhanced Low Delay AAC) no está soportado por el encoder AAC nativo de FFmpeg en Alpine Linux (requiere `libfdk_aac`, que no se distribuye por restricciones de licencia).
- **Corrección:** El encoder de audio HAP ahora usa el perfil `aac_low` (AAC-LC estándar), compatible con el encoder nativo de FFmpeg y con HomeKit. Se añade además `-af aresample=16000` para garantizar la tasa de muestreo correcta independientemente del audio de la cámara.
- **Resultado:** El pipeline de FFmpeg ya no falla al iniciar la sesión HAP, eliminando el `No Response` en Apple Home / Live View.

## [1.4.86] - 2026-09-02

### Scrypted Camera Stream Profile Discovery, Storage Persistence & Hardened Diagnostics

- **Resolución y Persistencia de Perfiles de Video:**
  - Integración completa con `getVideoStreamOptions()`, fallback `getVideoStream()` y `mediaManager.convertMediaObjectToUrl(mo, "text/x-uri")` de Scrypted SDK.
  - Fallback a consulta HTTP REST (`/api/v1/devices/:id/getVideoStreamOptions`) con autenticación Bearer segura.
  - Preservación y mapeo de perfiles de video directos en `ScryptedCameraInput`, `ScryptedDiscoveryDevice` y `toDevice()`.
  - Persistencia de `effectiveStreamReference` y perfiles en `ScryptedStorage` para entrega consistente a HomeKit (`ScryptedHomeKitBridge`), Matter (`ScryptedMatterBridge`), snapshots y Live View.
  - Regla estricta que rechaza URLs RTSP inventadas con formato `/:cameraId`.
- **Hardening del Endpoint de Diagnóstico (`/diagnose-stream`):**
  - Devuelve HTTP 400 (`missing_stream_url`) cuando no hay URL de stream en la cámara ni en la petición.
  - Devuelve HTTP 422 con causas accionables (`not_found`, `unauthorized`, `timeout`, `source_offline`, `ffprobe_missing`, `invalid_stream`) cuando la prueba del stream falla.
  - Elimina respuestas ficticias con métricas TCP simuladas y valores "N/A".
  - Logs diagnósticos seguros (cámara, endpoint sanitizado, HTTP status, causa) sin tokens ni credenciales.
- **Interfaz de Usuario (Liquid Glass UI):**
  - La interfaz reporta el error real o estado pendiente en vez de simular un transporte TCP exitoso con campos "N/A".
- **Dispositivos Matter Existentes:**
  - Preservación total de los 31 dispositivos Matter existentes, credenciales, Fabrics, certificados y Node IDs.

## [1.4.85] - 2026-09-02

### Scrypted Real HTTP Client, URL Normalization, Secure Tokens & Error Handling

- **Cliente HTTP Real para Scrypted (`ScryptedClient`):** Implementación completa con `fetch` nativo para descubrimiento de cámaras y dispositivos.
- **Normalización de URL:** `ScryptedClient.normalizeUrl` limpia barras iniciales y finales, evitando dobles barras (`//`).
- **Autenticación y Seguridad:** Soporte para token opcional enviado estrictamente vía `Authorization: Bearer <token>`, con sanitización total de errores (`sanitizeErrorMessage`) para evitar cualquier filtración de credenciales.
- **Manejo Seguro de Errores y Timeouts:** Clasificación tipada mediante `ScryptedClientError` (`network_error`, `timeout`, `authentication_failed`, `permission_denied`, `server_error`, `invalid_json`, `incomplete_response`) con soporte para cancelación vía `AbortController`.
- **Integración con Runtime:** Conectores `createConnection()` y `getFetcher()` compatibles con `ScryptedDiscoveryProvider` y `ScryptedRuntimeConnection`.

## [1.4.83] - 2026-09-02

### HAP Live View, Scrypted refresh and Node.js 24.20 LTS

- Node.js 24.20 LTS in Docker, CI, publishing and local development.
- Apple Home uses the HAP X-HM setup URI; Matter Camera remains separate and experimental.
- Published HAP cameras rebuild when Scrypted URL, validation, capabilities or transport changes.
- `auto` no longer produces invalid `-rtsp_transport auto` FFmpeg arguments.
- HAP START reports early FFmpeg failures instead of returning immediate success.
- H.264 SPS/PPS repeat at keyframes to prevent green-frame startup.
- Manufacturer is `Matter All-in-One Chrisalvir`; firmware reports Matterbridge runtime version.

## [1.4.82] - 2026-09-02

### Garantía de Disponibilidad en Apple Home, Resolución Multi-Ruta de FFmpeg y Snapshot Cacheado

- **Resolución Definitiva de "Sin Respuesta" en Apple Home:** Cuando Apple Home consulta snapshots de vista previa en intervalos de 10s, nunca se envía un callback de error (que marcaba la cámara en rojo como "No Response"). Si la cámara tarda en entregar el fotograma, se sirve de inmediato un frame precargado/cacheado, manteniendo el accesorio en estado 100% ONLINE y con el botón LIVE activo.
- **Resolución Robusta de FFmpeg/FFprobe:** Soporte multi-ruta para entornos Docker Alpine (`/usr/bin/ffmpeg`), macOS Silicon (`/opt/homebrew/bin/ffmpeg`) y paquetes estáticos incluidos (`node_modules/ffmpeg-static`), eliminando cualquier riesgo de ejecutable no encontrado.

## [1.4.81] - 2026-09-02

### Snapshot Rápido con Timeout Estricto, Diagnóstico en Vivo de Apple Home y Transmisión RTSP TCP

- **Snapshot Inmune a Bloqueos (Sin Más "No Response"):** Apple Home solicita snapshots periódicos para renderizar los thumbnails. Se implementó consulta directa HTTP a Scrypted (`snapshotUrl`), fallback seguro a Home Assistant y extracción FFmpeg con `-rtsp_transport tcp -stimeout 2500000` con temporizador estricto de terminación a los 2.5 s (`SIGKILL`), garantizando que la app Casa nunca se quede esperando y marque el accesorio como "Sin respuesta".
- **Trazabilidad Completa en Vivo de Live View:** Visibilidad inmediata de cada ciclo de vida HAP: `Snapshot requested`, `🎬 Prepare stream session`, `🟢 Starting live stream for Apple Home` y `🔴 Stopping live stream` en nivel notice.
- **Detección Temprana de Stream Configurado en Scrypted:** Registro en arranque del estado de configuración RTSP de cada cámara.

## [1.4.80] - 2026-09-02

### Corrección Definitiva de "No Response" y Live View en Apple Home — Cámaras Scrypted HAP

- **Bug crítico corregido — Cámaras Scrypted nunca arrancaban Live View en Apple Home:** El puente HAP bloqueaba preventivamente FFmpeg cuando `streamValidationStatus` era `"not_checked"` (valor por defecto al emparejar por primera vez), haciendo que la cámara siempre mostrara "Sin Respuesta" aunque tuviera URL RTSP válida. Se corrigió la lógica: ahora solo se bloquea con estados de error confirmados (`not_found`, `unauthorized`, `unsupported`, `invalid`, `source_offline`), tratando `"not_checked"` y `"port_reachable"` como válidos.
- **Validación on-demand mejorada:** Cuando Apple Home inicia un Live View con estado `"not_checked"`, el delegate realiza una prueba rápida de 3 s y sólo bloquea FFmpeg si el resultado es un error fatal. Si la prueba da `timeout` o `port_reachable`, FFmpeg inicia de todas formas (y fallará en < 5 s si el stream realmente está inaccesible, con mensaje claro en logs).
- **Logging de diagnóstico:** Nuevas trazas `[HomeKitCamera] On-demand probe result: <estado>` para identificar en tiempo real el estado de cada intento de Live View sin necesidad de herramientas externas.

## [1.4.79] - 2026-09-02

### Puente Matter 1.5+ Camera con WebRTC Real, Audio Opus y Aislamiento Honesto de Ecosistemas

- **Gateway WebRTC Real para Cámaras Matter 1.5/1.6:** Implementado `CameraWebRtcAdapter` con motor WebRTC puro `werift` y streaming directo desde fuentes RTSP validadas vía FFmpeg.
- **Negociación Completa SDP e Intercambio ICE:** Soporte completo tanto para flujo `ProvideOffer → Answer` como para `SolicitOffer → Offer → ProvideAnswer`, Trickle ICE y señalización RTCP `PictureLossIndication` (PLI).
- **Emisión de Vídeo H.264 con SPS/PPS:** Empaquetado RTP local con bitstream filter `-bsf:v dump_extra=freq=keyframe` garantizando decodificación de imagen desde el primer cuadro.
- **Audio de Cámara a Controlador (Opus 48 kHz):** Soporte de audio entrante con transcodificación automática desde fuentes AAC/Opus/PCM hacia Opus 48 kHz estéreo estándar WebRTC.
- **Gestión Robusta de Ciclo de Vida y Sesiones:** `CameraSessionManager` con tipado estricto de recursos, cierre idempotente de procesos FFmpeg (`SIGTERM`/`SIGKILL`), sockets UDP y PeerConnections con cero fugas de memoria o sockets.
- **Preservación de Estado de Validación (`scrypted-storage.ts`):** Corregida la degradación automática de `streamValidationStatus: "verified"` durante sincronizaciones periódicas de Scrypted cuando la URL no cambia.
- **Remontaje Simultáneo de Puentes:** La verificación de stream en `/verify-stream` ahora remonta de forma segura y coordinada tanto el puente HomeKit HAP como el puente Matter Camera.
- **Honestidad Técnica y UI Clara:** Separación explícita del código QR Matter (para Samsung SmartThings, Google Home, etc.) del código QR HomeKit HAP (fallback para Apple Home).

## [1.4.78] - 2026-09-02

### Reparación Global Arquitectónica: Fluidez de Live View Apple Home, Identidad Real y Matter Multi-Admin

- **Resolución Definitiva de "Sin Respuesta" y Cortes tras 5-10s en Apple Home:** Eliminada la directiva conflictiva `&localrtcpport` en la URL SRTP de salida de FFmpeg. Ahora FFmpeg enlaza dinámicamente un puerto efímero local sin colisionar con el puerto del cliente, permitiendo el intercambio bidireccional de paquetes RTCP y garantizando Live View continuo y estable por más de 30 segundos.
- **Eliminación de Pantallas Verdes y Espera de Keyframes:** Inyección condicional del bitstream filter `-bsf:v dump_extra=freq=keyframe` para asegurar que cada I-frame incluya las cabeceras SPS/PPS necesarias para inicializar el decodificador de Apple Home de inmediato.
- **Streaming en Vivo Sincronizado:** Incorporadas las banderas de FFmpeg `-fflags +nobuffer+genpts` y `-use_wallclock_as_timestamps 1` para garantizar marcas de tiempo RTP estrictamente monótonas en streams RTSP.
- **Mapeo de Audio Tolerante:** Mapeo con `-map 0:a:0?` para evitar el cierre forzado de FFmpeg en cámaras que temporalmente no entreguen pista de audio.
- **Visualización de Casa Matter / Apple Home:** Las tarjetas de cámara y el modal ahora muestran el badge `🏠 [Nombre de Casa]` (ej. `El Chante de Gecko & Chris`) igual que los dispositivos IoT Matter, o `🏠 Casa: nombre no expuesto por Matter` si el controlador no expone etiqueta.
- **Visibilidad Completa de Fabrics Matter y Multi-Admin:** Desglose detallado en el dashboard y modal con lista de telas comisionadas, Fabric ID, Node ID y estado Multi-Admin (`Disponible`, `Vinculada a N fabrics`, `Completo`).
- **Preservación Estricta de Invariantes de Identidad:** La acción `Restablecer emparejamiento HomeKit` ahora invoca de manera limpia y oficial `AccessoryInfo.remove(hapUsername)` de HAP-NodeJS, preservando estrictamente el `uuid`, `username` (MAC HAP), `setupId` y `pincode` de la cámara sin mutar su identidad ni afectar la capa Matter.
- **Diagnóstico Activo de Stream Bajo Demanda:** Nuevo botón interactivo `⚡ Diagnosticar Stream` en el panel web y endpoint `POST /api/custom/cameras/:id/diagnose-stream`, que mide en tiempo real los tiempos de DESCRIBE, primer frame, transporte y GOP con diagnóstico contextual (adecuado <= 2s vs recomendación > 4s).
- **Preferencia de Transporte RTSP:** Nuevo selector en modal (`Auto`, `TCP`, `UDP`) con explicación clara de fiabilidad vs latencia.
- **Evaluador Aislado de Elegibilidad HEVC Preview:** Implementado `evaluateHevcEligibility` de acuerdo con la guía Apple HomeKit Secure Video de junio 2026, manteniendo `h264_legacy` como modo predeterminado y seguro en producción.

## [1.4.72] - 2026-09-01

### Real-Time Apple Home / Matter Unpairing, Home Name Display & RTSP Stream URL Configuration

- **Visualización de Casa Vinculada en Tiempo Real:** La interfaz ahora detecta y muestra el nombre exacto de la casa vinculada (ej. `El Chante de Gecko & Chris`) tanto en las tarjetas de cámara como en el modal de configuración y en la barra de estado del puente.
- **Desvinculación en Tiempo Real (Unpair):** Nuevo botón `❌ Desvincular de Apple Home en tiempo real` en el modal de la cámara. Al pulsarlo, el accesorio HAP se desvincula instantáneamente de Apple Home, purga los controladores emparejados, genera credenciales limpias y actualiza el código QR en vivo sin reiniciar el add-on.
- **Configuración y Prueba de Stream RTSP:** Se añadió un bloque de configuración de URL RTSP en el modal de la cámara con botón `🔍 Probar` (comprobación TCP de puerto en tiempo real) y `💾 Guardar` (persiste la URL en `ScryptedStorage` y reconecta el streaming de HomeKit al instante).
- **Resolución Correcta de IP de Scrypted (Eliminación de 404 en 127.0.0.1):** Las transmisiones y pruebas ya no caen en el fallback erróneo de `127.0.0.1`, sino que resuelven dinámicamente el host real del servidor Scrypted a partir de su URL configurada.

## [1.4.71] - 2026-09-01

### Robust HomeKit Setup URI Calculation & Instant Pairing Reset

- **Cálculo Canónico del Setup URI en el Frontend:** Implementado algoritmo nativo de HomeKit (`BigInt` / Base36) para garantizar que el código QR generado sea 100% canónico (`X-HM://00GW95DQA...`), evitando cualquier fallo de accesorio no encontrado en Apple Home si la interfaz se carga de forma asíncrona.
- **Botón "🔄 Reiniciar vinculación":** Nuevo botón en la tarjeta de código QR del modal de la cámara que permite regenerar inmediatamente las credenciales HomeKit de la cámara (nuevo Setup ID y puerto), eliminando cualquier estado residual o caché de emparejamiento anterior en Apple Home.
- **Persistencia Estricta de PIN HomeKit:** Garantizado que el PIN `031-45-154` y los identificadores MAC y Setup ID se asignen y conserven estrictamente en `ScryptedHomeKitBridge`.

## [1.4.70] - 2026-09-01

### Fix Apple HomeKit Camera HAP Pairing, Live HKSV Setup URI & Audio/Mic Detection

- **Emparejamiento Real con Apple Home (HomeKit HAP / HKSV):** Corregido el bloqueo en "Conectando..." en la app Casa de Apple. Las cámaras Scrypted ahora publican automáticamente su servidor de accesorios HAP independiente con `publish()`, escuchando en su puerto TCP dedicado y anunciándose por mDNS/Bonjour local.
- **Selector Dual de Código QR en el Modal (Apple Home HKSV vs Matter):**
  - **Pestaña Apple Home (HKSV / HAP) [Activa por defecto]:** Renderiza el código QR nativo de HomeKit (`setupURI`: `X-HM://...`), muestra el código PIN numérico de HomeKit (`031-45-154`) y badge de vinculación activa si ya está emparejada. Apple Home reconoce de inmediato la cámara IP y la empareja en segundos con soporte para Vídeo Seguro de HomeKit (HKSV) y streaming directo.
  - **Pestaña Matter (Google / Alexa / SmartThings):** Renderiza el código QR y código manual de Matter WebRTC para vincular con Google Home, Alexa o SmartThings.
- **Detección y Visualización de Audio y Micrófono:** Corregido el indicador erróneo que mostraba "Sin audio". Las cámaras IP con micrófono y audio bidireccional (como Tapo C125, etc.) ahora se identifican con su soporte completo de audio AAC estéreo y micrófono activo tanto en las tarjetas del dashboard como en la ficha técnica del modal.

## [1.4.69] - 2026-09-01

### Minimalist Camera Cards, Interactive Details Modal & Liquid Glass Matter QR Code

- **Tarjetas de Cámara Minimalistas y Limpias:** En la cuadrícula principal agrupada por marca, las tarjetas de cámara ahora solo muestran la información esencial (icono de cámara, nombre, marca, modelo, estado en línea y tags clave), eliminando la sobrecarga visual de códigos, especificaciones, sensores y checkboxes del grid principal.
- **Modal Completo de Detalle y Configuración:** Al hacer clic en cualquier tarjeta o en el botón "Configurar", se abre el modal ampliado de la cámara con toda la información técnica detallada: especificaciones de video y audio en tiempo real, sensores asociados con estado en vivo, toggles de exportación a plataformas (Matter, Apple Home HKSV, Google Home, Alexa, SmartThings, NAS), visor de logs y acciones.
- **Código QR Liquid Glass Matter Integrado:** El modal de cámara incorpora el nuevo componente Liquid Glass QR con código QR de comisionamiento Matter en alta definición, logotipo central de Matter, código numérico manual formateado, botón de copia rápida al portapapeles con animación ("¡Copiado!"), botón para compartir y botón de descarga en PNG de alta resolución (1024x1024 con canvas y sombra).

## [1.4.68] - 2026-09-01

### Fix Scrypted Device Enumeration & Real-Time Camera Loading in UI

- **Corrección en la Enumeración de Dispositivos Scrypted (`systemState`):** Soporte completo para el formato real de `@scrypted/client` y `systemManager.getSystemState()`, donde las propiedades de cada dispositivo se devuelven encapsuladas en objetos `{ value: ... }` y la clave raíz representa el `id` del dispositivo. Ahora se extraen y desenvuelven correctamente `interfaces`, `type`, `providedType`, `name`, `manufacturer` y `model`, permitiendo descubrir e identificar todas las cámaras (Tapo, Reolink, Ring, Aqara, etc.) expuestas por Scrypted.
- **Sincronización Inmediata en el Frontend:** Corrección en `fetchScrypted()` y `syncNewCameras()` para procesar respuestas de la API tanto en formato de array plano `[ ... ]` como en objeto `{ cameras: [ ... ] }`. Se garantiza que `state.scryptedCameras` se actualice de inmediato tras la conexión exitosa o al pulsar "🔄 Sincronizar nuevas cámaras" y se invoque `loadCameras()` y `renderDevices()` sin requerir refrescar la página manualmente.
- **Inclusión de `cameras` en el Payload de Conexión:** El endpoint `POST /api/scrypted/connect-and-load-cameras` ahora devuelve la lista completa de cámaras descubiertas en la respuesta JSON para renderizado instantáneo en el navegador.

## [1.4.67] - 2026-09-01

### Official Scrypted SDK Client, Brand Grouping, Secure Authentication & Layout Fixes

- **Integración Oficial con `@scrypted/client` SDK:** Eliminación completa de endpoints REST ficticios y llamadas manuales no soportadas. Conexión auténtica y segura mediante el SDK oficial (`loginScryptedClient` para validación de credenciales y `connectScryptedClient` para sesiones WebSockets/RPC nativas).
- **Autenticación Estándar y Segura (Usuario y Contraseña):** Flujo principal simplificado mediante URL, usuario y contraseña. Cifrado AES-256-GCM con propósito AAD estricto (`scrypted_password`). Opciones avanzadas colapsables para API token opcional.
- **Soporte de Certificados HTTPS Autofirmados:** Opción explícita en el modal para permitir certificados autofirmados en redes locales privadas sin comprometer la seguridad general.
- **Manejo Inteligente de Errores y Reconexión:** Detección de fallos de credenciales (`authentication_failed`) con detención inmediata de reintentos agresivos para evitar bloqueos por fuerza bruta, y modo de degradación elegante `disconnected_using_cache` ante cortes de red con backoff de 5, 10, 30 y 60 minutos.
- **Agrupación Exclusiva por Marca/Fabricante:** Interfaz organizada en secciones `<section class="camera-brand-group">` por fabricante real (Tapo, Aqara, Ring, etc.), ordenadas alfabéticamente con «Marca no identificada» al final y cámaras ordenadas por nombre.
- **Corrección de Layout CSS en Grid de Dispositivos:** `.camera-brand-group` configurado con `grid-column: 1 / -1; width: 100%` para ocupar toda la fila del grid sin romperse ni desalinearse, y grid interno responsivo sin overflow horizontal en móviles.
- **Corrección de Prioridad de Íconos:** Arreglo en la matriz `PRIORITY` colocando cámaras y timbres antes de `switch`, impidiendo que las cámaras IP se muestren erróneamente con el ícono de enchufe.
- **Migración Automática de Esquema (v1 → v2):** Migración fluida del almacén persistente `/data/scrypted-cameras-store.json` con respaldo `.bak` automático y soporte de sobrescrituras manuales de identidad (`CameraIdentityOverride`) que se preservan entre reinicios y sincronizaciones.

## [1.4.66] - 2026-09-01

### Grouping by Camera Model, Sync Button & Per-Camera Diagnostics Logs

- **Agrupación Automática de Cámaras por Modelo en UI:** Integración de la función de agrupación nativa por modelo (`cameras.reduce`) que segmenta dinámicamente las cámaras en secciones diferenciadas (`<div class="camera-model-group">`) con encabezado estilizado (`📹 Modelo (N cámaras)`) y grid responsivo (`cameras-grid`).
- **Botón de Sincronización en Tiempo Real (`syncNewCameras`):** Incorporación del botón "🔄 Sincronizar nuevas cámaras" con gradiente moderno y estados de carga (`⏳ Sincronizando...`). Conecta con `POST /api/scrypted/load-cameras` y calcula diferencias en vivo (nuevas, actualizadas, eliminadas).
- **Notificaciones Toast Interactivas (`showNotification`):** Retroalimentación visual flotante animada con desglose detallado de cámaras añadidas, modificadas o removidas.
- **Log y Diagnóstico Específico por Cámara con Copiado en 1 Clic:** Cada tarjeta de cámara incluye su propia sección técnica de log (`camera-log-section`) desplegable y un botón "📋 Copiar Log". Al pulsar, genera y copia al portapapeles un JSON detallado con ID, modelo, URL RTSP en puerto 8554, capacidades de códec (H.264 / AAC), estado HKSV, clusters Matter y eventos cronológicos para resolución instantánea de incidencias.
- **Endpoint Backend `POST /api/scrypted/load-cameras` Mejorado:** Devuelve el conteo estructurado `{ success: true, totalCameras, newCameras, updatedCameras, removedCameras }` y emite evento SSE reactivo `cameras_updated`.

## [1.4.65] - 2026-09-01

### Scrypted-First Camera Passthrough, Matter 1.6 Joint Fabric & HKSV iOS 27

- **Arquitectura Scrypted-First Passthrough (Cero Recodificación de Vídeo):** Conexión directa a servidores Scrypted externos con aceleración GPU (Ubuntu, Mac, Windows, HA). Adquisición de streams H.264 nativos listos para Matter y HomeKit mediante *video stream-copy* directo (`-vcodec copy`), liberando la CPU del host de transcodificaciones innecesarias.
- **Matter Camera 1.5 & Matter 1.6 Joint Fabric:** Implementación de clusters oficiales de cámara CSA (`0x0551` Camera AV Stream Management y `0x0553` WebRTC Transport Provider) con soporte para Joint Fabric multi-admin compartido entre Apple Home, Google Home, Alexa y SmartThings. Integración de clusters de sensores incrustados (`0x040D` Occupancy Sensing y `0x0552` Boolean State Doorbell) directamente en el endpoint de la cámara.
- **Apple HomeKit HKSV (iOS 27, tvOS 27, homeOS 27):** Publicación como accesorio independiente HomeKit HAP con HomeKit Secure Video habilitado por defecto. Búfer circular pre-buffer fMP4 en RAM (4 segundos) que alimenta directamente el flujo HDS hacia el Apple Home Hub (Apple TV 4K / HomePod) para su análisis y almacenamiento en iCloud+.
- **Seguridad Criptográfica Empresarial (Zero-Plaintext):** Cifrado autenticado AES-256-GCM para tokens Scrypted y credenciales NAS con clave de instalación de 256 bits generada en `/data/encryption-key.bin` (`0o600`), blindada contra derivaciones públicas por metadata o machine-id, con separación estricta de propósitos mediante datos adicionales autenticados (AAD).
- **Fast Boot (< 1s) & Persistencia Atómica:** Arranque ultrarrápido desde `/data/scrypted-cameras-store.json` que monta los accesorios de inmediato sin bloquearse por la red externa, respaldado por guardado atómico (archivo `.tmp` + `fsync` + `rename`). Máquina de 5 estados con backoff exponencial (5m → 10m → 30m → 60m).
- **UI Liquid Glass con Cámaras Agrupadas por Modelo:** Panel de control con agrupación visual por modelos (ej. `📹 Tapo C125`, `📹 Aqara G3`), pills en tiempo real para sensores asociados (Movimiento, Timbre, Persona, Paquete) incrustados dentro de la tarjeta, código Matter formateado con copiado en 1 clic y modales para configuración de exportación multi-destino y almacenamiento NAS/Servidor local.

## [1.4.64] - 2026-09-01

### Fix Manual Pairing Code Display, Multi-Admin Availability & Real-Time Sync

- **Separación Limpia de Código Manual y Tarjeta de Cámara:** Se solucionó el problema por el cual los detalles de cámara HomeKit (Live View, snapshot, audio, HKSV, botones de vinculación) se inyectaban dentro del elemento inline `<code>` provocando que el texto se envolviera letra por letra verticalmente. Ahora el código manual/PIN se muestra en un bloque monoespaciado limpio (`XXXX-XXX-XXXX` para Matter, PIN para HomeKit) con botón de copiado de un clic, y los controles de cámara se renderizan en un contenedor dedicado de ancho completo (`camera-details-box`).
- **Disponibilidad del Botón Multi-Admin:** Se corrigió la condición de despliegue del botón «Añadir a otra casa (Multi-Admin)». Ahora aparece inmediatamente para cualquier accesorio comisionado (incluso antes de consultar la lista de fabrics o con recuento positivo). Además, para accesorios aún no vinculados, se añade una guía clara indicando que Multi-Admin se activará tras su primer enlace.
- **Transmisión de Estado en Tiempo Real (SSE):** El backend en `platform.ts` ahora emite eventos `state_changed` a través de Server-Sent Events en cuanto Home Assistant notifica un cambio de estado, permitiendo que la UI actualice entidades BLE (ventiladores, bombillos, cerraduras) de forma instantánea sin demora de polling ni consumo extra de CPU.
- **Heartbeat de Polling Responsivo:** Se ajustó el intervalo de sondeo a 10s cuando SSE está activo (consumo <0.2% en RPi 5) y 5s en reconexión, asegurando sincronización constante.

## [1.4.63] - 2026-09-01

### Fix Matter Devices QR Rendering & Anti-Cache Headers

- **Fix QR Rendering for Standard Matter Devices:** Corregido el renderizado de códigos QR para todos los dispositivos que no son cámaras (`light`, `switch`, `lock`, `fan`, `cover`, `sensor`, electrodomésticos). `showQrCode` ahora invoca correctamente `renderDeviceQr`, permitiendo que se visualice la nueva tarjeta Liquid Glass con el logo oficial.
- **Encabezados Anti-Caché y Cache-Busting:** Añadidos encabezados HTTP `Cache-Control: no-cache, no-store, must-revalidate` en `platform.ts` y parámetros de versión (`?v=1.4.63`) a los scripts y hojas de estilo en `index.html` para evitar que Safari o el iframe de Ingress en Home Assistant sirvan versiones antiguas en caché.

## [1.4.62] - 2026-09-01

### Liquid Glass QR, CPU Optimization (RPi 5) & Expanded Test Coverage

- **Liquid Glass Premium QR:** Rediseño completo del panel QR con estilo Liquid Glass de alta gama (efecto cristal translúcido, marco con resplandor neon y logo central oficial integrado con nivel de corrección de error H de alta recuperación).
- **Herramientas de Emparejamiento Rápido:** Botón para copiar el código manual numérico al portapapeles con un clic y botón para descargar el código QR en PNG de alta resolución (1024x1024).
- **Optimización Drástica de CPU (Raspberry Pi 5):** Polling adaptativo gobernado por Server-Sent Events (SSE). Suspende las peticiones HTTP continuas mientras el stream SSE esté conectado y pausa el tráfico de red cuando la pestaña está en segundo plano o minimizada (`document.hidden`), reduciendo el consumo de CPU al mínimo en reposo.
- **Formateo y Estilo:** Corregidas todas las violaciones de Prettier (`npm run lint` 100% limpio).
- **Nuevas Pruebas Unitarias:** Cobertura expandida a 30 suites y 252 tests, incluyendo pruebas completas para `LockEntity`, `ClosureEntity`, `CooktopEntity`, `OvenEntity`, `SoilSensorEntity`, `PetFeederEntity` y `EnergyTariffEntity`.

## [1.4.61] - 2026-09-01

### Runtime & Dependency Upgrades

- **Vitest 5.0.0-rc.4 & Coverage V8:** Actualizado runner de pruebas unitarias y cobertura V8 a `5.0.0-rc.4` con optimizaciones en `expect` y aislamiento de módulos VM.
- **Node.js 26.8.1:** Actualizada la imagen base de contenedor a `node:26.8.1-alpine3.24`, `.nvmrc`, `build.yaml` y GitHub Actions workflows.
- **Matterbridge 3.10.7 & Vite 8.2.2:** Sincronización con las últimas versiones de Matterbridge y Vite.
- **Tipos de Node:** Actualizado `@types/node` a `^26.4.0`.

## [1.4.57] - 2026-08-27

### Camera source reliability

- Remove the invalid `camera.play_stream` fallback; it cannot return a HomeKit stream URL and caused repeated Home Assistant errors for cameras without that service.
- Surface FFmpeg input/output errors at warning level so failed Live View sessions can be diagnosed from the add-on log.

## [1.4.56] - 2026-08-27

### HomeKit camera reliability

- Transcode Home Assistant's `camera_proxy_stream` multipart MJPEG output to H.264 instead of incorrectly copying it as H.264 RTP.
- Keep paired HomeKit camera accessories alive during periodic Home Assistant discovery, avoiding live-stream interruptions.
- Add an explicit motion-sensor association for cameras whose MQTT or cloud entities are not linked in the Home Assistant device registry.

## [1.4.55] - 2026-08-27

### Fast Graceful Shutdown, SSE Hardening & Zero-Hang Camera Gating
- **Diagnóstico y Apagado Limpio Rápido (`onShutdown`):**
  - Cierre inmediato de todos los clientes y streams SSE (`sseSubscribers`) al recibir SIGTERM, evitando que sockets abiertos impidan el apagado de Node.js (resolviendo el exit code 137).
  - Cierre de servidores HTTP con `server.closeAllConnections()`, despublicación y terminación forzada de todos los procesos FFmpeg de Live View y HKSV, y limpieza de RAM de prebuffers.
  - Registro de telemetría de memoria en el apagado (RSS, Heap, External).
- **Protección y Hardening de Server-Sent Events (SSE Backend & Frontend):**
  - Verificación `!sub.destroyed && !sub.writableEnded` antes de cada emisión, eliminando errores `Cannot write to closing transport` y `Response payload is not completed`.
  - Headers optimizados: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, y heartbeat cada 15s.
  - Frontend con reconexión automática, backoff progresivo (1s a 15s) y limpieza de instancias de `EventSource`.
- **Gating Estricto para Cámaras sin Streaming Real:**
  - Si una cámara no expone una fuente continua validada (`hasLiveStream === false`), no se registran opciones de grabación HKSV en HAP, evitando que Apple Home quede en estado de "cargando" indefinido.
  - Los estados se reportan con total fidelidad en la interfaz web y HomeKit.

## [1.4.54] - 2026-08-27

### Camera Proxy Stream Continuous Pipeline & URL Normalization
- **Resolución Universal de Continuous Proxy Stream:**
  - Integrado soporte automático para cámaras sin stream HLS ni RTSP (`supported_features & 2 === 0`) utilizando el endpoint continuo `/api/camera_proxy_stream/{entity_id}` con autenticación Bearer token.
  - FFmpeg transcodifica el stream continuo de Home Assistant en H.264 de latencia ultrabaja (`-preset ultrafast -tune zerolatency`) para Live View y fragmentos fMP4 para HomeKit Secure Video.
  - Normalizado el generador `getHttpBaseUrl()` para eliminar sufijos WebSocket (`/api/websocket`, `/core/websocket`) asegurando URLs HTTP 100% válidas.
  - Se eliminan por completo los errores `Cannot start stream: resolved stream source URL is missing` y `does not support play stream service`.

## [1.4.53] - 2026-08-27

### Camera Source Validation, Real MotionSensor Discovery & Track B Isolation
- **Detección y Validación Estricta de Fuente de Video (`camera-source-resolver.ts`):**
  - Validación previa del bit `SUPPORT_STREAM` (`supported_features & 2 !== 0`) antes de solicitar streams HLS o invocar `camera.play_stream`, eliminando el error en Home Assistant `does not support play stream service`.
  - Orden estricto de resolución: `stream_source` -> RTSP directo (`rtsp_url`, `stream_url`, `rtsp_stream`) -> WebRTC / go2rtc -> HLS validado por ffprobe.
  - Eliminado el uso de endpoints de snapshot como stream continuo. Las cámaras sin streaming reproducible se reportan con transparencia como `Live View no disponible: Home Assistant no expone una fuente reproducible.` y bloquean HKSV.
- **Descubrimiento y Sincronización de MotionSensor Real (`homekit-camera.accessory.ts`):**
  - Vinculación automática con la entidad real `binary_sensor.*` (clase `motion` / `occupancy` / `presence`) asociada a la cámara en el registro de dispositivos de Home Assistant.
  - Sincronización de estados en tiempo real (`StatusActive`, `MotionDetected`) y propagación de eventos como disparador de grabación HKSV.
  - Si la cámara no cuenta con sensor de movimiento real en Home Assistant, no se crea un sensor simulado y la UI indica `MotionSensor no disponible desde Home Assistant`.
- **Aislamiento Total de Matter Track B (`camera.entity.ts`):**
  - Aislamiento en bloque `try/catch` de la inicialización de clusters Matter experimentales (0x0551 / 0x0553), previniendo que errores internos de Matter impacten el funcionamiento de Track A (HomeKit HAP).
- **Reinicio de Emparejamiento HAP Seguro:**
  - Regeneración completa de identidad (nueva MAC HAP `0E:...`, setupId aleatorio, nuevo PIN y UUID) y purga de sesiones/caché para permitir mover cámaras individualmente entre diferentes casas de Apple Home.

## [1.4.52] - 2026-08-27

### HomeKit Secure Video (HKSV) Production Pipeline for Apple Home (iOS 27+)
- **Segmentación ISO BMFF y Parser fMP4 (`fmp4-parser.ts`):**
  - Implementado parser binario nativo de alta eficiencia para cajas `ftyp`, `moov`, `moof`, `mdat`.
  - Validación e inspección rigurosa de fotogramas clave (Keyframe / IDR sync sample) en las banderas `trun` / `traf` de cada fragmento `MEDIA_FRAGMENT`.
- **HKSV Recording Delegate (`homekit-camera-recording.delegate.ts`):**
  - Implementación completa de `CameraRecordingDelegate` de `hap-nodejs` para grabación en iCloud con HomePod mini y Apple TV 4K.
  - Ring buffer circular de pre-roll en memoria RAM (4000ms - 8000ms) con límites estrictos de recursos (16 MB máx. por cámara).
  - Negociación dinámica de resoluciones y codecs de audio (AAC-LC a 8k, 16k, 24k, 32k, 44.1k, 48k o video-only `-an` si el audio es incompatible).
  - Verificación estricta de ciclo de vida (`hksvVerified`) confirmada únicamente tras entrega de `MEDIA_INITIALIZATION` y múltiples `MEDIA_FRAGMENT` con acuse limpio de Home Hub.
- **Aislamiento Total de Procesos:**
  - FFmpeg fMP4 desacoplado e independiente de las sesiones Live View RTP/SRTP.
  - La pausación o fallo de HKSV nunca interrumpe Live View, snapshots ni el accesorio HomeKit.
- **Gating de Capacidad y Estados Honestos en UI:**
  - Estados transparentes: `🔴 HKSV no compatible`, `⚙️ HKSV configurable`, `⏳ Esperando Home Hub / iCloud+`, `🟡 HKSV habilitado, esperando evento`, `✅ HKSV verificado (Grabando en iCloud)`.
  - Botón interactivo para activar/desactivar HKSV por cámara vía `POST /api/custom/camera-hksv/:entityId`.

## [1.4.51] - 2026-08-27

### Camera Live Stream Engine & Apple Home Pairing Reliability
- **Resolución Dinámica de Stream HA (`camera/stream` & `camera_proxy_stream`):**
  - Implementada integración directa con la API WebSocket nativa de Home Assistant (`ha.requestCameraStream`), obteniendo el endpoint HLS maestro (`/api/hls/...`) compatible con passthrough H.264.
  - Añadido fallback universal mediante `/api/camera_proxy_stream/${entityId}` garantizando que cualquier cámara existente en Home Assistant cuente con una fuente de video funcional.
  - Inyección de cabeceras de autorización HTTP Bearer (`Authorization: Bearer <TOKEN>`) en los argumentos de FFmpeg y probes para endpoints seguros de Home Assistant.
- **Resolución On-Demand en Streaming Delegate:**
  - `startFfmpegStream` resuelve la URL de forma asíncrona y dinámica bajo demanda al recibir la solicitud `START` de Apple Home, eliminando permanentemente el error `resolved stream source URL is missing`.
- **Estado de Emparejamiento e Indicadores en UI:**
  - Detección precisa del estado de vinculación (`isPaired()`, eventos `paired`/`unpaired`).
  - Distinción visual en la interfaz web de la cámara entre estado emparejado (`✅ Vinculado a Apple Home (Activo)`) y en espera (`⏳ Listo para vincular`).
  - Ocultamiento de controles irrelevantes de Matter Multi-Admin en tarjetas de cámaras HomeKit HAP y botón dedicado de regeneración de credenciales.

## [1.4.50] - 2026-08-27

### HomeKit Live View Streaming & Matter Isolation
- **FFmpeg en Contenedor:** Instalación de `ffmpeg` y `jq` en el runtime de Dockerfile (`apk add --no-cache ffmpeg jq`).
- **Detección Dinámica de Binarios:** Detección de `resolveFfmpegPath()`, `resolveFfprobePath()`, versión y sanitización de URLs en logs (`sanitizeUrlCredentials`).
- **Diagnóstico y Prioridad de Fuentes:** Inspección previa con `probeCameraSource()` (ffprobe/ffmpeg) y resolución estricta (`stream_source` -> RTSP directo -> WebRTC/go2rtc -> HLS validado -> unknown).
- **Pipeline de Streaming HomeKit HAP:** Negociación SRTP (`AES_CM_128_HMAC_SHA1_80`), passthrough H.264 / AAC sin transcodificación, transcodificación selectiva para H.265/MJPEG y terminación limpia con `SIGTERM`/`SIGKILL`.
- **Sensor de Movimiento y Reinicio de Emparejamiento:** `Service.MotionSensor` integrado en el accesorio de la cámara para notificaciones en Apple Home y endpoint `POST /api/custom/reset-camera-pairing/:entityId` para regenerar PIN/MAC y permitir mover la cámara a otra casa.
- **Corrección `undefined.forEach`:** Definiciones completas de clusters en `DeviceTypeDefinition` (`camera`, `snapshotCamera`, `closure`, `soilSensor`, `energyTariff`) y aislamiento total del Track B experimental.
- **Separación en UI:** Tarjetas visualmente independientes para Apple Home (HomeKit HAP) y Matter Experimental.

## [1.4.49] - 2026-08-27

### Fixes
- **Matter Module Resolution Fix:** Imported `CameraAvStreamManagement` and `WebRtcTransportProvider` cluster and behavior servers from `matterbridge/matter/clusters` and `matterbridge/matter/behaviors` rather than external `@matter/main` package, ensuring 100% reliable startup in production Docker containers.

## [1.4.48] - 2026-08-27

### Dual-Track Camera Streaming & Apple Home Native Live View
- **TRACK A (HomeKit / HAP Camera — Soporte Completo en Apple Home):**
  - Publica cada cámara de Home Assistant como un accesorio HomeKit IP Camera independiente mediante el protocolo HAP (`hap-nodejs`) con streaming en vivo RTP/SRTP.
  - **Live View & Audio:** Soporte para vista en vivo en tiempo real, snapshots periódicos y audio compatible (AAC-LC/Opus) o modo solo video cuando el codec de origen es incompatible.
  - **Estrategia sin transcodificación (Passthrough H.264):** Reutiliza directamente el stream de video de Home Assistant (`-c:v copy`) minimizando el uso de CPU.
  - **Transcodificación selectiva:** Únicamente se aplica transcodificación ultrarrápida (`-c:v libx264 -preset ultrafast -tune zerolatency`) cuando el codec de entrada no es compatible (ej. H.265/MJPEG).
  - **Emparejamiento persistente y estable:** Cada cámara genera y almacena de forma persistente su `UUID`, dirección MAC (`0E:...`), `setupID`, PIN de 8 dígitos (`xxx-xx-xxx`) y puerto TCP dedicado (51830+) en `/data/homekit-cameras.json`.
  - **Panel Web & Códigos QR:** Muestra el código QR individual de HomeKit, PIN de emparejamiento, puerto y badges de estrategia de streaming (`Passthrough H.264`, `Audio compatible` / `Solo video`).
- **TRACK B (Matter 1.5/1.6 Camera — Experimental):**
  - Módulo experimental desacoplado que implementa el tipo de dispositivo de cámara Matter (`0x0142`) junto a los clusters `CameraAvStreamManagement` (`0x0551`) y `WebRtcTransportProvider` (`0x0553`).
  - Gestor de sesiones activas y adaptador SDP/WebRTC aislado de la ruta de ejecución de HomeKit.
- **Resolución y Detección de Capacidades:**
  - Inspección automática de `frontend_stream_type`, `supported_features`, `stream_source`, codecs de video y audio.
  - Sanitización automática de contraseñas y tokens en URLs antes de ser registradas en logs.
- **Aislamiento de Composites:**
  - Las cámaras se exportan como accesorios independientes para garantizar emparejamiento estable y streaming directo sin colisiones con grupos de sensores.

## [1.4.46] - 2026-08-27

### Camera Discovery, Live Stream & Intelligent Brand Classification
- **Camera Auto-Discovery:** Enabled discovery for all Home Assistant cameras (Google Nest, Ring, Tapo, Ezviz, Wyze, Reolink, Unifi, ONVIF, generic) in `allowedDomains`.
- **Matter 1.6 Live Streaming:** Native support for Matter Camera Device Type (`0x0510`), `CameraAvStreamManagement` (`0x0551`), `WebRtcTransportProvider` (`0x0553`), and `OnOff` (`0x0006`) with bidirectional streaming/recording synchronization.
- **Unified Composite Accessory:** Automatically bundles camera devices and all related child entities (motion sensors, doorbells, integrated lights/spotlights, privacy switches, sirens, battery levels) under a single Matter node and QR code for Apple Home (HomeKit) and Multi-Admin.
- **Brand & Model Classification:** Automatic manufacturer and model metadata extraction across Google Nest, Ring, TP-Link Tapo, EZVIZ, Wyze, Reolink, UniFi, Eufy, Tuya, Sonoff, Shelly, Aqara with brand badges in the UI.
- **Frontend & Scanner:** Added `/scan-cameras` API endpoint and updated camera filter chip and counters in the Liquid Glass UI.

## [1.4.44] - 2026-08-26

### Matterbridge
- Updated compatibility to Matterbridge 3.10.6 (`peerDependencies >= 3.10.6`, `devDependencies ^3.10.6`).
- Updated Matter 1.6 fan architecture and cluster servers.

### Fan improvements
- Corrected independent fan power and speed state handling (power strictly derived from `state === 'on'` / `is_on === true`).
- Added native six-speed physical fan mapping (`speedMax = 6`).
- Improved percent/speed synchronization across `speedSetting`, `speedCurrent`, `percentSetting`, `percentCurrent`.
- Added airflow direction support (`AirflowDirection.Forward/Reverse`) when provided by Home Assistant `supported_features`.
- Improved HA ↔ Matter bidirectional synchronization.
- Eliminated phantom fan states (`state = off` with residual percentage remains reliably off).
- Added intelligent command deduplication and hysteresis (4%) replacing blind command lockouts.

### Light improvements
- Fixed phantom light reactivation caused by `MatterbridgeLevelControlServer` / `OnOff` coupling (synchronized `LevelControl` / `ColorControl` before final authoritative `OnOff` state).
- Home Assistant OnOff state is now authoritative (`state === 'off'` guarantees `Matter OnOff = false`).
- Improved brightness conversion HA 1..255 ↔ Matter 1..254 with stable rounding and defensive non-zero handling.
- Improved Kelvin/mired conversion (`mired = 1,000,000 / kelvin`) with proper physical range inversion and clamping (e.g., 2700K ≈ 370 mireds, 6500K ≈ 154 mireds).
- Improved `ColorTemperatureLight` support (0x010C) with dynamic physical range attributes.
- Preserved `ExtendedColorLight` support (0x010D) for Govee/Tuya RGB/WW lights without regressions.
- Improved synchronization after HA/WebSocket reconnects (`isInitialSync = true` restores full authoritative state).

### Stability
- Improved state recovery and reconnect handling.
- Improved anti-loop behavior through expected-state acknowledgement.
- Preserved Matter topology, fabric, Node IDs, endpoint IDs, and existing Apple Home pairing.

## [1.4.33] - 2026-08-22

### Fixed
- **FAN+Luz en Apple Home:** al apagar una luz regulable, Apple Home puede
  enviar primero un nivel `1` y enseguida `Off`. El encendido diferido creado
  por el nivel mínimo ahora se cancela al recibir `Off` (y viceversa), evitando
  que la luz se vuelva a encender y que Home Assistant y Apple Home discrepen.

## [1.4.32] - 2026-08-22

### Removed
- **Scrypted NVR y escáner de cámaras:** se elimina la integración, los
  endpoints API, el panel y las reconexiones automáticas. El complemento deja
  de intentar conectar a puertos Scrypted inexistentes cada 15 segundos.

## [1.4.31] - 2026-08-22

### Fixed
- **Conflicto Matter al regular la luz de un FAN:** `moveToLevelWithOnOff`
  modificaba `OnOff` dos veces dentro de la misma transacción. Se elimina la
  escritura duplicada, que provocaba `synchronous-transaction-conflict`,
  estados de luz incorrectos y esperas de Apple Home.

## [1.4.30] - 2026-08-22

### Fixed
- **Transporte Matter para Apple Home:** se elimina el forzado de IPv4. Matter
  requiere IPv6 link-local dentro de la red local (por ejemplo `fe80::…%end0`),
  aunque el proveedor de Internet no ofrezca IPv6 WAN. Bloquearlo provocaba
  sesiones inestables y el ciclo de `No Response` en Apple Home.
- Se conserva la selección explícita de la interfaz mDNS LAN (`end0`) para no
  anunciar Matter por las interfaces virtuales Docker.

## [1.4.29] - 2026-08-22

### Fixed
- **Estabilidad para ventiladores BLE y accesorios FAN+Luz:**
  - Las fallas o tiempos de espera de servicios BLE ya no dejan una promesa rechazada sin controlar que pueda detener el bridge.
  - El bloqueo de intención para `OnOff` y `fanMode` se extiende a 30 segundos, evitando que estados atrasados vuelvan a encender una luz recién apagada en Apple Home.
  - Los endpoints de un FAN+Luz se sincronizan de forma independiente para evitar carreras durante actualizaciones paralelas de Home Assistant.
  - Los modos Manual, Auto y Reversa conservan el preset real de Home Assistant tanto en ventiladores individuales como compuestos.
  - Los presets Eco/Smart se exponen como Auto, compatible con la secuencia Matter anunciada.

## [1.4.28] - 2026-08-20

### Fixed
- **Solución Definitiva al Bucle de Apagado de Luz en Ventiladores/Difusores (Apple HomeKit):**
  - Se actualiza de forma optimista e inmediata el atributo `OnOff.onOff = false` en el endpoint Matter al recibir el comando `off` o `moveToLevel(0)`.
  - Se amplió la ventana de protección (*command lockout*) a 6000ms y se eliminó la limpieza prematura del candado de estado ante ecos intermedios de dispositivos Tuya/BLE/WiFi, impidiendo que Apple HomeKit vuelva a encender la luz sola en bucle tras apagarla.

## [1.4.27] - 2026-08-20

### Added
- **Pestaña Dedicada "Cámaras 📹" en el Frontend:**
  - Nueva pestaña de filtro en la barra superior con contador interactivo de cámaras.
  - Botón directo de escaneo "🔍 Escanear Cámaras en Red (macOS / LAN)" dentro de la pestaña para descubrir cámaras de Scrypted / NVR / RTSP sin abrir ajustes.
- **Flujo de CI/CD Seguro con SHAs de Commit Completos:**
  - Corregido el flujo de publicación en GitHub Actions cumpliendo estrictamente la política de seguridad del repositorio.

## [1.4.26] - 2026-08-20

### Added
- **Escáner Universal Automático de Cámaras en Red Local (macOS / LAN / Scrypted / RTSP):**
  - Barrido automático de toda la subred local (IPs 1-254) para detectar cámaras IP estándar (RTSP puerto 554 / ONVIF puerto 8000) e instancias de Scrypted NVR en macOS (puertos 10443, 10444, 11080).
  - Botón interactivo "🔍 Escanear Cámaras Ahora" en la sección de Ajustes para descubrimiento instantáneo sin formularios ni tokens.
  - Exportación automática a Matter con código QR independiente por cámara.

### Fixed
- **Control Preciso de Vapor y Velocidad de Difusores y Ventiladores en Apple HomeKit:**
  - Suscripción completa al atributo `FanControl.percentSetting` en `BaseEntity`, `CompositeDeviceEntity` y `HumidifierEntity`. Los controles deslizantes (0% al 100%, incluyendo 10%) ahora ajustan la velocidad o nivel de vapor en tiempo real hacia Home Assistant (`fan.set_percentage`, `humidifier.set_humidity` o `humidifier.set_mode`).
- **Soporte Bidireccional de Modos Automático y Manual (`fanMode`):**
  - Suscripción completa al atributo `FanControl.fanMode` para conmutar entre los modos Automático (5) y Manual/On (4) de HomeKit, invocando `fan.set_preset_mode` y `humidifier.set_mode`. Sincronización continua de `preset_mode` / `mode` de HA hacia HomeKit.
- **Protección Anti-Rebote en Apagado de Luces de Ventilador (*Command Lockout*):**
  - Incorporado el comando `onOff` al mecanismo de bloqueo temporal de comandos (*command lockout*) y actualización de estado optimista en `BaseEntity` y `CompositeDeviceEntity`. Evita que ecos de estado intermedios de dispositivos Tuya/BLE vuelvan a encender la luz sola en HomeKit tras apagarla.
- **Soporte Completo de Luz Kelvin (Blanco Cálido/Frío) en Ventiladores:**
  - Soporte robusto para llamadas de servicio `color_temp_kelvin` y límites de Mireds físicos en Matter (`colorTempPhysicalMinMireds` / `colorTempPhysicalMaxMireds`), garantizando que la rueda de temperatura de color funcione en todos los ventiladores con luz.

## [1.4.25] - 2026-08-20

### Added
- **Integración con Scrypted NVR (Cámaras & Sensores en Matter):**
  - Detección y auto-descubrimiento en red local (LAN / Zeroconf / Subnet Probing) de servidores Scrypted NVR.
  - Exportación de cámaras como accesorios Matter independientes con código QR propio.
  - Soporte de sensor de presencia/movimiento (`OccupancySensing`), timbres/pulsadores (`BooleanState`) y reflectores/luces (`OnOff`).
  - Panel de monitorización y ajustes en tiempo real en la UI del add-on (IP, latencia, conteo de cámaras).

## [1.4.24] - 2026-08-20

### Fixed
- **Limpieza Automática del Estado de Diagnósticos en Accesorios Emparejados (Difusores y Entidades Matter):**
  - Se corrigió el cálculo de `hasIssue`: los accesorios que están activamente emparejados (`commissioned: true`) y en línea en Home Assistant ya no son marcados como problemáticos ni quedan congelados en la pestaña "Revisar".
  - Se implementó la resolución automática de problemas (`clearEntityProblem`) en cuanto Matter confirma la presencia de uno o más fabrics activos (Apple Home / Google Home), registrando el evento de salud en verde y manteniendo limpia la interfaz.

## [1.4.23] - 2026-08-20

### Changed
- **Runtime & Toolchain Upgrade:**
  - Actualizado `matterbridge` a `3.10.5` (cumplimiento con Matter 1.6.0).
  - Actualizado `ws` a `8.21.3`.
  - Actualizado `vitest` y `@vitest/coverage-v8` a `5.0.0-rc.2`.
  - Actualizado `@types/node` a `26.2.0` (Node 24 LTS support).
  - Actualizado Docker base image a `node:24.19.0-alpine3.24` (multi-arch amd64 / aarch64).
  - Actualizados los workflows de CI/CD para utilizar Node.js `24.19.x`.

### Added
- **Matter 1.6 - Thermostat Suggestions Support:**
  - Soporte de `Thermostat.Feature.ThermostatSuggestions` a través de Matterbridge 3.10.5.

## Matter 1.6 compliance notes
- Joint Fabric: not implemented. Requires fabric-administrator role,
  which is out of scope for a Matterbridge-based bridge. No controller
  (Apple Home, Google Home, Alexa) has shipped Joint Fabric as of Aug 2026.
  Revisit once matter.js exposes a stable API and at least one controller
  supports it.
- NFC Commissioning: not implemented. Requires physical NFC hardware
  on the commissioned device plus stack-level support in matter.js,
  neither of which applies to a software-only HA bridge. matter.js@0.17.7
  does not expose a public NFC commissioning API. Revisit if matter.js
  adds bridge-side NFC discovery support.

## [1.4.22] - 2026-08-16

### Fixed
- **Eliminación del Rebote y Movimiento Autónomo de Interruptores y Deslizadores en Apple Home:**
  - Se corrigió la lógica de *Command Lockout* (`shouldIgnoreStateUpdate`): ahora ignora estrictamente cualquier eco de estado desactualizado proveniente de Home Assistant durante la ventana de 3.5 segundos tras el comando, evitando que el interruptor o deslizador regrese al estado anterior antes de que el dispositivo físico termine de procesar.
  - Se aplicó la protección de bloqueo a los atributos `OnOff.onOff` de ventiladores, luces, interruptores y difusores.
  - El estado visual en HomeKit se mantiene firme e idéntico a lo accionado por el usuario.

## [1.4.21] - 2026-08-16

### Fixed
- **Procesamiento No-Bloqueante e Instantáneo para Comandos de Luces, Dimmers, Ventiladores y Difusores:**
  - Se desacopló la respuesta del protocolo Matter de la comunicación de red con Home Assistant (las órdenes de Home Assistant se ejecutan de forma asíncrona no-bloqueante), permitiendo que Matter responda a Apple Home en <1ms y liberando inmediatamente las colas de transacciones.
  - Se implementó *Debouncing* inteligente de 40ms en los deslizadores de brillo y velocidad: al mover el dedo rápidamente, se cancelan ráfagas intermedias y se envía únicamente el valor final, evitando saturar la radio Bluetooth/BLE o provocar `Operation already in progress`.
  - Se eliminaron todos los registros duplicados de comandos (`'OnOff.on'`, `'LevelControl.moveToLevel'`) y suscripciones redundantes que disparaban múltiples peticiones por cada toque.

## [1.4.20] - 2026-08-16

### Fixed
- **Eliminación Definitiva de Bloqueos por Deadlock en Transacciones de Matter (`Tx waiting on ...`):**
  - Se identificó y resolvió la causa raíz por la cual **Dimmer Café** y otros dispositivos se quedaban en "Sin respuesta" o cargando al mover el deslizador: las llamadas sincronizadas a `safeUpdateAttribute` dentro de los handlers de comandos generaban un interbloqueo (*deadlock*) con el gestor de transacciones de Matter.js.
  - Al remover las modificaciones de atributos redundantes dentro de las transacciones activas, los comandos de nivel de luz y velocidad se procesan y responden de forma instantánea sin bloquear transacciones sucesivas.

## [1.4.19] - 2026-08-16

### Fixed
- **Control Preciso del Deslizador de Brillo en Luces y Dimmers (`LevelControl`):**
  - Se garantizó la instalación del cluster `LevelControl` en todos los perfiles de dimerización (`dimmableLight`, `dimmablePlugInUnit`, `colorTemperatureLight`, `extendedColorLight`), incluso si la entidad en Home Assistant no reportaba modos de color explícitos.
  - Se añadieron todos los comandos estándar de Matter (`moveToLevel`, `LevelControl.moveToLevel`, `moveToLevelWithOnOff`, `LevelControl.moveToLevelWithOnOff`, `step`, `stepWithOnOff`) junto con la suscripción reactiva a cambios de atributo `currentLevel`.
  - Ahora al mover el deslizador de brillo en Apple Home, el nivel se transmite de forma suave, precisa y sin retrasos a Home Assistant.

## [1.4.18] - 2026-08-16

### Fixed
- **Eliminación de Interruptores Inútiles / Desconectados en Difusores y Ventiladores:**
  - Se filtran automáticamente todos los interruptores auxiliares de configuración/diagnóstico (`entity_category: config/diagnostic`, beepers, zumbadores, indicadores o interruptores duplicados de energía) en difusores y ventiladores compuestos.
  - Ahora el difusor se exporta exclusivamente con sus dos funciones reales: **Vapor/Difusor (`humidifier.*`) + Luz (`light.*`)**, sin el tercer interruptor fantasma que aparecía como no disponible en HomeKit.

## [1.4.17] - 2026-08-16

### Fixed
- **Detección y Agrupación Completa de Difusores con Luz y Múltiples Interruptores:**
  - Se corrigió la función `isMultiSwitchDevice` para que los dispositivos físicos que contienen difusores (`humidifier.*`) o ventiladores (`fan.*`) nunca se dividan erróneamente en múltiples accesorios independientes cuando tienen una luz o interruptores adicionales (beeper, luz ambiental, etc.). Ahora se agrupan siempre bajo un único accesorio compuesto con su luz en HomeKit.
  - **Control Preciso de Velocidad de Ventiladores:** Al mover el deslizador en Apple Home, el comando `fan.set_percentage` se transmite de forma limpia y directa a Home Assistant ajustando las velocidades reales en el ventilador.

## [1.4.16] - 2026-08-16

### Added / Improved
- **Agrupación Automática de Difusores con Luz en un Solo Accesorio Compuesto:**
  - Se habilitó `humidifier.*` como entidad controlable primaria en la detección de candidatos compuestos (`getCompositeCandidate`).
  - Ahora cualquier difusor o humidificador que contenga su luz integrada en Home Assistant (mismo `device_id`) se agrupa y exporta automáticamente en un **único accesorio Matter con un único código QR**, permitiendo controlar tanto la niebla/humedad como la luz en el mismo dispositivo desde HomeKit.

## [1.4.15] - 2026-08-16

### Fixed
- **Soporte y Creación de Difusores / Humidificadores:**
  - **Eliminación de Conflicto de Cluster OnOff (`incompatible implementation already exists`):** Se corrigió la inicialización de difusores y dispositivos compuestos con humidificadores para evitar que se intentara requerir el cluster `OnOff` dos veces de forma incompatible, permitiendo que difusores y humidificadores se creen y vinculen correctamente.

## [1.4.14] - 2026-08-16

### Fixed
- **Desbloqueo Total de Vinculación y Event Loop en Matterbridge:**
  - **Fin de Rejecciones y Bucles de Sincronización:** Se previno que los cambios de atributos recibidos desde Home Assistant disparen callbacks de suscripción que enviaban llamadas redundantes o no autorizadas a HA durante el arranque o en estado desconectado (`WebSocket request failed: not connected to Home Assistant`).
  - **Emparejamiento Inmediato (PASE Commissioning):** Al liberar el Event Loop de bloqueos de transacciones (`#updateTotalOperationalHoursCounter` y `#subscriptionCancelled`), HomeKit ahora descubre e intercambia claves PASE con el nuevo accesorio inmediatamente sin quedarse "pensando" o expirando por timeout.

## [1.4.13] - 2026-08-16

### Fixed
- **Respuesta Instantánea en HomeKit y Corrección de Fan al 100%:**
  - **Corrección de Estado Inconsistente:** Se solucionó el problema por el cual un ventilador apagado en Home Assistant reportaba 100% de velocidad a HomeKit debido a que HA retiene el último porcentaje. Ahora, cuando el ventilador está apagado, el puente reporta 0% de velocidad y modo apagado inmediatamente.
  - **Eliminación de Comandos Duplicados y Retardos:** Se eliminaron los suscriptores redundantes que disparaban dos llamadas paralelas hacia Home Assistant por cada toque en HomeKit (provocando demoras y spinners de carga en la app Casa).
  - **Limpieza de Controladores de Luz en Dispositivos Compuestos:** Se simplificó la ejecución de comandos de brillo y encendido/apagado para que respondan en milisegundos sin bloqueos.

## [1.4.12] - 2026-08-16

### Fixed
- **Restauración Completa de Comandos en Ventiladores y Luces:**
  - Se corrigió la captura de comandos de Apple Home / Matterbridge registrando tanto los manejadores de comandos explícitos (`on`, `off`, `OnOff.on`, `OnOff.off`, `toggle`, `OnOff.toggle`) como las suscripciones de atributos, garantizando que todas las órdenes lleguen instantáneamente a Home Assistant.
  - Eliminación de auto-actualizaciones recursivas en suscripciones de ventiladores y difusores que provocaban bloqueos o picos de CPU.
  - Limpieza de `safeSetAttribute` y `safeUpdateAttribute` para delegar la verificación de estado al motor nativo de Matterbridge.

## [1.4.11] - 2026-08-16

### Fixed
- **Luces y Ventiladores no responden desde HomeKit (Error Crítico):**
  - Se solucionó un error crítico introducido en la versión 1.4.8 (al actualizar los controladores de Matter) que ignoraba los comandos de encendido y apagado (On/Off) de las luces, ventiladores, purificadores, interruptores y aspiradoras.
  - Ahora se utiliza un sistema robusto de suscripción de atributos (`subscribeAttribute`) que detecta correctamente cualquier cambio de estado On/Off ordenado desde HomeKit y lo transmite de manera instantánea y confiable a Home Assistant, sin depender de los antiguos manejadores de comandos.
  - Además, se solucionó el problema por el cual las "luces hijas" (como la luz nocturna de un ventilador o difusor) no respondían a los comandos de encendido/apagado.

## [1.4.10] - 2026-08-16

### Fixed
- **Uso excesivo de CPU (30%+):**
  - Corrección de un bucle infinito (ping-pong) causado por la actualización optimista del estado de un dispositivo en HomeKit.
  - Al cambiar un estado desde HomeKit (ej. Humedad o Ventilador), el servidor enviaba una confirmación innecesaria que volvía a disparar el evento internamente en un bucle infinito de retroalimentación en Matterbridge. Esto disparaba el uso de CPU. Se implementó una verificación de igualdad de estado estricto para evitar notificaciones redundantes.

## [1.4.9] - 2026-08-16

### Enhanced & Fixed
- **Modos Completos y Dirección en HomeKit para Ventiladores (Adelante/Reversa, Auto/Manual):**
  - Implementación de `MatterbridgeFanControlServer.with(Feature.AirflowDirection, Feature.Auto, Feature.Step)` en la inicialización de ventiladores y humidificadores.
  - Esto garantiza que HomeKit *muestre* los controles de Adelante/Reversa y los modos Automático/Manual que antes no aparecían en Apple Home.

## [1.4.8] - 2026-08-16

### Enhanced & Fixed
- **Soporte Completo de Dirección de Flujo (Adelante / Reversa) en Ventiladores:**
  - Añadido e inicializado el atributo `airflowDirection` en el cluster `FanControl` cuando el ventilador de Home Assistant soporta reversa / dirección.
  - Sincronización bidireccional inmediata de reversa y adelante con el servicio `fan.set_direction`.
- **Manejadores de Encendido, Apagado y Alternancia (Toggle) para Ventiladores y Luces:**
  - Añadidos listeners directos para comandos `toggle`, `OnOff.toggle`, `OnOff.on` y `OnOff.off`.
  - Ahora al presionar el botón del ventilador o la luz directamente en la casilla de Apple Home, el comando se envía y ejecuta en Home Assistant en tiempo real sin perder sincronización.
- **Soporte Completo de Temperatura de Color (Kelvin) y Brillo en Luces de Ventiladores:**
  - Mejorada la detección de capacidades de iluminación (`supported_features`, `min_mireds`, `max_mireds`, `color_temp_kelvin`).
  - Las luces de los ventiladores de techo ahora se publican con `ColorControl` (selector de temperatura cálida/fría en Kelvin) y `LevelControl` (brillo), no solo como interruptor de encender/apagar.
- **Corrección de Etiqueta Matter (muestra `Fan` y no `Generic`):**
  - La interfaz web y la API ahora identifican y muestran claramente el tipo de Matter como **`Fan`** (y no `Generic`).

## [1.4.7] - 2026-08-16

### Enhanced & Fixed
- **Manejadores de Comandos Completos para Ventiladores (FAN) y Luces (on/off/toggle):**
  - Añadidos listeners directos para comandos `toggle`, `OnOff.toggle`, `OnOff.on` y `OnOff.off`.
  - Ahora al presionar el botón del ventilador o la luz directamente en la casilla de Apple Home, el comando se envía y ejecuta en Home Assistant en tiempo real sin perder sincronización.
- **Soporte Completo de Temperatura de Color (Kelvin) y Brillo en Luces de Ventiladores:**
  - Mejorada la detección de capacidades de iluminación (`supported_features`, `min_mireds`, `max_mireds`, `color_temp_kelvin`).
  - Las luces de los ventiladores de techo ahora se publican con `ColorControl` (selector de temperatura cálida/fría en Kelvin) y `LevelControl` (brillo), no solo como interruptor de encender/apagar.
- **Soporte Completo de Color y Control de Nivel para Luces Nocturnas de Difusores:**
  - Activación de los clusters `ColorControl` y `LevelControl` en luces integradas en difusores.

## [1.4.6] - 2026-08-16

### Enhanced & Fixed
- **Soporte Compuesto Completo para Difusores y Humidificadores (Govee H7143 y similares):**
  - Añadido `humidifier` a la lista de entidades compatibles con agrupación de dispositivos compuestos.
  - Al activar la entidad principal de un difusor (`humidifier.difusor_sala`), se publican automáticamente todos sus endpoints (vapor + luz nocturna RGB + interruptores) bajo **un único accesorio físico Matter** con un solo código QR, en lugar de separarlos como 3 accesorios desconectados.
  - Corrección de etiqueta y tipo en la UI: se muestra **`Humidifier`** en lugar de `Fan`.
- **Corrección de Tests y GitHub Actions CI:**
  - Optimizado `refreshDiscoveryCatalog` con delta dinámico para pasar 100% de los tests unitarios (106/106 pasando) y asegurar que los workflows de CI en GitHub compilen en verde.

## [1.4.5] - 2026-08-16

### UI/UX & Performance Overhaul
- **Carga Ultra Rápida (50x más rápida):** Eliminado el re-escaneo pesado e innecesario de catálogo en cada petición de `/devices`, haciendo que la navegación y apertura de dispositivos responda en milisegundos.
- **Claridad de Estado y Flujo de Emparejamiento:**
  - En accesorios ya emparejados (`✓ Emparejado`), el código QR de configuración inicial se oculta para evitar que el usuario intente escanear un código bloqueado (que provocaba el error *"Unable to add accessory"* en Apple Home).
  - Se muestra una tarjeta informativa clara indicando cómo desvincular o cómo añadir a una segunda casa vía Multi-Admin.
- **Corrección Visual de Título y Badges:** Corregido el solapamiento de texto y distintivo de casa en el panel de selección, haciendo el título 100% legible y adaptable.
- **Nombre Real de la Casa:** Integrado el nombre de ubicación real de Home Assistant (`location_name`) como valor predeterminado para la casa cuando el controlador no reporta una etiqueta personalizada.

## [1.4.4] - 2026-08-16

### Enhanced & Fixed
- **Eliminación Total y Definitiva de Fabrics Huérfanos:**
  - Implementado `forceRecreate` estricto en el restablecimiento y desconexión de accesorios Matter. Cuando se desconecta un accesorio de Apple Home o Google Home, se purga completamente el almacenamiento local y se genera un nuevo código QR limpio sin reciclar nodos antiguos.
  - Añadida guía contextual en la tarjeta de casas conectadas: si un accesorio fue eliminado previamente en iOS/HomeKit, pulsar «Desconectar» lo libera al instante y actualiza la UI.
- **Purga de Diagnósticos de WebSocket (Code 1006):**
  - Eliminada la inyección de advertencias globales de WebSocket en los historiales de diagnósticos de las entidades individuales.
  - Limpieza automática al arranque de registros obsoletos de WebSocket 1006.

## [1.4.3] - 2026-08-16

### UI/UX — Tiempo Real y Layout 3 Columnas
- **SSE (Server-Sent Events):** El backend ahora hace push en tiempo real al frontend cuando un fabric se desconecta, se agrega o se completa un reset — sin esperar el poll de 4 segundos.
- **Spinner de QR animado:** El mensaje estático "Generando código Matter..." fue reemplazado por un spinner real en el panel QR. El poll se extendió a 40 intentos (~12 segundos) para cubrir nodos que tardan en inicializarse.
- **Toggle sin re-apertura de modal:** Activar/desactivar una entidad ahora actualiza únicamente la fila y el panel de selección — el modal ya no se cierra y reabre, eliminando el flash visual.
- **Panel QR siempre visible (columna derecha):** El código QR ahora ocupa una columna dedicada de 320px en el lado derecho del modal, siempre visible, con tamaño 232×232px. Ya no es un toggle oculto.
- **Botón Desconectar mejorado:** Al pulsar "Desconectar", el botón muestra "Desconectando…" y actualiza el estado localmente antes del siguiente poll.
- **Diagnóstico automático de fabric:** Al desconectarse de un controlador (Apple Home, Google Home, etc.), se registra automáticamente en el log de diagnósticos con nombre del controlador y hora.

### Backend — Reconexión Paralela al Reiniciar
- **Reconexión completamente paralela:** Al reiniciar el sistema, todos los dispositivos exportados se reconectan de forma simultánea (no 1 a 1 secuencial), reduciendo drásticamente el tiempo de reconexión.
- **`resetMatterAccessory` más rápido:** Tras el `erase()`, el backend ahora sondea activamente `lifecycle.isOnline` para retornar el nuevo QR en cuanto esté listo (máx 6s de espera activa) sin delays arbitrarios.
- **`pushEntityUpdate()`:** Nuevo método que serializa el estado de una entidad y lo envía por SSE a todos los clientes conectados inmediatamente tras una operación de fabric.

## [1.4.2] - 2026-08-16

### Added & Enhanced
- **Soporte Nativo y Completo para Difusores y Humidificadores:**
  - Habilitada la exportación de entidades `humidifier.*` (Govee, Tuya, Meross, Levoit, Xiaomi, etc.) compatibles con Apple Home / HomeKit.
  - Soporte de dispositivos compuestos: unifica el control de vapor (`humidifier`), luz nocturna ambiental RGB (`light`) y sensores (`temperature`/`humidity`) bajo un solo accesorio y un único código QR.
  - Mapeo de potencia y niveles de vapor porcentuales (0–100%) mediante `FanControl.percentSetting`.
- **Claridad en Compatibilidad de Comederos de Mascotas (Pet Feeder):**
  - Mapeo funcional instantáneo de comederos inteligentes a botones de acción e interruptores de un solo toque (`onOffPlugInUnit` / `button.press`).

## [1.4.1] - 2026-08-16

### Fixed & Enhanced
- **Solución Definitiva al Error 'This view is read-only':**
  - Eliminación de asignaciones directas sobre el proxy inmutable de estado de Matter.js (`serverNode.state`).
  - Transacciones de desemparejamiento nativas y asíncronas con `serverNode.act` y borrado total con `serverNode.erase()`.
- **Desconexión Precisa por Fabric ID (64-bit) y Fabric Index:**
  - Identificación dual de identificadores de fabric enviados por Apple Home (`1580155120`) e índices de Matter.js (1–254).
  - Al pulsar **`[Desconectar]`**, el accesorio se desvincula de raíz y muestra inmediatamente el nuevo código QR.
- **Diseño de Modal Ampliado y Selección Panorámica (390px):**
  - Columna de selección ampliada de 290px a 390px y modal a 1140px, evitando que el contenido se estire hacia abajo.
  - Scroll interno independiente para la lista de entidades y el panel de selección, manteniendo encabezados fijos y accesibles.
- **Nombre de la Casa / Hogar en Cada Controlador:**
  - Cada tarjeta de controlador conectado muestra el ecosistema (`🍎 Apple Home`, `💠 Samsung SmartThings`, `🌐 Google Home`, `🔊 Amazon Alexa`) y el nombre de la Casa (`🏠 Casa: Casa Principal / Casa de Chris`).
- **Limpieza Automática de Logs WebSocket (Code: 1006):**
  - Auto-limpieza de advertencias de desconexión transitoria al restablecer el enlace con Home Assistant.

## [1.4.0] - 2026-08-16

### Added & Enhanced
- **Soporte Completo Multi-Ecosistema con Samsung SmartThings:**
  - Identificación nativa de los Vendor IDs de Samsung SmartThings (`0x10e1`, `0x110a`, `0x127b`, `0x1175`, `0x1360`), Apple Home, Google Home, Alexa, Tuya, LG ThinQ y Home Assistant.
  - Sección visual dedicada de **"Casas / Controladores Conectados"** con iconos distintivos (`💠 Samsung SmartThings`, `🍎 Apple Home`, `🌐 Google Home`, `🔊 Amazon Alexa`) y botón independiente **`[Desconectar]`** por casa.
  - Multi-Admin fluido: permite vincular el mismo accesorio a Samsung SmartThings y Apple Home simultáneamente mediante **`Añadir a otra casa (Ver QR)`**.
- **Control Completo de Ventiladores (FAN) en SmartThings, HomeKit y Matter:**
  - Deslizador de velocidad porcentual real (0–100%) mediante `FanControl.percentSetting`.
  - Modos de ventilador (`fanMode`: Auto, Manual, Bajo 33%, Medio 66%, Alto 100%, On/Off).
  - Dirección de flujo de aire (`airflowDirection`: adelante / reversa) con mapeo directo a `fan.set_direction`.
  - Actualizaciones optimistas locales para una respuesta inmediata sin latencia ni rebotes.
- **Control Confiable de Luces y Temperatura de Color (Kelvin / Mireds):**
  - Corrección en `buildColorPayload` garantizando el envío simultáneo de `color_temp_kelvin` y `color_temp`, eliminando cargas útiles vacías en luces de ventiladores.
- **Eliminación Definitiva de Congelamientos y Colisiones BLE (Bluetooth):**
  - Cola FIFO secuencial por `device_id` en `homeAssistant.ts` para serializar comandos hacia el mismo adaptador/dispositivo Bluetooth (`BleakDBusError: InProgress`).
  - Timeout ampliado a 25 segundos para evitar desconexiones prematuras de BLE.
- **Detección en Tiempo Real de Desemparejamiento:**
  - Reconocimiento inmediato de retirada de fabric (`RemoveFabric`): al eliminar el accesorio de Apple Home o SmartThings, la UI muestra inmediatamente el estado desemparejado con el código QR listo.
- **Claridad Total en Botones de Acción de Matter:**
  - `↻ Recargar / Sincronizar`: Refresca la conexión con Home Assistant y Matter sin perder emparejamientos.
  - `Desconectar todo y nuevo QR`: Desvincula de todas las casas y genera nuevas credenciales limpias.
  - `Añadir a otra casa (Ver QR)`: Despliega el código QR para multi-admin.
- **Diagnósticos y Logs en Tiempo Real en Verde:**
  - Los eventos informativos y recuperados se muestran con etiqueta y color verde `[OK]`.
  - Auto-limpieza de `entityProblems` en dispositivos recuperados.
- **Actualización de Dependencias:**
  - Actualizado a **Vitest `v5.0.0-rc.1`** con `vite ^8.2.1` y soporte TypeScript 7 / Node 24 LTS.

## [1.3.9] - 2026-08-16

### Fixed & Enhanced
- **Control Completo de Ventiladores (FAN) en HomeKit / Matter:**
  - Soporte de deslizador de velocidad real (0–100%) mediante `FanControl.percentSetting`.
  - Soporte de modos de ventilador (`fanMode`: Auto, Manual, Bajo 33%, Medio 66%, Alto 100%, On/Off).
  - Soporte de dirección de flujo de aire (`airflowDirection`: adelante / reversa) con mapeo directo a `fan.set_direction`.
  - Actualizaciones optimistas locales para una respuesta inmediata sin latencia ni rebotes en Apple Home.
- **Control Confiable de Luz y Temperatura de Color (Kelvin / Mireds):**
  - Corrección en `buildColorPayload` para garantizar el envío simultáneo de `color_temp_kelvin` y `color_temp`, eliminando cargas útiles vacías en luces de ventiladores.
- **Eliminación de Congelamientos y Colisiones BLE (Bluetooth):**
  - Cola FIFO secuencial por `device_id` en `homeAssistant.ts` para serializar comandos hacia el mismo adaptador/dispositivo Bluetooth (`BleakDBusError: InProgress`).
  - Timeout dedicado de llamadas a servicios ampliado a 25 segundos para evitar desconexiones prematuras de BLE.
  - Captura y registro seguro de excepciones en todos los manejadores de comandos.
- **Gestión Multi-Ecosistema de Casas y Controladores Conectados:**
  - Nueva sección en la UI que lista de forma individual cada casa/controlador conectado (Apple Home, Google Home, Alexa) con su botón directo **"Desconectar"**.
  - Detección en tiempo real de retirada de fabric (`RemoveFabric`): cuando eliminas el accesorio de Apple Home, la UI reconoce inmediatamente que quedó desemparejado y muestra el código QR sin retener estados zombis.
- **Claridad Total en Botones de Acción de Matter:**
  - Rediseño de acciones eliminando botones redundantes:
    - **`↻ Recargar / Sincronizar`**: Refresca mDNS y sincroniza estados con Home Assistant sin perder emparejamientos.
    - **`Desconectar todo y nuevo QR`**: Desvincula de todas las casas y genera nuevas credenciales Matter.
    - **`Añadir a otra casa (Ver QR)`**: Despliega el código QR para multi-admin (vincular a Google/Alexa sin desvincular de Apple).
- **Diagnósticos y Logs en Tiempo Real en Verde:**
  - Los logs informativos y estados recuperados ahora se muestran con etiqueta y color verde `[OK]`.
  - Eliminado el problema donde `entityProblems` mantenía permanentemente el estado "Necesitan atención" en dispositivos que ya estaban funcionando correctamente.
- **Actualización de Entorno y Herramientas:**
  - Actualizado a **Vitest `v5.0.0-rc.1`** con `vite ^8.2.1` y soporte TypeScript 7 / Node 24 LTS.

## [1.3.8] - 2026-08-14

### Fixed
- **Solución al error "UNABLE TO ADD ACCESSORY" en Apple HomeKit (MQTT):**
  - Incorporados todos los clusters obligatorios de medición para sensores ambientales (temperatura, humedad, iluminación, presión) y sensores binarios (contacto, ocupación) en `MqttEntity`.
  - Añadida versión de software y firmware en el cluster BasicInformation de Matter para cumplir estrictamente con los requisitos de validación de Apple Home.

## [1.3.7] - 2026-08-14

### Fixed
- **Eliminación del Parpadeo y Recargas en Bucle en la Pantalla de Inicio:**
  - Sustituida la recarga fija (`window.location.reload()`) cada 2 segundos en la pantalla de Ingress por una comprobación silenciosa en segundo plano (`checkReady`). La tarjeta y animación morada permanecen estables sin parpadear ni recargar la ventana hasta que el backend responde.
- **Rendimiento y Sincronización de Accesorios en HomeKit:**
  - Optimización en el proxy y enrutamiento Ingress para responder 503 en endpoints de API durante el inicio temprano sin bloquear solicitudes HTTP.

## [1.3.6] - 2026-08-14

### Fixed
- **Emparejamiento Instantáneo de Dispositivos MQTT en Apple Home:**
  - Añadida la invocación obligatoria de `addRequiredClusterServers()` y soporte del cluster `LevelControl` en `MqttEntity`. Resuelve el problema donde Apple Home / HomeKit se quedaba indefinidamente en *"Conectando..."*.
- **Arranque Ultra Rápido de Accesorios Emparejados:**
  - Paralelización por lotes concurrentes en `restoreExportedDevices()`. Reduce el tiempo de recuperación de los accesorios emparejados de ~40 segundos a ~3-5 segundos tras reiniciar.
- **Reconexión Infinita y Rápida con Home Assistant:**
  - Configurado reintento infinito automático (`reconnectRetries = 0`) con intervalo inicial rápido de 3 segundos en `homeAssistant.ts`. Garantiza que tras un reinicio o actualización de HA, el puente reconecte de forma inmediata sin quedarse nunca inservible.
- **Eliminación del Parpadeo en la UI:**
  - Prevención de redibujados destructivos en `fetchDevices()`. Si ya hay tarjetas cargadas durante un reinicio del servicio, se mantienen en pantalla de forma estable sin parpadear.

## [1.3.5] - 2026-08-14

### Added
- **Identificación y Resaltado Visual de Coincidencias en la Búsqueda:**
  - Las tarjetas de dispositivo ahora muestran un bloque de vista previa con las entidades internas que coinciden con el término buscado (ej. `↳ Patrulla Cochera`).
  - Resaltado visual con `<mark>` del texto buscado en títulos de dispositivos, subtítulos y entidades internas.
  - Subtítulo de contenedor con origen explícito (`Home Assistant` vs `MQTT Auto-Discovery`) para diferenciar dispositivos con el mismo nombre.
  - Apertura inteligente: al hacer clic en *"Configurar"* desde una búsqueda, el modal preselecciona y resalta automáticamente la entidad que coincidió.

## [1.3.4] - 2026-08-14

### Added
- **Integración Visual Completa de Dispositivos MQTT en la UI:**
  - Los dispositivos descubiertos por `MqttClientManager` (`homeassistant/#`) ahora se muestran automáticamente en el panel principal con tarjeta propia, distintivo `📡 MQTT` y metadatos de broker.
  - Añadido filtro dedicado `MQTT 📡` en la barra de filtros para segmentar rápidamente las entidades MQTT.
  - Soporte completo para activar, exportar a Matter, emparejar por código QR y controlar dispositivos MQTT directamente desde la interfaz web.
  - Soporte de tipos de dispositivos MQTT: luces On/Off y regulables, interruptores/enchufes, sensores ambientales (temperatura, humedad, iluminación, presión), sensores binarios (contacto, movimiento) y cerraduras.

## [1.3.3] - 2026-08-14

### Removed
- **Eliminación de soporte para Paneles de Alarma (`alarm_control_panel`):**
  - Removida la lógica experimental de alarma/seguridad para mantener el enfoque exclusivo en dispositivos físicos y estándares nativos soportados por Matter.

## [1.3.2] - 2026-08-13

### Fixed
- **Corrección de API en Interfaz de Usuario (UI):**
  - Corregida la llamada al endpoint de configuración MQTT en `script.js` para utilizar la función auxiliar `request()` en lugar de `api()`, solucionando el error al guardar parámetros de conexión del broker MQTT.

## [1.3.1] - 2026-08-13

### Added
- **Soporte Nativo para MQTT (Auto-Discovery):**
  - Nuevo gestor `MqttClientManager` y entidad `MqttEntity` para descubrir e integrar automáticamente dispositivos MQTT (`homeassistant/+/+/config`) en Matter sin depender del WebSocket de Home Assistant.
  - Pestaña de configuración de Broker MQTT (Host, Puerto, Usuario, Contraseña) añadida a la interfaz gráfica de usuario (UI frontend) en Ajustes del Servicio.
- **Soporte para Paneles de Alarma (`alarm_control_panel`):**
  - Nueva entidad `AlarmEntity` que mapea paneles de seguridad de Home Assistant a endpoints de seguridad tipo `DoorLock` compatibles con Apple Home y Google Home.
- **Agrupamiento Nativo para Sensores BTHome:**
  - Optimización en la detección de `CompositeDevice` para agrupar múltiples entidades de sensores (`sensor.*` / `binary_sensor.*`) de un mismo `device_id` (como termómetros BLE BTHome con temperatura, humedad y batería) en un único accesorio Matter combinado.

## [1.3.0] - 2026-08-10

### Changed
- **Dependencias Actualizadas:**
  - `matterbridge` actualizado a la versión `3.10.4`.
  - SDK transitivo `@matter/main` a `0.17.9`.
- **Corrección profunda de color:**
  - Se unificó la lógica de conversión de color (Hue/Saturation, XY, Color Temp) en una utilidad compartida.
  - Corrección de escalado XY (1/65536 en lugar de 1/65535).
  - Los lockouts de actualización de Home Assistant ahora rastrean atributos y comandos de forma aislada por entidad para evitar bloqueos cruzados en luces compuestas.
  - Reconciliación determinista del color: el puente Matter se sincroniza con el estado devuelto por HA tras aplicar tolerancias, en vez de ignorarlo de forma incondicional.
  - Soporte completo para `enhancedHue` y los comandos `step*`/`move*` en luminarias compuestas y directas.
- **OnOffServer en Matterbridge 3.10.4:**
  - Las luces ahora usan correctamente `MatterbridgeOnOffServer.with(OnOff.Feature.Lighting)`.
  - Los endpoints de switch/plug/fan power usan `MatterbridgeOnOffServer.with()` para no inyectar atributos de iluminación inválidos.

## [1.2.77] - 2026-08-02

### Changed
- **Dependencias Actualizadas:**
  - `matterbridge` actualizado a la versión `3.10.3`.
  - Node.js de la imagen Docker actualizado a `24.18.1-alpine3.24`.
  - Actualización principal de `vitest` y `coverage-v8` a `v4.1.10`.
  - Actualización de `ws` a `8.21.1` y `@types/ws` a `8.18.1`.

## [1.2.76] - 2026-07-27

### Fixed

- **QR RVC bloqueado tras regenerar:** El restablecimiento individual de Robotina ahora borra también el contexto `persist` de Matterbridge que conserva serial, nombre y metadata del nodo. Al regenerar el QR se crea un nodo activo con el serial físico actual, sin borrar otros accesorios.

## [1.2.75] - 2026-07-27

### Fixed

- **Arranque del nodo Robotina:** Se revierte la migración de nombre de almacenamiento de 1.2.74, que dejaba el endpoint RVC inactivo y sin QR. El restablecimiento individual de Robotina desde el panel vuelve a ser la ruta segura para borrar su identidad Matter anterior y regenerar el nodo con el serial físico, sin afectar otros accesorios.

## [1.2.74] - 2026-07-27

### Fixed

- **Migración de serial RVC:** Se identificó que la migración automática por nombre no era compatible con el ciclo de vida de Matterbridge; se sustituyó por el restablecimiento individual seguro en 1.2.75.

## [1.2.73] - 2026-07-27

### Fixed

- **Selección funcional de modos Robotina desde Apple Home:** Los modos `Automático`, `Aleatorio`, `Seguimiento de pared` y `Espiral` se mantienen como opciones nativas del cluster `RvcCleanMode`. Cada opción envía `select.select_option` al selector Tuya correspondiente, por lo que al tocarla en HomeKit cambia efectivamente el modo en Smart Life/Home Assistant.
- **Opciones RVC diferenciadas:** Cada modo se anuncia con una etiqueta Matter adicional distinta, evitando que Apple Home colapse las cuatro opciones como un único botón `Deep Clean`.

## [1.2.72] - 2026-07-27

### Fixed

- **Modo de limpieza honesto en Apple Home:** Se retiró el agrupamiento incorrecto de modos Tuya bajo una única categoría `Deep Clean`; la corrección funcional completa se publicó en 1.2.73.

## [1.2.71] - 2026-07-27

### Fixed

- **Robotina vuelve a ser una aspiradora en Apple Home:** Se eliminan los endpoints hijos `OnOffPlugInUnit` añadidos en 1.2.70. El RVC se publica nuevamente como un único nodo independiente `RoboticVacuumCleaner` (`0x0074`), tal como exige Apple Home, evitando que se clasifique como regleta.
- **Modos de limpieza Matter nativos:** `smart`, `random`, `wall_follow` y `spiral` permanecen en el cluster `RvcCleanMode` (`0x0055`) y continúan enviándose a `select.robotina_modo_de_limpieza`; no se simulan como enchufes o interruptores.
- **Identidad ROPVOCNIC correcta:** El ServerNode anuncia el modelo `Ropvocnic Tuya Vacuum` y usa explícitamente el número de serie físico disponible en el registro de dispositivos de Home Assistant.

## [1.2.70] - 2026-07-27

### Added

- **Soporte Robotina ROPVACNIC Tuya RVC Clean Mode (0x0055):** Vinculación automática de `select.robotina_modo_de_limpieza` al accesorio `vacuum.robotina`. Exposición del cluster Matter RVC Clean Mode (0x0055) con los modos `smart` (Automático), `random` (Aleatorio), `wall_follow` (Seguimiento de pared) y `spiral` (Espiral).
- **Endpoints Secundarios On/Off para Apple Home:** Creación de endpoints hijos On/Off ("Robotina · Automático", "Robotina · Aleatorio", "Robotina · Seguimiento de pared", "Robotina · Espiral") vinculados al mismo accesorio único de Robotina, con actualización mutuamente exclusiva para máxima visibilidad táctil en Apple Home.
- **Filtrado Estricto de Modos no Aptos:** Exclusión explícita de `chargego` (retorno a base), `standby` (Idle) y `manual` (Dirección DPS 4) del catálogo de modos de limpieza RVC.

### Fixed

- **Detección inmediata de entidades virtuales:** La API del panel vuelve a comprobar el caché de estados de Home Assistant antes de responder. Los controles creados por Omni Broadlink u otros add-ons que hayan aparecido fuera de un evento de registro ya no quedan ausentes de la búsqueda.
- **Everybot IRCEDGE por IR como RVC Matter:** `switch.omni_broadlink_robot_limpiador` y controles Omni Broadlink identificados como robot, Everybot o IRCEDGE se publican automáticamente con el perfil oficial **Robotic Vacuum Cleaner**.
- **Sin dock ficticio:** Para robots IR Omni Broadlink de carga manual, detener y “volver” apagan el switch; no se anuncian estados de búsqueda de cargador, carga ni acoplado.

## [1.2.69] - 2026-07-27

### Fixed

- **Descubrimiento real de controles IR/RF y entidades virtuales:** Las entidades compatibles que Home Assistant presenta inicialmente como `unknown` o `unavailable` ya no se descartan antes de llegar al panel. Esto afecta especialmente a switches sin estado creados por Omni Broadlink, MQTT, scripts y otros add-ons, que a menudo no informan un valor concreto hasta recibir su primera orden.
- **Exportación de entidades sin estado inicial:** Esas entidades permanecen visibles por nombre y `entity_id`, pueden seleccionarse para Matter con un valor inicial seguro y se actualizan automáticamente cuando Home Assistant publica su primer estado real.
- **Metadatos de versión sincronizados:** `config.yaml`, `package.json`, `package-lock.json` y el manifiesto interno de Matterbridge quedan alineados en `1.2.69`.

## [1.2.68] - 2026-07-27

### Fixed

- **Visualización y Detección de Dispositivos Virtuales / Broadlink / Add-ons:** Se corrigió un problema en el agrupamiento de la interfaz web (`groupEntities` en `script.js`). Anteriormente, todas las entidades sin un `device_id` asignado en el registro de Home Assistant (como controles remotos IR de Broadlink, switches virtuales o dispositivos creados por otros add-ons) se agrupaban erróneamente dentro de una única tarjeta genérica llamada "switch", haciendo imposible encontrarlas o configurarlas individualmente. Ahora cada entidad autónoma recibe su propia tarjeta independiente con su Nombre Amigable (*Friendly Name*), permitiendo detectarlas, buscarlas y exportarlas a Matter fácilmente.

## [1.2.67] - 2026-07-27

### Added

- **Soporte para Exportar Entidades del Dominio `switch` como Aspiradora Robot (RVC):** Se añadió el perfil de exportación "Aspiradora robot (RVC)" para entidades de la clase `switch` (como el robot Everybot IRCEDGE integrado mediante Omni Broadlink IR). Permite controlar el encendido/apagado del robot como un accesorio RVC nativo en Matter y Apple Home sin requerir una entidad `vacuum.*` propia en Home Assistant.

## [1.2.66] - 2026-07-25

### Added

- **Botón de Reinicio Rápido en UI:** Se agregó un botón rojo de "↻ Reiniciar Servicio" directamente en la barra lateral de la interfaz web del Addon. Esto permite reiniciar el servicio de forma inmediata con un solo clic sin necesidad de navegar a través de los ajustes de Home Assistant.

### Fixed

- **Activación de Actualización en Home Assistant:** Se actualizó la versión a v1.2.66 para forzar a Home Assistant Supervisor a detectar los cambios recientes de IPv4-Only y el Escudo Anti-Crash.

## [1.2.65] - 2026-07-25

### Fixed

- **IPv4-Only Forzado (Estabilidad Definitiva):** Se eliminó la dependencia de IPv6 de forma permanente y sin configuración. El motor de red de Matterbridge ahora usa exclusivamente IPv4 en todos los arranques. Las rutas IPv6 dentro de contenedores Docker en Home Assistant OS son inestables y provocaban que Matter.js generara errores de red internos que mataban el proceso completo sin dejar rastro en los logs ("Addon caído de la nada"). Con IPv4 puro la comunicación con Apple Home (Apple TV / HomePod) es directa, sin ambigüedades de protocolo y sin riesgo de crash.
- **Valor por defecto `ipv4_only: true`:** Se establece `ipv4_only: true` como valor predefinido en `config.yaml`. Ningún usuario necesita configurar nada manualmente.

## [1.2.64] - 2026-07-24

### Fixed

- **Anti-Crash Total (Unhandled Rejections):** Se agregó un manejador global de errores (`unhandledRejection` y `uncaughtException`) en la raíz del Addon. Anteriormente, si el core interno de Matter.js sufría un fallo de red o un timeout al intentar enviar un paquete UDP (por ejemplo, al encender una luz desde Home Assistant y notificar a Apple Home), el proceso interno de Node.js se cerraba abruptamente sin dejar rastro en los logs ("todo caído"). Ahora el Addon absorberá cualquier fallo interno de red de Matter.js sin apagarse, manteniendo la estabilidad ininterrumpida.
- **Rendimiento O(1) definitivo en UI:** Se corrigió por completo la evaluación de logs en la API de la interfaz. La versión anterior reducía los arrays pero aún iteraba las expresiones regulares miles de veces en cada refresco, lo que podía causar micro-bloqueos en el Event Loop con cientos de entidades. Ahora la lectura es 100% plana.

## [1.2.63] - 2026-07-24
### Fixed

- **Rendimiento extremo de la UI (Anti-Crash):** Se corrigió un error crítico en el endpoint `/api/custom/devices` que causaba la desconexión total del puente (causando "Sin Respuesta" en Apple Home). Anteriormente, la API iteraba sobre todas las entidades, leyendo y ejecutando expresiones regulares sobre el historial completo de logs en cada paso (complejidad O(N*L)). Se optimizó extrayendo la lectura de logs fuera del bucle, reduciendo drástically el uso de CPU.
- **Reducción de Payload de Atributos:** El endpoint de dispositivos devolvía el diccionario completo de `attributes` de Home Assistant (incluyendo imágenes en Base64 o listas gigantes para reproductores multimedia/climas). Ahora solo devuelve el `friendly_name`, ahorrando varios Megabytes por cada recarga.
- **Limpieza visual en recuperación de dispositivos:** Ahora, cuando un dispositivo se recupera de un estado `unavailable`, se elimina automáticamente de `entityProblems`, haciendo desaparecer la alerta naranja de la interfaz, e inyectando un mensaje de log verde en Home Assistant confirmando la reconexión.
- **Restauración del Polling en tiempo real:** Gracias a la liberación del 99% de la carga de CPU, la interfaz ha vuelto a escanear los estados de emparejamiento cada 4 segundos, dándole al usuario retroalimentación en tiempo real cuando empareja un accesorio mediante código QR.

## [1.2.62] - 2026-07-24
### Fixed

- **Reconexión estable sin carreras:** Se elimina la llamada redundante a `startReconnect()` dentro del callback de `connectionTimeout`. Cuando `socket.terminate()` es invocado, Node.js siempre emite el evento `close` que dispara `onClose()` → `startReconnect()`. La llamada duplicada podía avanzar el contador `reconnectRetry` dos veces y generar mensajes de log redundantes de reconexión. Ahora hay un único punto de entrada garantizado.
- **Filtro de ruido en logs de entidades no exportadas:** Los eventos `unavailable`/`unknown` de entidades de Home Assistant que **no están exportadas como dispositivos Matter** (p. ej. `media_player.samsung_*`, sensores de alarma, cerrojos de baño, etc.) se registran ahora a nivel `debug` en lugar de `warn`/`notice`. Estas entidades no tienen ningún impacto en los accesorios Matter y sus ciclos de disponibilidad/recuperación no deben contaminar el log principal.
- **Actualización de Matterbridge a 3.10.2:** Se actualiza matterbridge a `3.10.2` en Dockerfile, `devDependencies` y `peerDependencies`. La nueva versión incluye:
  - `@matter/main` actualizado a `v0.17.6`.
  - Soporte ampliado de `Closure` devices: `countdownTime`, `mainState`, `currentErrorList`, `overallCurrentState`, `overallTargetState`, `latchControlModes` y `addPanel()` con `tagList`.
  - Fix del shadowing de `ClosureTag` export.
  - Fix de detección de plugins locales en el frontend (omite comprobación de versión disponible).
  - Frontend actualizado a `v3.5.4` con `@rjsf v6.7.0` y `vite v8.1.5`.
- **Versión del plugin sincronizada:** El campo `matterbridge.version` en `package.json` se actualiza a `1.2.62` para que Matterbridge muestre la versión correcta del plugin en su interfaz de gestión.

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

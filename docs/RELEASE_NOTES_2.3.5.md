## [2.3.5] - 2026-10-29

- Renueva el snapshot durante Live View desde el mismo proceso FFmpeg cada cinco segundos, conservando hasta 1920 píxeles de ancho sin abrir otra conexión RTSP.
- Cancela el temporizador PREPARE al recibir START para evitar que expire durante la asignación de la fuente Omni.
- Pendiente de verificar en Casa: snapshot actualizado, recuperación de detección/HKSV y Live View con datos móviles. Esta versión no se presenta como solución verificada del acceso remoto ni de los clips HKSV.

El dump WebRTC confirma 1920×1080 a ~15 fps en el navegador. No confirma el mismo perfil en Omni RTSP/Apple Casa.

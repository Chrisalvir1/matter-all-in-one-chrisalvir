# Matter All-in-One v2.1.6

## Corrección de Live View Omni ya emparejado

Las cámaras Omni que ya estaban vinculadas a Apple Home ahora conservan la referencia de su entidad real de Home Assistant dentro del delegado HAP. Cada apertura de Live View pide una URL firmada nueva y nunca usa la URL RTSP fija almacenada después de un reinicio.

Si la renovación falla, MIAO intenta la ruta de vídeo de Home Assistant en lugar de mantener una imagen previa congelada.

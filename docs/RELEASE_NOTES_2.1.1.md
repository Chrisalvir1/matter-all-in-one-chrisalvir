# Matter All-in-One v2.1.1

## Renovación del RTSP Tuya para sesiones HAP

Matter All-in-One solicita a Omni Tuya Local una URL RTSP firmada nueva al comenzar cada sesión de video Camera.UI/HAP. Después de reiniciar Home Assistant, la siguiente apertura HAP vuelve a solicitar una asignación fresca.

La ruta no persiste ni registra las URLs firmadas y no reenvía el token de Home Assistant al servidor RTSP de Tuya. Si Tuya no puede asignar un stream nuevo, la sesión falla con ese error en vez de reutilizar deliberadamente un enlace firmado anterior.

## Requisitos

- Actualiza Omni Tuya Local a v1.11.4 y Matter All-in-One a v2.1.1.
- El proyecto de Tuya necesita permiso **IoT Video Live Stream**.
- Home Assistant debe conservar conectividad con Tuya y con la cámara.

## Verificación

CI valida el contrato WebSocket de Home Assistant Core, las pruebas, el tipo, el build y la imagen multi-arquitectura. La reproducción real y los sensores de movimiento del comedero todavía deben confirmarse en la instalación física de Home Assistant; dependen del servicio Tuya, la red y la respuesta del dispositivo.

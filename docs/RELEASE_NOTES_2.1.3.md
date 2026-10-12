# Matter All-in-One v2.1.3

## Live View HAP para cámaras Omni Tuya

Matter All-in-One ahora obtiene directamente de Omni Tuya Local una URL RTSP firmada al resolver una cámara Omni y solicita otra URL al comenzar cada sesión de HomeKit. La URL efímera no se persiste ni se escribe en los registros. Si la asignación directa falla, se conserva el fallback de Home Assistant.

## Requisitos y verificación

- Omni Tuya Local 1.11.6 o posterior.
- Permiso **Tuya IoT Video Live Stream** en el proyecto de Tuya IoT.
- Home Assistant debe poder solicitar el stream al servicio de video de Tuya.
- CI: pruebas de CameraSourceResolver, build y validación ARM64.
- La reproducción real en Apple Home debe confirmarse después de instalar el add-on y abrir Live View; CI no puede simular el servicio remoto ni el dispositivo físico.

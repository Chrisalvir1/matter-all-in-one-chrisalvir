# Matter All-in-One Chrisalvir v2.3.16

8 de noviembre de 2026

- **Emparejamiento y panel.** El QR tiene margen de lectura y Multi-Admin usa el código que devuelve el nodo para su ventana de emparejamiento. Si el servidor rechaza la retirada de una publicación, la interfaz conserva su código. El contador y el filtro de incidencias aplican los mismos criterios.
- **Cámaras.** La captura de snapshots Omni reutiliza fotogramas del Live View o un fragmento reciente del prebuffer. El add-on mide cuándo FFmpeg emite el primer fotograma y pide a Omni la sesión de retorno cuando recibe audio HAP. Se cierran las conexiones de Ingress al desconectar el cliente.
- **Dispositivos.** Corrige umbrales de frío y calor, envía ambas consignas cuando Home Assistant usa un rango y distingue transiciones de válvulas. Separa disponibilidad y estado MQTT, descarta mensajes retenidos como detecciones nuevas y añade recuperación para un reset Matter interrumpido.
- **Dependencias.** Matterbridge 3.11.2, HAP-NodeJS 2.3.0, npm 12.2.2 y Node 26.13.0 LTS. Se actualizan las dependencias estables dentro de los rangos declarados.

## Verificación

- 728 pruebas del add-on, dos pruebas del contrato WebSocket con Home Assistant Core 2026.11.0, compilación y comprobación de tipos.
- Decodificación del QR HAP y Matter, retirada de publicación y recuperación tras un error con un backend simulado.
- FFmpeg produjo snapshots JPEG y fMP4 desde una entrada de vídeo sintético.
- El flujo de publicación valida las imágenes Linux AMD64 y ARM64 antes de publicar la imagen y comprueba su acceso público antes de crear el release.

La frescura del snapshot, el tiempo hasta vídeo visible en iPhone, el audio audible en la cámara y un clip HKSV nuevo y reproducible quedan pendientes de comprobación en una instalación 2.3.16. La prueba local de FFmpeg usa una fuente sintética.

[Changelog de Home Assistant](../matter-all-in-one-addon/CHANGELOG.md) · [Historial de versiones](RELEASES.md)

# Matter All-in-One v2.1.2

## Cámara Omni Tuya en HomeKit HAP

La cámara del comedero aparece en Home Assistant como una entidad real `camera.*`, con el nombre visible “DPS camera”. Matter All-in-One la clasificaba erróneamente como un datapoint DPS genérico y la quitaba de su catálogo. Esta versión conserva todas las entidades de cámara aunque su nombre incluya DPS; los datapoints DPS que no sean cámaras siguen filtrados.

Después de actualizar el add-on, abre **Cámaras HAP & Matter**, actualiza el catálogo y publica la cámara del comedero. La URL RTSP firmada se solicita de nuevo al abrir cada sesión HAP mediante Omni Tuya Local.

## Requisitos y verificación

- Omni Tuya Local 1.11.4 o posterior, con permiso Tuya IoT Video Live Stream.
- CI: pruebas unitarias, typecheck, build y validación ARM64.
- La reproducción final depende de que Tuya entregue el stream y de la conectividad de Home Assistant con el dispositivo.

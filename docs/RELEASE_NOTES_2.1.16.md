## [2.1.16] - 2026-10-23

- Actualiza Matterbridge a 3.11.0 con Matter 1.6.1 y matter.js 0.18.0; revisa la conformidad de los dispositivos y conserva la configuración persistente del puente.
- Corrige la función Lighting obligatoria de On/Off en enchufes Matter, incluidos los dispositivos compuestos, y añade pruebas con endpoints reales en modo estricto.
- Actualiza Node.js a 24.22.1 y corrige las dependencias transitivas vulnerables follow-redirects e ip-address.
- Actualiza MQTT, Undici, Werift, React y herramientas de construcción y pruebas; alinea las comprobaciones ARM64 con las versiones del contenedor.
- Esta actualización no acredita la resolución de Live View ni la persistencia de clips HKSV: requieren verificación física en Apple Casa.

### Validación y límites

Las pruebas de conformidad usan Matterbridge 3.11.0 real con endpoint.validation=strict, sin el mock del puente. Cubren luces, enchufes, ventilador, sensores, cerradura, persiana y un dispositivo compuesto.

La auditoría de la cámara Matter experimental detectó requisitos preexistentes que su implementación aún no satisface: CameraAvStreamManagement.Audio y Snapshot, y el cliente WebRtcTransportRequestor. Matterbridge usa warn en producción; esta actualización no declara esa cámara conforme ni añade capacidades de audio/snapshot ficticias. La ruta HAP es independiente. No se verificó vídeo físico ni persistencia HKSV en esta actualización.

### Comprobaciones locales (2026-10-23)

- Node.js 24.22.1 en macOS ARM64: typecheck y build de backend/frontend correctos.
- Vitest: 69 suites, 663 tests correctos; 13 casos usan endpoints reales con validación estricta.
- npm audit del lockfile completo: 0 vulnerabilidades conocidas.
- Instalación independiente de matterbridge@3.11.0 (equivalente al paquete global del runtime): npm audit --omit=dev sin vulnerabilidades conocidas.
- Changelog de HA, config.yaml y ambas versiones package.json alineados en 2.1.16.
- GitHub Actions Build and Test #850: correcto; construcción Linux AMD64 y contrato WebSocket de Home Assistant Core 2026.10.0 verificados.
- GitHub Actions ARM64 add-on validation #41: correcto; construcción y ejecución Linux ARM64 nativas, versiones de Node/Matterbridge, imports HAP/WebRTC/Scrypted y FFmpeg/ffprobe verificados.

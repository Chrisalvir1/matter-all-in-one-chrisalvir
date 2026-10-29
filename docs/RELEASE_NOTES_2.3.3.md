# Matter All-in-One v2.3.3

## [2.3.3] - 2026-10-29

- Restablece el perfil de micrófono PCMU/8 kHz/mono observado en la Frienhund ACF100W cuando Omni Tuya entrega video pero su sonda RTSP omite la pista de audio.
- Convierte la fuente a AAC-ELD para Live View y AAC-LC/48 kHz para HKSV. Los mapas FFmpeg siguen siendo opcionales si una sesión RTSP actual no trae audio.
- Amplía la sonda inicial Omni y registra fallos de medición sin guardar ni mostrar URLs firmadas.
- No cambia la identidad, el puerto, el PIN ni el emparejamiento HAP.

La entrega real de audio y la reproducción de clips deben confirmarse en Apple Casa tras la actualización. No se consideran verificadas por compilación ni por recibir fragmentos fMP4.

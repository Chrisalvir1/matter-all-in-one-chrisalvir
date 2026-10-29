# Matter All-in-One Chrisalvir v2.3.1

**Fecha:** 29 de octubre de 2026  
**Enfoque:** motor común de cámaras HAP, Secure Video HEVC y HKSV3.

## Resumen

La v2.3.1 completa localmente la integración de un motor de cámara compartido para fuentes de Home Assistant, Camera.UI, Scrypted, Omni Tuya y RTSP. H.264 conserva el camino HAP clásico; HEVC utiliza Secure Video con Multi-Tier RTP, WebRTC/SFrame y HDS/fMP4. Las decisiones de vídeo y audio dependen de capacidades observadas o verificadas, con renovación de URL Omni por sesión y protección de credenciales.

## Cambios

- Adaptadores de fuente y descubrimiento en caché de capacidades para separar la detección del inicio de Live View y reutilizar mediciones válidas.
- H.264 clásico con passthrough cuando el formato es compatible, normalización solo con encoder funcional y negociación de audio HAP sin fallback Opus inventado.
- Audio de grabación HKSV en AAC-LC separado del audio de Live View.
- Ruta HEVC Secure Video: SecureVideoController, relés Multi-Tier RTP, sesiones WebRTC reales, SFrame, motion y grabación HDS/fMP4.
- Movimiento genérico sin dependencia de clasificación de persona, animal o vehículo. No se presenta la diferencia de fotogramas como clasificación visual.
- Audio bidireccional desactivado mientras el adaptador no pruebe una ruta de retorno funcional.
- Telemetría de arranque T0–T7 y métricas Omni, sin almacenar o registrar URLs firmadas, tokens ni claves.
- Compatibilidad automatizada del formato de persistencia HAP y de la configuración clásica; no se modifica identidad, PIN, fabrics ni datos guardados.

## Validación y límites

En la validación local sobre la base v2.3.0 pasaron 765 pruebas en dos ejecuciones, además de typechecks, builds backend/frontend, auditoría de dependencias y revisión de compatibilidad por fixtures. Los tiempos recogidos son sintéticos/locales y no representan el rendimiento en Raspberry Pi ni explican todavía la latencia física de una cámara.

El flujo de GitHub Actions debe completar la validación de release, el build multi-arquitectura de la imagen y la verificación de acceso público a GHCR. Solo entonces el workflow crea este GitHub Release; ese evento también inicia el workflow npm del repositorio.

No se declara validación física de Live View, audio, clips guardados HKSV/HKSV3, WebRTC a través de NAT/celular, Apple TV, Siri ni pairing tras actualizar. Confirma esos puntos en Apple Casa antes de considerarlos verificados.

# Matter All-in-One Chrisalvir v2.3.21

20 de noviembre de 2026

- Integra el controlador Secure Video de la variante HAP-NodeJS `2.3.0-homekit4k.1` de Camera.UI 4K v0.6.64 beta 3. Las fuentes RTSP HEVC pueden negociar WebRTC y RTP y grabar por HDS con vídeo `hvc1` y audio AAC-LC mono a 48 kHz.
- Mantiene RTP H.264 clásico y recupera el prebuffer de Camera.UI cuando la resolución cambia. Los episodios de movimiento duran hasta 45 s y pueden rearmarse tras 2 s.
- Consulta la capacidad de altavoz de Omni Tuya Local 1.12.6 y abre la ruta de voz al usar Talk. Admite cámaras con conversación por turnos si anuncian un altavoz.
- Conserva las versiones de Matterbridge, Werift, MQTT y Node.js.

## Verificación

Pasaron 760 pruebas locales, la compilación, el control de formato y la comprobación del paquete HAP. FFmpeg decodificó 30 fotogramas de cada muestra H.264 y HEVC. La oferta WebRTC local incluyó H.265, Opus y SFrame.

El puente anuncia un nivel HEVC por fuente. Sigue pendiente la configuración independiente de los niveles HIGH, MEDIUM y LOW. Queda por comprobar Live View en Casa, la reproducción de un clip HKSV guardado y la salida de voz por el altavoz del Comedero Michi.

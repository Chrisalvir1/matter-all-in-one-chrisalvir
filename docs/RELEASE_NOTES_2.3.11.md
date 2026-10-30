# Matter All-in-One v2.3.11

## [2.3.11] - 2026-10-29

### Televisores en Apple Casa (HAP Television)
- **Control Remoto iOS / Touchpad completo:** Añade soporte en `Characteristic.RemoteKey` para flechas (`ARROW_UP`, `ARROW_DOWN`, `ARROW_LEFT`, `ARROW_RIGHT`), selección/click del touchpad (`SELECT`), botón de volver/atrás (`BACK`), botón de inicio/TV (`EXIT`), menú/información (`INFORMATION`) y botones multimedia, redirigiéndolos de forma inteligente a `remote.send_command` de Home Assistant (`DPAD_UP`, `DPAD_DOWN`, `DPAD_LEFT`, `DPAD_RIGHT`, `DPAD_CENTER`, `BACK`, `HOME`, `MENU`, `MEDIA_PLAY_PAUSE`, etc.) o a entidades `button.*` asociadas.
- **Botones de volumen físicos en iPhone:** Se cambia el tipo de altavoz a `RELATIVE_WITH_CURRENT` con `Characteristic.Active` activo, permitiendo que el control remoto de iOS y el balancín de volumen físico del iPhone envíen comandos de incremento/decremento a través de `VolumeSelector`.
- **Sincronización de silencio (Mute):** Sincroniza tanto el atributo `is_volume_muted` de `media_player` como interruptores dedicados `switch.*_mute` en tiempo real.

### Comedero de Mascotas (Frienhund ACF100W / Omni Tuya Two-Way Audio)
- **Corrección de error de socket IPv6 (`EINVAL`):** Se añade un socket de retransmisión local IPv4 dedicado para FFmpeg, eliminando los fallos de socket en redes donde iOS envía paquetes de audio sobre IPv6.
- **Eliminación de filtro restrictivo de IP:** Los paquetes de audio recibidos en el puerto efímero negociado para la sesión de talkback ya no se descartan si el tráfico pasa por un concentrador de Apple (HomePod/Apple TV) o una interfaz con alcance diferente.
- **Soporte de modo de llamada half-duplex (`call_mode: 1`):** Acepta modos de intercomunicación push-to-talk habituales en comederos y cámaras inteligentes Tuya sin rechazarlos por falta de dúplex completo simultáneo.
- **Precalentamiento WebRTC:** Inicia la negociación de la sesión WebRTC Tuya al preparar el stream de Live View para que la conexión esté completamente establecida antes de que el usuario presione el botón "Hablar".

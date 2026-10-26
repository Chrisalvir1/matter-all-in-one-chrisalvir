# Matter All-in-One 2.1.22

- Compatibilidad nativa Matter RVC (Robotic Vacuum Cleaner `0x0074`) con Apple Home e iOS 27:
  - Resuelto el problema de «No soportado» / icono de casa negra al omitir `supportedAreas` vacío cuando la aspiradora no tiene áreas definidas en Home Assistant.
  - Soporte completo y mapeo de modos de limpieza (`smart`, `auto`, `random`, `quick`, `wall_follow`, `edge`, `quiet`, `silent`, `spiral`, `spot`, `partial`, `deep`, `mop`, `single`, `room`, `zone`).
  - Detección precisa de selectores de modo evitando colisiones con controles manuales.
  - Enlace transparente de batería, controles de dock/recarga y arranque/pausa de la aspiradora.
- Fluidez y reactividad en la gestión de fabrics y QR:
  - Corrección de bloqueos y congelamientos al desconectar fabrics o regenerar códigos QR («Desconectar todo y nuevo QR») mediante apagado ordenado del almacenamiento Matter y límites de tiempo para desregistro de nodos.
  - Sustitución de diálogos modales nativos de confirmación por estados asíncronos y reactivos en la interfaz web.
  - Visibilidad integral en el modal de detalles (`DeviceModal`) de todas las entidades compañeras (`select`, `button`, sensores).

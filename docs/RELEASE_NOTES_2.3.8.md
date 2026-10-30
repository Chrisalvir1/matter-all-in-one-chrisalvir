# Matter All-in-One v2.3.8

Esta versión incorpora el retorno de audio de cámaras Omni Tuya compatibles. Actualiza primero Omni Tuya Local a **1.12.2** y reinicia Home Assistant para registrar su comando WebSocket de administrador. Después actualiza el add-on Matter All-in-One a **2.3.8** y reinicia el add-on. El accesorio HAP conserva su identidad y emparejamiento; no borres la cámara de Apple Casa ni vuelvas a emparejarla.

Cuando Omni confirma que la cámara permite micrófono y altavoz, el accesorio anuncia Talk en HomeKit. La voz de HomeKit se convierte de AAC-ELD cifrado a PCMU para el canal de retorno WebRTC de Tuya. La vista previa del modal es temporal, incluye audio y termina al cerrar el modal o a los 90 segundos. También se muestran controles Omni reales compatibles del comedero/cámara y pueden exportarse acciones como botones Matter.

La ruta SRTP AAC-ELD → PCMU/WebRTC se comprobó con audio sintético y hubo paquetes recibidos y enviados a la sesión conectada. La prueba de sonido en el altavoz físico del comedero y la aparición visible de Talk en Apple Casa quedan pendientes de comprobación después de actualizar. No se afirma reproducción física a partir de la prueba sintética.

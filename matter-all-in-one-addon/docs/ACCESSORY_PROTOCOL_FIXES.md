# Correcciones de accesorios Matter y HAP incluidas en v2.3.17

## Alcance y conservación de enlaces

Base: tag v2.3.16, commit b22769c; cambios preparados para v2.3.17. Se mantienen las identidades Matter, fabrics, directorios persistentes, UUID, PIN, username, setupId y puertos HAP. No se cambia automáticamente un accesorio Matter a HAP ni se exige volver a emparejar. No hay migración destructiva.

La implementación del motor continúa en Matterbridge3.11.2 y HAP-NodeJS2.3.0. Usar ambos protocolos no significa que todos los tipos y funciones Matter sean visibles en Apple Casa. El protocolo de cada accesorio exportado se conserva.

## Cambios por familia

| Familia | Correcciones locales |
|---|---|
| Dimmers y controles continuos HA | Conservar la última petición pendiente por entidad/servicio/campos; mantener la petición en vuelo y el orden de apagado y otras acciones discretas. No eliminar la serialización por dispositivo que protege BLE. |
| Luces RGB y temperatura de color HAP | Usar los valores de color recibidos en el setter y publicar temperatura de color cuando la fuente la soporta. Las rutas RGB/CT Matter existentes mantienen sus perfiles. |
| Cerraduras Matter/HAP | Estados atascado/en transición no se presentan como desbloqueados o bloqueados confirmados; controles HAP lock/unlock enlazados con HA. La indisponibilidad conserva el último estado confirmado. |
| Persianas, puertas, ventanas y garajes | Procesar request real Matter, posición en centésimas, abrir/cerrar/detener y tilt; HAP TargetPosition y TargetDoorState conectados. Covers soportados sin device_class ya no caen en una entidad sin controles. |
| Contactos | BooleanState sigue el contrato Matter: true cerrado/contacto, false abierto. Retirar el latch de movimiento de los contactos. MQTT conserva la misma polaridad. |
| Temperatura/humedad/luz/presión/caudal/suelo | Sincronizar los clusters correctos; conversión Fahrenheit/Celsius y unidades de presión/caudal; valores primarios HAP conectados a HA en lugar de constantes. No sustituir lecturas inválidas por valores ficticios. |
| Calidad de aire/CO2/PM/VOC | Crear clusters de concentración necesarios; Moderate es3 y desconocido es0. Disponibilidad de lectura según capacidades del controlador. |
| Baterías HAP y RVC | Primario HAP actualizado y batería baja derivada del porcentaje; conservar lógica RVC y sus servicios. No inferir una lectura de batería inexistente. |
| Climatización/termostatos | Conversión Celsius↔Fahrenheit en lecturas y consignas; respetar modos HVAC admitidos y conservar corrección de rangos frío/calor de2.3.16. |
| Humidificadores/deshumidificadores | Threshold HAP correcto según perfil, no confundir humedad objetivo con medida; proteger sincronización Matter contra bucles y encender antes de cambiar modo/humedad cuando está apagado. |
| Ventiladores | Cola de valores pendientes sin retrasar otros dispositivos; controles Matter/BLE existentes conservados; velocidad MQTT enlazada cuando existe su topic de comando. |
| Válvulas/irrigación | Validar posición y disponibilidad; conservar duración persistente HAP. La válvula Matter genérica rechaza duración que no puede garantizar mediante HA, en vez de ignorarla. |
| TV/altavoces/remotos | Perfiles HAP de altavoz conectados a volumen/mute; se conserva la ruta TV completa y el fallback IR existente. |
| Hornos/placas | Usar controles HA asociados por device_id, rechazar modos o consignas sin control real; conectar Off de placa sin habilitar ignición remota. Restaurar los endpoints hijos retenidos. |
| Aspiradoras | Firmware/metadatos desde runtime, modelo HA cuando está disponible; registrar fallos al actualizar metadatos de nodos retenidos. Conservar la composición RVC y emparejamientos. |
| Switches/enchufes y comederos | Conservar acciones discretas e inFlight del comedero; no agrupar comandos Feed ni acciones de encendido/apagado como si fueran niveles. |
| Cámaras HAP | Propagar el error HA de luz/sirena asociadas. Se conservan Live View, snapshots HAP, HKSV y talkback existentes. |
| Cámaras Matter | Liberar las sesiones asociadas al desasignar streams; validar prioridades. El endpoint Video sin Snapshot negociado rechaza CaptureSnapshot y las llamadas legacy de snapshot/chime, en lugar de simular una imagen o una acción física. |
| MQTT | ACK del broker con plazo de5s y errores de entrega; no convertir LOCK enviado en estado desbloqueado confirmado; no inventar feedback de on/off. Brillo básico/JSON y WithOnOff, cubrir mandos de persiana y velocidad, y enrutar topics de estado separados. Reinstalar manejadores al adoptar un nodo ya enlazado, sin callbacks duplicados de atributos. |

Los tipos adicionales de sensores se descubren solo cuando tienen medición implementada. Los perfiles eléctricos/presión/caudal se identifican como no documentados para Apple Home; calidad de aire como dependiente del controlador. Los sensores monetarios y mapeos sin semántica correcta continúan excluidos.

## Pruebas y límites

Las once reproducciones de auditoría se convirtieron en regresiones con resultados correctos. Se añadieron casos de ráfagas de brillo, barrera de apagado, aislamiento entre dispositivos, recuperación MQTT, confirmación del broker, conservación de credenciales HAP, unidades y contacto.

Las pruebas estrictas usan endpoints reales de Matterbridge3.11.2 para validar mediciones de presión, luz, Fahrenheit y centésimas de posición. Otras pruebas usan mocks y no equivalen a una prueba de hardware. Se mantiene la suite existente de RVC, cámaras, climatización, sensores, electrodomésticos y recuperación.

No se ha conectado la instalación del usuario ni medido el retardo físico del dimmer. Tampoco se ha leído la versión que publica Robotina en Apple Casa: requiere contrastar runtime del contenedor, BasicInformation del nodo y caché del controlador. El código ya se basaba en Matterbridge3.11.2 en v2.3.16; no era una actualización pendiente del package.

No se certifica iOS27. La consulta de documentación Apple fue bloqueada con403 desde este entorno; quedan pendientes el contraste con documentación accesible y los recorridos físicos de los accesorios exportados en Apple Casa/iOS27. No se insertaron reglas basadas en una versión de iOS supuesta.

## Capacidades que dependen del hardware o del controlador

- Presión, caudal, energía, electrodomésticos avanzados y cámaras Matter no se convierten en tipos Apple compatibles mediante nombres o versiones ficticias.
- Un dispositivo que carece de control HA de un modo, nivel, temperatura o temporizador no puede recibir ese control desde el puente; la operación se rechaza explícitamente.
- La implementación MQTT continúa limitada a los esquemas y capacidades descritos; no es un intérprete Jinja completo ni implementa todos los modos RGB de MQTT Discovery.
- La duración garantizada de válvula continúa en HAP. Un cierre temporizado Matter no puede prometerse si la integración HA genérica no ofrece esa garantía.
- La captura de imágenes de las cámaras de esta implementación se conserva por HAP. El endpoint Matter de vídeo no anuncia Snapshot negociado.

Validación local:88 suites/754 pruebas en el recorrido completo; después del último ajuste de inicialización de cerradura e irrigación,5 suites afectadas/44 pruebas pasan, incluida la nueva regresión. Build completo backend/frontend con TypeScript y Vite pasa, y git diff --check pasa. Este documento describe el cambio preparado para v2.3.17 y no afirma que esté instalado en HA.

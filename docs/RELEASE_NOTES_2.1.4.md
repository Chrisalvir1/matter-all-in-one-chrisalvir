# Matter All-in-One v2.1.4

## Cámara Omni Tuya en Apple Home

- Antes de cada sesión HAP, la cámara vuelve a medir la pista de audio de la URL RTSP firmada recién emitida. Apple Home recibe el audio real con la codificación negociada por la sesión.
- Las cámaras Omni sin un `binary_sensor` propio usan detección local de cambios de imagen con FFmpeg a baja frecuencia. La detección renueva la URL firmada en cada reconexión, pausa durante Live View y publica los eventos para HomeKit y HKSV.
- Ante un `404 Stream Not Found`, Live View y el prebuffer HKSV solicitan una fuente nueva antes de reutilizar la anterior. Los parámetros firmados de Tuya se eliminan completamente de los registros.

## Controles del comedero

- Las entidades `number` se exportan en HAP como controles deslizantes estándar. "Porciones por comida" se publica como deslizador y "Alimentar ahora" como interruptor independiente.

## Publicación

- La publicación de GitHub Release ya no falla si falta un archivo de notas: genera las notas de GitHub como respaldo.

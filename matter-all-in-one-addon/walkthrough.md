# Resumen de Cambios: Versión 1.4.78 (Reparación Global Arquitectónica de Cámaras Scrypted)

Hemos implementado una reparación global y arquitectónica para todas las cámaras importadas desde Scrypted en Matter All-in-One, resolviendo los fallos de streaming en Apple Home, estabilizando Live View por más de 30 segundos continuos, reportando la identidad técnica real y unificando el estado de comisionamiento Matter con el badge de Casa Apple Home.

### Cambios Principales en v1.4.78

1. **Resolución de "Sin Respuesta" y Cortes de Live View tras 5-10s:**
   - Se eliminó `&localrtcpport` de las URLs de salida SRTP de FFmpeg para vídeo y audio.
   - FFmpeg ahora enlaza dinámicamente un puerto efímero local en el host sin colisionar con el puerto del iPhone/iPad, permitiendo el intercambio bidireccional de paquetes RTCP de feedback. Live View se mantiene fluido y continuo por más de 30 segundos sin timeouts.
   - Se agregaron `-fflags +nobuffer+genpts` y `-use_wallclock_as_timestamps 1` para garantizar marcas de tiempo RTP monótonas en RTSP.

2. **Eliminación de Pantallas Verdes y Espera de Keyframe:**
   - Inyección condicional de `-bsf:v dump_extra=freq=keyframe` para asegurar que cada I-frame incluya las cabeceras SPS/PPS necesarias para inicializar el decodificador de Apple Home de inmediato.
   - Mapeo de audio tolerante `-map 0:a:0?` para evitar caídas si la fuente no tiene pista de audio.

3. **Badge de Casa Matter / Apple Home:**
   - Las tarjetas de cámara y el modal muestran el badge `🏠 [Nombre de Casa]` (ej. `El Chante de Gecko & Chris`) de forma idéntica a los dispositivos IoT Matter, o `🏠 Casa: nombre no expuesto por Matter` si el controlador no expone etiqueta.

4. **Visibilidad Total de Fabrics Matter y Multi-Admin:**
   - Tarjetas y modales exponen la lista de telas comisionadas, Fabric ID, Node ID y estado Multi-Admin (`Disponible`, `Vinculada a N fabrics`, `Completo`).

5. **Preservación Estricta de Invariantes de Identidad:**
   - El reseteo de pairing invoca exclusivamente `AccessoryInfo.remove(hapUsername)` de HAP-NodeJS en disco.
   - Se preservan estrictamente el UUID del accesorio, la MAC (hapUsername), el setupId, el PIN `031-45-154` y el endpointId de Matter.

6. **Diagnóstico Activo de Stream Bajo Demanda:**
   - Nuevo botón interactivo `⚡ Diagnosticar Stream` en el panel web y endpoint `POST /api/custom/cameras/:id/diagnose-stream`.
   - Mide en tiempo real DESCRIBE, primer frame, transporte y GOP con análisis contextual (adecuado <= 2s vs recomendación > 4s).

7. **Preferencia de Transporte RTSP:**
   - Nuevo selector en modal (`Auto`, `TCP`, `UDP`) con notas de fiabilidad vs latencia.

8. **Evaluador Aislado de Elegibilidad HEVC Preview:**
   - Implementado `evaluateHevcEligibility` conforme a la guía Apple HomeKit Secure Video de junio 2026, manteniendo `h264_legacy` como modo predeterminado de producción.

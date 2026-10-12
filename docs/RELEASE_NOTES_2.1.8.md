# Matter All-in-One v2.1.8

## Diagnóstico autenticado para Live View Omni

Los streams HLS recién creados por Home Assistant requieren el mismo token Bearer que usan los pipelines HAP y HKSV. El diagnóstico de MIAO ahora adjunta ese token a FFprobe y a la medición GOP, evitando el falso HTTP 401 que impedía verificar el stream.

Cuando Omni Tuya Local no logra asignar una URL RTSP firmada, MIAO registra cada intento de forma segura. Las URLs firmadas y sus credenciales nunca se persisten ni se escriben en registros.

## Actualización

Instala v2.1.8 únicamente después de que el workflow **Publish Home Assistant add-on image** termine correctamente. No es necesario restablecer el emparejamiento de Apple Home.

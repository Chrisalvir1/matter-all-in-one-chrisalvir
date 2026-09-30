# Auditoría de HomeKit, HKSV y Matter — 2026-09-29

## Alcance y fuentes

Esta auditoría usa los registros del add-on y el estado visible en Apple Casa.
No se cambian las identidades HAP, los códigos de emparejamiento ni las fuentes
RTSP ya exportadas.

| Área | Estado observado | Causa o evidencia | Acción aplicada |
| --- | --- | --- | --- |
| Tapo C120 | Live View disponible; sin grabaciones recientes después de la interrupción | HKSV quedó `waiting_hub`: el Home Hub activó grabación sin enviar `SelectedCameraRecordingConfiguration` | Mantener su RTSP de Camera.UI (`rtsp://192.168.110.147:8554/tapo_c120`), corregir el detector que disparaba falsamente al iniciar y persistir la configuración HKSV negociada para sobrevivir reinicios |
| EZVIZ Patio Trasero | Stream y eventos MQTT disponibles; entregas HKSV duplicadas y cierres de stream anormales | El mismo cambio llega por MQTT, HA y detector FFmpeg; había coincidencia por ubicación compartida con Wyze | Asociar movimiento por entidad, dispositivo o marca; deduplicar el estado y preferir el sensor nativo para evitar un segundo lector RTSP |
| Wyze Patio Trasero | Funciona: Live View y grabación HKSV | HAP inició y cerró sesiones correctamente | No cambiar fuente ni sensibilidad |
| Tapo C402 | HAP inició y entregó el primer frame | Fuente directa de Home Assistant `rtsp://192.168.110.147:62291/tapo-c402`; no es Camera.UI | Mantener fuera de Camera.UI y evitar un lector FFmpeg de movimiento que compita con su sensor nativo HA |
| HAP genérico | Casa podía mostrar activo un accesorio cuyo origen HA estaba `unavailable` | HAP genérico no propagaba disponibilidad del origen HA | Publicar `StatusActive=false` y `StatusFault=1` cuando la entidad queda unavailable; restaurarlos al recuperarse |
| IDs de Camera.UI | IDs con UUID producían errores WebSocket de HA | Los guiones del UUID no son válidos en un `entity_id` de Home Assistant | Persistir ID sanitizado para HA y conservar el UUID original para Camera.UI/HAP |
| Diagnóstico RTSP | El panel llamaba “primer frame” a un cálculo no medido | FFprobe sólo devuelve duración total de la sonda | Mostrar sólo la métrica que realmente se mide |

## Contrato de fuentes

| Cámara | Origen que se debe conservar |
| --- | --- |
| Tapo C120 | Camera.UI / `rtsp://192.168.110.147:8554/tapo_c120` |
| EZVIZ Patio Trasero | Camera.UI / `rtsp://192.168.110.147:8554/ezviz_patio_trasero` |
| Wyze Patio Trasero | Camera.UI / `rtsp://192.168.110.147:8554/wyze_patio_trasero` |
| Tapo C402 | Home Assistant directo / `rtsp://192.168.110.147:62291/tapo-c402` |

## Códecs

Live View negocia H.264 hasta nivel 4.0. Cuando el controlador negocia AAC-ELD
el add-on usa `libfdk_aac` para audio RTP; los registros confirman esa ruta para
C402 y Wyze. HKSV usa un contenedor de grabación distinto al RTP de Live View,
por lo que su códec de audio se negocia independientemente con el Home Hub.

## Riesgo pendiente

La grabación de C120 no puede iniciar hasta que el Home Hub vuelva a enviar su
configuración HKSV. Esto no requiere volver a emparejar la cámara. Después de
instalar el arreglo, alternar una vez la opción de Casa a “Transmitir” y de
vuelta a “Transmitir y grabar” fuerza esa negociación; el registro debe mostrar
`Negotiated HKSV Configuration`. A partir de ahí, el add-on conserva la última
configuración válida para que los reinicios no vuelvan a romper HKSV.

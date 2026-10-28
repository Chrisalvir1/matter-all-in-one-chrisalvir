# Matter All-in-One Chrisalvir v2.3.0

**Fecha:** 28 de octubre de 2026
**Enfoque:** compatibilidad con Home Assistant 2026.11 beta, continuidad de cámaras Omni Tuya Local y diagnóstico seguro.

## Resumen

La **v2.3.0** mantiene intacta la ruta que Chrisalvir ya tiene operativa:

`Omni Tuya Local → Home Assistant → URL RTSP firmada por sesión → HomeKit HAP/HKSV → Apple Casa`

En la instalación del autor se ha confirmado una cámara con **Live View, audio, movimiento y grabación HKSV**. Esta publicación añade compatibilidad defensiva y diagnóstico sobre esa ruta, sin sustituir el pipeline de streaming ni restablecer emparejamientos.

### Mejoras incluidas, punto por punto

1. **Home Assistant 2026.11: nombres contextuales.** Se extiende el texto utilizado para la búsqueda de entidades y sensores relacionados con nombres del registro de entidad y dispositivo cuando los atributos de estado son insuficientes. Los identificadores estables siguen siendo `entity_id` y `device_id`.
2. **Asociación de movimiento conservada.** Se aplica la compatibilidad de nombres en el enlace de cámaras con sensores de movimiento, sin incorporar heurísticas invasivas que puedan separar un sensor que ya funciona.
3. **Asignación RTSP Omni observable.** Se miden intentos, reintentos, resultados y duración de cada asignación temporal de stream, con contadores aislados por cámara y límites de memoria.
4. **Privacidad por diseño.** Las métricas no almacenan URLs RTSP firmadas, contraseñas ni tokens; el nuevo diagnóstico solo publica campos expresamente permitidos.
5. **Endpoint de diagnóstico de solo lectura.** Se incorpora `GET /api/custom/ai/camera-diagnostics` y se habilita solo mediante `diagnostics_token` de 24 caracteres o más y una cabecera Bearer válida.
6. **Base para análisis con IA.** Un adaptador MCP separado y confiable podría consumir el JSON, pero la v2.3.0 **no crea** un servidor MCP ni concede a una IA permisos para reiniciar, borrar o cambiar accesorios.
7. **Compatibilidad de emparejamiento.** Se conservan las identidades persistentes Matter y HAP, QR, fabrics, audio, HKSV, la obtención de URL firmada por sesión y el comportamiento de FFmpeg.
8. **Cobertura automatizada.** Se añaden pruebas de nombres de HA, asociaciones de sensores, fallos y recuperación de Omni, varias cámaras a nivel de métricas, autenticación y minimización de datos.
9. **Documentación v2.3.0.** Se renuevan ambos README, respetando los archivos y referencias al logo original, y se publica una guía de compatibilidad 2026.11 y verificación física.

## Matriz de compatibilidad

| Elemento | Estado |
| --- | --- |
| Home Assistant 2026.10 | Referencia operativa actual |
| Home Assistant **2026.11 beta** | Preparación y regresiones a nivel de código; falta validación física |
| Home Assistant **2026.11 estable** | Pendiente de publicación y pruebas |
| Matterbridge | 3.11.0 |
| Matter | 1.6.1 |
| Apple Casa, HAP/HKSV, cámara Omni | Funcionamiento reportado en la instalación actual de Chrisalvir |
| Varias cámaras Omni simultáneas | Métricas independientes probadas; streaming simultáneo pendiente de prueba física |
| Cámaras Matter 1.5 importadas a HA | No se convierte automáticamente su señal a RTSP ni a HomeKit |

## Instalación segura

1. Respalda Home Assistant y los datos persistentes del complemento.
2. Actualiza el add-on a **v2.3.0** cuando GitHub Actions haya publicado la imagen GHCR y confirmado su acceso público.
3. Mantén **Home Assistant 2026.10** en el servidor principal mientras pruebas 2026.11 en una instancia secundaria.
4. Comprueba que los emparejamientos existentes se conservan y verifica una cámara Omni con vídeo, audio, detección y un clip HKSV nuevo.
5. Solo si necesitas diagnósticos para automatizaciones, configura `diagnostics_token` (24+ caracteres) y consulta la ruta mediante un acceso local autenticado; no publiques el puerto 8285.

Para probar la beta, sigue la [guía técnica y lista de comprobación](home-assistant-2026-11-readiness.md). La publicación de imagen y release se automatiza con los flujos de GitHub; si falla la validación o la imagen no es pública, no se considera lista para instalar.

## Limitaciones conocidas

- Las pruebas automatizadas **no acreditan por sí solas** la reproducción de Live View ni la retención de clips HKSV bajo la beta 2026.11.
- Esta versión no cambia codecs, configuración de FFmpeg, proxy RTSP ni infraestructura Apple/iCloud.
- El nuevo endpoint sirve como fuente de diagnósticos; no es un servidor MCP público ni una función de control remoto.
- La importación de cámaras Matter 1.5 en HA requiere que el dispositivo y la integración expongan un stream adecuado si se desea exportarlo por HAP.

## Recuperación

Si detectas una regresión tras actualizar, conserva los registros **sin compartir tokens ni URL RTSP firmadas**, restaura la copia de seguridad y vuelve a la imagen de add-on que tu entorno tenía verificada. No elimines fabrics ni restablezcas cámaras funcionales por defecto.

**Logo y marca originales preservados.** Proyecto: [Matter All-in-One Chrisalvir](https://github.com/Chrisalvir1/matter-all-in-one-chrisalvir).

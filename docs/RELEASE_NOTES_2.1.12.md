# MIAO v2.1.12 — movimiento durante Live View

Al abrir Live View, MIAO pausaba el detector local y el prebuffer HKSV para no competir con Casa por la única conexión RTSP de Omni. Eso dejaba un intervalo ciego y, aunque hubiera un evento, Apple podía cerrar HKSV con `TIMEOUT` al quedarse sin fragmentos. Esta versión analiza el movimiento y entrega video fMP4 para HKSV desde ramas del mismo FFmpeg que ya recibe el video de Casa; no solicita una segunda sesión RTSP.

La rama de grabación conserva audio convirtiéndolo a AAC-LC con la frecuencia configurada por Casa. Los reinicios conservan el emparejamiento y el accesorio solicita una URL RTSP firmada nueva al abrir o reanudar el stream.

Si Omni aún no está disponible tras reiniciar Home Assistant, el detector vuelve a solicitar una URL nueva; no intenta abrir la credencial caducada que había quedado en memoria.

El filtro ahora permite evaluar fotogramas con cambios grandes, que antes podían omitirse antes de llegar al umbral. La cámara sigue usando video H.264 passthrough y no se abre una segunda conexión RTSP para el análisis.

La pestaña «IA & Fauna» configura clases de eventos externos. Las casillas «Gato», «Perro», etc. no indican que MIAO esté ejecutando un clasificador visual; solo filtran eventos que otra integración clasifique.

La verificación de streams RTSP sobre TLS (RTSPS) ahora dispone de cinco segundos para medir una URL firmada temporal.

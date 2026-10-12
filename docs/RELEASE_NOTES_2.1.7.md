# Matter All-in-One v2.1.7

## Corrección de Live View Omni tras reinicios

El accesorio HAP de cámaras Omni pide una URL RTSP firmada nueva antes de cada Live View y reintenta la asignación para cubrir el reinicio de Home Assistant o una renovación breve de Tuya.

Si Omni no puede emitir una URL directa, MIAO solo acepta un stream HLS recién creado por Home Assistant. No vuelve a iniciar Live View mediante `camera_proxy_stream`, ya que esa ruta puede rechazar el token HTTP del add-on con 401 y dejar una imagen congelada.

No se guardan ni se registran URLs firmadas o credenciales de vídeo.

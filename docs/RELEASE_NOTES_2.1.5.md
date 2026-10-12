# Matter All-in-One v2.1.5

## Recuperación de cámaras Omni Tuya

Las cámaras Omni que Camera.UI registra con una URL RTSP fija ahora se resuelven mediante su entidad real de Home Assistant. MIAO solicita una URL firmada nueva a Omni al iniciar Live View, después de un reinicio y al reconectar el detector de movimiento.

La configuración fija de go2rtc se conserva para cámaras con URL permanente. Un stream firmado de Tuya no se guarda en go2rtc como si fuera permanente: se renueva desde Omni para evitar que falle cuando caduque.

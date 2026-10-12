# MIAO v2.1.13 — continuidad de HKSV durante Live View

En la prueba del 12 de octubre, MIAO detectó el movimiento y envió el evento a Apple Casa, pero la grabación HKSV recibió muy pocos fragmentos para confirmar un clip. La salida compartida de Live View fragmentaba el video solo en fotogramas clave del RTSP Omni; algunos firmwares usan intervalos largos entre ellos.

MIAO ahora fragmenta también al intervalo negociado con Casa en la salida fMP4 compartida. Así HKSV puede recibir video continuo sin abrir una segunda conexión RTSP al comedero. Los logs registran cada fragmento recibido y la cantidad enviada al cerrar la solicitud.

El cambio corrige el empaquetado cuando Live View está activo. La grabación se considera verificada únicamente cuando Apple recibe el segmento inicial y múltiples fragmentos; todavía debe comprobarse que Casa guarde el clip en la cámara instalada.

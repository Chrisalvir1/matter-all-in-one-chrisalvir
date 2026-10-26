# Reparación en dos fases — estado de trabajo

Base: GitHub v2.1.24, commit `47e0bfe`. Rama `codex/two-phase-reliability`, versión de trabajo 2.1.25. La rama no está publicada ni instalada en Home Assistant.

## Fase 1: identidad, emparejamiento y seguridad

- El registro ya no retira otro endpoint por coincidir su nombre o serial físico y evita recrear una identidad mientras continúa su desregistro. El reseteo utiliza `ServerNode.erase()` y confirma fabrics y código; si falta el nodo informa fallo. Un ensayo con un servidor Matterbridge real produjo un QR nuevo, pero no utilizó un controlador físico ni una fabric real.
- Eliminar una fabric requiere encontrar exactamente la fabric indicada; un error no produce un reset general. Las operaciones de un mismo dispositivo se serializan.
- Se conservan las identidades y selecciones individuales y compuestas anteriores, incluso si ahora se clasifican como multi-switch; cuando faltan entidades se aplaza su restauración. La migración sobre almacenamiento de una instalación física sigue sin verificarse.
- Los archivos de selección, ajustes y cámaras se escriben de forma serializada y atómica. Quedan rutas de persistencia adicionales y tratamiento de errores por revisar.
- Los endpoints administrativos verifican métodos de escritura y el proxy limita los clientes a Supervisor y loopback. Debe verificarse en HA real que Ingress utiliza `172.30.32.2`; otras redes podrían requerir adaptación.

## Fase 2: inventario, interfaz y Robotina

- Índices temporales reducen recorridos repetidos del inventario y del monitor de conexiones. En un Mac M2, 1.000 entidades sintéticas tardaron 1,4–1,65 s en v2.1.24 y aproximadamente 28–154 ms en la rama. El monitor con 1.804 entidades y 33 exportadas pasó de 729–912 ms a 7–46 ms en varias ejecuciones. Son pruebas sintéticas, no mediciones del Pi.
- El inventario se muestra en cuanto llega, los errores se informan y los eventos se reconcilian con las peticiones en curso. React, Vite y Vitest ya formaban parte del proyecto y se mantienen. Las lecturas GET tienen timeout; no se cancela automáticamente una operación de escritura. La generación QR ya usa `qrcode` sobre Canvas y no hay evidencia de que requiera otro motor.
- Se evita solapar consultas de Camera.UI, se cachea la versión de FFmpeg y se detienen más temporizadores al cerrar. No se han modificado los pipelines de vídeo.
- Para nuevos robots con menos de dos modos se omite el clúster opcional incompatible; en identidades fijadas se conserva la estructura. Se verificó un endpoint y servidor Matterbridge reales con validación estricta. La representación y comandos de Robotina en Casa con una versión de desarrollo siguen pendientes.
- Los archivos de versión, lock y changelogs locales marcan 2.1.25; el flujo de publicación comprueba versión, compilación y tests antes de crear la imagen. `werift` se actualizó de 0.25.1 a 0.25.2. El análisis señaló `multer` 2.4.0 transitivo vulnerable; el override 2.5.x reduce npm audit a cero vulnerabilidades conocidas. `@types/node` se mantiene en la línea 24 compatible con Node 24. No existe imagen 2.1.25 publicada.

## Observación de la instalación actual

La pantalla de Ingress mostró v2.1.24. Al recargar, primero apareció “Iniciando…” y cero elementos; después la vista completó la carga y mostró 192 dispositivos, 29 emparejados (27 Matter y 2 HAP), 3 activos sin emparejar y 0 en “Necesita atención”. Robotina apareció vinculada en Matter/Apple Home. Los logs previos reportaron 1.804 estados, 33 dispositivos exportados, bloqueos del event loop de aproximadamente 6–11 segundos y errores de endpoint destruido de Robotina. En una recarga limpia cronometrada de la vista de Ingress, seguía mostrando “Iniciando / Cargando entidades” a los 22,8 s; en la siguiente observación ya mostraba los 192, alrededor de 24 s en total. Es una única muestra en Mac/Safari y no separa la espera de Ingress, el servidor ni el navegador. No se desplegaron cambios en HA.

## Pendiente antes de afirmar que todo está reparado

- Verificar recuperación y reemparejamiento en una instalación con compuestos multi-switch ya comisionados; las pruebas unitarias preservan el registro y selección, pero no simulan fabrics persistentes del cliente.
- Probar reset con fabric real, reinicios y rollback con accesorios existentes; preservar sus identidades y emparejamientos.
- Verificar en Apple Casa el commissioning, representación y comandos de Robotina; medir tiempos reales en Pi 5 y probar acceso Ingress con la nueva versión.
- Completar tratamiento de errores en las rutas de persistencia restantes, cierre integral y la política Camera.UI desactivada. La rama corrige los casos encontrados en las áreas modificadas, pero no cierra todavía los 27 hallazgos de la auditoría.
- Verificar Live View real y clip HKSV en Casa siguiendo los criterios de AGENTS.md; ni un build ni eventos o fragmentos simulados demuestran reproducción o clip guardado.

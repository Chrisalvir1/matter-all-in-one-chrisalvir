# Reparación en dos fases — seguimiento de despliegue

Base: GitHub v2.1.24, commit `47e0bfe`. v2.2.0 ya fue publicada e instalada en Home Assistant el 2026-10-26. La corrección RVC descrita aquí está en desarrollo como v2.2.1 y todavía no se ha publicado ni instalado.

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
- v2.2.0 corrigió la inicialización de aspiradoras nuevas con pocos modos, pero su cambio dejó a Matterbridge agregar PowerSource (`0x0011`) junto con RVC (`0x0074`) al descriptor final. Chris confirmó que Casa no reconoce Robotina como aspiradora. También se observó que una identidad Matter ya fijada puede conservar el clúster RVC Clean Mode con una sola opción, lo cual falla la validación Matter.js (límite de 2–255).
- La corrección v2.2.1 en curso aplica el tipo RVC único después del inicializador PowerSource sin retirar el clúster de batería; para identidades fijadas garantiza al menos dos modos y conserva el clúster. La prueba de endpoint/servidor Matterbridge real confirma descriptor final RVC único, clúster PowerSource y arranque estricto; una prueba de identidad guardada confirma lista Clean Mode válida. Suite completa: 76 archivos/686 pruebas; typecheck, build y frontend typecheck pasan. Falta publicar e instalar v2.2.1 y verificar representación y comandos de Robotina en Casa con la fabric existente.
- Los metadatos de la v2.2.1 de trabajo están alineados entre config, paquete, lock y changelogs. `werift` está en 0.25.2 y el override `multer` 2.5.x deja `npm audit` sin vulnerabilidades conocidas en la publicación anterior; no se cambiaron dependencias para esta corrección.

## Observación de la instalación actual

La pantalla de Ingress mostró inicialmente v2.1.24 y tras actualizar indicó v2.2.0. Después del reinicio se cargaron 192 dispositivos y 30 emparejados (28 Matter y 2 HAP); Robotina aparece vinculada a la casa/fabric en la aplicación, pero Chris confirma que Apple Casa no la presenta como aspiradora. La ficha de Matter All-in-One muestra “Emparejado en red Matter”, que solo confirma la fabric; no prueba la representación ni los comandos de RVC en Casa. Los registros del accesorio muestran fallo de inicialización del clúster `rvcCleanMode` y endpoint destruido. No se hizo reset ni se eliminó el accesorio durante el diagnóstico.

## Pendiente antes de afirmar que todo está reparado

- Verificar recuperación y reemparejamiento en una instalación con compuestos multi-switch ya comisionados; las pruebas unitarias preservan el registro y selección, pero no simulan fabrics persistentes del cliente.
- Probar reset con fabric real, reinicios y rollback con accesorios existentes; preservar sus identidades y emparejamientos.
- Publicar e instalar v2.2.1; verificar en Apple Casa que Robotina se representa como aspiradora y que los controles de estado/modo funcionan sin borrar la fabric existente. El resultado físico sigue pendiente.
- Medir tiempos reales en Pi 5 y probar acceso Ingress con la nueva versión.
- Completar tratamiento de errores en las rutas de persistencia restantes, cierre integral y la política Camera.UI desactivada. La rama corrige los casos encontrados en las áreas modificadas, pero no cierra todavía los 27 hallazgos de la auditoría.
- Verificar Live View real y clip HKSV en Casa siguiendo los criterios de AGENTS.md; ni un build ni eventos o fragmentos simulados demuestran reproducción o clip guardado.

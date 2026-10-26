# Reparación en dos fases — seguimiento de despliegue

Base: GitHub v2.1.24, commit `47e0bfe`. v2.2.0 se publicó e instaló en Home Assistant el 2026-10-26, pero Robotina no apareció como vacuum. La v2.2.1 corrigió el descriptor RVC, pero al instalarse el 2026-10-26 se detectó en los logs que la imagen final omitía `@matter/node`: Matterbridge rechazó cargar el plugin y se negó a iniciar el puente para proteger accesorios registrados. v2.2.2 corrige ese empaquetado y añade una validación en la etapa runtime de la imagen. La validación física en Casa aún está pendiente.

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
- La v2.2.1 aplica el tipo RVC único después del inicializador PowerSource sin retirar el clúster de batería; para identidades fijadas garantiza al menos dos modos y conserva el clúster. La suite local validó descriptor, batería, modos y endpoint, pero no la resolución de dependencias dentro de la imagen de producción. En Home Assistant `@matter/node` no se pudo resolver desde `vacuum.entity.js`, por lo que el plugin quedó en error y Matterbridge se detuvo para evitar borrar accesorios.
- La v2.2.2 agrega `@matter/node` 0.18.0 a dependencias runtime y el Dockerfile importa `@matter/node/behaviors/descriptor` después de instalar solo dependencias de producción; una imagen sin este módulo no debe publicarse. Mantiene el resto de la corrección RVC de 2.2.1.
- La publicación 2.2.2 alinea config, paquete, lock y changelog, y añade `@matter/node` 0.18.0 como dependencia de producción. Una instalación aislada `npm ci --omit=dev --omit=peer` resolvió con éxito el import del descriptor; la validación equivalente también se añadió al Dockerfile. Suite actual: 76 archivos/686 pruebas; typecheck y build pasan. La imagen publicada y su arranque físico aún deben verificarse.

## Observación de la instalación actual

La pantalla de Ingress mostró inicialmente v2.1.24 y tras actualizar indicó v2.2.0. Después del reinicio se cargaron 192 dispositivos y 30 emparejados (28 Matter y 2 HAP); Robotina aparece vinculada a la casa/fabric en la aplicación, pero Chris confirma que Apple Casa no la presenta como aspiradora. La ficha de Matter All-in-One muestra “Emparejado en red Matter”, que solo confirma la fabric; no prueba la representación ni los comandos de RVC en Casa. Los registros de 2.2.0 mostraron fallo de inicialización del clúster `rvcCleanMode` y endpoint destruido. Tras instalar 2.2.1, Supervisor confirmó `state: started`, pero los logs mostraron que el plugin Matter All-in-One no pudo resolver `@matter/node/behaviors/descriptor`; Matterbridge se negó a arrancar el puente y la interfaz Ingress permaneció en “Iniciando Matter Bridge”. Esta protección evitó que el controlador ejecutara una publicación nueva con el plugin en error. No se hizo reset ni se eliminó el accesorio durante el diagnóstico.

## Pendiente antes de afirmar que todo está reparado

- Verificar recuperación y reemparejamiento en una instalación con compuestos multi-switch ya comisionados; las pruebas unitarias preservan el registro y selección, pero no simulan fabrics persistentes del cliente.
- Probar reset con fabric real, reinicios y rollback con accesorios existentes; preservar sus identidades y emparejamientos.
- Publicar e instalar v2.2.2; confirmar que el add-on inicia, los emparejamientos/fabrics existentes siguen presentes, el plugin RVC se carga y Robotina aparece como aspiradora en Apple Casa con controles operativos. No restablecer ni volver a emparejar Robotina. Resultado físico pendiente.
- Medir tiempos reales en Pi 5 y probar acceso Ingress con la nueva versión.
- Completar tratamiento de errores en las rutas de persistencia restantes, cierre integral y la política Camera.UI desactivada. La rama corrige los casos encontrados en las áreas modificadas, pero no cierra todavía los 27 hallazgos de la auditoría.
- Verificar Live View real y clip HKSV en Casa siguiendo los criterios de AGENTS.md; ni un build ni eventos o fragmentos simulados demuestran reproducción o clip guardado.


## Seguimiento de Robotina posterior a 2.2.2

La instalación de 2.2.2 tampoco arrancó el plugin: al corregir una clave persistida antigua del plugin, el log de Matterbridge reveló que rechaza `@matter/node` como dependencia directa inválida. El paquete existe como dependencia interna de Matterbridge, pero no debe declararse en el manifiesto del plugin. La corrección preparada para 2.2.3 sustituye tanto `DescriptorServer` como los dos imports dinámicos de `BasicInformationServer` por el export público `matterbridge/matter/behaviors`, retira `@matter/node` de dependencias y valida ambos exports en la imagen final. La clave actual del plugin se habilitó en el archivo persistente conservando la anterior y el resto de configuración; no se borró fabric ni se retiró ningún dispositivo. Pendiente: CI/publicación/instalación, arranque Matterbridge sin errores, restauración de inventario y confirmación de Robotina como aspiradora con controles funcionales en Apple Casa.

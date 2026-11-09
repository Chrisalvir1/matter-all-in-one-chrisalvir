# Matter All-in-One Chrisalvir v2.3.17

9 de noviembre de 2026

Esta versión corrige rutas de control y estado de accesorios que se exportan por Matter, HomeKit HAP o MQTT. Conserva las identidades y los emparejamientos existentes; no cambia automáticamente un accesorio Matter a HAP ni exige volver a enlazarlo.

- **Dimmers y mandos deslizantes:** la cola reemplaza valores que todavía no se han enviado por el más reciente. Mantiene el comando en curso, respeta el orden de apagado y otros comandos discretos, y no bloquea dispositivos distintos.
- **Sensores y mediciones:** corrige la polaridad Matter de contactos; sincroniza temperatura, humedad, iluminancia, presión, caudal, calidad de aire y batería donde el perfil lo admite. Convierte unidades Fahrenheit/Celsius y las unidades de presión/caudal.
- **HomeKit HAP:** conecta los valores de sensores y controles a Home Assistant; corrige estados de cerraduras y posiciones de cubiertas, objetivos de humidificación/deshumidificación, temperatura, color y funciones de purificadores, altavoces e irrigación según las entidades disponibles.
- **MQTT:** confirma la entrega mediante ACK del broker, expone errores y tiempo de espera, no presenta un comando como estado físico confirmado y restaura manejadores para nodos retenidos. Añade rutas configuradas de brillo, cubiertas, ventiladores y lecturas.
- **Electrodomésticos y actuadores:** hornos, placas, aspiradoras y válvulas usan controles y metadatos disponibles en Home Assistant. Si falta un control requerido, la operación falla explícitamente. La duración Matter de válvula no se anuncia como garantizada por una integración HA genérica.
- **Cámaras Matter:** la desasignación libera la sesión de stream y se rechaza la captura Matter si Snapshot no fue negociado. La captura HAP existente se mantiene.

## Verificación

- Suite completa: **88 suites y 754 pruebas**.
- Tras los dos últimos ajustes de estado inicial de cerradura e irrigación: **5 suites afectadas y 44 pruebas**.
- Build completo de TypeScript backend/frontend y Vite correcto; `git diff --check` correcto.
- Contratos de medición revisados con endpoints reales de Matterbridge 3.11.2; otras pruebas usan mocks.

Estas comprobaciones no son certificación física. No se conectó la instalación Home Assistant del usuario ni se probaron accesorios en Apple Casa/iOS 27; tampoco se leyó el Basic Information publicado por Robotina. Las capacidades que dependen del modelo, firmware, broker o controlador deben verificarse en la instalación correspondiente. No se recomienda borrar fabrics ni volver a emparejar para instalar esta versión.

La publicación de `v2.3.17` dispara el flujo del repositorio para validar ambos contenedores, publicar la imagen multi-arquitectura en GHCR, verificar su acceso público y crear esta release. La publicación npm se ejecuta desde el evento de release.

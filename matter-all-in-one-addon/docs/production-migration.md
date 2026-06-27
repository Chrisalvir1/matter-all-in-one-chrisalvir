# Migración de producción: Accesorios Matter Independientes (v1.2.0+)

## Qué cambia

Este add-on expone ahora las entidades de Home Assistant en **Modo de Accesorios Independientes (Plan B)**. Cada entidad activada se publica como su propio nodo servidor Matter independiente (`mode: 'server'`).

**Consecuencias de la migración:**
1. **Códigos QR individuales:** Cada accesorio tiene su propio código QR y código manual de emparejamiento. No se comparte un bridge único global.
2. **Ciclo de vida aislado:** El encendido, apagado o emparejamiento de un accesorio no afecta a los demás.
3. **Agrupación visual:** En la interfaz de configuración del add-on, los accesorios se muestran agrupados bajo sus correspondientes dispositivos físicos de Home Assistant, haciendo más limpia la gestión.

## Instrucciones de Despliegue y Migración desde versiones < v1.2.0

Si vienes de una versión que usaba el modo Bridge único global (versiones 1.1.x o anteriores):

1. **Respaldar configuración:** Haz una copia de seguridad de la carpeta de datos `/data/.matterbridge`.
2. **Actualizar el add-on:** Instala la última versión (v1.2.9 o superior).
3. **Eliminar accesorios antiguos:** En tus ecosistemas domésticos (Apple Home, Google Home, etc.), elimina el puente "Matterbridge" antiguo si existía.
4. **Registrar de nuevo:** Abre el panel gráfico del add-on (puerto 8285), busca los dispositivos físicos y activa las entidades individuales que quieras exponer a Matter.
5. **Emparejar uno por uno:** Para cada entidad exportada, haz clic en `Configurar` y usa el botón de ver código QR. Escanea el código QR único generado para ese accesorio específico en tu aplicación de hogar (Apple Home, etc.).
6. **Nombre de Casa:** Una vez emparejado un accesorio, el panel mostrará un badge con el nombre de la casa vinculada (ej: `🏠 Casa de Chris`), lo que te permite confirmar visualmente que el accesorio se ha registrado con éxito.

# Resumen de Cambios: Versión 1.2.6 (Estado de carga RVC)

Hemos implementado mejoras clave en el add-on para solucionar problemas de emparejamiento, corregir errores fatales en el ciclo de vida y optimizar la experiencia de usuario.

### Cambios Principales

1. **Corrección de Error Fatal (`TypeError` en ciclo de vida):**
   - Se eliminaron las llamadas a `this.matterbridge.stopServerNode()` y `this.matterbridge.startServerNode()` en `platform.ts`. Estos métodos no existen en la API oficial de Matterbridge.
   - Ahora, activar y desactivar entidades funciona de manera segura a través de `registerDevice()` y `unregisterDevice()`, sin colgar el add-on ni lanzar excepciones.

2. **Detección del Nombre de la Casa (Fabric Name):**
   - El backend extrae dinámicamente la etiqueta de la red (fabric label) una vez que el accesorio se empareja.
   - La interfaz ahora muestra un badge de color azul con el nombre de la casa (ej: `🏠 Casa de Chris`) junto al título del dispositivo una vez emparejado, confirmando visualmente la vinculación.

3. **Mejora del Botón QR:**
   - El botón para generar/ver el código QR de un accesorio exportado está **siempre visible** de manera inmediata.
   - Dado que el servidor Matter puede tardar unos segundos en inicializarse y generar los códigos la primera vez, el frontend ahora realiza polling automático cada 2 segundos para obtener y mostrar el QR sin necesidad de recargar la página.

4. **Agrupación Limpia por Dispositivos:**
   - La interfaz agrupa estrictamente las entidades por su dispositivo físico en Home Assistant (`device_id`). No se mezclan listados de entidades sueltas con dispositivos, facilitando una gestión limpia y organizada.

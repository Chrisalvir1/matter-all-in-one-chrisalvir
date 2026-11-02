# Matter All-in-One Chrisalvir v2.3.14

Esta versión corrige un fallo de arranque de los accesorios Matter tras actualizar a Matterbridge 3.11.1. Ese runtime congela el prototipo de `CommandHandler`; la política del add-on trataba de asignar un nuevo `executeHandler` y cada registro terminaba con `Cannot assign to read only property 'executeHandler'`.

La corrección aplica la política de espera/diagnóstico a los callbacks registrados en cada instancia de `CommandHandler`, tanto a los ya registrados como a los futuros. Conserva el timeout de respuesta Matter de 750 ms y el reporte de fallos de comandos que terminan tarde.

La auditoría del almacenamiento en Home Assistant encontró las fabrics Matter todavía persistidas. Esta versión no limpia el almacenamiento, no cambia identidades y no solicita restablecer ni volver a enlazar accesorios.

## Verificación

- Node.js 26.13.0: typecheck de backend y frontend correctos.
- Pruebas locales: 82 suites y 708 pruebas correctas, incluida una prueba con el `CommandHandler` real de Matterbridge y su prototipo congelado.
- La presencia de los accesorios en Apple Casa, la recuperación de las comunicaciones y el control físico se confirman después de instalar la imagen en Home Assistant; no se infieren de la compilación ni de pruebas simuladas.

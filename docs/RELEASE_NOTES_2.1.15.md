# Matter All-in-One v2.1.15 — Actualización Matterbridge 3.10.14 y Optimización de Runtime

- Actualiza la base oficial de ejecución a **Matterbridge 3.10.14** sobre Node.js 24.21.0 y Alpine 3.24.
- Normaliza la detección de límites de memoria en Docker (`constrainedMemory`) en Home Assistant OS, evitando lecturas globales de la máquina host y protegiendo el add-on contra eventos Out-Of-Memory.
- Optimiza los contextos de almacenamiento de MatterNode: se omiten escrituras redundantes en disco al inicializar cuando los valores no han cambiado, reduciendo el desgaste de almacenamiento flash y acelerando el arranque tras reinicios.
- Añade conformidad con Matter 1.6.1: atributos requeridos para fuentes de energía por batería (`batCapacity`, `batTimeToFullCharge`, `batChargingCurrent`, `activeBatChargeFaults`) y tipo estricto `TiltOnlyInteriorBlind` en persianas.
- Fija salida a 30 FPS constante en flujos WebRTC con `werift@0.25.1`, eliminando picos anómalos de bitrate y mejorando la fluidez del streaming en vivo.
- Actualiza dependencias de producción y herramientas de desarrollo: `undici@8.12.2`, `mqtt@5.16.1`, `react@19.3.1`, `react-dom@19.3.1`, `lucide-react@1.59.0`, `vite@8.3.4`, `vitest@5.0.5` y `prettier@3.9.10`.

**Pruebas locales:**
- 68 archivos de prueba aprobados (650 tests unitarios).
- Compilación de producción de frontend y backend finalizada con éxito.

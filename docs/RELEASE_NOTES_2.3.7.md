## [2.3.7] - 2026-10-29

- Corrige la selección de entidad principal en dispositivos de televisión compuestos: `DeviceModal` ahora prioriza `media_player` sobre interruptores auxiliares (`switch.*_mute`).
- Resuelve automáticamente la entidad `media_player` correspondiente en `HapGenericAccessory` para televisores exportados vía HomeKit HAP, permitiendo encendido, apagado, selector de entradas HDMI y control de volumen real.
- Agrega soporte para el mando a distancia de Apple TV/Centro de Control en iOS mediante `Characteristic.RemoteKey`.

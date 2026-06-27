# Apple Home Compatibility (2026)

This document records the compatibility baseline used by this project for Apple Home in 2026. It distinguishes a Matter device type from the required commissioning topology.

## Supported Device Type Mapping

```json
export const homekitSupportedDeviceTypes = {
  // Matter 1.0-1.3 (fully supported)
  onOffLight: true,
  dimmableLight: true,
  colorTemperatureLight: true,
  extendedColorLight: true,
  onOffPlugInUnit: true,
  dimmablePlugInUnit: true,
  doorLock: true,
  thermostat: true,
  windowCovering: true,
  contactSensor: true,
  occupancySensor: true,
  temperatureSensor: true,
  humiditySensor: true,
  illuminanceSensor: true,
  roboticVacuumCleaner: true, // Native RVC controls; standalone node required
  
  // Matter 1.4 (HomeKit does not support yet)
  waterHeater: false,
  evse: false,
  solarPanel: false,
  heatPump: false,
  
  // Not exported until implementation and Apple interoperability testing exist.
  camera: false,
  closure: false,
  soilSensor: false,
  energyTariff: false,
}
```

## Robotic Vacuum Cleaner (RVC)

`vacuum.*` is exported as the official Matter `RoboticVacuumCleaner` device type (`0x0074`), not as a switch. Apple documents robot-vacuum features in the current Home app, and Matterbridge documents the Apple constraint: an RVC must be a standalone Matter server node, with its own QR code and fabric store.

- Use `mode: 'server'` as the third `RoboticVacuumCleaner` constructor argument.
- Keep exactly one RVC endpoint in that server node; do not bridge it as a child endpoint.
- Preserve the Home Assistant `friendly_name` (limited only to Matter's 32-character Basic Information field); use `entity_id`/serial for internal identity.
- When an integration leaves HA at `cleaning` while its physical status/DPS reports charge or dock, prefer the physical signal and publish `Charging` with RVC Run Mode `Idle`.
- On a failed attempt that leaves the node commissioned, perform the add-on factory reset before retrying so the old fabric store is not reused.

Sources: [Apple Home — robot vacuums](https://www.apple.com/home-app/), [Apple Home update support](https://support.apple.com/en-ie/102287), [Matterbridge RVC server-mode guidance](https://matterbridge.io/CHANGELOG.html), and [Apple Matter accessory interoperability best practices](https://developer.apple.com/apple-home/downloads/Matter-Accessory-Best-Practices-for-Apple-Home.pdf).

## Topología y alcance

- Cada accesorio se publica como un nodo Matter independiente y pertenece a la fabric del controlador que escanea su QR. Apple Home y Home Assistant son fabrics distintas.
- El bridge no puede recibir Home Key ni convertirse en una cámara HomeKit Secure Video: esas funciones requieren dispositivos y certificación específicos.
- `windowCovering` es el perfil predeterminado de Apple Home. `Closure` permanece experimental y no se anuncia como soporte Apple.
- Cámara, tarifa energética, suelo, humo/CO, presión, caudal, alarma, calentador de agua y botón genérico se excluyen hasta implementar sus clusters, comandos y pruebas interoperables.

## Unified Closure

`Closure` sigue disponible únicamente como perfil experimental. No se debe usar para una instalación Apple Home de producción hasta completar las pruebas de interoperabilidad del tipo y de sus clusters.

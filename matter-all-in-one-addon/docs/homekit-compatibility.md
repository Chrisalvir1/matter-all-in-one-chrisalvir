# HomeKit Compatibility (2025/2026)

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
  
  // Matter 1.5.1 (HomeKit supported - 2025/2026)
  camera: true,          // Recognized as native IP video streams
  closure: true,         // Replaces legacy WindowCovering with Unified Closure behavior
  soilSensor: true,      // Native soil moisture reading
  energyTariff: false,   // Experimental/Partial
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

## Special Notes for Camera Streaming

> [!NOTE]
> HomeKit Secure Video (HKSV) requires certified camera feeds. By using the `CameraAvStreamManagement` cluster, we expose the camera as an IP video stream, allowing live views.
>
> **RTSP & WebRTC Setup**: Make sure your cameras in Home Assistant are configured with the WebRTC integration or RTSP streams enabled, so the HLS stream is loaded successfully.

## Unified Closure Advantages

* Replaces legacy **WindowCovering** cluster.
* Supports distinct cover classes: `garage_door`, `gate`, `blind`, `shade`, `curtain`, and `awning`.
* Avoids the "reverse position percentage" bug commonly seen in legacy HomeKit window covering implementations (where 0% open meant closed, but some bridges inverted this).

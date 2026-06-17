# HomeKit Compatibility (2025/2026)

This document provides a detailed overview of the compatibility of standard and new Matter 1.5.1 device types with Apple HomeKit (iOS 18+ and iOS 19/HomeKit 2025/2026 releases).

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

## Special Notes for Camera Streaming

> [!NOTE]
> HomeKit Secure Video (HKSV) requires certified camera feeds. By using the `CameraAvStreamManagement` cluster, we expose the camera as an IP video stream, allowing live views.
>
> **RTSP & WebRTC Setup**: Make sure your cameras in Home Assistant are configured with the WebRTC integration or RTSP streams enabled, so the HLS stream is loaded successfully.

## Unified Closure Advantages

* Replaces legacy **WindowCovering** cluster.
* Supports distinct cover classes: `garage_door`, `gate`, `blind`, `shade`, `curtain`, and `awning`.
* Avoids the "reverse position percentage" bug commonly seen in legacy HomeKit window covering implementations (where 0% open meant closed, but some bridges inverted this).

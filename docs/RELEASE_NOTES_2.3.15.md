# Matter All-in-One Chrisalvir v2.3.15

Esta versión añade el soporte nativo e integral para **Aire Acondicionado y Climatización** en HomeKit (HAP) y Matter:

1. **Apple HomeKit HAP (`Service.HeaterCooler` - Categoría Oficial 21 `AIR_CONDITIONER`)**:
   - Para Apple Casa, el perfil recomendado es HAP `heater_cooler` porque expone la interfaz nativa completa de Aire Acondicionado de iOS.
   - Control de encendido y apagado (`Active`).
   - Selector y control de temperatura objetivo de frío y calor (`CoolingThresholdTemperature`, `HeatingThresholdTemperature`).
   - Temperatura ambiente en tiempo real (`CurrentTemperature`).
   - Control porcentual de velocidad de ventilador (`RotationSpeed` 0-100%) integrado en la tarjeta de iOS, mapeado a los modos de ventilador de Home Assistant.
   - Botón de oscilación / swing (`SwingMode`) integrado en Apple Casa.
   - Sincronización bidireccional en tiempo real (`updateFromHassState`).
   - Soporte completo del perfil `thermostat_hap` con `Service.Thermostat`.

2. **Matter `ClimateEntity` (Tipo de dispositivo `Thermostat` 0x0301)**:
   - Implementa `MatterbridgeThermostatServer` con clusters estándar `Thermostat` (`0x0201`) y `ThermostatUserInterfaceConfiguration` (`0x0204`).
   - Sincronización continua de `localTemperature` (en centésimas de grado Celsius), `occupiedCoolingSetpoint`, `occupiedHeatingSetpoint`, `systemMode` y `thermostatRunningState`.
   - Soporte de comandos `setpointRaiseLower`, cambio de consignas y transiciones de modos HVAC.

3. **Toolchain y Dependencias Estables**:
   - Toolchain sincronizado con Node.js 26.13.0 LTS, npm 12.2.1, Matterbridge 3.11.1 y HAP-NodeJS 2.3.0.
   - Sincronización exacta de `package.json` y `package-lock.json` para compilación limpia y determinista en CI con `npm ci`.

## Verificación

- Typecheck de backend y frontend 100% verde sin errores.
- Build de producción generado correctamente.
- Suite de pruebas completa: 84 suites y 716 pruebas unitarias e integrales exitosas (100% verde).

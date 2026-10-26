# Matter All-in-One v2.1.17 — aspiradoras Matter RVC

## Matter y Apple Casa

- Mantiene `vacuum` como accesorio Matter Robotic Vacuum Cleaner (RVC) nativo. Evita recomendar el perfil HAP de televisor por coincidencias accidentales con nombres como `sala_tv_robotina`.
- Vincula al RVC la batería y el selector de modo del mismo dispositivo de Home Assistant cuando existen y aportan datos utilizables.
- Publica potencia, energía y voltaje como Matter Electrical Sensor (`0x0510`) con sus clusters de medición y unidades.
- Evita ofrecer un perfil de temperatura para sensores eléctricos.

Apple Casa solo puede mostrar los controles y atributos que su versión de Matter admita para el RVC. No se convierten datapoints arbitrarios en atributos RVC ni se fabrican valores. El perfil Electrical Sensor puede ser consumido por otros controladores Matter, pero no se promete que Apple Casa lo represente como una ficha de sensor.

La actualización no borra ni reinicia emparejamientos existentes.

## Verificación

- TypeScript typecheck y build completados en la rama antes del cambio de metadatos.
- La CI de la rama validó build, contrato WebSocket con Home Assistant Core, ARM64 y análisis de seguridad. La CI se ejecutará también para el commit de release.

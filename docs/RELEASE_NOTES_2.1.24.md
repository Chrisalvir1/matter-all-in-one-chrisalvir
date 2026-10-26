# Matter All-in-One 2.1.24

- Reconocimiento nativo de Aspiradora Robótica (RVC `0x0074`) en Apple Home (iOS 18+):
  - Eliminado el tipo de dispositivo auxiliar `powerSource` (`0x0011`) de `deviceTypeList` y `deviceTypes` del endpoint RVC. La clase base de Matterbridge declaraba simultáneamente `roboticVacuumCleaner` y `powerSource`, provocando que Apple Home lo clasificara como accesorio compuesto ("Connected Services: 2") bajo una tarjeta genérica con icono de casa naranja titulada "Matter Accessory".
  - Se mantiene el clúster `PowerSource` (`0x002f`) en el endpoint para telemetría en tiempo real de batería y estado de carga sin alterar la topología de tipo único requerida por Apple Home.
  - Sincronización de `BasicInformationServer` (`nodeLabel` y `productLabel`) en el `ServerNode` (Endpoint 0) para que Apple Home adopte de inmediato el nombre asignado (ej. "ROBOTINA").
- Fluidez y optimización en desconexión de fabrics y nuevo código QR:
  - En la interfaz web (`DeviceModal`), las claves de emparejamiento y fabrics de aspiradoras quedan estrictamente aisladas de otras entidades secundarias.
  - La desconexión de fabrics y generación de nuevo código QR actualizan de forma inmediata el estado en la interfaz a desvinculado (`commissioned: false`), evitando congelamientos de pantalla o estados desactualizados.
  - Tiempos de espera ampliados y seguros en el backend durante el cierre y desregistro de nodos Matter para garantizar operaciones sin bloqueos.

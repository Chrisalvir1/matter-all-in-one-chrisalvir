# Auditoría de dispositivos — Matter All-in-One v2.3.16

## Base y método

Se obtuvo el tag remoto v2.3.16, commit b22769c927344e03bd04d8ecf13c1d7b39b2d3a0, que coincide con main al iniciar la revisión. package.json y config.yaml indican2.3.16; Docker y lockfile usan Matterbridge3.11.2. La auditoría anterior sobre6a3d997/2.3.14 no describe la última versión y queda sustituida por este informe.

Revisión de registro y selección de entidades, clases simples y compuestas, convertidores, perfiles HAP, publicación MQTT, sincronización HA y rutas de cámara. Se ejecutaron las87 suites existentes:728 pruebas pasan, bajo Node26.13.0. TypeScript backend pasa. Además se añadieron11 reproducciones locales de defectos: todas reproducen el comportamiento descrito. Sus aserciones documentan el defecto actual; que pasen NO significa que el defecto esté corregido. Ver `matter-all-in-one-addon/test/audit-2316-reproductions.test.ts`.

No hubo conexión a la instancia del usuario ni prueba física. Los tiempos simulados no son mediciones del dimmer real. No se modificó código productivo, dependencias ni emparejamientos; no se hizo push ni tag.

## Hallazgos prioritarios

### A01 — Alta: cola de valores antiguos del dimmer

`src/homeAssistant.ts:callService` serializa por device_id y conserva cada petición. Las rutas LevelControl simple/compuesta y HAP Brightness envían cada nivel. No hay sustitución de valores pendientes de brillo por el último. La reproducción con10 valores y200ms por respuesta mantiene los10 comandos: el último empieza a1800ms y termina a2000ms. Se confirma acumulación por diseño, sin atribuir un tiempo físico a la instalación. Otros controles del mismo device_id esperan esa misma cola.

La espera máxima de750ms de los handlers limita la respuesta a HomeKit/Matter, pero no cancela la operación HA ni vacía la cola. No se debe quitar toda la serialización: protege BLE y acciones discretas; hay que agrupar valores continuos y preservar apagado/stop y entrega final.

### A02 — Alta: perfiles HAP anunciados sin enlace funcional completo

`src/hap/hap-generic-accessory.ts:addServiceForProfile` crea `lock_hap`, `window_covering_hap`, `door_hap`, `window_hap`, `garage_door`, `air_purifier`, `speaker_hap`, `television_speaker`, `irrigation_system` y `doorbell`; varios solo inicializan características. No tienen el correspondiente enlace de escritura y sincronización primaria en `bindPrimaryHomeAssistantEntity`/`updateFromHassState`.

Reproducido con HAP real, sin publicar accesorio: escribir TargetPosition80 en una persiana y LockTargetState0 en una cerradura no llama a HA. No confundir los perfiles genéricos con los servicios funcionales propios de cámaras o del televisor completo.

### A03 — Alta: sensores HAP primarios pueden quedar en valores ficticios

Los perfiles primarios de temperatura/humedad/contacto/movimiento/humo/CO/CO2/fuga/ocupación/luz/calidad de aire/batería se crean con valores iniciales, pero no tienen todos una actualización primaria. El descubrimiento automático añade OTROS servicios por subtype para ciertas clases; no reemplaza la característica primaria inicializada. Reproducción: sensor de temperatura con HA7→9 conserva20 en su servicio primario. Esto puede producir dos servicios, uno fijo y otro vinculado; las clases no incluidas en descubrimiento ni siquiera tienen ese segundo enlace. `numeric()` además limita temperatura a mínimo0 por defecto y sustituye lecturas inválidas por un valor mínimo.

### A04 — Alta: persianas Matter ignoran el formato real de la solicitud

`ClosureEntity.registerCommandHandlers` lee `payload.liftPercent100thsValue` directamente. Matterbridge3.11.2 entrega `{request:{liftPercent100thsValue:...}}` desde `@matterbridge/core/dist/behaviors/windowCoveringServer.js`. Reproducción: solicitud real envolvente3000 no produce ninguna acción HA. Las pruebas existentes solo entregan campos planos.

Tampoco hay handlers de `upOrOpen`, `downOrClose`, `stopMotion` ni tilt en ClosureEntity; el registro sobrescrito no llama al padre. Se publica una cubierta con capacidades que no están todas conectadas al hardware. La selección de ClosureEntity también excluye covers sin device_class o con otras clases; esos pueden caer en BaseEntity sin lógica cover.

### A05 — Alta: estados de cerradura incorrectos

`LockEntity.updateState` considera locked y locking como Locked y cualquier otro estado como Unlocked. La reproducción confirma jammed→Unlocked; locking se anuncia cerrado antes de confirmarlo. La plataforma filtra unavailable/unknown en su ruta normal, pero no corrige jammed/open ni la transición locking. Debe usarse el estado desconocido/no totalmente bloqueado que corresponda, sin inventar apertura o cierre.

MQTT lock usa el mismo intérprete para comandos y estados: `LOCK` no coincide con `LOCKED`, por lo que `handleStateUpdate('LOCK')` anuncia Unlocked. Los handlers llaman ese intérprete inmediatamente tras publicar. También ignora state_value_template/estados intermedios del lock.

### A06 — Alta: MQTT publica dispositivos con controles o mediciones incompletos

`MqttEntity` selecciona WindowCovering y Fan, pero no enlaza comandos de cubierta ni velocidad FanControl. En dimmers solo registra moveToLevel, sin moveToLevelWithOnOff; brillo de esquema JSON sin brightness_command_topic no dispone de escritor. El parser no aplica command_template al brillo y el flujo de plataforma no enruta brightness_state_topic independiente.

Para sensores, crea clusters de presión e iluminación con valores iniciales pero handleStateUpdate solo escribe mediciones de temperatura y humedad. Reproducción: presión/iluminación1020 no generan ninguna escritura. Binary_sensor humo y fuga caen en ContactSensor, no en dispositivos de alarma de humo/fuga. Los setters on/off/lock actualizan estado optimista sin confirmación física. No representan implementación completa de todos los esquemas MQTT Discovery.

### A07 — Alta: operaciones de cámara Matter aceptadas sin ejecutarse

`CameraEndpointBuilder` define videoStreamDeallocate y audioStreamDeallocate vacíos. takeSnapshot devuelve `{success:true,timestamp}` sin capturar ni devolver una imagen. setStreamPriorities no aplica prioridades. Son implementaciones presentes en la clase montada; no pruebas de que una cámara HAP falle. La asignación crea sesiones y la liberación no libera la correspondiente sesión; el temporizador puede limpiar después, pero no sustituye Deallocate. Debe implementar o rechazar explícitamente la operación según el contrato Matter.

En cámaras HAP, los setters de luz/sirena vinculadas capturan fallos HA sin devolver error. Un controlador puede ver éxito aunque HA rechace el servicio. Los recorridos físicos de Live View/HKSV/talkback siguen sin comprobarse.

### A08 — Media: sensores Matter y unidades incompletos

`BaseEntity.updateState` para sensor solo actualiza temperatura/humedad. Presión, caudal e iluminación seleccionados por el registro quedan sin sincronización equivalente; reproducción de presión confirma ausencia de medición. `CompositeDeviceEntity.updateEntity` también solo trata temperatura/humedad para sensor y su lista de clusters sigue ese alcance.

Temperatura Matter/HAP/Soil/Climate se interpreta directamente como Celsius; no convierte HA en°F. Reproducción del convertidor:68°F→6800 centésimas (68°C), en vez de2000 (20°C). `sensorConverter.toAirQuality('moderate')` devuelve Fair2 en vez de Moderate3; texto desconocido devuelve Good1. Estados no disponibles pueden ser filtrados por la plataforma, pero texto válido no reconocido continúa convirtiéndose en Good.

El mapa eléctrico de plataforma incluye power/energy/monetary pero no voltage, aunque EnergyTariffEntity tiene lógica voltage. monetary entra en esa entidad pero no tiene rama de publicación del valor. La normalización de unidades en minúsculas no distingue MW de mW ni MWh de mWh.

### A09 — Media: humidificador y deshumidificador

El HAP dehumidifier enlaza RelativeHumidityHumidifierThreshold en vez de RelativeHumidityDehumidifierThreshold. Reproducción confirma escritor en el primero y ausencia en el segundo. La humedad actual puede sustituirse por la consigna si falta lectura: confunde objetivo con medida.

La ruta Matter FanControl de HumidifierEntity no usa la protección de sincronización del padre al sobrescribir updateState; debe probarse contra suscripciones reales para descartar comandos de retorno. Cambiar modo/humedad con el equipo apagado marca intención onOff pero no envía necesariamente turn_on. Este último es dependiente de cómo HA implemente set_mode/set_humidity; no se certifica como fallo de todos los modelos.

### A10 — Media: respuesta asíncrona y coherencia de luces compuestas

CompositeDeviceEntity.moveToLevelWithOnOff en level>1 llama callServiceDebounced(delay0) sin await/catch. callServiceTracked relanza el error; un fallo puede quedar sin gestionar tras respuesta temprana. La ruta simple sí espera. moveToLevel(level0) apaga el compuesto mientras el simple manda turn_on con brillo mínimo; deben alinearse con semántica LevelControl y validar transición y extremos, sin asumir que ambos comandos tienen semántica OnOff idéntica.

### A11 — Media: hornos y placas anuncian más de lo que controlan

OvenEntity anuncia Bake/Convection pero changeToMode solo escribe log; el setter de temperatura solo encuentra climate o un number de nombre supuesto y puede terminar sin acción ni error. Límites y pasos están fijados a30–250°C/5°C, no derivados del dispositivo. CooktopEntity no enlaza Off a HA aunque el comentario hable de OffOnly y la superficie se sincronice. Los nombres/modelos Samsung están fijados para dispositivos de otras marcas.

### A12 — Robotina: versión y metadatos

v2.3.16 sí instala3.11.2; retiro el diagnóstico anterior que atribuía el problema actual a Docker3.11.1. applyMatterFirmware calcula versiones desde el runtime, y BaseEntity.adoptEndpoint y CompositeDeviceEntity.adoptEndpoint intentan actualizar el nodo retenido sin borrar fabrics. Esos errores se silencian con catch; no hay confirmación visible de que el controlador recibió la actualización.

VacuumEntity además fija productName a Ropvocnic Tuya Vacuum y escribe la cadena genérica Matterbridge bridge endpoint en BasicInformation al crear. Esto es incoherente con metadatos dinámicos, pero no demuestra por sí solo que el nodo esté ejecutando una versión vieja. Se debe contrastar runtime del contenedor, BasicInformation del nodo y lo que Apple Home cachea; la versión concreta de Robotina no se leyó en vivo. No recomendar borrar emparejamientos como primer paso.

## Matriz de cobertura de familias

| Familia | Rutas revisadas | Resultado de esta auditoría |
|---|---|---|
| Luces on/off, dimmer, RGB, temperatura de color | BaseEntity, compuesto, HAP, MQTT, light converters | A01/A06/A10; RGB/CT HA cubiertos por pruebas existentes, esquema RGB MQTT no implementado completamente |
| Switches y enchufes | Base/compuesto/HAP/MQTT | Misma cola por dispositivo; MQTT confirma optimistamente; no nuevo defecto aislado de on/off HA |
| Ventiladores y BLE | Fan converter, Base/compuesto, HAP, MQTT | Cola compartida; HAP usa set_percentage directo sin verificar capacidades y no enlaza dirección/oscilación; MQTT sin velocidad; pruebas HA existentes pasan |
| Robot aspirador | VacuumEntity, converter, restore y firmware | A12; validaciones RVC reales existentes pasan; no confirma ejecución física ni actualización visible de Robotina |
| Cerraduras | LockEntity, HAP genérico, MQTT | A02/A05 reproducidos |
| Persianas, puertas, ventanas, garajes | ClosureEntity, dispatch, HAP, MQTT | A02/A04/A06; no soporte completo de stop/tilt |
| Climatización y termostatos | ClimateEntity/converter, HAP HeaterCooler/Thermostat | A08 unidades; rango frío/calor tiene corrección en2.3.16 y sus pruebas pasan; faltan comprobaciones físicas de modos y unidades |
| Humidificadores/deshumidificadores | Matter FanControl/HAP | A09 reproducido para threshold HAP |
| Purificadores de aire | Perfil HAP y sensores AQ | A02/A08; perfil de control genérico incompleto |
| Temperatura/humedad/suelo | Base/compuesto/Soil/HAP/MQTT | A03/A08; lecturas en Celsius/porcentaje básicas cubiertas, unidades negativas/°F necesitan corrección |
| Iluminación/presión/caudal | Registro, Base/compuesto/MQTT | A06/A08; faltan mediciones conectadas |
| Contacto/movimiento/presencia | Base/compuesto/HAP/MQTT | A03; Base retiene3s el paso a inactivo también para contactos; HA y MQTT usan polaridad distinta de BooleanState (requiere prueba del contrato por tipo) |
| Humo/CO/CO2/fuga | Registro, Base, AirQuality, HAP/MQTT | A03/A06; Base para binary_sensor no escribe atributos de SmokeCoAlarm/BooleanStateConfiguration dedicados; revisar clusters realmente activados por perfil |
| Calidad de aire/PM/VOC | AirQualityEntity/converter | A08; enum moderate incorrecto; no ramas de estado para ozone/radon aunque se mencionan como capacidades |
| Batería/almacenamiento/solar | Registro/perfiles, metadatos, vacuum power source/HAP | A03; batería RVC tiene lógica específica y pruebas; Base no tiene sincronización genérica PowerSource/almacenamiento/solar |
| Energía/potencia/voltaje/tarifa | Dispatch/EnergyTariff/converter | A08; ramas voltage/monetary y unidades incompletas |
| Válvulas/irrigación | ValveEntity y temporizador HAP | Estados opening/closing corregidos en2.3.16; Matter ignora openDuration, sin countdown asociado; IrrigationSystem HAP A02; pruebas HAP duración existentes pasan |
| TV/media/altavoces/remotos | MediaPlayerEntity, perfiles HAP TV/Speaker | TV completo dispone de enlaces; altavoces genéricos A02; cola afecta volumen; fallback IR/remote requiere capacidades reales |
| Hornos/placas | OvenEntity/CooktopEntity | A11; controles incompletos y datos fijos |
| Comederos/botones | PetFeederEntity, dispatch | Orden button.press y exclusión inFlight presentes; reset visual retrasado1s y perfiles genéricos dependen del dominio; pruebas existentes pasan, sin nueva reproducción de fallo |
| Cámaras/timbres/PTZ | CameraEntity, builder/adapter/session manager, HAP/HKSV/Omni/Scrypted/Camera.UI | A07; setters accesorios silencian fallos; suites existentes pasan con mocks, no certifican audio/vídeo físico |

## Qué demuestra la validación

728 pruebas existentes y11 reproducciones nuevas, ejecutadas por separado. No sumarlas como una sola suite libre de errores funcionales: las11 últimas verifican que existen defectos. Los tests existentes usan mocks en buena parte; el mock hasAttributeServer devuelve true para cualquier atributo y el mock invokeCommand usa payload plano. Eso permite que pasen casos que en el contrato real de Matterbridge requieren request o clusters concretos. El test de persiana real se contrastó con el código instalado de Matterbridge3.11.2.

No se declara que las familias sin hallazgo nuevo estén certificadas: se revisaron sus rutas y la cobertura existente. Una certificación física requiere inventario/modelos/firmware y trazas de la instalación.

## Orden recomendado de corrección

1. Estados falsos de cerradura y perfiles HAP que aceptan controles sin actuar.
2. Persiana con request real, mandos open/close/stop y feedback correcto.
3. Cola de sliders con conservación del último valor, apagado prioritario y aislamiento BLE.
4. Mediciones y capacidades MQTT/HA, unidades y valores desconocidos.
5. Deshumidificador, controles electrodomésticos y operaciones de cámara sin implementar.
6. Diagnóstico de firmware visible y confirmación de actualización de nodos retenidos sin reset.

Antes de publicar: pruebas de contrato contra Matterbridge3.11.2 y HAP real para cada familia afectada, ráfagas de valores/fallos/reconexión y después validación física de los accesorios correspondientes.

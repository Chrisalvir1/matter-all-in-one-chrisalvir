# Estado de refactorización — matter-all-in-one-chrisalvir

> Documento vivo. Última actualización: 2026-06-21 — versión 1.1.67.

## Objetivo de arquitectura

Operar un único nodo Matter en modo `bridge` y publicar las entidades de Home
Assistant seleccionadas como endpoints bridged. Home Assistant es la fuente de
estado; el bridge no se conecta directamente a las IP de los dispositivos
físicos.

## Cambios aplicados

| Área | Estado | Implementación |
| --- | --- | --- |
| Ciclo de vida Matter | Hecho | Se eliminó `mode: 'server'` en endpoints genéricos y RVC. Ya no hay un servidor Matter por entidad. |
| Modo Matterbridge | Hecho | `run.sh` migra `bridgeMode: dynamic` a `bridge` y arranca con `--bridge`. |
| Exportación bajo demanda | Hecho | Los endpoints se construyen solamente al activar una entidad y se eliminan al desactivarla. |
| Eventos HA | Hecho | Solo se suscribe a `state_changed`; se coalescen cambios por entidad antes de actualizar Matter. |
| Cliente WebSocket HA | Hecho | Un dispatcher central de solicitudes, limpieza de solicitudes pendientes y reconexión exponencial sin límite. |
| Interfaz | Hecho | Corregido el error de sintaxis que impedía ejecutar `script.js`; se eliminó el QR ficticio por entidad. |
| Dependencias oficiales | Hecho | Matterbridge fijado en `3.9.1`; retirada dependencia directa duplicada de `@matter/nodejs`. |
| Código privado de Matterbridge | Hecho | Se eliminó el acceso por rutas internas y `createRequire` al singleton de Matterbridge. |
| Panel gráfico | Hecho | Reemplazado por un panel responsivo de selección de entidades, búsqueda, estado del bridge y acciones confirmadas de mantenimiento. |
| Dispositivos compuestos | Hecho | Los `button.*` auxiliares de un dispositivo HA con entidad principal no se publican como accesorios Matter independientes. |
| Perfil Matter | Hecho | El panel expone solo perfiles Matterbridge oficiales y muestra el alcance real de compatibilidad actual con Apple Home. |
| QR / código manual | Hecho | La interfaz dirige al frontend oficial de Matterbridge; el bridge único es el propietario del QR y PIN reales. |
| Identidad RVC | Hecho | Identificadores estables derivados de `entity_id`; se retiraron sufijos de versión que generaban accesorios nuevos. |
| Publicación GitHub | Parcial | `main` y el tag anotado `v1.1.67` están publicados; falta crear la GitHub Release por ausencia de sesión/API autenticada. |

## Validación actual

- `npm run build`: correcto.
- `npm run lint`: correcto.
- `node --check src/frontend/script.js`: correcto.
- `npm test`: 52 pruebas correctas.
- `sh -n run.sh`: correcto.

## Decisiones técnicas

### Emparejamiento y QR

Un endpoint bridged no tiene QR ni fabric propios. El QR pertenece al bridge,
por lo que el emparejamiento inicial se realiza una vez desde el frontend
oficial de Matterbridge. El botón de QR del panel abre dicho frontend sin leer
estado privado ni fabricar códigos. Para añadir un segundo ecosistema se debe
abrir una ventana de comisión temporal desde el controlador o el frontend
oficial.

No se regenerará el PIN inicial cada pocos minutos: esa credencial identifica
al nodo y cambiarla no es una renovación segura compatible. La ventana de
comisión temporal es el mecanismo Matter adecuado.

### IP y red

El addon usa `http://supervisor/core` en Home Assistant OS, evitando depender
de una IP LAN de HA. Cambios de IP de dispositivos Wi-Fi/Thread los absorbe su
integración de Home Assistant; este bridge continúa siguiendo el mismo
`entity_id` mediante eventos `state_changed`.

## Pendientes para la siguiente iteración

- [ ] Añadir pruebas de reconexión WebSocket, ráfagas de eventos y alta/baja repetida de endpoints.
- [ ] Ejecutar prueba de integración en Home Assistant real con Apple Home, IPv6 y mDNS habilitados.
- [ ] Auditar individualmente clusters no estándar (cámara, horno, cooktop y RVC) contra las capacidades vigentes de Apple Home.
- [ ] Confirmar una versión oficial de Matterbridge/matter.js que anuncie soporte explícito para Matter 1.6 antes de declararlo compatible.

## Despliegue requerido

La migración cambia la identidad topológica de los accesorios. Antes de
desplegar, seguir [production-migration.md](./production-migration.md), hacer
copia de `/data/.matterbridge` y volver a emparejar una vez el bridge.

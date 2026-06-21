# Migración de producción: un bridge Matter estable

## Qué cambia

Este add-on usa ahora un único nodo Matter en modo `bridge`. Las entidades de
Home Assistant son endpoints bridged y se crean únicamente después de que se
activen desde la interfaz. No se crea un servidor Matter, puerto, almacén o
anuncio mDNS por entidad.

La consecuencia esperada es que el bridge se empareja una vez y Apple Home
recibe todos los endpoints seleccionados. Un endpoint bridged no tiene un QR
ni una tela/fabric independiente: en Matter se empareja un nodo, no un
endpoint.

## Despliegue

1. Haz una copia de `/data/.matterbridge` antes de actualizar el add-on.
2. Actualiza la imagen y reinicia el add-on. El script migra el valor inválido
   `bridgeMode: dynamic` a `bridge` y arranca Matterbridge con `--bridge`.
3. En Apple Home, elimina los accesorios creados por la versión anterior. Eran
   nodos Matter independientes y no pueden convertirse de forma segura en
   endpoints bridged.
4. Restablece la comisión de Matterbridge una vez, con el flujo oficial de
   Matterbridge (`matterbridge --reset` con el servicio detenido, o desde su
   frontend oficial).
5. Arranca el add-on, selecciona las entidades que deseas exportar y empareja
   el bridge una sola vez con el QR que muestra el frontend oficial de
   Matterbridge.
6. Espera a que el controlador redescubra los endpoints. No borres la carpeta
   `/data/.matterbridge` después de este punto: contiene las credenciales y
   los registros de telas Matter.

## Emparejamiento y seguridad

El PIN/QR de instalación inicial es una credencial persistente del nodo. No se
debe regenerar cada cinco minutos: hacerlo invalida intentos de comisión y,
en implementaciones que fuerzan el cambio, puede requerir un factory reset.

Para añadir una segunda casa o ecosistema después de la primera comisión, usa
la acción **Turn on pairing mode / Compartir** del controlador o del frontend
oficial de Matterbridge. Eso abre la ventana de comisión temporal definida por
Matter y genera las credenciales de adición apropiadas.

## Red

El add-on se conecta a Home Assistant mediante `http://supervisor/core` y el
token del supervisor, por lo que no depende de una IP LAN de Home Assistant.
La IP de cada dispositivo físico tampoco debe ser gestionada por este plugin:
su integración de Home Assistant mantiene esa conexión y el add-on recibe los
eventos `state_changed` por WebSocket. Si un dispositivo Wi-Fi/Thread cambia
de dirección, HA vuelve a resolverlo y el mismo `entity_id` sigue actualizando
el endpoint Matter.

Para Matter/HomeKit, mantén IPv6 y multicast/mDNS disponibles entre HomePods,
Apple TVs, iPhones y el host de Home Assistant. Selecciona `mdnsinterface` si
el host tiene más de una interfaz LAN. No fuerces `ipv4_only` salvo que estés
diagnosticando un entorno muy concreto.

# Thread Network Topology

Este add-on no crea una red Thread, no almacena el Active Operational Dataset y no actúa como Thread Border Router. Sus accesorios Matterbridge usan transporte IP en la LAN.

Para acceder desde Home Assistant o Apple Home a dispositivos Matter-over-Thread:

1. Instala un Thread Border Router conectado a la misma LAN: HomePod mini/HomePod (2.ª gen), Apple TV 4K compatible o un OpenThread Border Router de Home Assistant.
2. Mantén IPv6 y multicast mDNS habilitados entre el host de Home Assistant, el Border Router y el bridge. No actives `ipv4_only` en este add-on.
3. Comisiona el dispositivo Thread en Apple Home o Home Assistant y compártelo mediante Multi-Admin cuando necesites ambos controladores.

No copies ni guardes manualmente claves Thread en la configuración de este plugin.

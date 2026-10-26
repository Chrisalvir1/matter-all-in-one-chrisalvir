# Matter All-in-One 2.1.23

- Exportación nativa Matter RVC garantizada:
  - Corregido el error `Matter server node was not created for vacuum.*` al exportar aspiradoras en Matter.
  - Sincronización completa de desregistro previo para evitar que colisiones de nombres o identidades en Matterbridge impidan la creación del `ServerNode`.
  - Retiro dinámico del clúster `ServiceArea` cuando no hay mapas ni áreas definidas en Home Assistant para garantizar total conformidad con la especificación Matter RVC en Apple Home.
- Corrección de interfaz (UI):
  - Las aspiradoras robot nunca se sugieren como HomeKit HAP ni se confunden con televisores (resuelto falso positivo por contener "tv" en el nombre de la habitación).
  - Pestaña de protocolo Matter seleccionada por defecto para aspiradoras.

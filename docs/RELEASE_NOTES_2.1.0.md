# Matter All-in-One v2.1.0

- Actualiza Matterbridge a 3.10.13 y mantiene Node.js 24.21.0.
- Añade duración y cuenta atrás HAP para válvulas, con restauración de temporizadores y conservación de UUID y emparejamientos existentes.
- El cierre programado solicita a Home Assistant cerrar la válvula; no garantiza su cierre físico.
- Corrige disponibilidad childbridge y retirada de endpoints con Matterbridge 3.10.13.
- La imagen multi-arquitectura y el release se publican solo después de la verificación pública de GHCR.

**Pruebas locales:** typecheck, build y 623 pruebas aprobadas con Node.js 24.21.0. La prueba Docker local no pudo descargar la imagen base por un fallo DNS del proxy; la build ARM64/AMD64 de GitHub Actions queda como condición de publicación. Las pruebas físicas de Apple Home y válvulas quedan pendientes.

# Matter All-in-One Chrisalvir v2.3.13

Publicada el 2 de noviembre de 2026. Actualiza Node.js 26.13.0 LTS, npm 12.2.1, Matterbridge 3.11.1, HAP-NodeJS 2.3.0 y werift 0.26.0. Fija imágenes base por digest y Actions estables por SHA.

El add-on resuelve los servicios `DeviceCommissioner` y `FabricManager` desde el entrypoint ESM de `@matter/protocol` que instala Matterbridge, preservando las identidades de clase entre bridge y plugin.

GitHub Actions aprobó 82 suites/707 pruebas, tipos, formato, build, npm audit (0 vulnerabilidades), contenedores AMD64/ARM64 y runtime de producción. La imagen GHCR multi-arquitectura, la GitHub Release y el paquete npm están publicados. La ejecución npm #225 publicó con Trusted Publishing y provenance: [workflow](https://github.com/Chrisalvir1/matter-all-in-one-chrisalvir/actions/runs/41512016121). El contrato pasó 2 pruebas contra Home Assistant 2026.11.0b3/Python3.14.10; es beta. En ambas imágenes cargaron Matterbridge, los servicios Matter, FFmpeg 8.0-homebridge y ffprobe 8.1.3.

Haz una copia de seguridad antes de instalar. Conserva `/data` y fabrics existentes. Matterbridge restablece preferencias de su interfaz por cambios en las claves locales. No hay nuevas pruebas físicas de Apple Casa, Live View, Talkback, HKSV ni Robotina asociadas a esta versión.

El registry npm confirma `matter-all-in-one-addon@2.3.13` como versión `latest`; la verificación devolvió HTTP 200 y el tarball coincide con la integridad reportada por GitHub Actions.

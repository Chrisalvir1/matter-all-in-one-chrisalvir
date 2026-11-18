# Matter All-in-One Chrisalvir v2.3.19

- Actualiza Lucide React a 1.74.0 y npm a 12.2.3 en el proyecto, las imágenes y los workflows.
- Actualiza uv y el objetivo de pruebas a Home Assistant 2026.11.2; conserva Node 26.13.1, Matterbridge 3.11.3 y HAP 2.3.0.
- Regenera el lockfile y conserva la validación nativa amd64/arm64 antes de publicar la imagen y el release.

## Verificación

755 pruebas unitarias y 2 pruebas Core correctas; tipos, formato, build y toolchain correctos. Auditoría npm de producción sin vulnerabilidades detectadas.

El build Docker local no pudo descargar el índice Alpine por HTTP 403. La imagen solo se publica si pasan las validaciones nativas amd64/arm64 y su comprobación pública en GitHub Actions.

Las pruebas locales no sustituyen la validación de dispositivos físicos, audio/iCloud ni una instalación de producción.

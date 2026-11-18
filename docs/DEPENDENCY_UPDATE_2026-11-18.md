# Actualización de dependencias — matter-all-in-one-chrisalvir

Estado: cambios incorporados a la candidata v2.3.19, con publicación por GitHub Actions al crear el tag. Base: 8451e4f75761a6870298cd9f846aece41b111a32

## Cambios

Lucide React1.74.0, npm12.2.3 en manifiesto/Docker/CI, uv0.13.9 y HA2026.11.2. Node 26.13.1, HAP2.3.0 y Matterbridge3.11.3 se mantienen porque están al día.

## Validación

Toolchain, tipos, formato y build correctos;755 pruebas unitarias y2 pruebas HA correctas; npm ci --legacy-peer-deps correcto. Auditoría npm de producción:0 vulnerabilidades. Dockerbuild bloqueado por HTTP403 del índice Alpine del entorno, antes de probar el runtime.

## Manifiestos modificados

| Archivo | Grupo | Dependencia | Antes | Ahora |
|---|---|---|---|---|
| `matter-all-in-one-addon/package.json` | dependencies | lucide-react | `^1.73.0` | `^1.74.0` |
| `matter-all-in-one-addon/package.json` | toolchain | packageManager | `npm@12.2.2` | `npm@12.2.3` |

## Alcance

No se modificaron Chrisalvir Pro, Omni Broadlink, Fan BLE Home ni brands. No se actualizó el Node del host Camera.UI ni se modificaron instalaciones de producción. Los plugins requieren que su host cumpla Node>=26.13.1<27 antes de instalar esta actualización.

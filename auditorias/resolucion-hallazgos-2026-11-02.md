# Resolución de hallazgos — 2026-11-02

Candidata local **2.3.13**, rama `codex/stable-dependencies-node26`. Sin commit, push, main, tag, publicación ni instalación HA.

## Resuelto y verificado localmente

- **npm12.2.1**, última estable consultada, en packageManager, builder y runtime Docker, jobs de CI y devcontainer. npm ci limpio aprobado con Node26.13.0 y npm12.2.1. Política explícita `allowScripts.fsevents=false`: módulo opcional macOS, no necesario para pruebas/compilación ni Linux; no se habilitaron scripts arbitrarios.
- **Servicios Matter**: `loadBridgeProtocol()` localiza @matter/protocol desde la instalación real de Matterbridge y usa el entrypoint **ESM** declarado por ese paquete. Usar directamente createRequire/import de su entrypoint CJS devolvía un espacio de exports distinto y no preservaba las clases ESM; la corrección evita esa ruta. No añade otra copia ni versión independiente de Matter.js. Reemplaza los dos imports directos de platform para DeviceCommissioner/FabricManager. Prueba de identidad frente al protocolo ESM real y validación de clases incluidas.
- **Producción separada**: instalación nueva en `/tmp/miao-addon-prod-audit`, npm ci omit=dev/peer y symlink al bridge separado `/tmp/miao-matterbridge-prod-audit`; checker completo aprobado, incluidos servicios protocolo. Esto reproduce la resolución npm/global del contenedor, pero sigue siendo macOS ARM64, no Linux musl.
- **Formato**: corregidos90 archivos de deuda previa y archivos nuevos según los globs del lint existente; `npm run lint` ahora pasa. No se afirma cobertura de estilos no incluidos en esos globs.
- **Imágenes**: fijados digests reales del índice multiarch Node y devcontainer MCR. Dockerfile/build.yaml usan el mismo índice Node, verificado por checker. Digests en `image-digests-2026-11-02.json`. No se inventaron paquetes OS ni resultados de escáner CVE.
- **Publicación accidental**: helper push_update.sh rechaza ramas diferentes de main antes de generar commit/tag/push; se retiró HEAD:main explícito. Se comprobó el rechazo en la rama candidata; ningún push/tag se realizó.
- **CI**: checker de runtime se ejecuta después de copiar dist, validando la función corregida también durante build. Publicación de imagen depende ahora de validación nativa AMD64+ARM64, con imports sin red y FFmpeg/ffprobe, además del job de tipos/build/tests. Lint añadido a CI de build/npm. Workflows parseados como YAML.

## Checks

- Node26.13.0 LTS / npm12.2.1: confirmado en ejecución.
- npm ci limpio: aprobado.
- typecheck y build: aprobados.
- suite final: **82 archivos / 707 pruebas aprobadas**.
- npm lint: aprobado.
- check:toolchain y check:runtime: aprobados.
- npm audit: **0 vulnerabilidades**; npm outdated directo: `{}`.
- Coherencia changelog/config/package/lock/plugin: **2.3.13**.
- git diff --check y sintaxis shell: aprobados.

## Lo que aún exige ejecución externa

No hay Docker/Podman/Colima disponible en este host; no se instalaron motores/VMs ni se enviaron cambios para disparar CI. Jobs Linux AMD64/ARM64 y build de imagen completa están preparados pero **no ejecutados**. Escaneo OS/SBOM, comprobación real de libs nativas/codecs/FFmpeg y consumo Pi5 requieren esa imagen.

El objetivo HA permanece **2026.11.0b3**, beta disponible por instrucción de Chris, con Python3.14.10/uv0.13.6. Job contrato HA todavía pendiente: no es correcto afirmar compatibilidad comprobada. Sustituir por estable2026.11 cuando exista, actualizando ref y aserción juntos. Las dependencias del add-on/Actions usan releases estables; no se forzaron majors transitivos incompatibles ni se migró Python fuera del soporte HA.

No se probaron acciones reales sobre fabrics existentes ni reproducción/clip HKSV/talkback o Robotina físicos. Los tests y resolución corregida no reemplazan esas pruebas.

> **Actualización posterior:** los hallazgos de código/configuración (npm12, protocolo ESM, lint, digests y helper) se corrigieron localmente. Véase `resolucion-hallazgos-2026-11-02.md`. Las secciones de hallazgos siguientes documentan la auditoría anterior a esas correcciones. Validación Linux/HA/Casa continúa pendiente.

# Auditoría ampliada de versiones — 2026-11-02

Ámbito: repositorio activo `miao-dependency-update`, base `0689b59`/2.3.12, candidata **2.3.13** en `codex/stable-dependencies-node26`. Incluye dependencias directas/transitivas, instalación de producción separada del bridge, workflows, Docker, scripts de desarrollo, imports, pruebas y documentación. No es una auditoría de seguridad exhaustiva de toda la lógica ni de servicios instalados externos. No se inspeccionó el estado vivo HA/Omni/Camera.UI/go2rtc/Scrypted ni se actualizaron esos servicios. Las otras carpetas/worktrees son referencias históricas y no se migraron.

## Conclusión

Las dependencias directas npm están en sus últimas estables consultadas y se renovaron transitivas compatibles. Quedan actualizaciones y defectos de empaquetado pendientes: **no declarar lista para desplegar** la candidata por el solo resultado verde de Vitest.

## Hallazgos que requieren atención

1. **Import de producción no resuelto en gestión de fabrics.** `src/platform.ts` importa dinámicamente `@matter/protocol` en fallbacks DeviceCommissioner y FabricManager, pero no lo declara. Una instalación limpia omit=dev/peer con Matterbridge separado y symlink (como Docker) pasa los imports principales, pero `import('@matter/protocol')` devuelve **ERR_MODULE_NOT_FOUND**. La instalación de desarrollo lo oculta por hoisting. Son rutas protegidas por try/catch, por lo que no demuestra caída del arranque; sí riesgo de fallback inoperante. Corregir usando el mismo módulo/identidad de clases del bridge y pruebas específicas antes de desplegar. No introducir otra copia Matter arbitraria ni probar borrando fabrics reales. La última estable Matter.js es **0.18.0**, la misma que consume Matterbridge3.11.1; no hay motivo de versión para forzar un salto.
2. **npm aún no es la última estable.** Node26.13.0 distribuye npm11.20.0, fijado actualmente y validado. Registry confirma **npm12.2.1**, compatible con Node26. Su migración queda pendiente: instalar explícitamente la misma versión en builder/runtime Docker, CI y devcontainer, cambiar packageManager y validar npm ci, lockfile, OIDC y allowScripts. La configuración actual coherente no equivale a última versión npm.
3. **Lint de formato falla en 90 archivos.** Reproducido con Prettier actual en candidata y en una extracción limpia de HEAD: mismo total90. Es deuda previa, no atribuida a esta actualización. No se reformateó masivamente código de cámara/fabrics.
4. **Jobs actualizados aún no ejecutados.** YAML parseado y comprobado sin claves duplicadas; esto no sustituye GitHub runner, Buildx/QEMU, builds Linux musl ni OIDC. Actions usan runtime propio `node24` según sus manifests oficiales: es independiente del Node26 seleccionado para el proyecto; no editar el runtime interno de Actions.
5. **Imágenes con tags flotantes.** `node:26.13.0-alpine3.24` fija Node y rama Alpine, no digest ni patch OS. La última rama estable es3.24, patch3.24.3; la versión OS real debe inspeccionarse dentro de la imagen construida. MCR26-trixie y BuildKit/binfmt por defecto también pueden cambiar. Recomendada fijación por digest tras build/smoke y escaneo real de CVEs/SBOM; no se inventaron digests ni un resultado de escáner.
6. **Helper de publicación de alto impacto.** `push_update.sh` todavía incluye commit/tag/push y `HEAD:main`; no se ejecutó. No usarlo para continuar esta rama de auditoría. Scripts manuales `install-matterbridge-dev.sh`/`main.sh` siguen siendo vías explícitas de desarrollo, fuera del devcontainer normal ya corregido.

## Cambios adicionales aplicados localmente

### GitHub Actions: releases estables fijadas por SHA

| Action | Release |
|---|---|
| [actions/checkout](https://github.com/actions/checkout/releases/tag/v7.0.1) | v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) |
| [actions/setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0) | v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`) |
| [actions/setup-python](https://github.com/actions/setup-python/releases/tag/v7.1.0) | v7.1.0 (`6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`) |
| [docker/setup-qemu-action](https://github.com/docker/setup-qemu-action/releases/tag/v4.4.0) | v4.4.0 (`99012661954931238ded8c8b007157a8430204e1`) |
| [docker/setup-buildx-action](https://github.com/docker/setup-buildx-action/releases/tag/v4.4.1) | v4.4.1 (`f87e5991a6d7451dcb8d9637bfbc97413f497069`) |
| [docker/login-action](https://github.com/docker/login-action/releases/tag/v4.7.0) | v4.7.0 (`81c6f93d4bc991e510b342a00b419b3bb4efc5c6`) |
| [docker/build-push-action](https://github.com/docker/build-push-action/releases/tag/v7.4.0) | v7.4.0 (`c3c9e263c25d99ce0380d002d59b67737d91b0dc`) |

Se revisaron manifests `action.yml`: los inputs usados siguen presentes. El build-push7.4.0 además incluye corrección de inyección de comandos en logs de metadata. Cambios mayores de Actions permanecen pendientes de ejecución real en runners.

### Dependencias transitivas

`npm update --legacy-peer-deps` renovó16 paquetes instalados, añadió1 y retiró2 durante esta pasada. Cambios incluyen Babel7, engine.io-client6.6.7, PostCSS8.5.32, readable-stream4.8.0, rolldown1.2.16, socks2.8.10 y tinybench6.2.3. Inventario exacto total contra HEAD en `lockfile-changes-2026-11-02.json`. No se forzaron majors transitivos: Babel8, Noble2, ASN.1/X5093, yargs18 y otras ramas necesitan adaptación del paquete padre. Matterbridge fija werift0.25.2 y ws8.22.0 internamente, aunque el add-on usa0.26.0/8.22.1; ambas copias son intencionales según su árbol, sin forzar deduplicación.

`@types/dom-webcodecs0.1.13` está fijado por mediabunny1.65.0 aunque existe0.1.19. `npm outdated --all` mantiene diferencias latest fuera de los rangos del padre y peers opcionales no instalados; no se deben instalar todos esos peers ni confundirlos con dependencias faltantes. Inventario de entradas instaladas en `transitive-outdated-2026-11-02.json`. No hay paquetes marcados deprecated en el lockfile revisado. Único paquete con install script: fsevents2.3.3, opcional macOS; npm avisa de política allowScripts no explícita. Revisar al migrar npm12.

### Home Assistant 2026.11, objetivo indicado por Chris

Workflow y contrato exacto apuntan a **2026.11.0b3**, Python **3.14.10**, uv **0.13.6**. 2026.11 aún es beta al momento de la auditoría; última estable general2026.10.4. No se instaló beta en HA. Prueba renombrada `tests_core/test_core_2026_11_websocket_contract.py`; pendiente ejecutar job real con requirements completos. Cuando se publique estable2026.11, reemplazar ref y aserción juntos. Python3.14.10 coincide con `.python-version` de esa referencia. No migrar a Python3.15 solo por ser un major más reciente: el objetivo es el entorno soportado de HA.

Fuentes: [releases HA](https://github.com/home-assistant/core/releases), [HA Python](https://github.com/home-assistant/core/blob/2026.11.0b3/.python-version), [Python3.14.10](https://www.python.org/downloads/release/python-31410/), [uv0.13.6](https://github.com/astral-sh/uv/releases/tag/0.13.6).

### FFmpeg y OS

FFmpeg-for-homebridge **v2.2.2** ya es la última estable del proveedor usada por Docker; se mantienen checksums específicos por arquitectura y codecs de audio existentes. No sustituirlo por FFmpeg genérico de otra rama por número mayor: requiere probar AAC-ELD/Opus, RTSP, fMP4 y reproducción real. `ffprobe` procede del paquete Alpine y puede diferir del FFmpeg de Homebridge: comprobar ambos binarios, rutas, versiones y codecs en imagen final. Curl/jq/ffmpeg del repositorio Alpine se resuelven durante apk add: no se puede afirmar su versión instalada ni ausencia de CVEs sin construir/inspeccionar.

Fuentes: [FFmpeg Homebridge](https://github.com/homebridge/ffmpeg-for-homebridge/releases/tag/v2.2.2), [ramas Alpine](https://alpinelinux.org/releases/).

## Validación y límites

- npm ci limpio después de renovar transitivas: aprobado.
- check:toolchain, check:runtime, typecheck y build: aprobados.
- Suite posterior a transitivas: **81 archivos/706 pruebas aprobadas**.
- npm audit completo:0 vulnerabilidades. Instalación separada Matterbridge3.11.1 producción:0 vulnerabilidades. Esto no es escaneo CVE del OS/imagen.
- Smoke instalación producción del add-on, sin dev/peer y con bridge separado: imports principales aprobados; import directo @matter/protocol falla como se detalla arriba.
- npm outdated directo:vacío. No significa que todo transitivo esté en latest.
- Changelog/config/package/lock/plugin:2.3.13. YAML y diff check:aprobados.
- Lint:fallo conocido90 archivos, igual en base.
- Pendientes: npm12, fallback protocol, GitHub Actions/Linux/ARM64/HA2026.11, imagen/SBOM/CVEs, pruebas físicas y rendimiento Pi5. No hay evidencia nueva Live View/HKSV/talkback ni commissioning por estos checks.

No push, main, tag, release ni despliegue.

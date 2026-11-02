# Actualización estable de dependencias — 2026-11-02

Rama: `codex/stable-dependencies-node26`. Base: `0689b59` (main 2.3.12). Candidata local: **2.3.13**, no publicada ni instalada.

Node 26.13.0 es LTS desde el 2026-10-28: https://nodejs.org/en/blog/release/v26.13.0 . Binario macOS ARM64 descargado de nodejs.org y SHA256 comprobado. Node se utilizó solo en el entorno de validación; no se cambió el runtime del sistema ni HA.

## Versiones verificadas

| Dependencia | Instalada en lockfile |
|---|---|
| `@homebridge/hap-nodejs` | 2.3.0 |
| `@scrypted/client` | 1.3.26 |
| `@scrypted/types` | 0.5.55 |
| `@types/node` | 26.6.6 |
| `@types/qrcode` | 1.5.6 |
| `@types/react` | 19.3.0 |
| `@types/react-dom` | 19.3.0 |
| `@types/ws` | 8.18.2 |
| `@vitejs/plugin-react` | 6.2.1 |
| `@vitest/coverage-v8` | 5.1.0 |
| `lucide-react` | 1.66.0 |
| `matterbridge` | 3.11.1 |
| `mqtt` | 5.16.1 |
| `prettier` | 3.9.10 |
| `qrcode` | 1.5.4 |
| `react` | 19.3.1 |
| `react-dom` | 19.3.1 |
| `typescript` | 7.0.2 |
| `undici` | 8.12.3 |
| `vite` | 8.3.5 |
| `vitest` | 5.1.0 |
| `werift` | 0.26.0 |
| `ws` | 8.22.1 |

## Comprobaciones

- [x] Instalación limpia `npm ci --legacy-peer-deps` con Node v26.13.0.
- [x] `npm run typecheck` backend y frontend.
- [x] `npm run build` TypeScript y Vite.
- [x] 81 archivos de pruebas, **706 pruebas aprobadas**, después de la corrección transitiva.
- [x] `npm audit`: **0 vulnerabilidades**.
- [x] `npm outdated --json`: `{}` para dependencias directas.
- [x] Imports de producción: Matterbridge DescriptorServer/BasicInformationServer, HAP-NodeJS, werift y Scrypted.
- [x] Uso real temporal de rimraf asíncrono y síncrono con glob: borra coincidencias y conserva archivo ajeno.
- [x] Coherencia changelog/config/package/lock: **2.3.13**.
- [x] `git diff --check`.
- [x] Docker Registry confirma `node:26.13.0-alpine3.24` para amd64 y arm64; MCR confirma devcontainer `26-trixie`.
- [ ] Build/arranque de la imagen completa Linux: Docker no está disponible en este entorno.
- [ ] Instalación HA y verificación física Apple Casa, Robotina, Live View local/remoto, audio bidireccional y clip HKSV: no realizados.

Se actualizan runtime Docker, build.yaml, workflows, devcontainer y documentación. Matterbridge se fija a 3.11.1 tanto en npm como en el runtime Docker. Las preferencias de su frontend se restablecen según sus notas oficiales; no se han tocado datos ni fabrics de la instalación real.

## Seguridad transitiva

La instalación inicial encontró cuatro avisos moderados en `@scrypted/client → rimraf → glob → minimatch`. Se mantiene Scrypted estable 1.3.26 y se añade override acotado `rimraf.glob: ^14.0.3`, que resuelve glob 14.0.3/minimatch corregido. Cambia de major transitivo: se validaron las APIs reales usadas por rimraf y toda la suite. No se ejecutó `npm audit fix --force` ni se degradó Scrypted.

No se hizo push, merge a main, tag, release ni despliegue. Los resultados locales no verifican commissioning, reproducción física ni grabaciones.

## Auditoría ampliada de sincronía

- Version managers: `.node-version`/`.nvmrc` raíz y add-on fijados a 26.13.0; packageManager npm@11.20.0 (npm distribuido con el binario validado).
- Nuevos checks `check:toolchain` (coherencia de fuentes) y `check:runtime` (Node/npm reales, imports ESM y versiones lockfile). Se ejecutan en CI; Docker ejecuta runtime contra instalación omit=dev/peer con symlink Matterbridge.
- Job de publicación multiarch configura explícitamente Node; antes confiaba en la versión del runner. Se conserva build_from amd64/aarch64 y Alpine3.24.
- CI amd64 añade ejecución sin red de imports y FFmpeg/ffprobe. ARM64 mantiene runner nativo, comprueba arquitectura de imagen y usa el mismo checker; trigger actualizado a la rama candidata. No se ejecutaron workflows ni publicación.
- Devcontainer deja de compilar Matterbridge dev y de invocar npm desde una carpeta sin package.json; usa release npm fijada, npm ci y checks. No registra/arranca puente automáticamente. El tag MCR 26-trixie es flotante: los checks rechazarán una versión Node diferente; un futuro bump requiere alinear versiones y reconstruir.
- Tareas VS Code reemplazadas por scripts existentes en la carpeta correcta; elimina referencias obsoletas Jest/experimental-vm-modules y scripts inexistentes. Instrucciones de desarrollo reflejan Node26.
- Check de shell `bash -n`/`sh -n`, metadata y diff correctos. Tipos/build y suite posterior: 81 archivos/706 pruebas aprobadas. Checks runtime local y toolchain aprobados.
- No se cambian targets TypeScript, Alpine, FFmpeg ni HA Core por el solo cambio de Node. Runtime Linux musl, imagen final, TLS/RTSP, CPU/RAM en Pi5 y funcionalidades físicas quedan pendientes de validación real.

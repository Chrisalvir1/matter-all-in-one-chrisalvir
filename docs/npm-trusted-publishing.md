# Publicación npm segura — Matter All-in-One Chrisalvir

## Estado y objetivo

La imagen para Home Assistant **v2.3.0** y su GitHub Release ya están
publicadas. El flujo npm de la release falló al intentar subir
`matter-all-in-one-addon@2.3.0` con `E404` de autorización. Las pruebas,
el typecheck y la compilación finalizaron satisfactoriamente; la versión
disponible en npm seguía siendo `2.1.3`.

La publicación npm es **independiente** del add-on de Home Assistant en GHCR.
No cambies la versión, el tag `v2.3.0` ni la imagen existente para recuperar
esta publicación.

## Configuración requerida en npmjs.com (propietario del paquete)

En la cuenta npm que administra `matter-all-in-one-addon`, abre la
configuración del paquete y busca **Trusted Publisher**. Configura:

| Campo | Valor |
| --- | --- |
| Proveedor | GitHub Actions |
| Usuario u organización | `Chrisalvir1` |
| Repositorio | `matter-all-in-one-chrisalvir` |
| Archivo de workflow | `publish.yml` |
| Environment | Sin especificar |
| Acciones permitidas | **Publicar directamente con `npm publish`** |

Guía oficial: https://docs.npmjs.com/trusted-publishers/

No compartas contraseñas, tokens ni códigos 2FA en issues, commits ni en
conversaciones. Esta configuración sustituye la necesidad de mantener un
`NPM_TOKEN` de larga duración en GitHub.

**Importante:** npm exige que la primera publicación de un Trusted Publisher
recién creado tenga éxito en un plazo de **dos días**. Conviene configurar la
conexión cuando se pueda ejecutar el workflow seguidamente.

## Reintentar la v2.3.0

1. Comprueba que la configuración de Trusted Publisher quedó guardada en npm.
2. Ve a GitHub → **Actions → Publish to NPM → Run workflow**.
3. Selecciona la rama **main** (la corrección de OIDC está allí, no en el tag
   antiguo) y ejecuta el flujo manual.
4. Confirma que `Publish to NPM using trusted OIDC identity` termine en
   verde. El workflow utiliza `npm publish --provenance --access public`.
5. Comprueba que `npm view matter-all-in-one-addon@2.3.0 version` devuelva
   `2.3.0`.

El workflow es idempotente: comprueba si **esa versión exacta** ya existe
antes de publicar. No requiere volver a crear la GitHub Release ni modificar
los datos de las cámaras.

## Requisitos de seguridad

- GitHub-hosted runner `ubuntu-latest`.
- Node.js `24.22.1` y npm CLI `11.5.1` o superior.
- Permiso GitHub Actions `id-token: write` y `contents: read`.
- El paquete npm debe autorizar exactamente el repositorio y workflow
  indicados arriba, con permiso de publicación directa.
- El paquete y la ruta del repositorio declarados en `package.json` deben
  coincidir con la configuración de Trusted Publisher.

Si npm vuelve a rechazar la publicación, inspecciona **solo el mensaje de
error** del job. No publiques ni reemplaces credenciales para diagnosticar
sin verificar primero el vínculo Trusted Publisher.

#!/usr/bin/env sh
set -e
echo "Removiendo lock file..."
rm -f .git/index.lock
echo "Agregando archivos..."
git add matter-all-in-one-addon/Dockerfile matter-all-in-one-addon/package.json matter-all-in-one-addon/config.yaml matter-all-in-one-addon/CHANGELOG.md matter-all-in-one-addon/src/ matter-all-in-one-addon/test/
echo "Haciendo commit..."
git commit -m "fix(ui): derive Matter pairing and diagnostics from live fabrics" || echo "Nada que comitear"
echo "Creando tag..."
git tag -a v1.2.44 -m "v1.2.44 — fix live Matter fabric pairing count and per-device logs" || echo "El tag ya existe"
echo "Haciendo push..."
git push origin HEAD --tags
echo "¡Hecho!"

#!/usr/bin/env sh
set -e
echo "Removiendo lock file..."
rm -f .git/index.lock
echo "Agregando archivos..."
git add matter-all-in-one-addon/Dockerfile matter-all-in-one-addon/package.json matter-all-in-one-addon/config.yaml matter-all-in-one-addon/CHANGELOG.md
echo "Haciendo commit..."
git commit -m "chore: release v1.2.32 - add HA logos and icons" || echo "Nada que comitear"
echo "Creando tag..."
git tag -a v1.2.32 -m "Release v1.2.32" || echo "El tag ya existe"
echo "Haciendo push..."
git push origin HEAD --tags
echo "¡Hecho!"

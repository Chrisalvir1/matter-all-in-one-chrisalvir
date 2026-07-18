#!/usr/bin/env sh
set -e
echo "Removiendo lock file..."
rm -f .git/index.lock
echo "Agregando archivos..."
git add matter-all-in-one-addon/Dockerfile matter-all-in-one-addon/package.json matter-all-in-one-addon/config.yaml matter-all-in-one-addon/CHANGELOG.md matter-all-in-one-addon/src/ matter-all-in-one-addon/test/
echo "Haciendo commit..."
git commit -m "fix(runtime): restore Matterbridge plugin startup" || echo "Nada que comitear"
echo "Creando tag..."
git tag -a v1.2.45 -m "v1.2.45 — restore startup after Matter runtime dependency regression" || echo "El tag ya existe"
echo "Haciendo push..."
git push origin HEAD --tags
echo "¡Hecho!"

#!/usr/bin/env sh
set -eu

VERSION=$(python3 -c "import json; print(json.load(open('./matter-all-in-one-addon/package.json'))['version'])")
TAG="v$VERSION"
MESSAGE=${1:-"release: $TAG"}

sed -i '' "s/^version:.*/version: \"$VERSION\"/" ./matter-all-in-one-addon/config.yaml

git diff --quiet && git diff --cached --quiet && { echo "No hay cambios para publicar."; exit 1; }
git add README.md push_update.sh matter-all-in-one-addon .github/workflows repository.yaml repository.json
git commit -m "$MESSAGE"
git tag -a "$TAG" -m "$TAG"
git push origin HEAD
git push origin HEAD:main
git push origin "$TAG"

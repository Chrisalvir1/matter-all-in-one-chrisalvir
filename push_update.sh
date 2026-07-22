#!/usr/bin/env sh
set -eu

VERSION=$(node -p "require('./matter-all-in-one-addon/package.json').version")
TAG="v$VERSION"
MESSAGE=${1:-"release: $TAG"}

git diff --quiet && git diff --cached --quiet && { echo "No hay cambios para publicar."; exit 1; }
git add README.md push_update.sh matter-all-in-one-addon .github/workflows
git commit -m "$MESSAGE"
git tag -a "$TAG" -m "$TAG"
git push origin HEAD
git push origin "$TAG"

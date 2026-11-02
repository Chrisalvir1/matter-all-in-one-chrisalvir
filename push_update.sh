#!/usr/bin/env sh
set -eu

# Publishing is intentionally unavailable from audit/feature branches.
if [ "$(git branch --show-current)" != "main" ]; then
  echo "Release helper requires main; this branch will not be pushed or tagged." >&2
  exit 1
fi

VERSION=$(python3 -c "import json; print(json.load(open('./matter-all-in-one-addon/package.json'))['version'])")
TAG="v$VERSION"
MESSAGE=${1:-"release: $TAG"}

sed -i '' "s/^version:.*/version: \"$VERSION\"/" ./matter-all-in-one-addon/config.yaml

git diff --quiet && git diff --cached --quiet && { echo "No hay cambios para publicar."; exit 1; }
git add README.md push_update.sh matter-all-in-one-addon .github/workflows repository.yaml repository.json CHANGELOG.md docs
git commit -m "$MESSAGE"
git tag -a "$TAG" -m "$TAG"
git push origin HEAD
git push origin "$TAG"

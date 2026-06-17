FROM node:22-alpine

# Install only what's needed at build/runtime
RUN apk add --no-cache jq

WORKDIR /app

# ── Layer 1: Install production + dev deps (cached unless package-lock changes) ──
COPY package.json package-lock.json ./
RUN npm install --no-fund --no-audit

# ── Layer 2: Copy source and build TypeScript ─────────────────────────────────
COPY tsconfig*.json ./
COPY src/ ./src/
# Install matterbridge 'ghostly' just for typescript types to compile, without saving to package.json
RUN npm install matterbridge@^3.9.0 --no-save --no-fund --no-audit
RUN npm run build
# Prune all dev dependencies including the ghostly matterbridge installation
RUN npm prune --production
# Strip matterbridge from dependencies/devDependencies to prevent Matterbridge load failure
RUN jq 'del(.dependencies.matterbridge, .devDependencies.matterbridge)' package.json > package.json.tmp && mv package.json.tmp package.json

# ── Layer 3: Install matterbridge globally and register plugin ────────────────
RUN npm install -g matterbridge@3.9.0 --no-fund --no-audit
RUN matterbridge -add /app || true

# ── Startup script ─────────────────────────────────────────────────────────────
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]

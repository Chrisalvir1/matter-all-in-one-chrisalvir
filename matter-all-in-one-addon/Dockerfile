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
RUN npm run build
RUN npm prune --production

# ── Layer 3: Install matterbridge globally and register plugin ────────────────
RUN npm install -g matterbridge --no-fund --no-audit
RUN matterbridge -add /app || true

# ── Startup script ─────────────────────────────────────────────────────────────
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]

FROM node:22-alpine

# Install only what's needed at build/runtime
RUN apk add --no-cache jq

WORKDIR /app

# ── Layer 1: Install matterbridge globally (provides types for tsc + runtime) ─
RUN npm install -g matterbridge --no-fund --no-audit

# ── Layer 2: Install plugin dev deps (typescript, etc.) without matterbridge ──
COPY package.json ./
RUN npm install --no-fund --no-audit

# ── Layer 3: Copy source and build TypeScript ──────────────────────────────────
COPY tsconfig*.json ./
COPY src/ ./src/
# NODE_PATH lets tsc resolve 'matterbridge' from the global node_modules
RUN NODE_PATH=$(npm root -g) npm run build

# ── Layer 4: Prune dev deps, keep only production artifacts ───────────────────
RUN npm prune --production

# ── Layer 5: Register plugin with matterbridge ────────────────────────────────
RUN matterbridge -add /app || true

# ── Startup script ─────────────────────────────────────────────────────────────
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]

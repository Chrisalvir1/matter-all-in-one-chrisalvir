FROM node:24-alpine

# Install only what's needed at build/runtime
RUN apk add --no-cache jq

# ── Install matterbridge globally FIRST ──
# This is the heaviest step (compiling @matter/node native bindings).
# By doing this before copying any source files, Docker caches it permanently
# until the matterbridge version string changes in this file.
RUN npm install -g matterbridge@3.9.0 --no-fund --no-audit

WORKDIR /app

# ── Layer 1: Install plugin dependencies ──
COPY package.json package-lock.json ./
RUN npm install --no-fund --no-audit

# ── Layer 2: Link global matterbridge and build TypeScript ──
# Link global matterbridge to local node_modules so TypeScript can see the types
RUN ln -s /usr/local/lib/node_modules/matterbridge /app/node_modules/matterbridge

COPY tsconfig*.json ./
COPY src/ ./src/
RUN npm run build

# ── Layer 3: Cleanup and register plugin ──
RUN npm prune --production
RUN jq 'del(.devDependencies, .peerDependencies)' package.json > package.json.tmp && mv package.json.tmp package.json

RUN matterbridge -add /app || true

# ── Startup script ──
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]

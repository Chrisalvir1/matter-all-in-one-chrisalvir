ARG BUILD_FROM=node:24.18-alpine3.24
FROM ${BUILD_FROM} AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --no-fund --no-audit
COPY tsconfig*.json ./
COPY scripts/clean-dist.mjs ./scripts/clean-dist.mjs
COPY src/ ./src/
RUN npm run build

FROM ${BUILD_FROM} AS runtime

ARG BUILD_VERSION=dev
ARG BUILD_ARCH=unknown
LABEL io.hass.type="app" \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.arch="${BUILD_ARCH}" \
  org.opencontainers.image.source="https://github.com/Chrisalvir1/matter-all-in-one-chrisalvir" \
  org.opencontainers.image.licenses="Apache-2.0"

RUN apk add --no-cache jq \
  && npm install -g matterbridge@3.10.0 --omit=dev --no-fund --no-audit

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=peer --legacy-peer-deps --no-fund --no-audit \
  && { test -e /app/node_modules/matterbridge || ln -s /usr/local/lib/node_modules/matterbridge /app/node_modules/matterbridge; }
RUN jq 'del(.devDependencies, .peerDependencies)' package.json > package.json.tmp \
  && mv package.json.tmp package.json

COPY --from=builder /app/dist ./dist
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

CMD ["/run.sh"]

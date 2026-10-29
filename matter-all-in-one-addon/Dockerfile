ARG BUILD_FROM=node:24.22.1-alpine3.24
FROM ${BUILD_FROM} AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/hap-nodejs/ ./vendor/hap-nodejs/
RUN npm ci --legacy-peer-deps --no-fund --no-audit
COPY tsconfig*.json vite.config.ts ./
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

RUN set -eu; apk add --no-cache curl jq ffmpeg; ARCH=$(uname -m); \
     case "${ARCH}" in \
       x86_64) FFMPEG_ASSET=ffmpeg-alpine-x86_64.tar.gz; FFMPEG_SHA256=b29b9d64111410a322e5e5558d1c4f968864ca44630329dc6cd31295997999a3 ;; \
       aarch64) FFMPEG_ASSET=ffmpeg-alpine-aarch64.tar.gz; FFMPEG_SHA256=3ed1724533921b6b54d1fd35802af62abd29e8672e0afb94bb2f8c18158323a3 ;; \
       armv7l) FFMPEG_ASSET=ffmpeg-alpine-arm32v7.tar.gz; FFMPEG_SHA256=7ca3a11389c3f1f06d620a3a1949a5ecfdc16112dd88ba2e7e9cdc8ec278d3af ;; \
       *) echo "Unsupported FFmpeg architecture: ${ARCH}" >&2; exit 1 ;; \
     esac; \
     curl -fL --retry 3 "https://github.com/homebridge/ffmpeg-for-homebridge/releases/download/v2.2.2/${FFMPEG_ASSET}" -o /tmp/ffmpeg-homebridge.tar.gz; \
     echo "${FFMPEG_SHA256}  /tmp/ffmpeg-homebridge.tar.gz" | sha256sum -c -; \
     tar xzf /tmp/ffmpeg-homebridge.tar.gz -C / --no-same-owner; \
     rm /tmp/ffmpeg-homebridge.tar.gz; chmod 0755 /usr/local/bin/ffmpeg; \
     npm install -g matterbridge@3.11.0 --omit=dev --no-fund --no-audit

WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor/hap-nodejs/ ./vendor/hap-nodejs/
RUN npm ci --omit=dev --omit=peer --legacy-peer-deps --no-fund --no-audit \
  && { test -e /app/node_modules/matterbridge || ln -s /usr/local/lib/node_modules/matterbridge /app/node_modules/matterbridge; } \
  && node --input-type=module -e "const { DescriptorServer } = await import('matterbridge/matter/behaviors'); if (!DescriptorServer || !('BasicInformationServer' in await import('matterbridge/matter/behaviors'))) throw new Error('Matter behavior exports missing')" \
  && node --input-type=module -e "const hap = await import('@homebridge/hap-nodejs'); if (!hap.CameraController || !hap.SecureVideoController || !hap.Service.CameraWebRTCStreamManagement || !hap.Service.CameraMultiTierRTPStreamManagement) throw new Error('HAP runtime incomplete')"
RUN jq 'del(.devDependencies, .peerDependencies)' package.json > package.json.tmp \
  && mv package.json.tmp package.json

COPY --from=builder /app/dist ./dist
COPY run.sh /run.sh
RUN chmod 0755 /run.sh

CMD ["/run.sh"]

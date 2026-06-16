ARG BUILD_FROM=alpine:latest
FROM $BUILD_FROM

# Install nodejs, npm, git and jq
RUN apk add --no-cache nodejs npm git jq

WORKDIR /app

# Copy the plugin files
COPY . .

# Build the plugin
RUN npm install --no-fund --no-audit
RUN npm run build

# Install matterbridge globally
RUN npm install -g matterbridge --no-fund --no-audit

# Copy run script
COPY matter-all-in-one-addon/run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

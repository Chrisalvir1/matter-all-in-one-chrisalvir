FROM node:22-alpine

# Install git and jq
RUN apk add --no-cache git jq

WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json tsconfig*.json ./

# Install dependencies (including typescript for compilation)
RUN npm install --no-fund --no-audit

# Copy the rest of the application source
COPY src/ ./src/

# Build/compile the typescript code
RUN npm run build

# Install matterbridge globally (peer dependency runtime)
RUN npm install -g matterbridge --no-fund --no-audit

# Register the plugin globally in matterbridge
RUN matterbridge -add /app || true

# Copy run script
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]

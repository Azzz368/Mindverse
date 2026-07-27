# syntax=docker/dockerfile:1
#
# Render production image for Mindverse.
# It deliberately keeps the Codex CLI development dependency because the running
# application invokes it for Codex + HyperFrames motion jobs.
FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/home/node \
    PUPPETEER_CACHE_DIR=/home/node/.cache/puppeteer \
    PRODUCER_PUPPETEER_LAUNCH_TIMEOUT_MS=120000

WORKDIR /app

# FFmpeg handles media inspection/assembly. The remaining packages are Chromium's
# shared-library dependencies for HyperFrames/Puppeteer rendering.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      ffmpeg \
      fonts-liberation \
      fonts-noto-cjk \
      libnspr4 \
      libasound2 \
      libatk-bridge2.0-0 \
      libatk1.0-0 \
      libatspi2.0-0 \
      libcups2 \
      libdrm2 \
      libgbm1 \
      libgtk-3-0 \
      libnss3 \
      libx11-xcb1 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxkbcommon0 \
      libxrandr2 \
      xdg-utils \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json package-lock.json ./
# Keep dev dependencies: @openai/codex and TypeScript are needed by the app's
# runtime bridge and by next build respectively. NODE_ENV is production in the
# base image, so include dev dependencies explicitly instead of relying on npm's
# default install behavior.
RUN npm ci --include=dev

# Do not point HyperFrames at Debian's regular Chromium. It only supports the
# screenshot capture fallback on Linux, which is prohibitively slow on a Render
# Web Service. Download HyperFrames' matching Chrome Headless Shell instead;
# it enables deterministic HeadlessExperimental.beginFrame capture at runtime.
# This stage only has package.json/package-lock.json and node_modules; the
# repository's scripts/ wrapper has not been copied yet, so call the installed
# HyperFrames CLI directly.
RUN node node_modules/hyperframes/dist/cli.js browser ensure --force

FROM dependencies AS build

COPY . .
RUN npm run build

# Keep Chromium as a diagnostic fallback, but normal rendering uses the managed
# Chrome Headless Shell copied from the build stage.
RUN mkdir -p /home/node/.cache/puppeteer /app/.mindverse \
    && chown -R node:node /home/node /app

FROM base AS runtime

COPY --from=build --chown=node:node /app /app
# The managed browser is outside /app, so it must be copied explicitly. Without
# this layer the runtime falls back to Debian Chromium and screenshot capture.
COPY --from=build --chown=node:node /home/node/.cache/hyperframes /home/node/.cache/hyperframes
COPY --chown=node:node docker/codex/config.toml /home/node/.codex/config.toml
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/mindverse-entrypoint
RUN chmod 755 /usr/local/bin/mindverse-entrypoint
USER node

# Render injects PORT. EXPOSE is documentation only and does not hard-code it.
EXPOSE 10000

# Next receives Render's PORT and binds to all interfaces.
ENTRYPOINT ["/usr/local/bin/mindverse-entrypoint"]
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]

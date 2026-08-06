# syntax=docker/dockerfile:1
#
# Render production image for Mindverse.
# It deliberately keeps the Codex CLI development dependency because the running
# application invokes it for Codex + HyperFrames motion jobs.
FROM node:22-bookworm-slim AS base

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOME=/home/node \
    PRODUCER_HEADLESS_SHELL_PATH=/usr/bin/chromium-headless-shell \
    PRODUCER_PUPPETEER_LAUNCH_TIMEOUT_MS=120000

WORKDIR /app

# FFmpeg handles media inspection/assembly. Chromium Headless Shell supports
# HyperFrames' Linux beginFrame capture without downloading a browser at build
# time, which is important because Render's build network can reject Chrome's
# external download endpoint.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium-headless-shell \
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

FROM dependencies AS build

COPY . .
RUN npm run build

# The Headless Shell comes from APT in the base stage, so no runtime browser
# cache or external Chrome download is required.
RUN mkdir -p /app/.mindverse \
    && chown -R node:node /home/node /app

FROM base AS runtime

COPY --from=build --chown=node:node /app /app
COPY --chown=node:node docker/codex/config.toml /home/node/.codex/config.toml
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/mindverse-entrypoint
RUN chmod 755 /usr/local/bin/mindverse-entrypoint
USER node

# Render injects PORT. EXPOSE is documentation only and does not hard-code it.
EXPOSE 10000

# Next receives Render's PORT and binds to all interfaces.
ENTRYPOINT ["/usr/local/bin/mindverse-entrypoint"]
CMD ["npm", "run", "start", "--", "-H", "0.0.0.0"]

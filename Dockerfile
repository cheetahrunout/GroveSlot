# Lowrider game server for Grove Casino: one service that serves the Vite page,
# the JSON/SSE game API and /health.

FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
# Install from the lockfile first so dependency layers only change with it.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build
# Production dependencies of the server only (the shared package is bundled in).
RUN pnpm --filter @lowrider/server deploy --prod --legacy /out

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIR=/app/web \
    DATA_DIR=/app/data
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist ./web
COPY casino-game.json ./
# SQLite keeps round references and Wanted levels only; never balances.
# The casino mounts the data volume at DATA_DIR; a new volume takes this folder with its owner (casino 0.52.0).
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data
USER node
# Set by CI to 1.0.<build number>; reported by /health and the heartbeat.
ARG BUILD_VERSION=dev
ENV GAME_VERSION=${BUILD_VERSION}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1
CMD ["node", "dist/server.mjs"]

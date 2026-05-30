# Beacon API server — Bun runtime, multi-stage to keep the final image small.
FROM oven/bun:1.3.13-alpine AS deps
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/server/package.json ./packages/server/
COPY packages/cli/package.json ./packages/cli/
COPY packages/widget/package.json ./packages/widget/
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.13-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4747
EXPOSE 4747

HEALTHCHECK --interval=20s --timeout=3s --retries=5 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4747/healthz || exit 1

CMD ["bun", "packages/server/src/index.ts"]

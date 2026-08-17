### @erp/api — Express worker (Article VI: the only long-running process).
### Build context is the REPOSITORY ROOT, not this directory, because the
### worker imports @erp/shared and @erp/database via pnpm workspace links.
###   docker build -f packages/api/Dockerfile .
### fly.toml at the repo root already sets dockerfile + context accordingly.

# ── Stage 1: install workspace deps and bundle the worker ───────────────────
FROM node:20-slim AS builder
WORKDIR /repo

RUN corepack enable

# Copy only the manifests first so `pnpm install` stays cached across source
# edits. Every workspace package.json must be present or --frozen-lockfile
# rejects the lockfile as out of date.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json   packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/ui/package.json       packages/ui/
COPY packages/web/package.json      packages/web/
COPY packages/api/package.json      packages/api/

# `@erp/api...` pulls in its workspace deps (shared, database) but skips
# @erp/web and @erp/ui — no Next.js or Playwright in this image.
RUN pnpm install --frozen-lockfile --filter @erp/api...

COPY packages/shared   packages/shared
COPY packages/database packages/database
COPY packages/api      packages/api

# esbuild, not tsc: @erp/shared and @erp/database publish their `exports` as
# raw .ts source (main: ./src/index.ts), so plain `node dist/index.js` dies
# with ERR_UNKNOWN_FILE_EXTENSION on the first workspace import. Bundling
# resolves that TS source at build time into one self-contained CJS file.
RUN pnpm --filter @erp/api run build:bundle

# ── Stage 2: runtime — just Node and the single bundled file ────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# The reminder cron computes per-school windows in Africa/Khartoum; the slim
# image ships no tzdata, so date-fns-tz would fall back to UTC and send at the
# wrong local hour.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /repo/packages/api/dist/server.cjs ./server.cjs

# Don't run the worker as root.
USER node

EXPOSE 8080
CMD ["node", "server.cjs"]

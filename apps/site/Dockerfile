# syntax=docker/dockerfile:1.7
# Build the Next.js standalone bundle for apps/site (隐界 Enclave 官网).
# Run from repo root: docker build -f apps/site/Dockerfile .

ARG NODE_VERSION=22-alpine

# ---------- deps ----------
FROM node:${NODE_VERSION} AS deps
RUN corepack enable
WORKDIR /repo
# Bring in workspace manifest + lockfile so pnpm can install just what apps/site needs.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/site/package.json apps/site/package.json
COPY packages/analytics/package.json packages/analytics/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/config/package.json packages/config/package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --filter @yinjie/site... --frozen-lockfile

# ---------- build ----------
FROM node:${NODE_VERSION} AS builder
RUN corepack enable
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/site/node_modules ./apps/site/node_modules
COPY . .
# NEXT_PUBLIC_* must be set at build time — Next bakes them into static HTML
# (canonical URLs, OG, sitemap, JSON-LD). Override via --build-arg in CI.
ARG NEXT_PUBLIC_SITE_URL=https://enclaveai.top
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
# Asset sync (screenshots, GIFs, favicons) + Next build
RUN pnpm --filter @yinjie/site exec node scripts/sync-assets.mjs \
 && pnpm --filter @yinjie/site exec next build

# ---------- runtime ----------
FROM node:${NODE_VERSION} AS runner
ENV NODE_ENV=production \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Standalone Next bundle has its own minimal node_modules + server.js.
COPY --from=builder /repo/apps/site/.next/standalone ./
COPY --from=builder /repo/apps/site/.next/static ./apps/site/.next/static
COPY --from=builder /repo/apps/site/public ./apps/site/public

EXPOSE 3001
CMD ["node", "apps/site/server.js"]

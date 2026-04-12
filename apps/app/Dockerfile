FROM node:20-alpine AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json turbo.json .npmrc ./
COPY apps/app/package.json apps/app/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/tooling/package.json packages/tooling/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN pnpm install --frozen-lockfile --filter @yinjie/app...

COPY apps/app apps/app
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY packages/tooling packages/tooling
COPY packages/ui packages/ui

RUN pnpm --filter @yinjie/app build

FROM nginx:1.29-alpine AS runner

ENV APP_API_UPSTREAM=http://api:3000

COPY apps/app/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /workspace/apps/app/dist /usr/share/nginx/html

EXPOSE 80

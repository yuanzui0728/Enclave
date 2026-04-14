#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

node scripts/dev-services.mjs restart api
if ! node scripts/wait-for-service-ready.mjs api http://127.0.0.1:3000/health 60000 1000; then
  tail -n 80 logs/dev-services/api.err.log || true
  exit 1
fi

node scripts/dev-services.mjs stop app
pnpm --dir apps/app build
node scripts/ensure-local-web-nginx.mjs
node scripts/wait-for-service-ready.mjs web http://127.0.0.1:5180/healthz 30000 1000

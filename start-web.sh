#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

node scripts/dev-services.mjs restart api
if ! node scripts/wait-for-service-ready.mjs api http://127.0.0.1:3000/health 60000 1000; then
  tail -n 80 logs/dev-services/api.err.log || true
  exit 1
fi

node scripts/dev-services.mjs restart app
node scripts/dev-services.mjs restart admin

node scripts/wait-for-service-ready.mjs app http://127.0.0.1:5180/ 30000 1000
node scripts/wait-for-service-ready.mjs admin http://127.0.0.1:5181/ 30000 1000

node scripts/dev-services.mjs status api
node scripts/dev-services.mjs status app
node scripts/dev-services.mjs status admin

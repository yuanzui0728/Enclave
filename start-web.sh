#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

node scripts/dev-services.mjs start api
node scripts/dev-services.mjs start app
node scripts/dev-services.mjs status api
node scripts/dev-services.mjs status app

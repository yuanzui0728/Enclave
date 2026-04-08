#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${YINJIE_ANDROID_API_PORT:-39092}"
API_HOST="${YINJIE_ANDROID_API_HOST:-127.0.0.1}"
HOST_API_URL="http://${API_HOST}:${API_PORT}"
ANDROID_API_URL="http://10.0.2.2:${API_PORT}"
ANDROID_CONFIG_PATH="$ROOT_DIR/apps/android-shell/android-shell.config.local.json"
CACHE_DIR="$ROOT_DIR/.cache/android-api"
API_LOG_PATH="$CACHE_DIR/server.log"
API_PID_PATH="$CACHE_DIR/server.pid"
API_DATABASE_PATH="$ROOT_DIR/runtime-data/android-api.sqlite"
AI_API_KEY="${YINJIE_ANDROID_DEEPSEEK_API_KEY:-android-local-placeholder-key}"
AI_BASE_URL="${YINJIE_ANDROID_OPENAI_BASE_URL:-https://api.deepseek.com}"

log() {
  printf '[android-run-local] %s\n' "$*"
}

fail() {
  printf '[android-run-local] %s\n' "$*" >&2
  exit 1
}

ensure_cache_dir() {
  mkdir -p "$CACHE_DIR"
}

write_android_local_config() {
  cat >"$ANDROID_CONFIG_PATH" <<EOF
{
  "allowCleartextTraffic": true,
  "runtime": {
    "environment": "development",
    "apiBaseUrl": "${ANDROID_API_URL}",
    "socketBaseUrl": "${ANDROID_API_URL}"
  }
}
EOF
}

healthcheck() {
  curl -fsS --max-time 3 "${HOST_API_URL}/health" >/dev/null 2>&1
}

port_in_use() {
  ss -ltn | rg -q ":${API_PORT}\\b"
}

start_api() {
  if healthcheck; then
    log "API already reachable at ${HOST_API_URL}"
    return
  fi

  if port_in_use; then
    fail "Port ${API_PORT} is already occupied, but ${HOST_API_URL}/health is not responding."
  fi

  ensure_cache_dir

  log "Starting local API on ${HOST_API_URL}"
  nohup env \
    PORT="$API_PORT" \
    DATABASE_PATH="$API_DATABASE_PATH" \
    CORS_ALLOWED_ORIGINS="*" \
    USER_API_KEY_ENCRYPTION_SECRET="dev_secret_yinjie_android" \
    DEEPSEEK_API_KEY="$AI_API_KEY" \
    OPENAI_BASE_URL="$AI_BASE_URL" \
    pnpm --dir "$ROOT_DIR/api" start:dev >"$API_LOG_PATH" 2>&1 &
  echo $! >"$API_PID_PATH"

  for _ in $(seq 1 60); do
    if healthcheck; then
      log "API is ready at ${HOST_API_URL}"
      return
    fi
    sleep 1
  done

  fail "API failed to start. Check ${API_LOG_PATH}"
}

main() {
  cd "$ROOT_DIR"
  write_android_local_config
  start_api
  pnpm android:run
}

main "$@"

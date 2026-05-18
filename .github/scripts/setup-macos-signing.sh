#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV is required." >&2
  exit 1
fi

has_cert_secret=false
has_signing_identity=false
has_api_key=false

[[ -n "${APPLE_CERTIFICATE:-}" ]] && has_cert_secret=true
[[ -n "${APPLE_SIGNING_IDENTITY:-}" ]] && has_signing_identity=true
[[ -n "${APPLE_API_KEY:-}" ]] && has_api_key=true

if [[ "$has_cert_secret" == false && "$has_signing_identity" == false && "$has_api_key" == false ]]; then
  echo "No Apple signing secrets detected; continuing with unsigned macOS artifacts."
  exit 0
fi

if [[ -z "${APPLE_CERTIFICATE:-}" || -z "${APPLE_CERTIFICATE_PASSWORD:-}" || -z "${APPLE_SIGNING_IDENTITY:-}" ]]; then
  echo "Apple signing is partially configured. APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, and APPLE_SIGNING_IDENTITY must all be set." >&2
  exit 1
fi

if [[ -n "${APPLE_API_KEY:-}" && -z "${APPLE_API_ISSUER:-}" ]]; then
  echo "APPLE_API_ISSUER is required when APPLE_API_KEY is set." >&2
  exit 1
fi

SECRETS_DIR="${GITHUB_WORKSPACE:-$PWD}/.ci-secrets"
CERT_PATH="$SECRETS_DIR/macos-signing.p12"
KEYCHAIN_PATH="$SECRETS_DIR/macos-build.keychain-db"
KEYCHAIN_PASSWORD="${APPLE_KEYCHAIN_PASSWORD:-$(python - <<'PY'
import secrets
print(secrets.token_urlsafe(24))
PY
)}"

mkdir -p "$SECRETS_DIR"

printf '%s' "$APPLE_CERTIFICATE" | base64 --decode > "$CERT_PATH"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERT_PATH" -k "$KEYCHAIN_PATH" -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security list-keychains -d user -s "$KEYCHAIN_PATH" login.keychain-db
security default-keychain -d user -s "$KEYCHAIN_PATH"

echo "APPLE_KEYCHAIN_PATH=$KEYCHAIN_PATH" >> "$GITHUB_ENV"
echo "APPLE_KEYCHAIN_PASSWORD=$KEYCHAIN_PASSWORD" >> "$GITHUB_ENV"
echo "APPLE_CERTIFICATE_PATH=$CERT_PATH" >> "$GITHUB_ENV"

if [[ -n "${APPLE_API_KEY:-}" ]]; then
  APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-$SECRETS_DIR/AuthKey.p8}"
  printf '%s' "$APPLE_API_KEY" > "$APPLE_API_KEY_PATH"
  chmod 600 "$APPLE_API_KEY_PATH"
  echo "APPLE_API_KEY_PATH=$APPLE_API_KEY_PATH" >> "$GITHUB_ENV"
fi

echo "Configured temporary macOS signing keychain."

#!/usr/bin/env bash
set -euo pipefail

KEYCHAIN_PATH="${APPLE_KEYCHAIN_PATH:-}"
CERT_PATH="${APPLE_CERTIFICATE_PATH:-}"
API_KEY_PATH="${APPLE_API_KEY_PATH:-}"

if [[ -n "$KEYCHAIN_PATH" && -f "$KEYCHAIN_PATH" ]]; then
  security delete-keychain "$KEYCHAIN_PATH" || true
fi

if [[ -n "$CERT_PATH" && -f "$CERT_PATH" ]]; then
  rm -f "$CERT_PATH"
fi

if [[ -n "$API_KEY_PATH" && -f "$API_KEY_PATH" ]]; then
  rm -f "$API_KEY_PATH"
fi

echo "Cleaned temporary macOS signing assets."

#!/usr/bin/env bash
set -euo pipefail

TARGET_TRIPLE="${1:?target triple is required}"
OUTPUT_DIR="${2:?output directory is required}"

mkdir -p "$OUTPUT_DIR"

BUNDLE_DIR="apps/desktop/src-tauri/target/${TARGET_TRIPLE}/release/bundle"
CORE_TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cargo-target/yinjie-desktop}"

{
  echo "target=${TARGET_TRIPLE}"
  echo "bundle_dir=${BUNDLE_DIR}"
  echo "core_target_dir=${CORE_TARGET_DIR}"
  echo "pwd=$(pwd)"
  echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "${OUTPUT_DIR}/build-context.txt"

if [[ -d "$BUNDLE_DIR" ]]; then
  find "$BUNDLE_DIR" -maxdepth 4 -type f | sort > "${OUTPUT_DIR}/bundle-files.txt"
fi

if [[ -d "$CORE_TARGET_DIR" ]]; then
  find "$CORE_TARGET_DIR" -maxdepth 4 -type f \( -name "*.log" -o -name "*.dmg" -o -name "*.app.tar.gz" -o -name "*.sig" \) | sort > "${OUTPUT_DIR}/target-artifacts.txt" || true
fi

if command -v rustc >/dev/null 2>&1; then
  rustc --version > "${OUTPUT_DIR}/rust-version.txt"
fi

if command -v cargo >/dev/null 2>&1; then
  cargo --version > "${OUTPUT_DIR}/cargo-version.txt"
fi

if command -v node >/dev/null 2>&1; then
  node --version > "${OUTPUT_DIR}/node-version.txt"
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm --version > "${OUTPUT_DIR}/pnpm-version.txt"
fi

echo "Collected macOS diagnostics into ${OUTPUT_DIR}"

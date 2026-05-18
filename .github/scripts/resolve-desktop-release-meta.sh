#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GITHUB_OUTPUT:-}" ]]; then
  echo "GITHUB_OUTPUT is required." >&2
  exit 1
fi

TARGET_TRIPLE="${1:?target triple is required}"

VERSION="$(python - <<'PY'
import json
from pathlib import Path
conf = json.loads(Path("apps/desktop/src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
print(conf["version"])
PY
)"

TAG_NAME="${GITHUB_REF_NAME:-}"
EXPECTED_TAG="desktop-v${VERSION}"
RELEASE_MODE="manual"

if [[ "${GITHUB_EVENT_NAME:-}" == "push" && -n "$TAG_NAME" ]]; then
  RELEASE_MODE="tag"
  if [[ "$TAG_NAME" != "$EXPECTED_TAG" ]]; then
    echo "Desktop tag/version mismatch: expected ${EXPECTED_TAG}, got ${TAG_NAME}" >&2
    exit 1
  fi
fi

{
  echo "version=${VERSION}"
  echo "expected_tag=${EXPECTED_TAG}"
  echo "release_mode=${RELEASE_MODE}"
  echo "artifact_prefix=yinjie-desktop-${VERSION}-${TARGET_TRIPLE}"
  echo "diagnostics_artifact=yinjie-desktop-diagnostics-${VERSION}-${TARGET_TRIPLE}"
} >> "$GITHUB_OUTPUT"

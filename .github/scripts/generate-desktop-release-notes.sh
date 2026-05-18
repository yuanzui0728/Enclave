#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?version is required}"
EXPECTED_TAG="${2:?expected tag is required}"
TARGETS_JSON="${3:?targets json is required}"
OUTPUT_PATH="${4:?output path is required}"

python - <<'PY' "$VERSION" "$EXPECTED_TAG" "$TARGETS_JSON" "$OUTPUT_PATH"
import json
import sys
from pathlib import Path

version, expected_tag, targets_json, output_path = sys.argv[1:]
targets = json.loads(targets_json)

target_lines = []
for target in targets:
    label = "Apple Silicon" if target == "aarch64-apple-darwin" else "Intel"
    target_lines.append(f"- {label}: `yinjie-desktop-{version}-{target}`")

text = "\n".join(
    [
        f"# Yinjie Desktop macOS {version}",
        "",
        f"- release tag: `{expected_tag}`",
        "- this release packages the desktop shell as a remote client",
        "- first launch enters `/setup` and asks for your server address",
        "",
        "## Downloads",
        "",
        *target_lines,
        f"- diagnostics bundle: `yinjie-desktop-diagnostics-{version}-<target>`",
        f"- release manifest: `yinjie-desktop-release-manifest-{version}`",
        "",
        "## Install",
        "",
        "1. Download the DMG for your Mac architecture.",
        "2. Drag `Yinjie.app` into `Applications`.",
        "3. Open the app and complete remote setup with your server address.",
        "",
        "## If Startup Fails",
        "",
        "- Open `/setup` and confirm the server address is correct.",
        "- Verify the backend is reachable at `/health`.",
        "- Check the diagnostics artifact for bundle metadata and logs.",
        "",
        "## Validation",
        "",
        "- `codesign --verify --deep --strict /Applications/Yinjie.app`",
        "- `spctl --assess --type execute /Applications/Yinjie.app`",
        "",
        "See the release manifest and diagnostics artifact for full target-specific details.",
    ]
)

Path(output_path).write_text(text + "\n", encoding="utf-8")
PY

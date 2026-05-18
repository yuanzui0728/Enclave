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

lines = [
    "# Yinjie Desktop macOS Release Manifest",
    "",
    f"- version: `{version}`",
    f"- expected tag: `{expected_tag}`",
    "",
    "## Targets",
]

for target in targets:
    lines.extend(
        [
            f"- `{target}`",
            f"  artifact: `yinjie-desktop-{version}-{target}`",
            f"  diagnostics: `yinjie-desktop-diagnostics-{version}-{target}`",
        ]
    )

lines.extend(
    [
        "",
        "## Release Tag Rule",
        "",
        f"- release tag must be `{expected_tag}`",
        "",
        "## Notes",
        "",
        "- Each target artifact contains the built desktop bundle only.",
        "- Each diagnostics artifact contains CI context, bundle file list, and collected artifact metadata.",
    ]
)

Path(output_path).write_text("\n".join(lines) + "\n", encoding="utf-8")
PY

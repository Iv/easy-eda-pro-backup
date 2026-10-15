#!/usr/bin/env bash
# Package the extension into project-backup_v<version>.eext (a zip of extension.json + dist/)
set -euo pipefail
cd "$(dirname "$0")"
version=$(python3 -c "import json;print(json.load(open('extension.json'))['version'])")
out="project-backup_v${version}.eext"
rm -f "$out"
zip -9 -q "$out" extension.json dist/index.js
echo "$out"

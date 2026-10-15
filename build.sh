#!/usr/bin/env bash
# Package the extension into project-backup_v<version>.eext.
# The .eext is a zip of extension.json + dist/ + README.md + CHANGELOG.md;
# Extension Manager shows README.md and CHANGELOG.md on the extension's details page.
# The packaged README.md is docs/EXTENSION_README.md (English, user-facing), not the repo README.
set -euo pipefail
cd "$(dirname "$0")"
version=$(python3 -c "import json;print(json.load(open('extension.json'))['version'])")
out="$PWD/project-backup_v${version}.eext"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/dist"
cp extension.json "$stage/"
cp dist/index.js "$stage/dist/"
cp docs/EXTENSION_README.md "$stage/README.md"
cp CHANGELOG.md LICENSE "$stage/"
rm -f "$out"
(cd "$stage" && zip -9 -q -r "$out" extension.json dist README.md CHANGELOG.md LICENSE)
echo "$(basename "$out")"

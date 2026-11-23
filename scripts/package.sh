#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/build/dist"
VERSION="$(jq -r .version "$ROOT/manifest.json")"

rm -rf "$OUT"
mkdir -p "$OUT"

PAYLOAD="$OUT/payload"
mkdir -p "$PAYLOAD"

for item in manifest.json background.js content.js content.css shared.js lib popup reader README.md; do
  cp -R "$ROOT/$item" "$PAYLOAD/"
done

# Plain unpackable extension.
(cd "$PAYLOAD" && zip -qr "$OUT/md-reader-$VERSION.zip" .)

# Per-OS self-contained installers.
for os in windows macos linux; do
  stage="$OUT/stage-$os"
  mkdir -p "$stage"
  cp "$ROOT/installers/README.md" "$stage/README.md"

  if [[ "$os" == "windows" ]]; then
    cp "$ROOT/installers/windows/install.ps1" "$stage/install.ps1"
  else
    cp "$ROOT/installers/$os/install.sh" "$stage/install.sh"
    chmod +x "$stage/install.sh"
  fi

  cp -R "$PAYLOAD/." "$stage/payload/"

  if [[ "$os" == "windows" ]]; then
    (cd "$stage" && zip -qr "$OUT/md-reader-$VERSION-windows.zip" .)
  else
    tar -czf "$OUT/md-reader-$VERSION-$os.tar.gz" -C "$stage" .
  fi

  rm -rf "$stage"
done

rm -rf "$PAYLOAD"

printf 'Built packages in %s\n' "$OUT"

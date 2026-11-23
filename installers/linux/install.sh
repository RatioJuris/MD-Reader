#!/usr/bin/env bash
set -euo pipefail

PREFIX=""
SOURCE=""
BROWSER="chrome"
ASSOCIATE=1
DRY_RUN=0
UNINSTALL=0
VERIFY=0
JSON=0
OPEN_BROWSER=0
LOG=""
CHANGES=""
WARNINGS=""
MANUAL=""
VERIFIED=0
EXIT_CODE=0
STATUS="ok"
ACTION="install"
PLATFORM="linux"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
MD Reader installer (Linux)

Usage: install.sh [options]

Options:
  --prefix PATH        Install root (default: ${XDG_DATA_HOME:-$HOME/.local/share}/md-reader)
  --browser NAME       chrome | edge | chromium | firefox (default: chrome)
  --source PATH        Extension payload directory (default: bundled payload or repo root)
  --no-associate       Do not register .md with the browser
  --open-browser       Open the browser's extension page after installing
  --dry-run            Report intended changes without writing
  --uninstall          Remove installed files and registrations
  --verify             Verify installed files against the recorded hashes
  --json               Write a single JSON result to stdout
  --log PATH           Append human-readable messages to PATH
  -h, --help           Show this help

Exit codes: 0 ok, 1 error, 2 usage, 4 verification failed
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX="$2"; shift 2 ;;
    --prefix=*) PREFIX="${1#*=}"; shift ;;
    --browser) BROWSER="$2"; shift 2 ;;
    --browser=*) BROWSER="${1#*=}"; shift ;;
    --source) SOURCE="$2"; shift 2 ;;
    --source=*) SOURCE="${1#*=}"; shift ;;
    --log) LOG="$2"; shift 2 ;;
    --log=*) LOG="${1#*=}"; shift ;;
    --no-associate) ASSOCIATE=0; shift ;;
    --open-browser) OPEN_BROWSER=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --uninstall) UNINSTALL=1; shift ;;
    --verify) VERIFY=1; shift ;;
    --json) JSON=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

case "$BROWSER" in
  chrome|edge|chromium|firefox) ;;
  *) printf 'Unsupported browser: %s\n' "$BROWSER" >&2; exit 2 ;;
esac

if [[ -z "$PREFIX" ]]; then
  PREFIX="${XDG_DATA_HOME:-$HOME/.local/share}/md-reader"
fi
EXT_DIR="$PREFIX/extension"
STATE="$PREFIX/state.tsv"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
MIME_DIR="$DATA_HOME/mime"
MIME_PACKAGE="$MIME_DIR/packages/md-reader.xml"

say() {
  if [[ $JSON -eq 1 ]]; then
    printf '%s\n' "$*" >&2
  else
    printf '%s\n' "$*"
  fi
  if [[ -n "$LOG" ]]; then printf '%s\n' "$*" >> "$LOG"; fi
}

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr '\n' ' '
}

json_array() {
  if [[ -z "$1" ]]; then printf '[]'; return; fi
  printf '%s' "$1" | awk 'BEGIN{ORS=""} NF { if (n++) printf ","; gsub(/\\/,"\\\\"); gsub(/"/,"\\\""); printf "\"%s\"", $0 }'
}

emit() {
  local dry="false"
  [[ $DRY_RUN -eq 1 ]] && dry="true"
  if [[ $JSON -eq 1 ]]; then
    printf '{"status":"%s","action":"%s","platform":"%s","browser":"%s","prefix":"%s","extension_dir":"%s","dry_run":%s,"verified_files":%d,"exit_code":%d,"changes":%s,"warnings":%s,"manual_steps":%s}\n' \
      "$(json_escape "$STATUS")" "$(json_escape "$ACTION")" "$PLATFORM" "$(json_escape "$BROWSER")" \
      "$(json_escape "$PREFIX")" "$(json_escape "$EXT_DIR")" "$dry" "$VERIFIED" "$EXIT_CODE" \
      "$(json_array "$CHANGES")" "$(json_array "$WARNINGS")" "$(json_array "$MANUAL")"
  else
    say "MD Reader $ACTION — $STATUS"
    say "Browser: $BROWSER"
    say "Prefix: $PREFIX"
    while IFS= read -r line; do [[ -n "$line" ]] && say "  + $line"; done <<< "$CHANGES"
    while IFS= read -r line; do [[ -n "$line" ]] && say "  ! $line"; done <<< "$WARNINGS"
    while IFS= read -r line; do [[ -n "$line" ]] && say "  > $line"; done <<< "$MANUAL"
  fi
}

on_error() {
  local line="$1"
  STATUS="error"
  EXIT_CODE=1
  WARNINGS+="Unexpected failure at line ${line}"$'\n'
  emit
  exit "$EXIT_CODE"
}
trap 'on_error $LINENO' ERR

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    printf ''
  fi
}

desktop_for() {
  case "$1" in
    chrome) printf 'google-chrome.desktop' ;;
    edge) printf 'microsoft-edge.desktop' ;;
    chromium) printf 'chromium.desktop' ;;
    firefox) printf 'firefox.desktop' ;;
  esac
}

browser_url() {
  if [[ "$BROWSER" == "firefox" ]]; then printf 'about:debugging#/runtime/this-firefox'; else printf 'chrome://extensions'; fi
}

EXPECTED=(
  "manifest.json"
  "background.js"
  "content.js"
  "content.css"
  "shared.js"
  "lib/marked.min.js"
  "lib/purify.min.js"
  "lib/LICENSE-marked.txt"
  "lib/LICENSE-dompurify.txt"
  "popup/popup.html"
  "popup/popup.css"
  "popup/popup.js"
  "reader/reader.html"
  "reader/reader.css"
  "reader/reader.js"
  "README.md"
)

if [[ -z "$SOURCE" ]]; then
  if [[ -d "$SCRIPT_DIR/payload" ]]; then
    SOURCE="$SCRIPT_DIR/payload"
  else
    REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
    if [[ -f "$REPO/manifest.json" ]]; then
      SOURCE="$REPO"
    else
      STATUS="error"; EXIT_CODE=1
      WARNINGS+="Cannot locate extension payload; pass --source"$'\n'
      emit; exit "$EXIT_CODE"
    fi
  fi
fi

DESKTOP="$(desktop_for "$BROWSER")"
URL="$(browser_url)"

if [[ $UNINSTALL -eq 1 ]]; then
  ACTION="uninstall"
  PREVIOUS=""
  if [[ -f "$STATE" ]]; then
    PREVIOUS="$(awk -F '\t' '$1=="#previous_association" { print $2; exit }' "$STATE")"
  fi
  if [[ $DRY_RUN -eq 1 ]]; then
    CHANGES+="Would remove $PREFIX"$'\n'
    CHANGES+="Would remove $MIME_PACKAGE"$'\n'
  else
    if command -v xdg-mime >/dev/null 2>&1 && [[ -n "$PREVIOUS" ]]; then
      xdg-mime default "$PREVIOUS" text/markdown || true
      CHANGES+="Restored previous text/markdown handler to $PREVIOUS"$'\n'
    fi
    rm -f "$MIME_PACKAGE"
    if command -v update-mime-database >/dev/null 2>&1; then
      update-mime-database "$MIME_DIR" || true
    fi
    if [[ -d "$PREFIX" ]]; then
      rm -rf "$PREFIX"
      CHANGES+="Removed $PREFIX"$'\n'
    fi
    CHANGES+="Removed $MIME_PACKAGE"$'\n'
  fi
  emit
  exit "$EXIT_CODE"
fi

if [[ $VERIFY -eq 1 ]]; then
  ACTION="verify"
  if [[ ! -f "$STATE" ]]; then
    STATUS="error"; EXIT_CODE=1
    WARNINGS+="No MD Reader installation found at $PREFIX"$'\n'
    emit; exit "$EXIT_CODE"
  fi
  while IFS=$'\t' read -r rel hash; do
    [[ -z "$rel" || "$rel" == \#* ]] && continue
    file="$EXT_DIR/$rel"
    if [[ ! -f "$file" ]]; then
      WARNINGS+="Missing: $rel"$'\n'
      continue
    fi
    actual="$(sha256_file "$file")"
    if [[ "$actual" != "$hash" ]]; then
      WARNINGS+="Changed: $rel"$'\n'
    else
      VERIFIED=$((VERIFIED + 1))
    fi
  done < "$STATE"
  if [[ -n "$WARNINGS" ]]; then STATUS="error"; EXIT_CODE=4; fi
  emit
  exit "$EXIT_CODE"
fi

if [[ $DRY_RUN -eq 0 ]]; then
  mkdir -p "$EXT_DIR"
  : > "$STATE"
  printf '#browser\t%s\n' "$BROWSER" >> "$STATE"
  printf '#extension_dir\t%s\n' "$EXT_DIR" >> "$STATE"
else
  CHANGES+="Would create $EXT_DIR"$'\n'
fi

for rel in "${EXPECTED[@]}"; do
  src="$SOURCE/$rel"
  if [[ ! -f "$src" ]]; then
    STATUS="error"; EXIT_CODE=1
    WARNINGS+="Missing source file: $rel"$'\n'
    emit; exit "$EXIT_CODE"
  fi
  if [[ $DRY_RUN -eq 0 ]]; then
    mkdir -p "$EXT_DIR/$(dirname "$rel")"
    cp "$src" "$EXT_DIR/$rel"
    hash="$(sha256_file "$EXT_DIR/$rel")"
    printf '%s\t%s\n' "$rel" "$hash" >> "$STATE"
  fi
done
CHANGES+="Staged ${#EXPECTED[@]} extension files"$'\n'

if [[ $ASSOCIATE -eq 1 ]]; then
  if command -v xdg-mime >/dev/null 2>&1; then
    if [[ $DRY_RUN -eq 1 ]]; then
      CHANGES+="Would register $DESKTOP as the text/markdown handler"$'\n'
    else
      previous="$(xdg-mime query default text/markdown 2>/dev/null || true)"
      printf '#previous_association\t%s\n' "$previous" >> "$STATE"

      mkdir -p "$MIME_DIR/packages"
      cat > "$MIME_PACKAGE" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="text/markdown">
    <comment>Markdown document</comment>
    <glob pattern="*.md"/>
    <glob pattern="*.markdown"/>
    <glob pattern="*.mdown"/>
    <glob pattern="*.mkd"/>
  </mime-type>
</mime-info>
XML
      if command -v update-mime-database >/dev/null 2>&1; then
        update-mime-database "$MIME_DIR" || true
      fi
      xdg-mime default "$DESKTOP" text/markdown || true
      CHANGES+="Registered $DESKTOP as the text/markdown handler"$'\n'
    fi
  else
    WARNINGS+="xdg-mime is not installed; .md association was skipped."$'\n'
    MANUAL+="Install xdg-utils, then run: xdg-mime default $DESKTOP text/markdown"$'\n'
  fi
fi

if [[ $DRY_RUN -eq 0 ]]; then
  CHANGES+="Wrote $STATE"$'\n'
fi

MANUAL+="Open $URL, enable Developer mode, choose Load unpacked, and select $EXT_DIR"$'\n'
if [[ $ASSOCIATE -eq 1 ]]; then
  MANUAL+="Confirm MD Reader as the default for .md in your desktop settings if desired."$'\n'
fi
MANUAL+="In the extension details, enable Allow access to file URLs to render local files in place."$'\n'

if [[ $OPEN_BROWSER -eq 1 && $DRY_RUN -eq 0 ]]; then
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" || true
    CHANGES+="Opened $URL"$'\n'
  else
    WARNINGS+="xdg-open is not installed; could not open $URL"$'\n'
  fi
fi

emit
exit "$EXIT_CODE"

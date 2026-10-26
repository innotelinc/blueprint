#!/usr/bin/env bash
# Resolve a Node runtime for local development.
#
# Prefers a real `node` on PATH. On machines with no Node install but the
# Freebuff desktop app present, Electron's binary doubles as Node when
# ELECTRON_RUN_AS_NODE=1 is set, so we use that as a fallback.
set -euo pipefail

if command -v node >/dev/null 2>&1; then
  exec node "$@"
fi

for candidate in \
  "$LOCALAPPDATA/Programs/@codebufffreebuff-desktop/Freebuff.exe" \
  "$LOCALAPPDATA/Programs/freebuff/Freebuff.exe" \
  "/Applications/Freebuff.app/Contents/MacOS/Freebuff" \
  "$HOME/.local/share/freebuff/freebuff"; do
  if [ -x "$candidate" ]; then
    ELECTRON_RUN_AS_NODE=1 exec "$candidate" "$@"
  fi
done

echo "No Node runtime found. Install Node 20+ (https://nodejs.org) or run the app locally with a Node-enabled host." >&2
exit 127
